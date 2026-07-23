import { parseIssuanceCallbackUrl, type ParsedIssuanceCallback } from './parseIssuanceCallbackUrl'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'
import { useDeeplinkStore } from '../../store/deeplinkStore'

/**
 * Rebuild a walletapp://callback URL from Expo Router path params after
 * +native-intent rewrites walletapp://callback?... → /callback?...
 */
export function buildIssuanceCallbackUrlFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  returnUrl: string = readWalletReturnUrl(),
): string | undefined {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue
    const raw = Array.isArray(value) ? value[0] : value
    if (typeof raw === 'string' && raw.length > 0) {
      query.set(key, raw)
    }
  }
  if ([...query.keys()].length === 0) return undefined

  const separator = returnUrl.includes('?') ? '&' : '?'
  return `${returnUrl}${separator}${query.toString()}`
}

export function resolveIssuanceCallbackFromSources(input: {
  linkingUrl?: string | null
  searchParams?: Record<string, string | string[] | undefined>
  returnUrl?: string
}): ParsedIssuanceCallback {
  const returnUrl = input.returnUrl ?? readWalletReturnUrl()

  if (input.linkingUrl) {
    const fromLink = parseIssuanceCallbackUrl(input.linkingUrl, returnUrl)
    if (fromLink.kind !== 'unsupported') return fromLink
  }

  if (input.searchParams) {
    const rebuilt = buildIssuanceCallbackUrlFromSearchParams(input.searchParams, returnUrl)
    if (rebuilt) {
      return parseIssuanceCallbackUrl(rebuilt, returnUrl)
    }
  }

  return { kind: 'unsupported' }
}

/** Persist portal return offers before PIN unlock so pin-lock can route to claim afterward. */
export function storePendingFromIssuanceCallbackUrl(
  url: string,
  returnUrl: string = readWalletReturnUrl(),
): ParsedIssuanceCallback {
  const parsed = parseIssuanceCallbackUrl(url, returnUrl)
  if (parsed.kind === 'credential_offer' || parsed.kind === 'presentation_request') {
    useDeeplinkStore.getState().setPendingDeeplinkUri(parsed.uri)
  }
  return parsed
}
