import { isCredentialOfferDeeplink, isPresentationRequestDeeplink } from '../../store/deeplinkStore'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'

export type ParsedIssuanceCallback =
  | { kind: 'credential_offer'; uri: string }
  | { kind: 'presentation_request'; uri: string }
  | { kind: 'unsupported' }

const OFFER_QUERY_KEYS = ['credential_offer_uri', 'offer_uri', 'uri', 'offer'] as const

function matchesWalletReturnUrl(url: URL, expectedReturnUrl: string): boolean {
  try {
    const expected = new URL(expectedReturnUrl)
    return (
      url.protocol === expected.protocol
      && url.hostname === expected.hostname
      && url.pathname === expected.pathname
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
  } catch {
    return { kind: 'unsupported' }
  }

  return { kind: 'unsupported' }
}

export function isIssuanceCallbackUrl(uri: string): boolean {
  return parseIssuanceCallbackUrl(uri).kind !== 'unsupported'
}
