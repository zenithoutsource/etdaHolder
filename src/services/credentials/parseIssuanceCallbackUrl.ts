import { parseAuthorizationResponseRedirectUrl } from '@openid4vc/oauth2'

import { isCredentialOfferDeeplink, isPresentationRequestDeeplink } from '../../store/deeplinkStore'
import { readActiveSameDeviceSession } from '../../store/sameDeviceIssuanceStore'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc } from '../vci/oid4vc/authorizationCodeViaOid4vc'
import type { Oid4vcVciAdapterContext } from '../vci/oid4vc/types'

const PRESENTATION_QUERY_KEYS = [
  'authorization_request_uri',
  'presentation_request_uri',
  'openid4vp',
  'uri',
] as const

export type ParsedIssuanceCallback =
  | { kind: 'credential_offer'; uri: string }
  | { kind: 'presentation_request'; uri: string }
  | { kind: 'authorization_code'; code: string; state?: string }
  | { kind: 'authorization_error'; error: string; errorDescription?: string; state?: string }
  | { kind: 'unsupported' }

const OFFER_QUERY_KEYS = ['credential_offer_uri', 'offer_uri', 'uri', 'offer'] as const

function matchesWalletReturnUrl(url: URL, expectedReturnUrl: string): boolean {
  try {
    const expected = new URL(expectedReturnUrl)
    const normalizedPath = (pathname: string) => pathname.replace(/\/+$/, '') || '/'
    return (
      url.protocol === expected.protocol
      && url.hostname === expected.hostname
      && normalizedPath(url.pathname) === normalizedPath(expected.pathname)
    )
  } catch {
    return url.toString().startsWith(expectedReturnUrl)
  }
}

function normalizeCredentialOfferUri(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('openid-credential-offer://')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(trimmed)}`
  }
  try {
    const decoded = decodeURIComponent(trimmed)
    if (decoded.startsWith('openid-credential-offer://')) return decoded
  } catch {
    // ignore malformed encoding
  }
  return undefined
}

function readOfferUriFromCallbackQuery(parsed: URL): string | undefined {
  for (const key of OFFER_QUERY_KEYS) {
    const raw = parsed.searchParams.get(key)
    const normalized = raw ? normalizeCredentialOfferUri(raw) : undefined
    if (normalized) return normalized
  }

  // Issuer quirk (2026-07): ?openid-credential-offer://?credential_offer_uri=<https>
  // instead of ?credential_offer_uri=<https>
  for (const [key, raw] of parsed.searchParams.entries()) {
    if (!raw.trim()) continue
    if (key.includes('credential_offer_uri') || key.startsWith('openid-credential-offer')) {
      const normalized = normalizeCredentialOfferUri(raw)
      if (normalized) return normalized
    }
  }

  const rawSearch = parsed.search.startsWith('?') ? parsed.search.slice(1) : parsed.search
  const embeddedOffer = rawSearch.match(/credential_offer_uri=([^&]+)/i)?.[1]
  if (embeddedOffer) {
    let decoded = embeddedOffer
    try {
      decoded = decodeURIComponent(embeddedOffer)
    } catch {
      // keep raw fragment
    }
    const normalized = normalizeCredentialOfferUri(decoded)
    if (normalized) return normalized
  }

  const credentialOffer = parsed.searchParams.get('credential_offer')?.trim()
  if (credentialOffer) {
    return `openid-credential-offer://?credential_offer=${encodeURIComponent(credentialOffer)}`
  }

  return undefined
}

function normalizePresentationRequestUri(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('openid4vp://')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `openid4vp://authorize?request_uri=${encodeURIComponent(trimmed)}`
  }
  try {
    const decoded = decodeURIComponent(trimmed)
    if (decoded.startsWith('openid4vp://')) return decoded
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return `openid4vp://authorize?request_uri=${encodeURIComponent(decoded)}`
    }
  } catch {
    // ignore malformed encoding
  }
  return undefined
}

function readEmbeddedOpenId4VpFromRawSearch(parsed: URL): string | undefined {
  const rawSearch = parsed.search.startsWith('?') ? parsed.search.slice(1) : parsed.search
  const trimmed = rawSearch.trim()
  if (!trimmed.startsWith('openid4vp://')) return undefined
  return normalizePresentationRequestUri(trimmed)
}

function reconstructOpenId4VpFromBrokenCallbackQuery(parsed: URL): string | undefined {
  const requestUri = parsed.searchParams.get('request_uri')?.trim()
  if (!requestUri) return undefined

  for (const [key, raw] of parsed.searchParams.entries()) {
    if (!key.startsWith('openid4vp')) continue
    if (!key.includes('client_id')) continue
    const clientId = raw.trim()
    if (!clientId) continue
    return `openid4vp://authorize?client_id=${encodeURIComponent(clientId)}&request_uri=${encodeURIComponent(requestUri)}`
  }

  return `openid4vp://authorize?request_uri=${encodeURIComponent(requestUri)}`
}

function readPresentationUriFromCallbackQuery(parsed: URL): string | undefined {
  const embedded = readEmbeddedOpenId4VpFromRawSearch(parsed)
  if (embedded) return embedded

  for (const key of PRESENTATION_QUERY_KEYS) {
    const raw = parsed.searchParams.get(key)
    const normalized = raw ? normalizePresentationRequestUri(raw) : undefined
    if (normalized) return normalized
  }

  for (const [key, raw] of parsed.searchParams.entries()) {
    if (!raw.trim()) continue
    if (
      key.includes('authorization_request_uri')
      || key.includes('presentation_request_uri')
      || key.startsWith('openid4vp')
    ) {
      const normalized = normalizePresentationRequestUri(raw)
      if (normalized) return normalized
    }
  }

  return reconstructOpenId4VpFromBrokenCallbackQuery(parsed)
}

type VerifiedAuthorizationResponse = ReturnType<typeof parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc>

type OAuthAuthorizationCallback = Extract<
  ParsedIssuanceCallback,
  { kind: 'authorization_code' } | { kind: 'authorization_error' }
>

function mapVerifiedAuthorizationResponse(
  response: VerifiedAuthorizationResponse,
): OAuthAuthorizationCallback | undefined {
  if ('code' in response && typeof response.code === 'string' && response.code.length > 0) {
    return {
      kind: 'authorization_code',
      code: response.code,
      state: typeof response.state === 'string' ? response.state : undefined,
    }
  }

  if ('error' in response && typeof response.error === 'string' && response.error.length > 0) {
    return {
      kind: 'authorization_error',
      error: response.error,
      errorDescription: typeof response.error_description === 'string'
        ? response.error_description
        : undefined,
      state: typeof response.state === 'string' ? response.state : undefined,
    }
  }

  return undefined
}

function readVerifiedAuthorizationCallbackFromUrl(
  parsed: URL,
  oid4vcContext: Oid4vcVciAdapterContext,
): OAuthAuthorizationCallback | undefined {
  try {
    const verified = parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc({
      url: parsed.toString(),
      oid4vcContext,
    })
    const mapped = mapVerifiedAuthorizationResponse(verified)
    if (!mapped) return undefined

    const session = readActiveSameDeviceSession()
    if (session && mapped.state && mapped.state !== session.id) {
      logWalletError(
        'same-device-issuance',
        'authorization-callback-state-mismatch',
        new Error('OAuth state does not match active same-device session'),
        { sessionId: session.id },
      )
      return {
        kind: 'authorization_error',
        error: 'invalid_state',
        state: mapped.state,
      }
    }

    logWalletStep('same-device-issuance', 'authorization-callback-verified', {
      kind: mapped.kind,
      hasState: Boolean(mapped.state),
    })
    return mapped
  } catch (error) {
    logWalletError('same-device-issuance', 'authorization-callback-verify-fallback', error)
    return undefined
  }
}

function readUnverifiedAuthorizationCallbackFromUrl(parsed: URL): ParsedIssuanceCallback | undefined {
  try {
    const response = parseAuthorizationResponseRedirectUrl({ url: parsed.toString() })
    if ('code' in response && typeof response.code === 'string' && response.code.length > 0) {
      return {
        kind: 'authorization_code',
        code: response.code,
        state: typeof response.state === 'string' ? response.state : undefined,
      }
    }

    if ('error' in response && typeof response.error === 'string' && response.error.length > 0) {
      return {
        kind: 'authorization_error',
        error: response.error,
        errorDescription: typeof response.error_description === 'string'
          ? response.error_description
          : undefined,
        state: typeof response.state === 'string' ? response.state : undefined,
      }
    }
  } catch {
    const code = parsed.searchParams.get('code')?.trim()
    if (code) {
      return {
        kind: 'authorization_code',
        code,
        state: parsed.searchParams.get('state')?.trim() || undefined,
      }
    }

    const oauthError = parsed.searchParams.get('error')?.trim()
    if (oauthError) {
      return {
        kind: 'authorization_error',
        error: oauthError,
        errorDescription: parsed.searchParams.get('error_description')?.trim() || undefined,
        state: parsed.searchParams.get('state')?.trim() || undefined,
      }
    }
  }

  return undefined
}

function readAuthorizationCallbackFromUrl(
  parsed: URL,
  oid4vcContext?: Oid4vcVciAdapterContext,
): ParsedIssuanceCallback | undefined {
  const hasOAuthParams = parsed.searchParams.has('code')
    || parsed.searchParams.has('error')
    || parsed.searchParams.has('state')
  if (!hasOAuthParams) return undefined

  if (oid4vcContext) {
    const verified = readVerifiedAuthorizationCallbackFromUrl(parsed, oid4vcContext)
    if (verified) return verified
  }

  return readUnverifiedAuthorizationCallbackFromUrl(parsed)
}

export function parseIssuanceCallbackUrl(
  uri: string,
  expectedReturnUrl: string = readWalletReturnUrl(),
  options?: { oid4vcContext?: Oid4vcVciAdapterContext },
): ParsedIssuanceCallback {
  if (isCredentialOfferDeeplink(uri)) {
    return { kind: 'credential_offer', uri }
  }

  if (isPresentationRequestDeeplink(uri)) {
    return { kind: 'presentation_request', uri }
  }

  try {
    const parsed = new URL(uri)
    if (!matchesWalletReturnUrl(parsed, expectedReturnUrl)) {
      return { kind: 'unsupported' }
    }

    const offerUri = readOfferUriFromCallbackQuery(parsed)
    if (offerUri) {
      return { kind: 'credential_offer', uri: offerUri }
    }

    const oid4vcContext = options?.oid4vcContext
      ?? readActiveSameDeviceSession()?.resolvedOffer?.oid4vcContext
    const authorizationCallback = readAuthorizationCallbackFromUrl(parsed, oid4vcContext)
    if (authorizationCallback) {
      return authorizationCallback
    }

    const presentationUri = readPresentationUriFromCallbackQuery(parsed)
    if (presentationUri) {
      return { kind: 'presentation_request', uri: presentationUri }
    }
  } catch {
    return { kind: 'unsupported' }
  }

  return { kind: 'unsupported' }
}

export function isIssuanceCallbackUrl(uri: string): boolean {
  return parseIssuanceCallbackUrl(uri).kind !== 'unsupported'
}
