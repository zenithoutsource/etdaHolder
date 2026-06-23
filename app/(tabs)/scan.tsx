import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Linking from 'expo-linking'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../../src/components/AppButton'
import { FacePreparePanel } from '../../src/components/FacePreparePanel'
import { PresentationConsentPanel } from '../../src/components/PresentationConsentPanel'
import { PresentationInfoPanel } from '../../src/components/PresentationInfoPanel'
import { PresentationResultPanel, type PresentationResultItem } from '../../src/components/PresentationResultPanel'
import { WalletHeader } from '../../src/components/WalletHeader'
import { TRUSTED_VERIFIERS } from '../../src/config/trustedVerifiers'
import { getCardSchema } from '../../src/config/cardSchemas'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { filterPresentableCredentials } from '../../src/services/credentials/credentialLifecycle'
import { readStoredCredentials } from '../../src/services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '../../src/services/debug/walletLogger'
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

export default function ScanScreen() {
  useStoredCredentials()
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<ScanPhase>({ tag: 'scanning' })
  const [viewfinderHeight, setViewfinderHeight] = useState(0)
  const processingRef = useRef(false)
  const generationRef = useRef(0)
  const handleBarcodeRef = useRef<(uri: string) => Promise<void>>(async () => undefined)
  const lastDeeplinkRef = useRef<string | null>(null)
  const router = useRouter()
  const incomingUrl = Linking.useURL()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const setPendingDeeplinkUri = useDeeplinkStore((s) => s.setPendingDeeplinkUri)
  const scanLineAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scanLineAnim])

  const resetScanner = useCallback(() => {
    generationRef.current++
    setPhase({ tag: 'scanning' })
    processingRef.current = false
    logWalletStep('scan', 'scanner-reset', { generation: generationRef.current })
  }, [])

  useFocusEffect(
    useCallback(() => {
      resetScanner()
    }, [resetScanner]),
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

  async function approvePresentation(request: ResolvedPresentationRequest) {
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
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(diagnosticRaw) })
    }
  }

  async function confirmPresentationFacePrepare(preparePhase: Extract<ScanPhase, { tag: 'presentationFacePrepare' }>) {
    const gen = generationRef.current
    try {
      logWalletStep('scan', 'presentation-biometric-start', describePresentationForLog(preparePhase.request))
      await confirmPresentationBiometric()
      logWalletStep('scan', 'presentation-biometric-complete', describePresentationForLog(preparePhase.request))
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
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetScanner} />
        <FacePreparePanel
          onScan={() => {
            logWalletStep('scan', 'presentation-face-prepare-done', describePresentationForLog(phase.request))
            void confirmPresentationFacePrepare(phase)
          }}
        />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'presentationConsent') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetScanner} />
        <PresentationConsentPanel
          request={phase.request}
          onAccept={() => {
            logWalletStep('scan', 'presentation-user-accepted', describePresentationForLog(phase.request))
            void approvePresentation(phase.request)
          }}
          onReject={resetScanner}
        />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'presentationInfo') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader title="Wallet" onBack={resetScanner} />
        <PresentationInfoPanel
          request={phase.request}
          onConfirm={() => {
            logWalletStep('scan', 'presentation-info-confirmed', describePresentationForLog(phase.request))
            setPhase({ tag: 'presentationFacePrepare', request: phase.request, nextStep: 'result', verifierName: phase.verifierName, response: phase.response })
          }}
        />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'presentationSuccess') {
    const schema = getCardSchema(phase.request.matchedCredential.type)
    const items: PresentationResultItem[] = [
      ...phase.request.disclosures.map((disclosure) => ({ key: disclosure.key, label: disclosure.label, status: 'verified' as const })),
      { key: phase.request.matchedCredential.id, label: schema.title, status: 'used' as const },
    ]

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader title="Verifier" onBack={goToWalletHome} />
        <PresentationResultPanel verifierName={phase.verifierName} items={items} onDone={goToWalletHome} />
      </SafeAreaView>
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

  const isLoading = phase.tag === 'resolving'
  const loadingLabel = phase.tag === 'resolving' ? 'Reading Request' : 'Scan QR code'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <View className="relative flex-1 items-center">
        <CameraView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={isLoading ? undefined : ({ data }) => { void handleBarcode(data) }}
        />
        <View className="w-full items-center bg-black/25 px-4 pb-10 pt-16">
          <Text className="text-3xl font-bold text-blue-700">{loadingLabel}</Text>
        </View>

        {/* Viewfinder box */}
        <View
          className="w-full max-w-[310px] overflow-hidden rounded-[18px]"
          style={{ aspectRatio: 1 }}
          onLayout={(e) => setViewfinderHeight(e.nativeEvent.layout.height)}>
          {/* Corner brackets */}
          <View style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderTopWidth: 3.5, borderLeftWidth: 3.5, borderColor: 'white', borderTopLeftRadius: 12 }} />
          <View style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderTopWidth: 3.5, borderRightWidth: 3.5, borderColor: 'white', borderTopRightRadius: 12 }} />
          <View style={{ position: 'absolute', bottom: 14, left: 14, width: 36, height: 36, borderBottomWidth: 3.5, borderLeftWidth: 3.5, borderColor: 'white', borderBottomLeftRadius: 12 }} />
          <View style={{ position: 'absolute', bottom: 14, right: 14, width: 36, height: 36, borderBottomWidth: 3.5, borderRightWidth: 3.5, borderColor: 'white', borderBottomRightRadius: 12 }} />

          {/* Animated scan line */}
          {!isLoading && viewfinderHeight > 0 && (
            <Animated.View
              style={{
                position: 'absolute',
                left: 14,
                right: 14,
                height: 2,
                borderRadius: 2,
                backgroundColor: 'rgba(0,40,135,0.55)',
                shadowColor: 'rgba(0,40,135,1)',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 8,
                shadowOpacity: 0.35,
                top: scanLineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    Math.round(viewfinderHeight * 0.1),
                    Math.round(viewfinderHeight * 0.88),
                  ],
                }),
              }}
            />
          )}

          {isLoading ? (
            <View className="absolute inset-0 items-center justify-center bg-black/25">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}
        </View>

        <View className="w-full flex-1 items-center bg-black/25 px-4 pt-10">
          {isLoading ? (
            <AppButton variant="icon-circle" label="Cancel" onPress={resetScanner} className="bg-white/20 px-6 py-2" textClassName="text-[14px] font-semibold text-white" />
          ) : (
            <View className="h-9" />
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
