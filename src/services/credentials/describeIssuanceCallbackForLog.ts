/**
 * Safe structural summary of Issuer portal / callback return URLs for debug logs.
 * Never include full offer URLs, tokens, or query values that may embed secrets.
 */
export type IssuanceCallbackLogSummary = {
  scheme: string | null
  host: string | null
  pathname: string | null
  queryKeys: string[]
  hasCredentialOfferUri: boolean
  hasCredentialOfferJson: boolean
  hasCode: boolean
  offerUriScheme: string | null
  offerUriHost: string | null
  offerUriPath: string | null
  looksLikeOpenIdCredentialOffer: boolean
  rawUrlBytes: number
}

const OFFER_QUERY_KEYS = ['credential_offer_uri', 'offer_uri', 'uri', 'offer'] as const

function readFirstString(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key]
  if (Array.isArray(value)) return value[0]
  return typeof value === 'string' ? value : undefined
}

function summarizeOfferEndpoint(raw: string | undefined): {
  offerUriScheme: string | null
  offerUriHost: string | null
  offerUriPath: string | null
} {
  if (!raw) {
    return { offerUriScheme: null, offerUriHost: null, offerUriPath: null }
  }

  let candidate = raw.trim()
  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    // keep raw
  }

  if (candidate.startsWith('openid-credential-offer://')) {
    try {
      const nested = new URL(candidate)
      const nestedOffer = nested.searchParams.get('credential_offer_uri')
        ?? nested.searchParams.get('uri')
      return summarizeOfferEndpoint(nestedOffer ?? undefined)
    } catch {
      return {
        offerUriScheme: 'openid-credential-offer',
        offerUriHost: null,
        offerUriPath: null,
      }
    }
  }

  try {
    const parsed = new URL(candidate)
    return {
      offerUriScheme: parsed.protocol.replace(':', ''),
      offerUriHost: parsed.host || null,
      offerUriPath: parsed.pathname || null,
    }
  } catch {
    return { offerUriScheme: null, offerUriHost: null, offerUriPath: null }
  }
}

export function describeIssuanceCallbackForLog(
  url: string | null | undefined,
): IssuanceCallbackLogSummary {
  if (!url) {
    return {
      scheme: null,
      host: null,
      pathname: null,
      queryKeys: [],
      hasCredentialOfferUri: false,
      hasCredentialOfferJson: false,
      hasCode: false,
      offerUriScheme: null,
      offerUriHost: null,
      offerUriPath: null,
      looksLikeOpenIdCredentialOffer: false,
      rawUrlBytes: 0,
    }
  }

  try {
    const parsed = new URL(url)
    const queryKeys = Array.from(parsed.searchParams.keys())
    let offerRaw: string | undefined
    for (const key of OFFER_QUERY_KEYS) {
      const value = parsed.searchParams.get(key)?.trim()
      if (value) {
        offerRaw = value
        break
      }
    }

    return {
      scheme: parsed.protocol.replace(':', '') || null,
      host: parsed.hostname || null,
      pathname: parsed.pathname || null,
      queryKeys,
      hasCredentialOfferUri: Boolean(offerRaw),
      hasCredentialOfferJson: Boolean(parsed.searchParams.get('credential_offer')?.trim()),
      hasCode: Boolean(parsed.searchParams.get('code')?.trim()),
      ...summarizeOfferEndpoint(offerRaw),
      looksLikeOpenIdCredentialOffer: url.startsWith('openid-credential-offer://'),
      rawUrlBytes: url.length,
    }
  } catch {
    return {
      scheme: null,
      host: null,
      pathname: null,
      queryKeys: [],
      hasCredentialOfferUri: false,
      hasCredentialOfferJson: false,
      hasCode: false,
      offerUriScheme: null,
      offerUriHost: null,
      offerUriPath: null,
      looksLikeOpenIdCredentialOffer: url.startsWith('openid-credential-offer://'),
      rawUrlBytes: url.length,
    }
  }
}

export function describeIssuanceCallbackSearchParamsForLog(
  params: Record<string, string | string[] | undefined>,
): IssuanceCallbackLogSummary {
  const queryKeys = Object.keys(params).filter((key) => {
    const value = readFirstString(params, key)
    return typeof value === 'string' && value.length > 0
  })

  let offerRaw: string | undefined
  for (const key of OFFER_QUERY_KEYS) {
    const value = readFirstString(params, key)?.trim()
    if (value) {
      offerRaw = value
      break
    }
  }

  return {
    scheme: 'expo-router',
    host: 'callback',
    pathname: '/callback',
    queryKeys,
    hasCredentialOfferUri: Boolean(offerRaw),
    hasCredentialOfferJson: Boolean(readFirstString(params, 'credential_offer')?.trim()),
    hasCode: Boolean(readFirstString(params, 'code')?.trim()),
    ...summarizeOfferEndpoint(offerRaw),
    looksLikeOpenIdCredentialOffer: Boolean(offerRaw?.startsWith('openid-credential-offer://')),
    rawUrlBytes: 0,
  }
}
