import * as Linking from 'expo-linking'
import { AppState, Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

import {
  resolveIssuerPortalUrl,
  readIssuerPortalReturnUrl,
  type IssuerPortalCredentialType,
} from '../../config/issuerPortalUrls'
import { readSameDeviceAuthCodeIssuanceEnabled } from '../../config/sameDeviceIssuance'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../../store/deeplinkStore'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { describeIssuanceCallbackForLog } from './describeIssuanceCallbackForLog'
import {
  formatPortalReturnDiagnostic,
  recordLastPortalReturn,
} from './lastPortalReturn'
import {
  beginPortalReturnCapture,
  endPortalReturnCapture,
  notifyPortalReturnUrl,
  readLastNotifiedPortalReturnUrl,
  readPortalReturnCaptureGeneration,
  waitForPortalReturnNotification,
} from './portalReturnBridge'
import {
  isPortalCallbackCaptureUrl,
  resolvePortalCallbackResult,
} from './resolvePortalCallbackResult'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'
import { storePendingFromIssuanceCallbackUrl } from './resolveIssuanceCallbackResult'

import type { PortalEmptyOfferReason } from './portalEmptyOfferDialog'

export type OpenCredentialRequestPortalResult =
  | { status: 'claimed'; deeplink: string }
  | { status: 'presentation_request'; deeplink: string }
  | { status: 'auth_code_claim_ready' }
  | { status: 'auth_code_awaiting_pid_vp' }
  | { status: 'dismissed' }
  /** Older in-flight portal wait replaced by a newer request — no user-facing error. */
  | { status: 'superseded' }
  | { status: 'empty_offer'; reason: PortalEmptyOfferReason; diagnostic: string }
  | { status: 'misconfigured' }
  | { status: 'error' }

export type OpenCredentialRequestPortalOptions = {
  androidFallbackMs?: number
  /** Override portal URL (used by auth-code path after session start). */
  portalUrlOverride?: string
  /** When true, callback ?code= is exchanged via same-device session instead of offer URI. */
  authorizationCodeMode?: boolean
}

const PORTAL_RETURN_WAIT_MS = 3 * 60 * 1000

async function finishAuthorizationCodeCallback(
  callbackUrl: string,
  returnUrl: string,
  credentialType: IssuerPortalCredentialType,
  source: 'auth-session' | 'linking-event' | 'android-fallback' | 'callback-route' | 'none',
  resultType: string,
): Promise<OpenCredentialRequestPortalResult> {
  const summary = describeIssuanceCallbackForLog(callbackUrl)

  logWalletStep('wallet-home', 'issuer-portal-auth-code-return', {
    credentialType,
    resultType,
    source,
    ...summary,
  })

  storePendingFromIssuanceCallbackUrl(callbackUrl, returnUrl)

  try {
    const { continueSameDeviceIssuanceAfterPortal } = await import('./sameDeviceIssuance')
    const continuation = await continueSameDeviceIssuanceAfterPortal()
    if (continuation.status === 'awaiting_pid_vp') {
      recordLastPortalReturn({
        at: Date.now(),
        credentialType,
        resultType,
        source,
        summary,
        outcome: 'offer',
      })
      return { status: 'auth_code_awaiting_pid_vp' }
    }
    if (continuation.status === 'claim_ready') {
      recordLastPortalReturn({
        at: Date.now(),
        credentialType,
        resultType,
        source,
        summary,
        outcome: 'offer',
      })
      return { status: 'auth_code_claim_ready' }
    }
  } catch (error) {
    logWalletError('wallet-home', 'issuer-portal-auth-code-continuation-failed', error, {
      credentialType,
      resultType,
      source,
    })
    return { status: 'error' }
  }

  recordLastPortalReturn({
    at: Date.now(),
    credentialType,
    resultType,
    source,
    summary,
    outcome: 'empty-callback',
  })
  return {
    status: 'empty_offer',
    reason: 'no_offer_in_callback',
    diagnostic: 'Authorization code callback received without an active same-device session.',
  }
}

function finishWithCallbackUrl(
  callbackUrl: string,
  returnUrl: string,
  credentialType: IssuerPortalCredentialType,
  source: 'auth-session' | 'linking-event' | 'android-fallback' | 'callback-route' | 'none',
  resultType: string,
): OpenCredentialRequestPortalResult {
  const summary = describeIssuanceCallbackForLog(callbackUrl)

  logWalletStep('wallet-home', 'issuer-portal-return-url', {
    credentialType,
    resultType,
    source,
    ...summary,
  })

  const resolved = resolvePortalCallbackResult(callbackUrl, returnUrl, credentialType)
  if (resolved) {
    recordLastPortalReturn({
      at: Date.now(),
      credentialType,
      resultType,
      source,
      summary,
      outcome: 'offer',
    })
    return resolved
  }

  if (isCredentialOfferDeeplink(callbackUrl)) {
    useDeeplinkStore.getState().setIncomingDeeplinkUri(callbackUrl)
    recordLastPortalReturn({
      at: Date.now(),
      credentialType,
      resultType,
      source,
      summary,
      outcome: 'offer',
    })
    return { status: 'claimed', deeplink: callbackUrl }
  }

  const emptyRecord = {
    at: Date.now(),
    credentialType,
    resultType,
    source,
    summary,
    outcome: 'empty-callback' as const,
  }
  recordLastPortalReturn(emptyRecord)
  logWalletStep('wallet-home', 'issuer-portal-unrecognized-return', {
    credentialType,
    resultType,
    ...summary,
  })
  return {
    status: 'empty_offer',
    reason: 'no_offer_in_callback',
    diagnostic: formatPortalReturnDiagnostic(emptyRecord),
  }
}

async function finishPortalCallbackUrl(
  callbackUrl: string,
  returnUrl: string,
  credentialType: IssuerPortalCredentialType,
  source: 'auth-session' | 'linking-event' | 'android-fallback' | 'callback-route' | 'none',
  resultType: string,
  authorizationCodeMode: boolean,
): Promise<OpenCredentialRequestPortalResult> {
  const parsed = parseIssuanceCallbackUrl(callbackUrl, returnUrl)
  if (authorizationCodeMode && parsed.kind === 'authorization_code') {
    return finishAuthorizationCodeCallback(callbackUrl, returnUrl, credentialType, source, resultType)
  }
  if (authorizationCodeMode && parsed.kind === 'authorization_error') {
    logWalletStep('wallet-home', 'issuer-portal-auth-code-error', {
      credentialType,
      error: parsed.error,
      hasState: Boolean(parsed.state),
    })
    return { status: 'error' }
  }
  return finishWithCallbackUrl(callbackUrl, returnUrl, credentialType, source, resultType)
}

export async function openCredentialRequestPortal(
  credentialType: IssuerPortalCredentialType,
  options: OpenCredentialRequestPortalOptions = {},
): Promise<OpenCredentialRequestPortalResult> {
  const authorizationCodeMode = options.authorizationCodeMode
    ?? readSameDeviceAuthCodeIssuanceEnabled()

  let portalUrl: string | undefined = options.portalUrlOverride
  if (!portalUrl) {
    if (authorizationCodeMode) {
      try {
        const { beginSameDeviceIssuanceSession } = await import('./sameDeviceIssuanceSession')
        const { buildSameDeviceAuthorizationRequestUrl } = await import('./buildSameDeviceAuthorizationRequestUrl')
        await beginSameDeviceIssuanceSession(credentialType)
        portalUrl = await buildSameDeviceAuthorizationRequestUrl(credentialType)
      } catch (error) {
        logWalletError('wallet-home', 'issuer-portal-auth-url-build-failed', error, { credentialType })
        return { status: 'error' }
      }
    } else {
      try {
        portalUrl = resolveIssuerPortalUrl(credentialType)
      } catch (error) {
        logWalletError('wallet-home', 'issuer-portal-url-build-failed', error, { credentialType })
        return { status: 'misconfigured' }
      }
    }
  }

  if (!portalUrl) {
    logWalletStep('wallet-home', 'issuer-portal-misconfigured', { credentialType })
    return { status: 'misconfigured' }
  }

  const returnUrl = readIssuerPortalReturnUrl()
  // Do not reinterpret an offer left by an earlier flow as this portal's result.
  const portalOfferGeneration = useDeeplinkStore.getState().offerGeneration
  const portalState = useDeeplinkStore.getState()
  const previousOfferUri = [
    portalState.pendingUri,
    portalState.activeUri,
  ].find((uri) => uri && isCredentialOfferDeeplink(uri))
  if (previousOfferUri) {
    useDeeplinkStore.getState().setDismissedDeeplinkUri(previousOfferUri)
  }
  const readNewPendingPortalOffer = (): string | undefined => {
    const { offerGeneration, pendingUri } = useDeeplinkStore.getState()
    if (offerGeneration <= portalOfferGeneration) return undefined
    return pendingUri && isCredentialOfferDeeplink(pendingUri)
      ? pendingUri
      : undefined
  }

  if (Platform.OS === 'web') {
    void Linking.openURL(portalUrl)
    return { status: 'dismissed' }
  }

  // Android can return the URL that originally launched the app after the
  // user dismisses Custom Tabs. It is not a new portal callback.
  let initialUrlBeforePortal: string | undefined
  try {
    initialUrlBeforePortal = (await Linking.getInitialURL()) ?? undefined
  } catch (error) {
    logWalletError('wallet-home', 'issuer-portal-initial-url-read-failed', error, {
      credentialType,
    })
  }
  const initialParsedCallback = initialUrlBeforePortal
    ? parseIssuanceCallbackUrl(initialUrlBeforePortal, returnUrl)
    : undefined
  const initialOfferUri = initialParsedCallback?.kind === 'credential_offer'
    ? initialParsedCallback.uri
    : undefined
  if (initialOfferUri) {
    useDeeplinkStore.getState().setDismissedDeeplinkUri(initialOfferUri)
  }
  const isPreexistingPortalOffer = (url: string): boolean => {
    if (url === initialUrlBeforePortal) return true
    const parsed = parseIssuanceCallbackUrl(url, returnUrl)
    return parsed.kind === 'credential_offer'
      && (
        parsed.uri === previousOfferUri
        || parsed.uri === initialOfferUri
      )
  }

  const captureGeneration = beginPortalReturnCapture({
    ...(initialUrlBeforePortal ? { ignoredUrls: [initialUrlBeforePortal] } : {}),
    ignoredUris: [previousOfferUri, initialOfferUri].filter(
      (uri): uri is string => Boolean(uri),
    ),
  })

  const isCaptureSuperseded = (): boolean =>
    readPortalReturnCaptureGeneration() !== captureGeneration

  const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
    logWalletStep('wallet-home', 'issuer-portal-link-seen', {
      credentialType,
      captured: isPortalCallbackCaptureUrl(url, returnUrl),
      ...describeIssuanceCallbackForLog(url),
    })
    if (
      isPortalCallbackCaptureUrl(url, returnUrl)
      && !isPreexistingPortalOffer(url)
    ) {
      logWalletStep('wallet-home', 'issuer-portal-link-captured', {
        credentialType,
        ...describeIssuanceCallbackForLog(url),
      })
      notifyPortalReturnUrl(url, 'linking-event')
    }
  })

  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    logWalletStep('wallet-home', 'issuer-portal-app-state', {
      credentialType,
      nextState,
    })
    if (nextState !== 'active') return
    logWalletStep('wallet-home', 'issuer-portal-app-active', { credentialType })
    void Linking.getInitialURL().then((url) => {
      if (url) {
        logWalletStep('wallet-home', 'issuer-portal-initial-url', {
          credentialType,
          ...describeIssuanceCallbackForLog(url),
        })
      }
      if (
        url
        && !isPreexistingPortalOffer(url)
        && isPortalCallbackCaptureUrl(url, returnUrl)
      ) {
        notifyPortalReturnUrl(url, 'getInitialURL')
      }
    })
    const pending = readNewPendingPortalOffer()
    if (pending) {
      notifyPortalReturnUrl(pending, 'deeplink-store')
    }
  })

  try {
    logWalletStep('wallet-home', 'issuer-portal-open', {
      credentialType,
      returnUrl,
      platform: Platform.OS,
    })

    const waitMs = options.androidFallbackMs ?? PORTAL_RETURN_WAIT_MS

    // Android: openAuthSessionAsync often never resolves after walletapp:// deep link.
    // openBrowserAsync returns immediately; we wait on Linking / /callback bridge.
    if (Platform.OS === 'android') {
      await WebBrowser.openBrowserAsync(portalUrl)
      logWalletStep('wallet-home', 'issuer-portal-browser-opened', {
        credentialType,
        waitingFor: returnUrl,
        hint: 'Issuer must redirect to walletapp://callback?credential_offer_uri=https://...',
      })

      const notifiedUrl = await waitForPortalReturnNotification(waitMs, {
        captureGeneration,
        heartbeatMs: 3000,
        pollMs: 1000,
        onHeartbeat: (elapsedMs) => {
          logWalletStep('wallet-home', 'issuer-portal-waiting-return', {
            credentialType,
            elapsedMs,
            returnUrl,
            hasNotification: Boolean(readLastNotifiedPortalReturnUrl()),
          })
        },
        poll: async () => {
          if (isCaptureSuperseded()) return undefined
          const pending = readNewPendingPortalOffer()
          if (pending) return pending
          const initial = await Linking.getInitialURL()
          if (
            initial
            && !isPreexistingPortalOffer(initial)
            && isPortalCallbackCaptureUrl(initial, returnUrl)
          ) {
            return initial
          }
          return readLastNotifiedPortalReturnUrl()
        },
      })

      if (isCaptureSuperseded()) {
        logWalletStep('wallet-home', 'issuer-portal-dismissed', {
          credentialType,
          resultType: 'superseded',
          reason: 'newer-portal-request',
        })
        return { status: 'superseded' }
      }

      const callbackUrl = notifiedUrl
        ?? readLastNotifiedPortalReturnUrl()
        ?? readNewPendingPortalOffer()

      if (!callbackUrl) {
        logWalletStep('wallet-home', 'issuer-portal-dismissed', {
          credentialType,
          resultType: 'timeout-or-cancel',
          reason: 'no-walletapp-deep-link',
        })
        recordLastPortalReturn({
          at: Date.now(),
          credentialType,
          resultType: 'timeout-or-cancel',
          source: 'none',
          summary: describeIssuanceCallbackForLog(undefined),
          outcome: 'cancelled',
        })
        return {
          status: 'empty_offer',
          reason: 'no_callback',
          diagnostic: [
            'No walletapp://callback deep link received after login.',
            `Expected ReturnUrl: ${returnUrl}?credential_offer_uri=https://...`,
            'Issuer must HTTP-redirect the browser to that URL after login.',
          ].join('\n'),
        }
      }

      return finishPortalCallbackUrl(
        callbackUrl,
        returnUrl,
        credentialType,
        'android-fallback',
        'browser-deep-link',
        authorizationCodeMode,
      )
    }

    const authPromise = WebBrowser.openAuthSessionAsync(portalUrl, returnUrl)
    const notifyPromise = waitForPortalReturnNotification(waitMs, {
      captureGeneration,
    })

    const raced = await Promise.race([
      authPromise.then((result) => ({ kind: 'auth' as const, result })),
      notifyPromise.then((url) => ({ kind: 'notify' as const, url })),
    ])

    if (isCaptureSuperseded()) {
      logWalletStep('wallet-home', 'issuer-portal-dismissed', {
        credentialType,
        resultType: 'superseded',
        reason: 'newer-portal-request',
      })
      try {
        WebBrowser.dismissAuthSession()
      } catch {
        // iOS-only; ignore on other platforms
      }
      return { status: 'superseded' }
    }

    if (raced.kind === 'notify' && raced.url) {
      logWalletStep('wallet-home', 'issuer-portal-auth-session-bypassed', {
        credentialType,
        reason: 'deep-link-before-session-close',
      })
      try {
        WebBrowser.dismissAuthSession()
      } catch {
        // iOS-only; ignore on other platforms
      }
      return finishPortalCallbackUrl(
        raced.url,
        returnUrl,
        credentialType,
        'linking-event',
        'notify',
        authorizationCodeMode,
      )
    }

    const result = raced.kind === 'auth'
      ? raced.result
      : await authPromise

    if (isCaptureSuperseded()) {
      logWalletStep('wallet-home', 'issuer-portal-dismissed', {
        credentialType,
        resultType: 'superseded',
        reason: 'newer-portal-request',
      })
      return { status: 'superseded' }
    }

    logWalletStep('wallet-home', 'issuer-portal-auth-session-closed', {
      credentialType,
      resultType: result.type,
      hasResultUrl: result.type === 'success' && Boolean(result.url),
      ...(result.type === 'success' && result.url
        ? describeIssuanceCallbackForLog(result.url)
        : {}),
    })

    const sessionUrl = result.type === 'success' ? result.url : undefined
    const callbackUrl = sessionUrl
      ?? readLastNotifiedPortalReturnUrl()
      ?? readNewPendingPortalOffer()

    if (!callbackUrl) {
      logWalletStep('wallet-home', 'issuer-portal-dismissed', {
        credentialType,
        resultType: result.type,
      })
      recordLastPortalReturn({
        at: Date.now(),
        credentialType,
        resultType: result.type,
        source: 'none',
        summary: describeIssuanceCallbackForLog(undefined),
        outcome: 'cancelled',
      })
      return { status: 'dismissed' }
    }

    return finishPortalCallbackUrl(
      callbackUrl,
      returnUrl,
      credentialType,
      sessionUrl ? 'auth-session' : 'linking-event',
      result.type,
      authorizationCodeMode,
    )
  } catch (error) {
    logWalletError('wallet-home', 'issuer-portal-open-failed', error, {
      credentialType,
    })
    return { status: 'error' }
  } finally {
    linkingSubscription.remove()
    appStateSubscription.remove()
    endPortalReturnCapture(captureGeneration)
  }
}
