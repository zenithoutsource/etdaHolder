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
import { resumeSameDeviceClaimAfterPidVp } from '../services/credentials/resumeSameDeviceClaim'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { isAwaitingSameDevicePidVp } from '../store/sameDeviceIssuanceStore'
import { resolvePresentationRequestUri } from '../services/credentials/resolvePresentationRequestUri'
import { isPresentationRequestConsumed } from '../services/vp/presentationRequestReplay'
import { notifyPresentationIntakeRejectionForUri } from '../services/vp/presentationIntakeRejection'
import { describeUriForLog } from '../services/scan/scanLogDescriptors'
import { isPresentationRequestDeeplink, useDeeplinkStore } from '../store/deeplinkStore'
import type { PresentationFlowOrigin } from '../services/vp/oid4vc/types'

const MISSING_REQUEST_GRACE_MS = 1_500

function readHydratedPresentationRequestUri(): string | null {
  const state = useDeeplinkStore.getState()
  const candidate = state.activeUri ?? state.pendingUri
  if (!candidate || !isPresentationRequestDeeplink(candidate)) return null
  if (candidate === state.dismissedUri) return null
  if (isPresentationRequestConsumed(candidate)) return null
  return candidate
}

function readHydratedPresentationFlowOrigin(): PresentationFlowOrigin {
  return useDeeplinkStore.getState().pendingPresentationFlowOrigin ?? 'same-device'
}

function readPresentationUiOrigin(
  flowOrigin: PresentationFlowOrigin,
): 'scanned-verifier-qr' | 'wallet-generated-qr' {
  return flowOrigin === 'my-qr' ? 'wallet-generated-qr' : 'scanned-verifier-qr'
}

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
  const activeDeeplinkUri = useDeeplinkStore((s) => s.activeUri)
  const pendingPresentationFlowOrigin = useDeeplinkStore((s) => s.pendingPresentationFlowOrigin)
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeRequestUriRef = useRef<string | null>(readHydratedPresentationRequestUri())
  const lastStartedRequestRef = useRef<string | null>(readHydratedPresentationRequestUri())
  const initialUrlCheckedRef = useRef(false)
  const directUrlHandledRef = useRef<string | null>(null)
  const [requestUri, setRequestUri] = useState<string | null>(readHydratedPresentationRequestUri)
  const [presentationFlowOrigin, setPresentationFlowOrigin] = useState<PresentationFlowOrigin>(
    readHydratedPresentationFlowOrigin,
  )
  const [missingRequestError, setMissingRequestError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)

  const beginRequest = useCallback((uri: string, flowOrigin?: PresentationFlowOrigin) => {
    if (!isPresentationRequestDeeplink(uri)) return false
    if (uri === dismissedDeeplinkUri) return false
    if (isPresentationRequestConsumed(uri)) return false
    if (uri === lastStartedRequestRef.current) return false

    const resolvedFlowOrigin = flowOrigin
      ?? (uri === pendingDeeplinkUri || uri === activeDeeplinkUri
        ? pendingPresentationFlowOrigin ?? undefined
        : undefined)
      ?? 'same-device'

    lastStartedRequestRef.current = uri
    activeRequestUriRef.current = uri
    setMissingRequestError(null)
    setRequestUri(uri)
    setPresentationFlowOrigin(resolvedFlowOrigin)
    if (uri === useDeeplinkStore.getState().pendingUri) {
      useDeeplinkStore.getState().consumePendingDeeplinkUri()
    }
    logWalletStep('presentation-request', 'request-detected', describeUriForLog(uri))
    return true
  }, [activeDeeplinkUri, dismissedDeeplinkUri, pendingDeeplinkUri, pendingPresentationFlowOrigin])

  useEffect(() => {
    if (isFinishing) return

    if (initialRequestUri && beginRequest(initialRequestUri, pendingPresentationFlowOrigin ?? undefined)) return
    if (pendingDeeplinkUri && beginRequest(pendingDeeplinkUri, pendingPresentationFlowOrigin ?? undefined)) return
    if (activeDeeplinkUri && beginRequest(activeDeeplinkUri, pendingPresentationFlowOrigin ?? undefined)) return

    const directRequest = resolvePresentationRequestUri(incomingUrl)
    if (directRequest && directRequest !== directUrlHandledRef.current && beginRequest(directRequest, 'same-device')) {
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
          beginRequest(initialRequest, 'same-device')
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
  }, [
    activeDeeplinkUri,
    beginRequest,
    incomingUrl,
    initialRequestUri,
    isFinishing,
    pendingDeeplinkUri,
    pendingPresentationFlowOrigin,
  ])

  useEffect(() => {
    if (isFinishing || requestUri) return

    const directRequest = resolvePresentationRequestUri(incomingUrl)
    if (!directRequest || directRequest === directUrlHandledRef.current) return
    if (beginRequest(directRequest, 'same-device')) {
      directUrlHandledRef.current = directRequest
    }
  }, [beginRequest, incomingUrl, isFinishing, requestUri])

  useEffect(() => {
    if (isFinishing || requestUri) return

    const blockedUri = [pendingDeeplinkUri, activeDeeplinkUri, resolvePresentationRequestUri(incomingUrl)]
      .find((uri) => (
        uri
        && isPresentationRequestDeeplink(uri)
        && (uri === dismissedDeeplinkUri || isPresentationRequestConsumed(uri))
      ))

    if (blockedUri) {
      if (useDeeplinkStore.getState().pendingUri === blockedUri) {
        useDeeplinkStore.getState().setDismissedDeeplinkUri(blockedUri)
      }
      logWalletStep('presentation-request', 'stale-request-rejected', describeUriForLog(blockedUri))
      notifyPresentationIntakeRejectionForUri(blockedUri)
      setIsFinishing(true)
      returnToWallet()
      return
    }

    if (pendingDeeplinkUri || activeDeeplinkUri) return
    if (!initialUrlCheckedRef.current) return

    const directRequest = resolvePresentationRequestUri(incomingUrl)
    const staleUri = directRequest ?? lastStartedRequestRef.current
    if (
      staleUri
      && (staleUri === dismissedDeeplinkUri || isPresentationRequestConsumed(staleUri))
    ) {
      notifyPresentationIntakeRejectionForUri(staleUri)
      setIsFinishing(true)
      returnToWallet()
    }
  }, [
    activeDeeplinkUri,
    dismissedDeeplinkUri,
    incomingUrl,
    isFinishing,
    pendingDeeplinkUri,
    requestUri,
    returnToWallet,
  ])

  const finish = useCallback(() => {
    setIsFinishing(true)
    const uriToDismiss = activeRequestUriRef.current
    if (uriToDismiss) {
      setDismissedDeeplinkUri(uriToDismiss)
    }
    activeRequestUriRef.current = null
    lastStartedRequestRef.current = null
    returnToWallet()
  }, [returnToWallet, setDismissedDeeplinkUri])

  const finishAfterPresentation = useCallback(() => {
    void (async () => {
      if (isAwaitingSameDevicePidVp()) {
        try {
          const resume = await resumeSameDeviceClaimAfterPidVp()
          if (resume.status === 'claim_ready') {
            logWalletStep('same-device-issuance', 'pid-vp-complete-resume-claim', {})
            finish()
            router.push('/(tabs)/credential-offer')
            return
          }
        } catch (error) {
          logWalletError('same-device-issuance', 'pid-vp-complete-resume-failed', error)
        }
      }
      finish()
    })()
  }, [finish, router])

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

  if (isFinishing) {
    return null
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
      presentationOrigin={readPresentationUiOrigin(presentationFlowOrigin)}
      presentationFlowOrigin={presentationFlowOrigin}
      onRequestCredential={requestCredential}
      onDone={finishAfterPresentation}
      onCancel={exitFlow}
    />
  )
}
