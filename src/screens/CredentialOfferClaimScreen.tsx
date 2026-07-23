import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View, type ImageSourcePropType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../components/AppButton'
import { useAppDialog } from '../components/AppDialog'
import { CodeBoxField } from '../components/auth/CodeBoxField'
import { DrivingLicencePreviewPanel } from '../components/DrivingLicencePreviewPanel'
import { ScanSuccessPanel } from '../components/ScanSuccessPanel'
import { ThaIdVerificationPanel } from '../components/ThaIdVerificationPanel'
import { ThaiIdReceivePanel } from '../components/ThaiIdReceivePanel'
import { ThaiIdSuccessConfirmationPanel } from '../components/ThaiIdSuccessConfirmationPanel'
import { TranscriptPreviewPanel } from '../components/TranscriptPreviewPanel'
import { WalletHeader } from '../components/WalletHeader'


import { useStoredCredentials } from '../hooks/useStoredCredentials'
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
  isDualFormatOffer,
  persistPendingMdocForCredential,
  selectOfferForSingleFormatAcquire,
  type PendingMdocCredential,
} from '../services/credentials/dualFormatIssuance'
import { saveScannedCredential } from '../services/credentials/scannedCredentialSave'
import { readStoredCredentials } from '../services/credentials/storedCredentials'
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
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../services/vci/exchangeService'
import { readCredentialPreviewDisplay } from '../services/vci/qrIssuanceFlow'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../store/deeplinkStore'
import { normalizeNumericCode } from '../utils/normalizeNumericCode'

import { THEME } from '../config/themeColors'

const SCREEN_SAFE_EDGES = ['top'] as const

type ClaimPhase =
  | { tag: 'initializing' }
  | { tag: 'resolving' }
  | { tag: 'thaIdVerify'; offer: ResolvedCredentialOffer }
  | { tag: 'txCode'; offer: ResolvedCredentialOffer }
  | { tag: 'acquiring' }
  | { tag: 'preview'; record: VerifiableCredentialRecord; pendingMdoc?: PendingMdocCredential }
  | { tag: 'receive'; record: VerifiableCredentialRecord; pendingMdoc?: PendingMdocCredential }
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
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
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const offerGeneration = useDeeplinkStore((s) => s.offerGeneration)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeOfferUriRef = useRef<string | null>(null)
  const expiredCleanupPromptedRef = useRef<string | null>(null)
  const lastStartedOfferRef = useRef<string | null>(null)
  const missingOfferCheckRef = useRef(0)

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
    setPhase({ tag: 'acquiring' })
    logWalletStep('deeplink', 'credential-acquire-start', {
      ...describeOfferForLog(offer),
      txCodeProvided: Boolean(code),
    })
    try {
      if (isDualFormatOffer(offer.credentialConfigurations)) {
        logWalletStep('deeplink', 'credential-acquire-dual-format', describeOfferForLog(offer))
        const dualPreview = await withTimeout(
          acquireDualFormatForPreview(offer, { tx_code: code }),
          ACQUIRE_TIMEOUT_MS,
          'DeeplinkTimeout: acquiring credential timed out',
        )
        logWalletStep('deeplink', 'credential-acquire-complete', {
          ...describeCredentialForLog(dualPreview.primaryRecord),
          mdocPresent: Boolean(dualPreview.pendingMdoc),
          missingFormat: dualPreview.missingFormat,
        })
        if (generationRef.current === gen) {
          setPhase({
            tag: 'preview',
            record: dualPreview.primaryRecord,
            ...(dualPreview.pendingMdoc ? { pendingMdoc: dualPreview.pendingMdoc } : {}),
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
        acquireCredentialRecord(offerToAcquire, { tx_code: code }),
        ACQUIRE_TIMEOUT_MS,
        'DeeplinkTimeout: acquiring credential timed out',
      )
      logWalletStep('deeplink', 'credential-acquire-complete', describeCredentialForLog(record))
      if (generationRef.current === gen) setPhase({ tag: 'preview', record })
    } catch (err) {
      logWalletError('deeplink', 'credential-acquire-failed', err, describeOfferForLog(offer))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }, [])

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
      setTxCode('')
      const latestCredentials = readStoredCredentials()
      const renewalStatuses = readCredentialRenewalStatuses(latestCredentials)
      const isPidOffer = isPidCredentialOffer(offer)
      const pidGateStatus = readPidGateStatus(latestCredentials, renewalStatuses)
      logWalletStep('deeplink', 'offer-resolved', {
        ...describeOfferForLog(offer),
        isPidOffer,
        pidGateStatus,
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
        if (pidGateStatus === 'ready') {
          if (generationRef.current === gen) {
            setPhase({
              tag: 'error',
              message: WALLET_HOME_COPY.thaIdAlreadyActiveMessage,
            })
          }
          return
        }

        if (
          !canRequestCredentialType('ThaiNationalID', latestCredentials, renewalStatuses)
        ) {
          if (generationRef.current === gen) {
            setPhase({
              tag: 'error',
              message: WALLET_HOME_COPY.renewThaIdRequiredMessage,
            })
          }
          return
        }

        logWalletStep('deeplink', 'offer-pid-flow', describeOfferForLog(offer))
        if (generationRef.current === gen) setPhase({ tag: 'thaIdVerify', offer })
        return
      }
      if (offer.txCode) {
        logWalletStep('deeplink', 'offer-tx-code-required', describeOfferForLog(offer))
        if (generationRef.current === gen) setPhase({ tag: 'txCode', offer })
        return
      }
      await acquireForPreview(offer)
    } catch (err) {
      logWalletError('deeplink', 'offer-resolve-failed', err, describeUriForLog(uri))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }, [acquireForPreview])

  const beginOffer = useCallback((uri: string) => {
    if (!isCredentialOfferDeeplink(uri)) return false
    if (uri === dismissedDeeplinkUri) return false
    if (uri === lastStartedOfferRef.current) return false

    missingOfferCheckRef.current += 1
    lastStartedOfferRef.current = uri
    activeOfferUriRef.current = uri
    if (useDeeplinkStore.getState().pendingUri === uri) {
      useDeeplinkStore.getState().consumePendingDeeplinkUri()
    }
    generationRef.current += 1
    setTxCode('')
    setPhase({ tag: 'initializing' })
    void handleOfferUri(uri)
    return true
  }, [dismissedDeeplinkUri, handleOfferUri])

  const hasIncomingPendingOffer = Boolean(
    pendingDeeplinkUri
      && isCredentialOfferDeeplink(pendingDeeplinkUri)
      && pendingDeeplinkUri !== dismissedDeeplinkUri,
  )

  useEffect(() => {
    if (initialOfferUri && beginOffer(initialOfferUri)) return

    if (pendingDeeplinkUri && beginOffer(pendingDeeplinkUri)) return

    const directOffer = incomingUrl && isCredentialOfferDeeplink(incomingUrl) && incomingUrl !== directUrlHandledRef.current ? incomingUrl : null
    if (directOffer) {
      initialUrlCheckedRef.current = true
      directUrlHandledRef.current = directOffer
      beginOffer(directOffer)
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
      const pending = useDeeplinkStore.getState().pendingUri
      if (
        pending
        && isCredentialOfferDeeplink(pending)
        && pending !== useDeeplinkStore.getState().dismissedUri
      ) {
        return
      }
      setPhase({ tag: 'error', message: 'No credential offer link is pending.' })
    }

    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (!isMounted || missingOfferCheckRef.current !== checkId) return
        const initialOffer = initialUrl && isCredentialOfferDeeplink(initialUrl) ? initialUrl : null
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
  }, [beginOffer, incomingUrl, initialOfferUri, pendingDeeplinkUri, offerGeneration])

  function resetToWalletHome() {
    generationRef.current += 1
    missingOfferCheckRef.current += 1
    lastStartedOfferRef.current = null
    const uriToDismiss = activeOfferUriRef.current ?? incomingUrl
    if (uriToDismiss) setDismissedDeeplinkUri(uriToDismiss)
    onClose?.()
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(tabs)')
    }
  }

  function handleTxCodeSubmit(offer: ResolvedCredentialOffer) {
    logWalletStep('deeplink', 'tx-code-submit', {
      ...describeOfferForLog(offer),
      txCodeProvided: txCode.trim().length > 0,
    })
    void acquireForPreview(offer, txCode.trim() || undefined)
  }

  function handleThaIdVerified(offer: ResolvedCredentialOffer) {
    logWalletStep('deeplink', 'pid-verification-confirmed', describeOfferForLog(offer))
    if (offer.txCode) {
      setPhase({ tag: 'txCode', offer })
      return
    }
    void acquireForPreview(offer)
  }

  async function handleSave(record: VerifiableCredentialRecord, pendingMdoc?: PendingMdocCredential) {
    setPhase({ tag: 'saving' })
    logWalletStep('deeplink', 'credential-save-start', {
      ...describeCredentialForLog(record),
      mdocPresent: Boolean(pendingMdoc),
    })
    try {
      saveScannedCredential(record, { refreshCredentials })
      if (pendingMdoc) {
        await persistPendingMdocForCredential(record.id, pendingMdoc)
        logWalletStep('deeplink', 'credential-mdoc-saved', {
          credentialId: record.id,
          docType: pendingMdoc.docType,
        })
      }
      logWalletStep('deeplink', 'credential-save-complete', describeCredentialForLog(record))
      setPhase({ tag: 'success', record })
    } catch (err) {
      logWalletError('deeplink', 'credential-save-failed', err, describeCredentialForLog(record))
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (phase.tag === 'preview') {
    if (phase.record.type === 'DLTDrivingLicence') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={resetToWalletHome} />
          <DrivingLicencePreviewPanel
            onAccept={() => {
              void handleSave(phase.record, phase.pendingMdoc)
            }}
          />
        </SafeAreaView>
      )
    }

    if (phase.record.type === 'ThaiNationalID') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={resetToWalletHome} />
          <ThaiIdSuccessConfirmationPanel
            record={phase.record}
            onConfirm={() =>
              setPhase({
                tag: 'receive',
                record: phase.record,
                ...(phase.pendingMdoc ? { pendingMdoc: phase.pendingMdoc } : {}),
              })
            }
          />
        </SafeAreaView>
      )
    }

    if (phase.record.type === 'ChulalongkornUniversityTranscript') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={resetToWalletHome} />
          <TranscriptPreviewPanel
            record={phase.record}
            profileImage={credentialImages.transcript}
            onAccept={() => {
              void handleSave(phase.record, phase.pendingMdoc)
            }}
          />
        </SafeAreaView>
      )
    }

    const preview = readCredentialPreviewDisplay(phase.record)

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={resetToWalletHome} />
        <View className="flex-1 bg-surface px-4 pt-6">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <View
              className="overflow-hidden rounded-lg bg-white"
              style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
              <View className="bg-navy-royal px-5 py-3">
                <Text className="text-[13px] font-extrabold text-white">{preview.documentTitle}</Text>
              </View>
              <View className="px-7 pb-6 pt-7">
                <View className="items-center">
                  <Image source={credentialImages[preview.imageKey]} style={{ width: 92, height: 104 }} resizeMode="contain" />
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
                  onPress={() => {
                    void handleSave(phase.record, phase.pendingMdoc)
                  }}
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

  if (phase.tag === 'receive') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={resetToWalletHome} />
        <ThaiIdReceivePanel
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
        <WalletHeader onBack={resetToWalletHome} />
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

  if (phase.tag === 'thaIdVerify') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={resetToWalletHome} />
        <ThaIdVerificationPanel offer={phase.offer} onContinue={() => handleThaIdVerified(phase.offer)} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'success') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
        <WalletHeader onBack={resetToWalletHome} />
        <ScanSuccessPanel record={phase.record} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'error') {
    if (hasIncomingPendingOffer) {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
          <WalletHeader onBack={resetToWalletHome} />
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
        <AppButton variant="solid-block" label="Back to Wallet" onPress={resetToWalletHome} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  const loadingLabel =
    phase.tag === 'saving'
      ? 'Saving Credential'
      : phase.tag === 'acquiring'
        ? 'Acquiring Credential'
        : phase.tag === 'resolving'
          ? 'Reading Offer'
          : 'Opening Credential Offer'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={SCREEN_SAFE_EDGES}>
      <WalletHeader onBack={resetToWalletHome} />
      <View className="flex-1 items-center justify-center bg-surface-soft p-6">
        <ActivityIndicator color={THEME.navy} />
        <Text className="mt-3 text-center text-[15px] font-semibold text-navy-deep">{loadingLabel}</Text>
        <Text className="mt-2 text-center text-[13px] text-gray500">Loading...</Text>
      </View>
    </SafeAreaView>
  )
}
