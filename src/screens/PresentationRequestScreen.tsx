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
import { isPresentationRequestDeeplink, isWithinDismissRedeliveryGrace, useDeeplinkStore } from '../store/deeplinkStore'
import type { PresentationFlowOrigin } from '../services/vp/oid4vc/types'

const MISSING_REQUEST_GRACE_MS = 1_500

function readHydratedPresentationRequestUri(): string | null {
  const state = useDeeplinkStore.getState()
  // Prefer pending over active: a newer deeplink is queued as pending while a
  // failed/in-flight active request may still linger until beginRequest consumes it.
  for (const candidate of [state.pendingUri, state.activeUri]) {
    if (!candidate || !isPresentationRequestDeeplink(candidate)) continue
    if (candidate === state.dismissedUri) continue
    if (isPresentationRequestConsumed(candidate)) continue
    return candidate
  }
  return null
}

function readHydratedPresentationFlowOrigin(): PresentationFlowOrigin {
  const state = useDeeplinkStore.getState()
  return state.activePresentationFlowOrigin
    ?? state.pendingPresentationFlowOrigin
    ?? 'same-device'
}

function readPresentationUiOrigin(
  flowOrigin: PresentationFlowOrigin,
): 'scanned-verifier-qr' | 'wallet-generated-qr' {
  return flowOrigin === 'my-qr' ? 'wallet-generated-qr' : 'scanned-verifier-qr'
}

type ExitReason = 'user' | 'consumed' | 'dismissed-stale' | 'missing'

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
  const activePresentationFlowOrigin = useDeeplinkStore((s) => s.activePresentationFlowOrigin)
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeRequestUriRef = useRef<string | null>(readHydratedPresentationRequestUri())
  const lastStartedRequestRef = useRef<string | null>(readHydratedPresentationRequestUri())
  const initialUrlCheckedRef = useRef(false)
  const directUrlHandledRef = useRef<string | null>(null)
  const exitingRef = useRef(false)
  const [requestUri, setRequestUri] = useState<string | null>(readHydratedPresentationRequestUri)
  const [presentationFlowOrigin, setPresentationFlowOrigin] = useState<PresentationFlowOrigin>(
    readHydratedPresentationFlowOrigin,
  )
  const [missingRequestError, setMissingRequestError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)

  const beginRequest = useCallback((uri: string, flowOrigin?: PresentationFlowOrigin) => {
    if (!isPresentationRequestDeeplink(uri)) return false
    const store = useDeeplinkStore.getState()
    if (uri === store.dismissedUri) {
      if (isWithinDismissRedeliveryGrace(store.dismissedAtMs)) return false
      store.clearDismissedDeeplinkUri()
    }
    if (isPresentationRequestConsumed(uri)) return false

    const alreadyStarted = uri === lastStartedRequestRef.current
    if (alreadyStarted) {
      // Hydration may have primed lastStarted/requestUri without consuming pending.
      if (uri === useDeeplinkStore.getState().pendingUri) {
        useDeeplinkStore.getState().consumePendingDeeplinkUri()
      }
      return false
    }

    const resolvedFlowOrigin = flowOrigin
      ?? (uri === pendingDeeplinkUri || uri === activeDeeplinkUri
        ? activePresentationFlowOrigin ?? pendingPresentationFlowOrigin ?? undefined
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
  }, [activeDeeplinkUri, activePresentationFlowOrigin, pendingDeeplinkUri, pendingPresentationFlowOrigin])

  /**
   * Sole exit from the VP screen. Dismisses the current URI (when applicable),
   * lands on Wallet home, and never opens the intake modal for dismissed redelivery.
   */
  const exitPresentationFlow = useCallback((reason: ExitReason, uriForLog?: string | null) => {
    if (exitingRef.current) return
    exitingRef.current = true
    setIsFinishing(true)

    const state = useDeeplinkStore.getState()
    const uriToDismiss = activeRequestUriRef.current
      ?? (state.activeUri && isPresentationRequestDeeplink(state.activeUri) ? state.activeUri : null)
      ?? (state.pendingUri && isPresentationRequestDeeplink(state.pendingUri) ? state.pendingUri : null)
      ?? (uriForLog && isPresentationRequestDeeplink(uriForLog) ? uriForLog : null)

    if (uriToDismiss && reason !== 'missing') {
      setDismissedDeeplinkUri(uriToDismiss)
    }

    if (reason === 'consumed' && uriForLog) {
      notifyPresentationIntakeRejectionForUri(uriForLog)
    }

    activeRequestUriRef.current = null
    lastStartedRequestRef.current = null
    logWalletStep('presentation-request', 'exit-flow', {
      reason,
      ...(uriForLog ? describeUriForLog(uriForLog) : {}),
    })
    returnToWallet()
  }, [returnToWallet, setDismissedDeeplinkUri])

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
          if (beginRequest(initialRequest, 'same-device')) return
          if (isPresentationRequestConsumed(initialRequest)) {
            logWalletStep('presentation-request', 'stale-initial-request-rejected', describeUriForLog(initialRequest))
            exitPresentationFlow('consumed', initialRequest)
            return
          }
          if (initialRequest === useDeeplinkStore.getState().dismissedUri) {
            logWalletStep('presentation-request', 'dismissed-initial-request-ignored', describeUriForLog(initialRequest))
            exitPresentationFlow('dismissed-stale', initialRequest)
            return
          }
          graceTimer = setTimeout(showMissingRequestError, MISSING_REQUEST_GRACE_MS)
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
    exitPresentationFlow,
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

    const store = useDeeplinkStore.getState()
    const dismissedActive = store.dismissedUri != null
      && isWithinDismissRedeliveryGrace(store.dismissedAtMs)

    const blockedUri = [pendingDeeplinkUri, activeDeeplinkUri, resolvePresentationRequestUri(incomingUrl)]
      .find((uri) => (
        uri
        && isPresentationRequestDeeplink(uri)
        && (
          isPresentationRequestConsumed(uri)
          || (dismissedActive && uri === store.dismissedUri)
        )
      ))

    if (blockedUri) {
      if (isPresentationRequestConsumed(blockedUri)) {
        logWalletStep('presentation-request', 'stale-request-rejected', describeUriForLog(blockedUri))
        exitPresentationFlow('consumed', blockedUri)
      } else {
        logWalletStep('presentation-request', 'dismissed-request-ignored', describeUriForLog(blockedUri))
        exitPresentationFlow('dismissed-stale', blockedUri)
      }
      return
    }

    // Recover from a remount that left requestUri null while a usable VP URI is
    // still in the store (e.g. after submit failure + newer deeplink + back).
    const recoverableUri = [pendingDeeplinkUri, activeDeeplinkUri]
      .find((uri) => (
        !!uri
        && isPresentationRequestDeeplink(uri)
        && !(dismissedActive && uri === store.dismissedUri)
        && !isPresentationRequestConsumed(uri)
      ))
    if (recoverableUri) {
      if (beginRequest(recoverableUri)) return
      if (recoverableUri === lastStartedRequestRef.current) {
        setRequestUri(recoverableUri)
      }
      return
    }

    if (!initialUrlCheckedRef.current) return

    const directRequest = resolvePresentationRequestUri(incomingUrl)
    const staleUri = directRequest ?? lastStartedRequestRef.current
    if (
      staleUri
      && (
        isPresentationRequestConsumed(staleUri)
        || (dismissedActive && staleUri === store.dismissedUri)
      )
    ) {
      exitPresentationFlow(
        isPresentationRequestConsumed(staleUri) ? 'consumed' : 'dismissed-stale',
        staleUri,
      )
    }
  }, [
    activeDeeplinkUri,
    beginRequest,
    dismissedDeeplinkUri,
    exitPresentationFlow,
    incomingUrl,
    isFinishing,
    pendingDeeplinkUri,
    requestUri,
  ])

  const finish = useCallback(() => {
    exitPresentationFlow('user')
  }, [exitPresentationFlow])

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
    return <SafeAreaView className="flex-1 bg-surface-soft" />
  }

  if (!requestUri) {
    const incomingRequest = resolvePresentationRequestUri(incomingUrl)
    const staleIncoming = Boolean(
      incomingRequest
      && (
        incomingRequest === dismissedDeeplinkUri
        || isPresentationRequestConsumed(incomingRequest)
      ),
    )
    const hasUsableStoreUri = Boolean(
      (pendingDeeplinkUri
        && isPresentationRequestDeeplink(pendingDeeplinkUri)
        && pendingDeeplinkUri !== dismissedDeeplinkUri
        && !isPresentationRequestConsumed(pendingDeeplinkUri))
      || (activeDeeplinkUri
        && isPresentationRequestDeeplink(activeDeeplinkUri)
        && activeDeeplinkUri !== dismissedDeeplinkUri
        && !isPresentationRequestConsumed(activeDeeplinkUri)),
    )
    // Never flash the loading copy for a dismissed/expired deeplink after Back.
    if (staleIncoming || !hasUsableStoreUri) {
      return <SafeAreaView className="flex-1 bg-surface-soft" />
    }

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
