import { isCredentialOfferDeeplink, isPresentationRequestDeeplink } from '../../store/deeplinkStore'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'

const PRESENTATION_QUERY_KEYS = [
  'authorization_request_uri',
  'presentation_request_uri',
  'openid4vp',
  'uri',
] as const

export type ParsedIssuanceCallback =
  | { kind: 'credential_offer'; uri: string }
  | { kind: 'presentation_request'; uri: string }
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

export function parseIssuanceCallbackUrl(
  uri: string,
  expectedReturnUrl: string = readWalletReturnUrl(),
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
