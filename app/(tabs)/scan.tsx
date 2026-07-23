import { useCameraPermissions } from 'expo-camera'
import * as Linking from 'expo-linking'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../../src/components/AppButton'
import { FacePreparePanel } from '../../src/components/FacePreparePanel'
import { PresentationConsentPanel, readInitialSelectedClaimKeys, readSelectedDisclosureLabels } from '../../src/components/PresentationConsentPanel'
import { PresentationInfoPanel } from '../../src/components/PresentationInfoPanel'
import { PresentationResultPanel } from '../../src/components/PresentationResultPanel'
import { PresentationStepScaffold } from '../../src/components/PresentationStepScaffold'
import { ScanCaptureSurface } from '../../src/components/ScanCaptureSurface'
import { WalletHeader } from '../../src/components/WalletHeader'
import { TRUSTED_VERIFIERS } from '../../src/config/trustedVerifiers'
import { getCardSchema } from '../../src/config/cardSchemas'
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { filterPresentableCredentials } from '../../src/services/credentials/credentialLifecycle'
import { submitRenewalRequest } from '../../src/services/credentials/credentialRenewalService'
import { readStoredCredentials } from '../../src/services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '../../src/services/debug/walletLogger'
import { isCredentialOfferDeeplink, isPresentationRequestDeeplink, isSupportedWalletDeeplink, useDeeplinkStore } from '../../src/store/deeplinkStore'
import { recordSuccessfulPresentation } from '../../src/services/history/presentationHistory'
import { recordOid4vpPresentationFailure } from '../../src/services/history/walletHistoryRecording'
import { appendWalletHistoryEvent } from '../../src/services/history/walletEventLog'
import { describePresentationForLog, describeUriForLog } from '../../src/services/scan/scanLogDescriptors'
import { toFriendlyError } from '../../src/services/scan/scanFriendlyErrors'
import { confirmPresentationBiometric, createApprovedPresentationResponse } from '../../src/services/vp/presentationApproval'
import { describePresentationAttempt } from '../../src/services/vp/presentationDiagnostics'
import {
  isOid4VpAuthorizationRequest,
  readPresentationTokenAudience,
  readPresentationTokenMode,
  resolvePresentationRequest,
  submitPresentationResponse,
  type ResolvedPresentationRequest,
  type VerifierResponse,
} from '../../src/services/vp/presentationService'

type ScanPhase =
  | { tag: 'scanning' }
  | { tag: 'resolving' }
  | { tag: 'renewing' }
  | { tag: 'presentationFacePrepare'; request: ResolvedPresentationRequest }
  | { tag: 'presentationConsent'; request: ResolvedPresentationRequest }
  | { tag: 'presentationInfo'; request: ResolvedPresentationRequest }
  | { tag: 'presentationSuccess'; request: ResolvedPresentationRequest; verifierName: string; response: VerifierResponse }
  | { tag: 'error'; message: string }

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

const RESOLVE_TIMEOUT_MS = 20_000
const PRESENT_TIMEOUT_MS = 30_000

export default function ScanScreen() {
  useScreenCaptureGuard()
  useStoredCredentials()
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<ScanPhase>({ tag: 'scanning' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClaimKeys, setSelectedClaimKeys] = useState<Set<string>>(() => new Set())
  const processingRef = useRef(false)
  const generationRef = useRef(0)
  const handleBarcodeRef = useRef<(uri: string) => Promise<void>>(async () => undefined)
  const lastDeeplinkRef = useRef<string | null>(null)
  const lastVpGenerationRef = useRef(0)
  const router = useRouter()
  const { renew } = useLocalSearchParams<{ renew?: string | string[] }>()
  const renewCredentialId = Array.isArray(renew) ? renew[0] : renew
  const incomingUrl = Linking.useURL()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const vpGeneration = useDeeplinkStore((s) => s.vpGeneration)
  const setPendingDeeplinkUri = useDeeplinkStore((s) => s.setPendingDeeplinkUri)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const resetScanner = useCallback(() => {
    const dismissedVpUri = lastDeeplinkRef.current
    if (dismissedVpUri && isPresentationRequestDeeplink(dismissedVpUri)) {
      setDismissedDeeplinkUri(dismissedVpUri)
      lastDeeplinkRef.current = null
    }
    generationRef.current++
    setPhase({ tag: 'scanning' })
    processingRef.current = false
    setIsSubmitting(false)
    logWalletStep('scan', 'scanner-reset', { generation: generationRef.current })
  }, [setDismissedDeeplinkUri])

  const isActivePresentationPhase = useCallback((current: ScanPhase) => {
    return (
      current.tag === 'presentationFacePrepare' ||
      current.tag === 'presentationConsent' ||
      current.tag === 'presentationInfo' ||
      current.tag === 'presentationSuccess' ||
      current.tag === 'resolving' ||
      current.tag === 'renewing'
    )
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (renewCredentialId) {
        if (processingRef.current) return undefined

        processingRef.current = true
        setPhase({ tag: 'renewing' })
        logWalletStep('scan', 'renewal-request-start', { credentialId: renewCredentialId })

        void (async () => {
          try {
            await submitRenewalRequest(renewCredentialId)
            logWalletStep('scan', 'renewal-request-submitted', {
              credentialId: renewCredentialId,
            })
            router.replace({
              pathname: '/(tabs)/credential/[id]',
              params: { id: renewCredentialId },
            })
          } catch (err) {
            logWalletError('scan', 'renewal-request-failed', err, { credentialId: renewCredentialId })
            setPhase({
              tag: 'error',
              message: 'Unable to renew this credential. Please try again.',
            })
          } finally {
            processingRef.current = false
          }
        })()

        return undefined
      }

      if (isActivePresentationPhase(phaseRef.current)) {
        return undefined
      }

      resetScanner()
      return undefined
    }, [renewCredentialId, resetScanner, router, isActivePresentationPhase]),
  )

  async function handleBarcode(uri: string) {
    logWalletStep('scan', 'barcode-received', {
      ...describeUriForLog(uri),
      alreadyProcessing: processingRef.current,
    })
    if (processingRef.current) {
      logWalletStep('scan', 'barcode-ignored-processing', describeUriForLog(uri))
      return
    }
    processingRef.current = true

    if (isOid4VpAuthorizationRequest(uri)) {
      const gen = generationRef.current
      setPhase({ tag: 'resolving' })
      logWalletStep('scan', 'presentation-qr-detected', describeUriForLog(uri))
      try {
        const latestCredentials = readStoredCredentials()
        const presentableCredentials = filterPresentableCredentials(latestCredentials)
        logWalletStep('scan', 'presentation-credentials-loaded', {
          storedCount: latestCredentials.length,
          presentableCount: presentableCredentials.length,
        })
        const request = await withTimeout(
          resolvePresentationRequest(uri, presentableCredentials, { trustedVerifiers: TRUSTED_VERIFIERS }),
          RESOLVE_TIMEOUT_MS,
          'ScanTimeout: resolving presentation request timed out',
        )
        logWalletStep('scan', 'presentation-resolved', describePresentationForLog(request))
        if (generationRef.current === gen) setPhase({ tag: 'presentationFacePrepare', request })
      } catch (err) {
        logWalletError('scan', 'presentation-resolve-failed', err, describeUriForLog(uri))
        const raw = err instanceof Error ? err.message : String(err)
        if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
      }
      return
    }

    if (isCredentialOfferDeeplink(uri)) {
      logWalletStep('scan', 'credential-offer-handoff', describeUriForLog(uri))
      setPendingDeeplinkUri(uri)
      return
    }

    logWalletError('scan', 'unsupported-qr', new Error('Unsupported QR code'), describeUriForLog(uri))
    setPhase({ tag: 'error', message: 'Not a supported QR code. Please scan a valid issuance or verifier QR code.' })
    return
  }

  useEffect(() => {
    handleBarcodeRef.current = handleBarcode
  })

  const handleDeeplink = useCallback((uri: string, source: 'pending' | 'incoming') => {
    if (!isSupportedWalletDeeplink(uri)) return
    if (isCredentialOfferDeeplink(uri)) return
    if (uri === lastDeeplinkRef.current) {
      logWalletStep('scan', 'deeplink-ignored-duplicate', { source, ...describeUriForLog(uri) })
      return
    }

    lastDeeplinkRef.current = uri
    logWalletStep('scan', 'deeplink-received', { source, ...describeUriForLog(uri) })
    void handleBarcodeRef.current(uri)
  }, [])

  useEffect(() => {
    if (vpGeneration === lastVpGenerationRef.current) return
    lastVpGenerationRef.current = vpGeneration
    lastDeeplinkRef.current = null
  }, [vpGeneration])

  useEffect(() => {
    if (!pendingDeeplinkUri) return
    handleDeeplink(pendingDeeplinkUri, 'pending')
  }, [handleDeeplink, pendingDeeplinkUri, vpGeneration])

  useEffect(() => {
    if (incomingUrl) handleDeeplink(incomingUrl, 'incoming')
  }, [incomingUrl, handleDeeplink])

  async function approvePresentation(
    request: ResolvedPresentationRequest,
    holderSelectedClaimKeys: ReadonlySet<string>,
  ) {
    if (isSubmitting) return
    setIsSubmitting(true)
    const gen = generationRef.current
    let presentationDebug: string | undefined
    const disclosedLabels = readSelectedDisclosureLabels(request.disclosures, holderSelectedClaimKeys)
    try {
      logWalletStep('scan', 'presentation-approve-start', describePresentationForLog(request))
      const presentationTokenMode = readPresentationTokenMode(request)
      if (presentationTokenMode === 'raw-credential') {
        logWalletStep('scan', 'presentation-biometric-start', describePresentationForLog(request))
        await confirmPresentationBiometric()
        logWalletStep('scan', 'presentation-biometric-complete', describePresentationForLog(request))
      }
      const presentationAudience = readPresentationTokenAudience(request)
      logWalletStep('scan', 'presentation-token-mode', {
        ...describePresentationForLog(request),
        presentationTokenMode,
        audience: presentationAudience,
        presentationSubmissionPresent: Boolean(request.presentationDefinition),
        selectedClaimCount: holderSelectedClaimKeys.size,
      })
      const { vpToken, presentationSubmission } = await createApprovedPresentationResponse(request, {
        selectedClaimKeys: [...holderSelectedClaimKeys],
      })
      logWalletStep('scan', 'presentation-token-created', {
        ...describePresentationForLog(request),
        presentationTokenMode,
        presentationBytes: vpToken.length,
      })
      presentationDebug = describePresentationAttempt({ request, vpToken })
      const response = await withTimeout(
        submitPresentationResponse(request, { vpToken, presentationSubmission }),
        PRESENT_TIMEOUT_MS,
        'ScanTimeout: presenting credential timed out',
      )
      logWalletStep('scan', 'presentation-submit-complete', {
        ...describePresentationForLog(request),
        responseStatus: response.status,
        messagePresent: Boolean(response.message),
      })

      recordSuccessfulPresentation({
        credentialId: request.matchedCredential.id,
        credentialType: request.matchedCredential.type,
        verifierName: request.verifier.name,
        documentType: getCardSchema(request.matchedCredential.type).title,
        disclosedClaims: disclosedLabels,
      })
      logWalletStep('scan', 'presentation-history-recorded', describePresentationForLog(request))

      if (response.redirectUri) {
        logWalletStep('scan', 'presentation-return-uri-open', {
          ...describePresentationForLog(request),
          returnUriOrigin: new URL(response.redirectUri).origin,
        })
        void Linking.openURL(response.redirectUri)
      }

      if (generationRef.current === gen) {
        setPhase({
          tag: 'presentationSuccess',
          request,
          verifierName: request.verifier.name,
          response,
        })
      }
    } catch (err) {
      logWalletError('scan', 'presentation-approve-failed', err, describePresentationForLog(request))
      recordOid4vpPresentationFailure(request, err)
      const raw = err instanceof Error ? err.message : String(err)
      const diagnosticRaw = presentationDebug ? `${raw}\n\n${presentationDebug}` : raw
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(diagnosticRaw) })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function confirmPresentationFacePrepare(preparePhase: Extract<ScanPhase, { tag: 'presentationFacePrepare' }>) {
    const gen = generationRef.current
    if (generationRef.current !== gen) return
    setSelectedClaimKeys(readInitialSelectedClaimKeys(preparePhase.request.disclosures))
    setPhase({ tag: 'presentationConsent', request: preparePhase.request })
  }

  function handlePresentationInfoBack(request: ResolvedPresentationRequest) {
    logWalletStep('scan', 'presentation-user-declined', describePresentationForLog(request))
    appendWalletHistoryEvent({
      kind: 'presentation-declined',
      credentialId: request.matchedCredential.id,
      documentType: getCardSchema(request.matchedCredential.type).title,
      partyName: request.verifier.name,
      disclosedClaims: readSelectedDisclosureLabels(request.disclosures, selectedClaimKeys),
      channel: 'oid4vp',
    })
    resetScanner()
  }

  function goToWalletHome() {
    resetScanner()
    router.replace('/(tabs)')
  }

  if (!permission) {
    return <View className="flex-1" />
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <Text className="mb-5 text-center text-[15px] text-gray700">
          Camera access is required to scan QR codes.
        </Text>
        <AppButton variant="solid-block" label="Allow Camera" onPress={requestPermission} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'presentationFacePrepare') {
    return (
      <PresentationStepScaffold onBack={resetScanner}>
        <FacePreparePanel
          onScan={() => {
            logWalletStep('scan', 'presentation-face-prepare-done', describePresentationForLog(phase.request))
            void confirmPresentationFacePrepare(phase)
          }}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'presentationConsent') {
    return (
      <PresentationStepScaffold onBack={resetScanner}>
        <PresentationConsentPanel
          request={phase.request}
          onAccept={() => {
            logWalletStep('scan', 'presentation-consent-acknowledged', describePresentationForLog(phase.request))
            setSelectedClaimKeys(readInitialSelectedClaimKeys(phase.request.disclosures))
            setPhase({ tag: 'presentationInfo', request: phase.request })
          }}
          onReject={() => {
            logWalletStep('scan', 'presentation-user-declined', describePresentationForLog(phase.request))
            appendWalletHistoryEvent({
              kind: 'presentation-declined',
              credentialId: phase.request.matchedCredential.id,
              documentType: getCardSchema(phase.request.matchedCredential.type).title,
              partyName: phase.request.verifier.name,
              disclosedClaims: readSelectedDisclosureLabels(
                phase.request.disclosures,
                readInitialSelectedClaimKeys(phase.request.disclosures),
              ),
              channel: 'oid4vp',
            })
            resetScanner()
          }}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'presentationInfo') {
    return (
      <PresentationStepScaffold title="Wallet" onBack={() => handlePresentationInfoBack(phase.request)}>
        <PresentationInfoPanel
          request={phase.request}
          selectedClaimKeys={selectedClaimKeys}
          onToggleClaim={(claimKey) => {
            setSelectedClaimKeys((previous) => {
              const next = new Set(previous)
              if (next.has(claimKey)) next.delete(claimKey)
              else next.add(claimKey)
              return next
            })
          }}
          onConfirm={() => {
            logWalletStep('scan', 'presentation-user-accepted', describePresentationForLog(phase.request))
            void approvePresentation(phase.request, selectedClaimKeys)
          }}
          submitting={isSubmitting}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'presentationSuccess') {
    return (
      <PresentationStepScaffold title="Verifier" onBack={goToWalletHome}>
        <PresentationResultPanel verifierName={phase.verifierName} onDone={goToWalletHome} />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <AppButton variant="solid-block" label="Try Again" onPress={resetScanner} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  const isLoading = phase.tag === 'resolving' || phase.tag === 'renewing'
  const loadingLabel =
    phase.tag === 'renewing'
      ? 'Renewing Credential'
      : phase.tag === 'resolving'
        ? 'Reading Request'
        : 'Scan QR code'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <ScanCaptureSurface
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onBarcode={(data) => {
          void handleBarcode(data)
        }}
        onCancel={resetScanner}
      />
    </SafeAreaView>
  )
}
