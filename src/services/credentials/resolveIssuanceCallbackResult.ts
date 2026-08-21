import { parseIssuanceCallbackUrl, type ParsedIssuanceCallback } from './parseIssuanceCallbackUrl'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'
import { useDeeplinkStore } from '../../store/deeplinkStore'
import { logWalletStep } from '../debug/walletLogger'
import { isPresentationRequestConsumed } from '../vp/presentationRequestReplay'
import { storeSameDeviceAuthorizationCode } from './sameDeviceIssuanceSession'

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

function persistAuthorizationCodeCallback(parsed: Extract<ParsedIssuanceCallback, { kind: 'authorization_code' }>): void {
  const session = storeSameDeviceAuthorizationCode(parsed.code)
  if (session) {
    logWalletStep('same-device-issuance', 'authorization-code-callback-stored', {
      sessionId: session.id,
      credentialType: session.credentialType,
    })
    return
  }

  // Portal offer-URI flow does not call beginSameDeviceIssuanceSession(); auth-code callbacks
  // are stored when same-device session was started before opening the authorize URL.
  logWalletStep('same-device-issuance', 'authorization-code-callback-without-session', {
    hasState: Boolean(parsed.state),
  })
}

/** Persist portal return offers before PIN unlock so pin-lock can route to claim afterward. */
export function storePendingFromIssuanceCallbackUrl(
  url: string,
  returnUrl: string = readWalletReturnUrl(),
): ParsedIssuanceCallback {
  const parsed = parseIssuanceCallbackUrl(url, returnUrl)
  if (parsed.kind === 'authorization_code') {
    persistAuthorizationCodeCallback(parsed)
    return parsed
  }
  if (parsed.kind === 'credential_offer' || parsed.kind === 'presentation_request') {
    // Keep dismissed blocked here: getInitialURL / cold replay must not resurrect a
    // user-closed request. Warm reopen uses setIncomingDeeplinkUri / layout listener.
    if (
      parsed.uri === useDeeplinkStore.getState().dismissedUri
      || (
        parsed.kind === 'presentation_request'
        && isPresentationRequestConsumed(parsed.uri)
      )
    ) {
      return parsed
    }
    if (parsed.kind === 'presentation_request') {
      useDeeplinkStore.getState().setPendingPresentationRequest({
        uri: parsed.uri,
        origin: 'same-device',
      })
    } else {
      useDeeplinkStore.getState().setPendingCredentialOffer({
        uri: parsed.uri,
        origin: 'same-device',
      })
    }
  }
  return parsed
}
