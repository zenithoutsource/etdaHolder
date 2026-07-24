import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Oid4VpDisclosureFlow } from '../components/Oid4VpDisclosureFlow'
import { useScreenCaptureGuard } from '../hooks/useScreenCaptureGuard'
import { useStoredCredentials } from '../hooks/useStoredCredentials'
import { logWalletStep } from '../services/debug/walletLogger'
import { describeUriForLog } from '../services/scan/scanLogDescriptors'
import { isPresentationRequestDeeplink, useDeeplinkStore } from '../store/deeplinkStore'

type Props = {
  initialRequestUri?: string | null
}

export function PresentationRequestScreen({ initialRequestUri }: Props = {}) {
  useScreenCaptureGuard()
  const router = useRouter()
  const { credentials } = useStoredCredentials()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const vpGeneration = useDeeplinkStore((s) => s.vpGeneration)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeRequestUriRef = useRef<string | null>(null)
  const lastStartedRequestRef = useRef<string | null>(null)
  const [requestUri, setRequestUri] = useState<string | null>(null)

  const beginRequest = useCallback((uri: string) => {
    if (!isPresentationRequestDeeplink(uri)) return false
    if (uri === dismissedDeeplinkUri) return false
    if (uri === lastStartedRequestRef.current) return false

    lastStartedRequestRef.current = uri
    activeRequestUriRef.current = uri
    setRequestUri(uri)
    if (uri === useDeeplinkStore.getState().pendingUri) {
      useDeeplinkStore.getState().consumePendingDeeplinkUri()
    }
    logWalletStep('presentation-request', 'request-detected', describeUriForLog(uri))
    return true
  }, [dismissedDeeplinkUri])

  useEffect(() => {
    if (initialRequestUri && beginRequest(initialRequestUri)) return
    if (pendingDeeplinkUri && beginRequest(pendingDeeplinkUri)) return
  }, [beginRequest, initialRequestUri, pendingDeeplinkUri, vpGeneration])

  const finish = useCallback(() => {
    const uriToDismiss = activeRequestUriRef.current
    if (uriToDismiss) {
      setDismissedDeeplinkUri(uriToDismiss)
    }
    activeRequestUriRef.current = null
    lastStartedRequestRef.current = null
    setRequestUri(null)
    router.replace('/(tabs)')
  }, [router, setDismissedDeeplinkUri])

  if (!requestUri) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <ActivityIndicator />
        <Text className="mt-3 text-center text-sm text-gray600">กำลังเปิดคำขอตรวจสอบ…</Text>
      </SafeAreaView>
    )
  }

  return (
    <Oid4VpDisclosureFlow
      authorizationRequestUri={requestUri}
      credentials={credentials}
      historyChannel="oid4vp"
      logScope="presentation-request"
      onDone={finish}
      onCancel={finish}
    />
  )
}
