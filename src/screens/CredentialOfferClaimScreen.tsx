import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View, type ImageSourcePropType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../components/AppButton'
import { useAppDialog } from '../components/AppDialog'
import { CodeBoxField } from '../components/auth/CodeBoxField'
import { DrivingLicencePreviewPanel } from '../components/DrivingLicencePreviewPanel'
import { IssuanceTrustConfirmationPanel } from '../components/IssuanceTrustConfirmationPanel'
import { ScanSuccessPanel } from '../components/ScanSuccessPanel'
import { ThaiIdReceivePanel } from '../components/ThaiIdReceivePanel'
import { ThaiIdSuccessConfirmationPanel } from '../components/ThaiIdSuccessConfirmationPanel'
import { TranscriptPreviewPanel } from '../components/TranscriptPreviewPanel'
import { WalletHeader } from '../components/WalletHeader'

import { useAndroidBackNavigation } from '../hooks/useAndroidBackNavigation'
import { useReturnToWallet } from '../hooks/useReturnToWallet'
import { useStoredCredentials } from '../hooks/useStoredCredentials'
import { readWalletReturnUrl } from '../config/sameDeviceIssuance'
import type { IssuerPortalCredentialType } from '../config/issuerPortalUrls'
import { buildAuthorizationRequestUrlForResolvedOffer } from '../services/credentials/buildAuthorizationRequestUrlForResolvedOffer'
import { inferPortalCredentialTypeFromOffer } from '../services/credentials/inferPortalCredentialType'
import { isAuthorizationCodeOnlyOffer } from '../services/credentials/isAuthorizationCodeOnlyOffer'
import { resumeSameDeviceClaimFromSession } from '../services/credentials/resumeSameDeviceClaim'
import { readActiveSameDeviceSession } from '../store/sameDeviceIssuanceStore'
import {
  canRequestCredentialType,
  isPidCredentialOffer,
  readPidGateStatus,
} from '../services/credentials/credentialGuard'
import { readCredentialRenewalStatuses } from '../services/credentials/credentialKeyRenewal'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import {
  deleteExpiredCredentialAfterReissue,
  readExpiredCredentialsForCleanupAfterClaim,
} from '../services/credentials/documentExpiryCleanup'
import {
  acquireDualFormatForPreview,
  finalizeDualFormatCredential,
  isDualFormatOffer,
  selectOfferForSingleFormatAcquire,
  type PendingMdocCredential,
} from '../services/credentials/dualFormatIssuance'
import { saveScannedCredential } from '../services/credentials/scannedCredentialSave'
import { readStoredCredentials } from '../services/credentials/storedCredentials'
import { discardIssuanceCredentialArtifacts, commitIssuanceCredentialKeyReplacement } from '../services/crypto/perCredentialSigning'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import {
  describeCredentialForLog,
  describeOfferForLog,
  describeUriForLog,
} from '../services/scan/scanLogDescriptors'
import { toFriendlyError } from '../services/scan/scanFriendlyErrors'
import {
  acquireCredentialRecord,
  resolveOffer,
  type AuthorizationCodeExchangeInput,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../services/vci/exchangeService'
import { resolveCredentialOfferDeeplink } from '../services/credentials/resolveCredentialOfferDeeplink'
import { readCredentialPreviewDisplay } from '../services/vci/qrIssuanceFlow'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../store/deeplinkStore'
import { normalizeNumericCode } from '../utils/normalizeNumericCode'

import { THEME } from '../config/themeColors'

const SCREEN_SAFE_EDGES = ['top'] as const

type ClaimPhase =
  | { tag: 'initializing' }
  | { tag: 'resolving' }
  | { tag: 'auth_redirect'; offer: ResolvedCredentialOffer; credentialType: IssuerPortalCredentialType }
  | { tag: 'txCode'; offer: ResolvedCredentialOffer }
  | { tag: 'dopaConfirm'; offer: ResolvedCredentialOffer; txCode?: string }
  | { tag: 'acquiring' }
  | { tag: 'preview'; record: VerifiableCredentialRecord; pendingMdoc?: PendingMdocCredential }
  | { tag: 'issuerConfirm'; record: VerifiableCredentialRecord; pendingMdoc?: PendingMdocCredential }
  | { tag: 'saving' }
  | { tag: 'success'; record: VerifiableCredentialRecord }
  | { tag: 'error'; message: string }

const credentialImages: Record<string, ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/user_profile.png'),
}

const RESOLVE_TIMEOUT_MS = 20_000
const ACQUIRE_TIMEOUT_MS = 30_000
const MISSING_OFFER_GRACE_MS = 1_500

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.()
      reject(new Error(message))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

type Props = {
  initialOfferUri?: string | null
  onClose?: () => void
}

export function CredentialOfferClaimScreen({ initialOfferUri, onClose }: Props = {}) {
  const { refresh: refreshCredentials, credentials } = useStoredCredentials()
  const { showDialog } = useAppDialog()
  const [phase, setPhase] = useState<ClaimPhase>({ tag: 'initializing' })
  const [txCode, setTxCode] = useState('')
  const generationRef = useRef(0)
  const initialUrlCheckedRef = useRef(false)
  const directUrlHandledRef = useRef<string | null>(null)
  const router = useRouter()
  const incomingUrl = Linking.useURL()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const activeDeeplinkUri = useDeeplinkStore((s) => s.activeUri)
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeOfferUriRef = useRef<string | null>(null)
  const expiredCleanupPromptedRef = useRef<string | null>(null)
  const lastStartedOfferRef = useRef<string | null>(null)
  const missingOfferCheckRef = useRef(0)
  const acquireAbortControllerRef = useRef<AbortController | null>(null)
  const authorizationCodeExchangeRef = useRef<AuthorizationCodeExchangeInput | undefined>(undefined)
  const sameDeviceResumeCheckedRef = useRef(false)
  const returnToWallet = useReturnToWallet(router)

  useEffect(() => {
    if (phase.tag !== 'success') return

    const expiredCredentials = readExpiredCredentialsForCleanupAfterClaim(
      phase.record,
      credentials.length > 0 ? credentials : readStoredCredentials(),
    )
    const expiredCredential = expiredCredentials[0]
    if (!expiredCredential) return
    if (expiredCleanupPromptedRef.current === phase.record.id) return

    expiredCleanupPromptedRef.current = phase.record.id
    showDialog({
      title: WALLET_HOME_COPY.documentExpiredCleanupTitle,
      message: WALLET_HOME_COPY.documentExpiredCleanupMessage,
      icon: 'danger',
      actions: [
        {
          label: WALLET_HOME_COPY.cancel,
          variant: 'secondary',
        },
        {
          label: WALLET_HOME_COPY.confirmDelete,
          variant: 'danger',
          onPress: () => {
            deleteExpiredCredentialAfterReissue(expiredCredential.id)
            refreshCredentials()
          },
        },
      ],
    })
  }, [credentials, phase, refreshCredentials, showDialog])

  const acquireForPreview = useCallback(async (offer: ResolvedCredentialOffer, code?: string) => {
    const gen = generationRef.current
    acquireAbortControllerRef.current?.abort()
    const acquireAbortController = new AbortController()
    acquireAbortControllerRef.current = acquireAbortController
    setPhase({ tag: 'acquiring' })
    logWalletStep('deeplink', 'credential-acquire-start', {
      ...describeOfferForLog(offer),
      txCodeProvided: Boolean(code),
    })
    try {
      if (isDualFormatOffer(offer.credentialConfigurations)) {
        logWalletStep('deeplink', 'credential-acquire-dual-format', describeOfferForLog(offer))
        const dualPreview = await withTimeout(
          acquireDualFormatForPreview(offer, {
            tx_code: code,
            signal: acquireAbortController.signal,
            ...(authorizationCodeExchangeRef.current
              ? { authorizationCodeExchange: authorizationCodeExchangeRef.current }
              : {}),
          }),
          ACQUIRE_TIMEOUT_MS,
          'DeeplinkTimeout: acquiring credential timed out',
          () => acquireAbortController.abort(),
        )
        logWalletStep('deeplink', 'credential-acquire-complete', {
          ...describeCredentialForLog(dualPreview.primaryRecord),
          mdocPresent: Boolean(dualPreview.pendingMdoc),
          missingFormat: dualPreview.missingFormat,
        })
        if (generationRef.current === gen) {
          if (dualPreview.missingFormat) {
            logWalletError(
              'deeplink',
              'dual-format-acquire-incomplete',
              new Error(`Missing credential format: ${dualPreview.missingFormat}`),
              describeOfferForLog(offer),
            )
            setPhase({
              tag: 'error',
              message: 'Unable to receive all credential formats. Please try again.',
            })
            return
          }
          setPhase({
            tag: 'preview',
            record: dualPreview.primaryRecord,
            ...(dualPreview.pendingMdoc ? { pendingMdoc: dualPreview.pendingMdoc } : {}),
          })
        } else {
          void discardIssuanceCredentialArtifacts({
            credentialId: dualPreview.primaryRecord.id,
            pendingCredentialKeyId: dualPreview.pendingMdoc?.pendingCredentialKeyId,
          })
        }
        return
      }

      const offerToAcquire = selectOfferForSingleFormatAcquire(offer)
      logWalletStep('deeplink', 'credential-acquire-config', {
        ...describeOfferForLog(offerToAcquire),
        dualFormatSlicedToSdJwt: offerToAcquire !== offer,
      })
      const record = await withTimeout(
        acquireCredentialRecord(offerToAcquire, {
          tx_code: code,
          signal: acquireAbortController.signal,
          ...(authorizationCodeExchangeRef.current
            ? { authorizationCodeExchange: authorizationCodeExchangeRef.current }
            : {}),
        }),
        ACQUIRE_TIMEOUT_MS,
        'DeeplinkTimeout: acquiring credential timed out',
        () => acquireAbortController.abort(),
      )
      logWalletStep('deeplink', 'credential-acquire-complete', describeCredentialForLog(record))
      if (generationRef.current === gen) {
        setPhase({ tag: 'preview', record })
      } else {
        void discardIssuanceCredentialArtifacts({ credentialId: record.id })
      }
    } catch (err) {
      logWalletError('deeplink', 'credential-acquire-failed', err, describeOfferForLog(offer))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    } finally {
      if (acquireAbortControllerRef.current === acquireAbortController) {
        acquireAbortControllerRef.current = null
      }
    }
  }, [])

  const proceedAfterOfferResolved = useCallback(async (offer: ResolvedCredentialOffer) => {
    const gen = generationRef.current
    setTxCode('')
    const latestCredentials = readStoredCredentials()
    const renewalStatuses = readCredentialRenewalStatuses(latestCredentials)
    const isPidOffer = isPidCredentialOffer(offer)
    const pidGateStatus = readPidGateStatus(latestCredentials, renewalStatuses)
    logWalletStep('deeplink', 'offer-resolved', {
      ...describeOfferForLog(offer),
      isPidOffer,
      pidGateStatus,
      authorizationCodeFlow: Boolean(authorizationCodeExchangeRef.current),
    })
    if (!isPidOffer && pidGateStatus !== 'ready') {
      logWalletError(
        'deeplink',
        'offer-requires-pid',
        new Error('Usable PID credential required before this offer'),
        describeOfferForLog(offer),
      )
      if (generationRef.current === gen) {
        setPhase({
          tag: 'error',
          message:
            pidGateStatus === 'missing'
              ? WALLET_HOME_COPY.pidRequiredMessage
              : WALLET_HOME_COPY.renewThaIdRequiredMessage,
        })
      }
      return
    }
    if (isPidOffer) {
      if (
        canRequestCredentialType('ThaiNationalID', latestCredentials, renewalStatuses)
      ) {
        logWalletStep('deeplink', 'offer-pid-flow', describeOfferForLog(offer))
        if (generationRef.current !== gen) return
        if (offer.txCode) {
          setPhase({ tag: 'txCode', offer })
          return
        }
        setPhase({ tag: 'dopaConfirm', offer })
        return
      }

      if (pidGateStatus === 'ready') {
        if (generationRef.current === gen) {
          setPhase({
            tag: 'error',
            message: WALLET_HOME_COPY.thaIdAlreadyActiveMessage,
          })
        }
        return
      }

      if (generationRef.current === gen) {
        setPhase({
          tag: 'error',
          message: WALLET_HOME_COPY.renewThaIdRequiredMessage,
        })
      }
      return
    }
    if (offer.txCode) {
      logWalletStep('deeplink', 'offer-tx-code-required', describeOfferForLog(offer))
      if (generationRef.current === gen) setPhase({ tag: 'txCode', offer })
      return
    }
    if (generationRef.current === gen) {
      setPhase({ tag: 'dopaConfirm', offer })
    }
  }, [])

  const resumeSameDeviceClaimIfReady = useCallback(async () => {
    try {
      const resume = await resumeSameDeviceClaimFromSession()
      if (resume.status !== 'claim_ready') return false

      authorizationCodeExchangeRef.current = resume.authorizationCodeExchange
      generationRef.current += 1
      setPhase({ tag: 'resolving' })
      logWalletStep('same-device-issuance', 'claim-screen-resume', {
        configurationIds: resume.resolvedOffer.credentialConfigurations.map((configuration) => configuration.id),
      })
      await proceedAfterOfferResolved(resume.resolvedOffer)
      return true
    } catch (err) {
      logWalletError('same-device-issuance', 'claim-screen-resume-failed', err)
      setPhase({
        tag: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }, [proceedAfterOfferResolved])

  useEffect(() => {
    if (sameDeviceResumeCheckedRef.current) return
    sameDeviceResumeCheckedRef.current = true
    void resumeSameDeviceClaimIfReady()
  }, [resumeSameDeviceClaimIfReady])

  useEffect(() => {
    if (phase.tag !== 'auth_redirect') return

    let cancelled = false
    void (async () => {
      try {
        const authUrl = await buildAuthorizationRequestUrlForResolvedOffer(
          phase.offer,
          phase.credentialType,
        )
        logWalletStep('same-device-issuance', 'auth-redirect-open', {
          credentialType: phase.credentialType,
        })
        await WebBrowser.openAuthSessionAsync(authUrl, readWalletReturnUrl())
        if (cancelled) return
        const resumed = await resumeSameDeviceClaimIfReady()
        if (!resumed && !cancelled) {
          setPhase({
            tag: 'error',
            message: 'Complete issuer login in the browser, then return to the Wallet to continue.',
          })
        }
      } catch (err) {
        logWalletError('same-device-issuance', 'auth-redirect-failed', err)
        if (!cancelled) {
          setPhase({
            tag: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [phase, resumeSameDeviceClaimIfReady])

  const handleOfferUri = useCallback(async (uri: string) => {
    if (!isCredentialOfferDeeplink(uri)) {
      logWalletError('deeplink', 'unsupported-deeplink', new Error('Unsupported deeplink'), describeUriForLog(uri))
      setPhase({ tag: 'error', message: 'Not a credential offer link. Please open a valid issuance link.' })
      return
    }

    const gen = generationRef.current
    activeOfferUriRef.current = uri
    setPhase({ tag: 'resolving' })
    logWalletStep('deeplink', 'offer-detected', describeUriForLog(uri))
    try {
      const offer = await withTimeout(resolveOffer(uri), RESOLVE_TIMEOUT_MS, 'DeeplinkTimeout: resolving offer timed out')
      if (
        isAuthorizationCodeOnlyOffer(offer)
        && !readActiveSameDeviceSession()?.authorizationCode
      ) {
        const credentialType = inferPortalCredentialTypeFromOffer(offer)
        if (!credentialType) {
          if (generationRef.current === gen) {
            setPhase({
              tag: 'error',
              message: 'This authorization-code offer is not supported from Scan. Request the document from Wallet Home.',
            })
          }
          return
        }
        if (generationRef.current === gen) {
          setPhase({ tag: 'auth_redirect', offer, credentialType })
        }
        return
      }
      await proceedAfterOfferResolved(offer)
    } catch (err) {
      logWalletError('deeplink', 'offer-resolve-failed', err, describeUriForLog(uri))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }, [acquireForPreview, proceedAfterOfferResolved])

  const beginOffer = useCallback((uri: string) => {
    if (!isCredentialOfferDeeplink(uri)) return false
    if (uri === dismissedDeeplinkUri) return false
    if (uri === lastStartedOfferRef.current) return false

    missingOfferCheckRef.current += 1
    lastStartedOfferRef.current = uri
    activeOfferUriRef.current = uri
    useDeeplinkStore.getState().activateDeeplinkUri(uri)
    generationRef.current += 1
    setTxCode('')
    setPhase({ tag: 'initializing' })
    void handleOfferUri(uri)
    return true
  }, [dismissedDeeplinkUri, handleOfferUri])

  // Only treat a still-pending store URI as "incoming" so a failed offer from
  // Linking.useURL / initialOfferUri can still show the error + Back CTA.
  const hasIncomingPendingOffer = Boolean(
    (() => {
      const pendingOffer = resolveCredentialOfferDeeplink(pendingDeeplinkUri)
      return pendingOffer && pendingOffer !== dismissedDeeplinkUri
    })(),
  )

  useEffect(() => {
    const markOfferSourceHandled = () => {
      initialUrlCheckedRef.current = true
    }

    const resolvedInitialOffer = resolveCredentialOfferDeeplink(initialOfferUri)
    if (resolvedInitialOffer && beginOffer(resolvedInitialOffer)) {
      markOfferSourceHandled()
      return
    }

    const resolvedPendingOffer = resolveCredentialOfferDeeplink(pendingDeeplinkUri)
    if (resolvedPendingOffer && beginOffer(resolvedPendingOffer)) {
      markOfferSourceHandled()
      return
    }

    const resolvedActiveOffer = resolveCredentialOfferDeeplink(activeDeeplinkUri)
    if (
      resolvedActiveOffer
      && resolvedActiveOffer !== dismissedDeeplinkUri
      && beginOffer(resolvedActiveOffer)
    ) {
      markOfferSourceHandled()
      return
    }

    const resolvedIncomingOffer = resolveCredentialOfferDeeplink(incomingUrl)
    if (
      resolvedIncomingOffer
      && resolvedIncomingOffer !== directUrlHandledRef.current
    ) {
      markOfferSourceHandled()
      directUrlHandledRef.current = resolvedIncomingOffer
      beginOffer(resolvedIncomingOffer)
      return
    }

    if (initialUrlCheckedRef.current) return
    initialUrlCheckedRef.current = true

    let isMounted = true
    const checkId = missingOfferCheckRef.current + 1
    missingOfferCheckRef.current = checkId
    let graceTimer: ReturnType<typeof setTimeout> | undefined

    const showMissingOfferError = () => {
      if (!isMounted || missingOfferCheckRef.current !== checkId) return
      if (lastStartedOfferRef.current) return
      const { pendingUri, activeUri, dismissedUri } = useDeeplinkStore.getState()
      if (activeUri && activeUri !== dismissedUri) return
      const waitingOffer = resolveCredentialOfferDeeplink(pendingUri)
      if (waitingOffer && waitingOffer !== dismissedUri) return
      setPhase({ tag: 'error', message: 'No credential offer link is pending.' })
    }

    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (!isMounted || missingOfferCheckRef.current !== checkId) return
        const initialOffer = resolveCredentialOfferDeeplink(initialUrl)
        if (initialOffer) {
          directUrlHandledRef.current = initialOffer
          beginOffer(initialOffer)
          return
        }
        graceTimer = setTimeout(showMissingOfferError, MISSING_OFFER_GRACE_MS)
      })
      .catch((err) => {
        logWalletError('deeplink', 'initial-url-read-failed', err)
        if (!isMounted || missingOfferCheckRef.current !== checkId) return
        graceTimer = setTimeout(showMissingOfferError, MISSING_OFFER_GRACE_MS)
      })

    return () => {
      isMounted = false
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [
    activeDeeplinkUri,
    beginOffer,
    incomingUrl,
    initialOfferUri,
    pendingDeeplinkUri,
  ])

  const dismissActiveOffer = useCallback(() => {
    generationRef.current += 1
    missingOfferCheckRef.current += 1
    lastStartedOfferRef.current = null
    acquireAbortControllerRef.current?.abort()
    const pendingCredentialKeyId =
      phase.tag === 'preview' || phase.tag === 'issuerConfirm'
        ? phase.pendingMdoc?.pendingCredentialKeyId
        : undefined
    const credentialId =
      phase.tag === 'preview' || phase.tag === 'issuerConfirm'
        ? phase.record.id
        : undefined
    if (credentialId || pendingCredentialKeyId) {
      void discardIssuanceCredentialArtifacts({
        credentialId,
        pendingCredentialKeyId,
      })
    }
    const uriToDismiss = activeOfferUriRef.current ?? incomingUrl
    if (uriToDismiss) setDismissedDeeplinkUri(uriToDismiss)
  }, [incomingUrl, phase, setDismissedDeeplinkUri])

  const resetToWalletHome = useCallback(() => {
    dismissActiveOffer()
    onClose?.()
    returnToWallet()
  }, [dismissActiveOffer, onClose, returnToWallet])

  const exitFlow = useAndroidBackNavigation(resetToWalletHome)

  function handleTxCodeSubmit(offer: ResolvedCredentialOffer) {
    logWalletStep('deeplink', 'tx-code-submit', {
      ...describeOfferForLog(offer),
      txCodeProvided: txCode.trim().length > 0,
    })
    setPhase({
      tag: 'dopaConfirm',
      offer,
      ...(txCode.trim() ? { txCode: txCode.trim() } : {}),
    })
  }

  function handleDopaConfirm(offer: ResolvedCredentialOffer, code?: string) {
    logWalletStep('deeplink', 'dopa-confirmed', {
      ...describeOfferForLog(offer),
      txCodeProvided: Boolean(code),
    })
    void acquireForPreview(offer, code)
  }

  async function handleSave(record: VerifiableCredentialRecord, pendingMdoc?: PendingMdocCredential) {
    setPhase({ tag: 'saving' })
    logWalletStep('deeplink', 'credential-save-start', {
      ...describeCredentialForLog(record),
      mdocPresent: Boolean(pendingMdoc),
    })
    try {
      if (pendingMdoc) {
        await finalizeDualFormatCredential(record, pendingMdoc, {
          refreshCredentials,
        })
      } else {
        saveScannedCredential(record, { refreshCredentials })
      }
      await commitIssuanceCredentialKeyReplacement(record.id)
      logWalletStep('deeplink', 'credential-save-complete', describeCredentialForLog(record))
      setPhase({ tag: 'success', record })
    } catch (err) {
      logWalletError('deeplink', 'credential-save-failed', err, describeCredentialForLog(record))
      void discardIssuanceCredentialArtifacts({
        credentialId: record.id,
        pendingCredentialKeyId: pendingMdoc?.pendingCredentialKeyId,
      })
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (phase.tag === 'dopaConfirm') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={exitFlow} />
        <ThaiIdSuccessConfirmationPanel
          credentialType="ThaiNationalID"
          onConfirm={() => handleDopaConfirm(phase.offer, phase.txCode)}
        />
      </SafeAreaView>
    )
  }

  const acceptPreview = (record: VerifiableCredentialRecord, pendingMdoc?: PendingMdocCredential) => {
    if (
      record.type === 'DLTDrivingLicence'
      || record.type === 'ChulalongkornUniversityTranscript'
    ) {
      setPhase({
        tag: 'issuerConfirm',
        record,
        ...(pendingMdoc ? { pendingMdoc } : {}),
      })
      return
    }

    void handleSave(record, pendingMdoc)
  }

  if (phase.tag === 'preview') {
    if (phase.record.type === 'DLTDrivingLicence') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={exitFlow} />
          <DrivingLicencePreviewPanel
            record={phase.record}
            onAccept={() => acceptPreview(phase.record, phase.pendingMdoc)}
          />
        </SafeAreaView>
      )
    }

    if (phase.record.type === 'ThaiNationalID') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={exitFlow} />
          <ThaiIdReceivePanel
            record={phase.record}
            onConfirm={() => {
              void handleSave(phase.record, phase.pendingMdoc)
            }}
          />
        </SafeAreaView>
      )
    }

    if (phase.record.type === 'ChulalongkornUniversityTranscript') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={exitFlow} />
          <TranscriptPreviewPanel
            record={phase.record}
            profileImage={credentialImages.transcript}
            onAccept={() => acceptPreview(phase.record, phase.pendingMdoc)}
          />
        </SafeAreaView>
      )
    }

    const preview = readCredentialPreviewDisplay(phase.record)

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={exitFlow} />
        <View className="flex-1 items-center bg-surface px-4 pt-6">
          <ScrollView showsVerticalScrollIndicator={false} className="w-full" contentContainerClassName="items-center pb-8">
            <View
              testID="credential-preview-content"
              className="w-full max-w-[380px] overflow-hidden rounded-lg bg-white"
              style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
              <View className="bg-navy-royal px-5 py-3">
                <Text className="text-[13px] font-extrabold text-white">{preview.documentTitle}</Text>
              </View>
              <View className="px-7 pb-6 pt-7">
                <View className="items-center">
                  <Image source={credentialImages[preview.imageKey]} className="h-[104px] w-[92px]" resizeMode="contain" />
                </View>
                <View className="mt-5">
                  <Text className="text-[16px] font-extrabold leading-[22px] text-navy-deep">Information to receive</Text>
                  {preview.rows.map((row) => (
                    <View key={row.key} className="border-b border-gray200 py-3">
                      <Text className="text-[12px] leading-4 text-gray-cool">{row.label}</Text>
                      <Text className="text-[13px] font-bold leading-5 text-navy-deep">{row.value}</Text>
                    </View>
                  ))}
                </View>
                <AppButton
                  variant="solid-block"
                  label="ยอมรับ"
                  onPress={() => acceptPreview(phase.record, phase.pendingMdoc)}
                  className="mt-4 h-9 w-28 self-start !bg-success"
                  textClassName="text-[14px]"
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'issuerConfirm') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={exitFlow} />
        <IssuanceTrustConfirmationPanel
          variant="issuer"
          record={phase.record}
          onConfirm={() => {
            void handleSave(phase.record, phase.pendingMdoc)
          }}
        />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'txCode') {
    const canContinue = txCode.trim().length > 0
    const txCodeMeta = phase.offer.txCode
    const isNumericTxCode = txCodeMeta?.input_mode === 'numeric'
    const txCodeMaxLength = txCodeMeta?.length
    const useCodeBoxes = isNumericTxCode && txCodeMaxLength === 6

    function handleTxCodeChange(text: string) {
      if (isNumericTxCode) {
        setTxCode(normalizeNumericCode(text, txCodeMaxLength ?? 32))
        return
      }
      setTxCode(text)
    }

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={exitFlow} />
        <View className="flex-1 bg-surface px-4 pt-6">
          <View className="rounded-lg bg-white p-6">
            <Text className="text-[16px] font-extrabold text-navy-deep">Transaction code</Text>
            <Text className="mt-1 text-xs text-slate">
              {useCodeBoxes
                ? 'Tap the boxes to enter or paste the code from your email'
                : 'Enter the code from your email'}
            </Text>
            {useCodeBoxes ? (
              <View className="mt-4">
                <CodeBoxField
                  value={txCode}
                  onChange={handleTxCodeChange}
                  length={6}
                  testID="tx-code-boxes"
                />
              </View>
            ) : (
              <TextInput
                value={txCode}
                onChangeText={handleTxCodeChange}
                keyboardType={isNumericTxCode ? 'number-pad' : 'default'}
                textContentType={isNumericTxCode ? 'oneTimeCode' : 'none'}
                autoComplete={isNumericTxCode ? 'one-time-code' : 'off'}
                maxLength={txCodeMaxLength}
                placeholder="Enter transaction code"
                placeholderTextColor={THEME.grayCool}
                className="mt-3 min-h-[44px] rounded-lg border border-gray300 px-3 text-[15px] font-semibold text-navy-deep"
              />
            )}
            <AppButton
              variant="solid-block"
              label="Continue"
              disabled={!canContinue}
              onPress={() => handleTxCodeSubmit(phase.offer)}
              className={`mt-4 h-9 w-28 !bg-success ${!canContinue ? 'opacity-45' : ''}`}
              textClassName="text-[14px]"
            />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'success') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={exitFlow} />
        <ScanSuccessPanel record={phase.record} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'error') {
    if (hasIncomingPendingOffer) {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={exitFlow} />
          <View className="flex-1 items-center justify-center bg-surface-soft p-6">
            <ActivityIndicator color={THEME.navy} />
            <Text className="mt-3 text-center text-[15px] font-semibold text-navy-deep">Opening Credential Offer</Text>
            <Text className="mt-2 text-center text-[13px] text-gray500">Loading...</Text>
          </View>
        </SafeAreaView>
      )
    }

    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <AppButton variant="solid-block" label="Back to Wallet" onPress={exitFlow} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  const loadingLabel =
    phase.tag === 'saving'
      ? 'Saving Credential'
      : phase.tag === 'acquiring'
        ? 'Acquiring Credential'
        : phase.tag === 'auth_redirect'
          ? 'Opening Issuer Login'
        : phase.tag === 'resolving'
          ? 'Reading Offer'
          : 'Opening Credential Offer'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
      <WalletHeader onBack={exitFlow} />
      <View className="flex-1 items-center justify-center bg-surface-soft p-6">
        <ActivityIndicator color={THEME.navy} />
        <Text className="mt-3 text-center text-[15px] font-semibold text-navy-deep">{loadingLabel}</Text>
        <Text className="mt-2 text-center text-[13px] text-gray500">Loading...</Text>
      </View>
    </SafeAreaView>
  )
}
