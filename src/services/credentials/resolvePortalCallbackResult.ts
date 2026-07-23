import type { IssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../../store/deeplinkStore'
import { logWalletStep } from '../debug/walletLogger'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

export type ResolvedPortalCallbackResult =
  | { status: 'claimed'; deeplink: string }
  | { status: 'presentation_request'; deeplink: string }

/** Poll window when Android Custom Tabs dismiss without returning result.url. */
export const PORTAL_ANDROID_LINKING_FALLBACK_MS = 2000
export const PORTAL_LINKING_POLL_MS = 50

export function resolvePortalCallbackResult(
  url: string,
  returnUrl: string,
  credentialType: IssuerPortalCredentialType,
): ResolvedPortalCallbackResult | undefined {
  const parsed = parseIssuanceCallbackUrl(url, returnUrl)
  if (parsed.kind === 'credential_offer') {
    logWalletStep('wallet-home', 'issuer-portal-return-offer', { credentialType })
    useDeeplinkStore.getState().setIncomingDeeplinkUri(parsed.uri)
    return { status: 'claimed', deeplink: parsed.uri }
  }

  if (parsed.kind === 'presentation_request') {
    logWalletStep('wallet-home', 'issuer-portal-return-presentation', { credentialType })
    useDeeplinkStore.getState().setIncomingDeeplinkUri(parsed.uri)
    return { status: 'presentation_request', deeplink: parsed.uri }
  }

  if (isCredentialOfferDeeplink(url)) {
    logWalletStep('wallet-home', 'issuer-portal-return-offer', { credentialType })
    useDeeplinkStore.getState().setIncomingDeeplinkUri(url)
    return { status: 'claimed', deeplink: url }
  }

  return undefined
}

export function isPortalCallbackCaptureUrl(url: string, returnUrl: string): boolean {
  if (parseIssuanceCallbackUrl(url, returnUrl).kind !== 'unsupported') return true
  if (isCredentialOfferDeeplink(url)) return true

  // Capture bare ReturnUrl redirects (no offer query) for diagnosis.
  // Also accept sibling wallet schemes (walletapp / etdawallet) with host "callback".
  try {
    const parsed = new URL(url)
    const expected = new URL(returnUrl)
    const walletSchemes = new Set(['walletapp:', 'etdawallet:', expected.protocol])
    if (
      walletSchemes.has(parsed.protocol)
      && (parsed.hostname === 'callback' || parsed.hostname === expected.hostname)
    ) {
      return true
    }
    return (
      parsed.protocol === expected.protocol
      && parsed.hostname === expected.hostname
      && (parsed.pathname === expected.pathname || parsed.pathname === `${expected.pathname}/`)
    )
  } catch {
    return url.startsWith(returnUrl)
      || url.startsWith('walletapp://callback')
      || url.startsWith('etdawallet://callback')
  }
}

export function readPendingPortalOfferFromStore(): string | undefined {
  const pending = useDeeplinkStore.getState().pendingUri
  return pending && isCredentialOfferDeeplink(pending) ? pending : undefined
}

export async function waitForPortalCallbackCapture(input: {
  getCapturedUrl: () => string | undefined
  getSessionUrl?: () => string | undefined
  timeoutMs?: number
  pollMs?: number
}): Promise<string | undefined> {
  const timeoutMs = input.timeoutMs ?? PORTAL_ANDROID_LINKING_FALLBACK_MS
  const pollMs = input.pollMs ?? PORTAL_LINKING_POLL_MS
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const sessionUrl = input.getSessionUrl?.()
    if (sessionUrl) return sessionUrl

    const captured = input.getCapturedUrl()
    if (captured) return captured

    const pending = readPendingPortalOfferFromStore()
    if (pending) return pending

    await new Promise((resolve) => {
      setTimeout(resolve, pollMs)
    })
  }

  return input.getSessionUrl?.()
    ?? input.getCapturedUrl()
    ?? readPendingPortalOfferFromStore()
}
