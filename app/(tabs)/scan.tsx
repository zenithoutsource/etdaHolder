import { useCameraPermissions } from 'expo-camera'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../../src/components/AppButton'
import { ScanCaptureSurface } from '../../src/components/ScanCaptureSurface'
import { WalletHeader } from '../../src/components/WalletHeader'
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard'
import { submitRenewalRequest } from '../../src/services/credentials/credentialRenewalService'
import { logWalletError, logWalletStep } from '../../src/services/debug/walletLogger'
import { describeUriForLog } from '../../src/services/scan/scanLogDescriptors'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../../src/store/deeplinkStore'
import { isOid4VpAuthorizationRequest } from '../../src/services/vp/presentationService'
import {
  notifyPresentationIntakeRejectionForUri,
  readPresentationIntakeRejectionForUri,
} from '../../src/services/vp/presentationIntakeRejection'

type ScanPhase =
  | { tag: 'scanning' }
  | { tag: 'renewing' }
  | { tag: 'error'; message: string }

export default function ScanScreen() {
  useScreenCaptureGuard()
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<ScanPhase>({ tag: 'scanning' })
  const processingRef = useRef(false)
  const generationRef = useRef(0)
  const router = useRouter()
  const { renew } = useLocalSearchParams<{ renew?: string | string[] }>()
  const renewCredentialId = Array.isArray(renew) ? renew[0] : renew
  const setPendingPresentationRequest = useDeeplinkStore((s) => s.setPendingPresentationRequest)
  const setPendingDeeplinkUri = useDeeplinkStore((s) => s.setPendingDeeplinkUri)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const resetScanner = useCallback(() => {
    generationRef.current++
    setPhase({ tag: 'scanning' })
    processingRef.current = false
    logWalletStep('scan', 'scanner-reset', { generation: generationRef.current })
  }, [])

  const handoffPresentationRequest = useCallback((uri: string) => {
    logWalletStep('scan', 'presentation-handoff', describeUriForLog(uri))
    setPendingPresentationRequest({ uri, origin: 'scan' })
    processingRef.current = false
    router.push('/(tabs)/presentation-request')
  }, [router, setPendingPresentationRequest])

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

      if (phaseRef.current.tag === 'renewing') {
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
      if (readPresentationIntakeRejectionForUri(uri)) {
        logWalletStep('scan', 'presentation-replay-ignored', describeUriForLog(uri))
        notifyPresentationIntakeRejectionForUri(uri)
        processingRef.current = false
        resetScanner()
        return
      }

      logWalletStep('scan', 'presentation-qr-detected', describeUriForLog(uri))
      handoffPresentationRequest(uri)
      return
    }

    if (isCredentialOfferDeeplink(uri)) {
      logWalletStep('scan', 'credential-offer-handoff', describeUriForLog(uri))
      setPendingDeeplinkUri(uri)
      processingRef.current = false
      return
    }

    logWalletError('scan', 'unsupported-qr', new Error('Unsupported QR code'), describeUriForLog(uri))
    setPhase({ tag: 'error', message: 'Not a supported QR code. Please scan a valid issuance or verifier QR code.' })
    processingRef.current = false
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

  if (phase.tag === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <AppButton variant="solid-block" label="Try Again" onPress={resetScanner} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  const isLoading = phase.tag === 'renewing'
  const loadingLabel = phase.tag === 'renewing' ? 'Renewing Credential' : 'Scan QR code'

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
