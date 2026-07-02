import { useCameraPermissions } from 'expo-camera'
import * as Linking from 'expo-linking'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../../src/components/AppButton'
import { FacePreparePanel } from '../../src/components/FacePreparePanel'
import { PresentationConsentPanel } from '../../src/components/PresentationConsentPanel'
import { PresentationInfoPanel } from '../../src/components/PresentationInfoPanel'
import { PresentationResultPanel, type PresentationResultItem } from '../../src/components/PresentationResultPanel'
import { PresentationStepScaffold } from '../../src/components/PresentationStepScaffold'
import { ScanCaptureSurface } from '../../src/components/ScanCaptureSurface'
import { WalletHeader } from '../../src/components/WalletHeader'
import { TRUSTED_VERIFIERS } from '../../src/config/trustedVerifiers'
import { getCardSchema } from '../../src/config/cardSchemas'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { filterPresentableCredentials } from '../../src/services/credentials/credentialLifecycle'
import { submitRenewalRequest } from '../../src/services/credentials/credentialRenewalService'
import { readStoredCredentials } from '../../src/services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '../../src/services/debug/walletLogger'
import {
  NfcDisabledError,
  NfcReadCancelledError,
  NfcUnsupportedError,
  NfcUnsupportedTagError,
  cancelNfcRead,
  readSingleNfcPayload,
} from '../../src/services/nfc/nfcTagService'
import { isCredentialOfferDeeplink, isSupportedWalletDeeplink, useDeeplinkStore } from '../../src/store/deeplinkStore'
import { recordSuccessfulPresentation } from '../../src/services/history/presentationHistory'
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
  | { tag: 'readingNfc' }
  | { tag: 'presentationFacePrepare'; request: ResolvedPresentationRequest; nextStep: 'consent' | 'result'; verifierName?: string; response?: VerifierResponse }
  | { tag: 'presentationConsent'; request: ResolvedPresentationRequest }
  | { tag: 'presentationInfo'; request: ResolvedPresentationRequest; verifierName: string; response: VerifierResponse }
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

function toNfcFriendlyError(error: unknown): string {
  if (error instanceof NfcDisabledError) {
    return 'Please enable NFC in Settings and try again.'
  }

  if (error instanceof NfcUnsupportedError) {
    return 'NFC is not supported on this device.'
  }

  if (error instanceof NfcUnsupportedTagError) {
    return 'This NFC tag is not supported by the wallet.'
  }

  return 'Unable to read NFC tag. Please try again.'
}

export default function ScanScreen() {
  useStoredCredentials()
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<ScanPhase>({ tag: 'scanning' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const processingRef = useRef(false)
  const generationRef = useRef(0)
  const handleBarcodeRef = useRef<(uri: string) => Promise<void>>(async () => undefined)
  const lastDeeplinkRef = useRef<string | null>(null)
  const router = useRouter()
  const { renew } = useLocalSearchParams<{ renew?: string | string[] }>()
  const renewCredentialId = Array.isArray(renew) ? renew[0] : renew
  const incomingUrl = Linking.useURL()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const setPendingDeeplinkUri = useDeeplinkStore((s) => s.setPendingDeeplinkUri)
  const resetScanner = useCallback(() => {
    generationRef.current++
    setPhase((prev) => {
      if (prev.tag === 'readingNfc') {
        void cancelNfcRead()
      }
      return { tag: 'scanning' }
    })
    processingRef.current = false
    logWalletStep('scan', 'scanner-reset', { generation: generationRef.current })
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

      resetScanner()
      return undefined
    }, [renewCredentialId, resetScanner, router]),
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
        if (generationRef.current === gen) setPhase({ tag: 'presentationFacePrepare', request, nextStep: 'consent' })
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
    if (!pendingDeeplinkUri) return
    handleDeeplink(pendingDeeplinkUri, 'pending')
  }, [handleDeeplink, pendingDeeplinkUri])

  useEffect(() => {
    if (incomingUrl) handleDeeplink(incomingUrl, 'incoming')
  }, [incomingUrl, handleDeeplink])

  const handleNfcPress = useCallback(async () => {
    if (processingRef.current) {
      logWalletStep('scan', 'nfc-ignored-processing')
      return
    }

    const gen = generationRef.current
    processingRef.current = true
    setPhase({ tag: 'readingNfc' })
    logWalletStep('scan', 'nfc-button-pressed')

    try {
      const payload = await readSingleNfcPayload()
      logWalletStep('scan', 'nfc-payload-read', { kind: payload.kind })
      if (generationRef.current !== gen) return

      if (payload.kind === 'credential-offer') {
        setPendingDeeplinkUri(payload.uri)
        resetScanner()
        return
      }

      processingRef.current = false
      await handleBarcodeRef.current(payload.uri)
    } catch (err) {
      if (err instanceof NfcReadCancelledError) {
        logWalletStep('scan', 'nfc-cancelled')
        if (generationRef.current === gen) resetScanner()
        return
      }

      logWalletError('scan', 'nfc-read-failed', err)
      processingRef.current = false
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toNfcFriendlyError(err) })
    }
  }, [resetScanner, setPendingDeeplinkUri])

  async function approvePresentation(request: ResolvedPresentationRequest) {
    if (isSubmitting) return
    setIsSubmitting(true)
    const gen = generationRef.current
    let presentationDebug: string | undefined
    try {
      logWalletStep('scan', 'presentation-approve-start', describePresentationForLog(request))
      const presentationTokenMode = readPresentationTokenMode(request)
      const presentationAudience = readPresentationTokenAudience(request)
      logWalletStep('scan', 'presentation-token-mode', {
        ...describePresentationForLog(request),
        presentationTokenMode,
        audience: presentationAudience,
        presentationSubmissionPresent: Boolean(request.presentationDefinition),
      })
      const { vpToken, presentationSubmission } = await createApprovedPresentationResponse(request)
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
        verifierName: request.verifier.name,
        documentType: getCardSchema(request.matchedCredential.type).title,
        disclosedClaims: request.disclosures.map((disclosure) => disclosure.label),
      })
      logWalletStep('scan', 'presentation-history-recorded', describePresentationForLog(request))

      if (generationRef.current === gen) {
        setPhase({ tag: 'presentationInfo', request, verifierName: request.verifier.name, response })
      }
    } catch (err) {
      logWalletError('scan', 'presentation-approve-failed', err, describePresentationForLog(request))
      const raw = err instanceof Error ? err.message : String(err)
      const diagnosticRaw = presentationDebug ? `${raw}\n\n${presentationDebug}` : raw
      setIsSubmitting(false)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(diagnosticRaw) })
    }
  }

  async function confirmPresentationFacePrepare(preparePhase: Extract<ScanPhase, { tag: 'presentationFacePrepare' }>) {
    const gen = generationRef.current
    try {
      // Signed presentation modes (vp-token / sd-jwt-kb) already get a mandatory
      // Keychain biometric gate at sign time (crypto.ts signJwtLikeObject). Running
      // the app-level biometric check here too asks the user twice for one approval.
      // raw-credential mode never signs, so it still needs this as its only gate.
      const needsAppLevelBiometric =
        preparePhase.nextStep !== 'consent' || readPresentationTokenMode(preparePhase.request) === 'raw-credential'

      if (needsAppLevelBiometric) {
        logWalletStep('scan', 'presentation-biometric-start', describePresentationForLog(preparePhase.request))
        await confirmPresentationBiometric()
        logWalletStep('scan', 'presentation-biometric-complete', describePresentationForLog(preparePhase.request))
      } else {
        logWalletStep('scan', 'presentation-biometric-skipped-signed-mode', describePresentationForLog(preparePhase.request))
      }
      if (generationRef.current !== gen) return
      if (preparePhase.nextStep === 'consent') {
        setPhase({ tag: 'presentationConsent', request: preparePhase.request })
      } else {
        setPhase({
          tag: 'presentationSuccess',
          request: preparePhase.request,
          verifierName: preparePhase.verifierName!,
          response: preparePhase.response!,
        })
      }
    } catch (err) {
      logWalletError('scan', 'presentation-biometric-failed', err, describePresentationForLog(preparePhase.request))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }

  function goToWalletHome() {
    resetScanner()
    router.replace('/')
  }

  if (!permission) {
    return <View className="flex-1" />
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f4f6fa] p-6">
        <Text className="mb-5 text-center text-[15px] text-[#374151]">
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
            logWalletStep('scan', 'presentation-user-accepted', describePresentationForLog(phase.request))
            void approvePresentation(phase.request)
          }}
          onReject={resetScanner}
          disabled={isSubmitting}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'presentationInfo') {
    return (
      <PresentationStepScaffold title="Wallet" onBack={resetScanner}>
        <PresentationInfoPanel
          request={phase.request}
          onConfirm={() => {
            logWalletStep('scan', 'presentation-info-confirmed', describePresentationForLog(phase.request))
            setPhase({ tag: 'presentationFacePrepare', request: phase.request, nextStep: 'result', verifierName: phase.verifierName, response: phase.response })
          }}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'presentationSuccess') {
    const schema = getCardSchema(phase.request.matchedCredential.type)
    const items: PresentationResultItem[] = [
      ...phase.request.disclosures.map((disclosure) => ({ key: disclosure.key, label: disclosure.label, status: 'verified' as const })),
      { key: phase.request.matchedCredential.id, label: schema.title, status: 'used' as const },
    ]

    return (
      <PresentationStepScaffold title="Verifier" onBack={goToWalletHome}>
        <PresentationResultPanel verifierName={phase.verifierName} items={items} onDone={goToWalletHome} />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f4f6fa] p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <AppButton variant="solid-block" label="Try Again" onPress={resetScanner} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  const isLoading =
    phase.tag === 'resolving' || phase.tag === 'readingNfc' || phase.tag === 'renewing'
  const loadingLabel =
    phase.tag === 'readingNfc'
      ? 'Hold Near NFC Tag'
      : phase.tag === 'renewing'
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
        onNfcPress={() => {
          void handleNfcPress()
        }}
        onCancel={resetScanner}
      />
    </SafeAreaView>
  )
}
