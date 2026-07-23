import * as Linking from 'expo-linking'
import { AppState, Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

import {
  resolveIssuerPortalUrl,
  readIssuerPortalReturnUrl,
  type IssuerPortalCredentialType,
} from '../../config/issuerPortalUrls'
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
  waitForPortalReturnNotification,
} from './portalReturnBridge'
import {
  isPortalCallbackCaptureUrl,
  readPendingPortalOfferFromStore,
  resolvePortalCallbackResult,
} from './resolvePortalCallbackResult'

export type OpenCredentialRequestPortalResult =
  | { status: 'claimed'; deeplink: string }
  | { status: 'presentation_request'; deeplink: string }
  | { status: 'dismissed' }
  | { status: 'empty_offer'; diagnostic: string }
  | { status: 'misconfigured' }
  | { status: 'error' }

const PORTAL_RETURN_WAIT_MS = 3 * 60 * 1000

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
    diagnostic: formatPortalReturnDiagnostic(emptyRecord),
  }
}

export async function openCredentialRequestPortal(
  credentialType: IssuerPortalCredentialType,
  options: { androidFallbackMs?: number } = {},
): Promise<OpenCredentialRequestPortalResult> {
  let portalUrl: string
  try {
    portalUrl = resolveIssuerPortalUrl(credentialType)
  } catch (error) {
    logWalletError('wallet-home', 'issuer-portal-url-build-failed', error, { credentialType })
    return { status: 'misconfigured' }
  }

  if (!portalUrl) {
    logWalletStep('wallet-home', 'issuer-portal-misconfigured', { credentialType })
    return { status: 'misconfigured' }
  }

  const returnUrl = readIssuerPortalReturnUrl()

  if (Platform.OS === 'web') {
    void Linking.openURL(portalUrl)
    return { status: 'dismissed' }
  }

  beginPortalReturnCapture()

  const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
    logWalletStep('wallet-home', 'issuer-portal-link-seen', {
      credentialType,
      captured: isPortalCallbackCaptureUrl(url, returnUrl),
      ...describeIssuanceCallbackForLog(url),
    })
    if (isPortalCallbackCaptureUrl(url, returnUrl)) {
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
      if (url && isPortalCallbackCaptureUrl(url, returnUrl)) {
        notifyPortalReturnUrl(url, 'getInitialURL')
      }
    })
    const pending = readPendingPortalOfferFromStore()
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
          const pending = readPendingPortalOfferFromStore()
          if (pending) return pending
          const initial = await Linking.getInitialURL()
          if (initial && isPortalCallbackCaptureUrl(initial, returnUrl)) return initial
          return readLastNotifiedPortalReturnUrl()
        },
      })
      const callbackUrl = notifiedUrl
        ?? readLastNotifiedPortalReturnUrl()
        ?? readPendingPortalOfferFromStore()

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
          diagnostic: [
            'No walletapp://callback deep link received after login.',
            `Expected ReturnUrl: ${returnUrl}?credential_offer_uri=https://...`,
            'Issuer must HTTP-redirect the browser to that URL after login.',
          ].join('\n'),
        }
      }

      return finishWithCallbackUrl(
        callbackUrl,
        returnUrl,
        credentialType,
        'android-fallback',
        'browser-deep-link',
      )
    }

    const authPromise = WebBrowser.openAuthSessionAsync(portalUrl, returnUrl)
    const notifyPromise = waitForPortalReturnNotification(waitMs)

    const raced = await Promise.race([
      authPromise.then((result) => ({ kind: 'auth' as const, result })),
      notifyPromise.then((url) => ({ kind: 'notify' as const, url })),
    ])

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
      return finishWithCallbackUrl(
        raced.url,
        returnUrl,
        credentialType,
        'linking-event',
        'notify',
      )
    }

    const result = raced.kind === 'auth'
      ? raced.result
      : await authPromise

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
      ?? readPendingPortalOfferFromStore()

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

    return finishWithCallbackUrl(
      callbackUrl,
      returnUrl,
      credentialType,
      sessionUrl ? 'auth-session' : 'linking-event',
      result.type,
    )
  } catch (error) {
    logWalletError('wallet-home', 'issuer-portal-open-failed', error, {
      credentialType,
    })
    return { status: 'error' }
  } finally {
    linkingSubscription.remove()
    appStateSubscription.remove()
    endPortalReturnCapture()
  }
}
