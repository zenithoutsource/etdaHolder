import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Oid4VpDisclosureFlow } from '../components/Oid4VpDisclosureFlow'
import type { IssuerPortalCredentialType } from '../config/issuerPortalUrls'
import { useAndroidBackNavigation } from '../hooks/useAndroidBackNavigation'
import { useReturnToWallet } from '../hooks/useReturnToWallet'
import { useScreenCaptureGuard } from '../hooks/useScreenCaptureGuard'
import { useStoredCredentials } from '../hooks/useStoredCredentials'
import { openCredentialRequestPortal } from '../services/credentials/openCredentialRequestPortal'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { resolvePresentationRequestUri } from '../services/credentials/resolvePresentationRequestUri'
import { describeUriForLog } from '../services/scan/scanLogDescriptors'
import { isPresentationRequestDeeplink, useDeeplinkStore } from '../store/deeplinkStore'

const MISSING_REQUEST_GRACE_MS = 1_500

type Props = {
  initialRequestUri?: string | null
}

export function PresentationRequestScreen({ initialRequestUri }: Props = {}) {
  useScreenCaptureGuard()
  const router = useRouter()
  const returnToWallet = useReturnToWallet(router)
  const { credentials } = useStoredCredentials()
  const incomingUrl = Linking.useURL()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const vpGeneration = useDeeplinkStore((s) => s.vpGeneration)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeRequestUriRef = useRef<string | null>(null)
  const lastStartedRequestRef = useRef<string | null>(null)
  const initialUrlCheckedRef = useRef(false)
  const directUrlHandledRef = useRef<string | null>(null)
  const [requestUri, setRequestUri] = useState<string | null>(null)
  const [missingRequestError, setMissingRequestError] = useState<string | null>(null)

  const beginRequest = useCallback((uri: string) => {
    if (!isPresentationRequestDeeplink(uri)) return false
    if (uri === dismissedDeeplinkUri) return false
    if (uri === lastStartedRequestRef.current) return false

    lastStartedRequestRef.current = uri
    activeRequestUriRef.current = uri
    setMissingRequestError(null)
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

    const directRequest = resolvePresentationRequestUri(incomingUrl)
    if (directRequest && directRequest !== directUrlHandledRef.current && beginRequest(directRequest)) {
      initialUrlCheckedRef.current = true
      directUrlHandledRef.current = directRequest
      return
    }

    if (initialUrlCheckedRef.current) return
    initialUrlCheckedRef.current = true

    let isMounted = true
    let graceTimer: ReturnType<typeof setTimeout> | undefined

    const showMissingRequestError = () => {
      if (!isMounted || lastStartedRequestRef.current) return
      const pending = useDeeplinkStore.getState().pendingUri
      if (
        pending
        && isPresentationRequestDeeplink(pending)
        && pending !== useDeeplinkStore.getState().dismissedUri
      ) {
        return
      }
      setMissingRequestError('No presentation request link is pending.')
    }

    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (!isMounted || lastStartedRequestRef.current) return
        const initialRequest = resolvePresentationRequestUri(initialUrl)
        if (initialRequest) {
          directUrlHandledRef.current = initialRequest
          beginRequest(initialRequest)
          return
        }
        graceTimer = setTimeout(showMissingRequestError, MISSING_REQUEST_GRACE_MS)
      })
      .catch((err) => {
        logWalletError('deeplink', 'initial-url-read-failed', err)
        if (!isMounted || lastStartedRequestRef.current) return
        graceTimer = setTimeout(showMissingRequestError, MISSING_REQUEST_GRACE_MS)
      })

    return () => {
      isMounted = false
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [beginRequest, incomingUrl, initialRequestUri, pendingDeeplinkUri, vpGeneration])

  const finish = useCallback(() => {
    const uriToDismiss = activeRequestUriRef.current
    if (uriToDismiss) {
      setDismissedDeeplinkUri(uriToDismiss)
    }
    activeRequestUriRef.current = null
    lastStartedRequestRef.current = null
    setRequestUri(null)
    returnToWallet()
  }, [returnToWallet, setDismissedDeeplinkUri])

  const exitFlow = useAndroidBackNavigation(finish)

  const requestCredential = useCallback((credentialType: IssuerPortalCredentialType) => {
    exitFlow()
    void openCredentialRequestPortal(credentialType)
  }, [exitFlow])

  if (missingRequestError) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <Text className="text-center text-sm text-gray600">{missingRequestError}</Text>
      </SafeAreaView>
    )
  }

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
      presentationOrigin="scanned-verifier-qr"
      onRequestCredential={requestCredential}
      onDone={exitFlow}
      onCancel={exitFlow}
    />
  )
}
