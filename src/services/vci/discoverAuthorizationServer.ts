import {
  fetchAuthorizationServerMetadata,
  type AuthorizationServerMetadata,
} from '@openid4vc/oauth2'
import type { IssuerMetadataResult } from '@openid4vc/openid4vci'

import { logWalletStep } from '@/src/services/debug/walletLogger'
import { readString } from '@/src/utils/jwtUtils'

import { normalizeIssuerIdentifier } from './discoverIssuerMetadata'

function isSameOrigin(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left)
    const rightUrl = new URL(right)
    return leftUrl.protocol === rightUrl.protocol && leftUrl.host === rightUrl.host
  } catch {
    return false
  }
}

function splitUrlPath(url: string): { origin: string; parts: string[] } | undefined {
  try {
    const parsed = new URL(url)
    return {
      origin: parsed.origin,
      parts: parsed.pathname.replace(/\/+$/, '').split('/').filter((part) => part.length > 0),
    }
  } catch {
    return undefined
  }
}

function isOriginLeafEndpoint(
  endpoint: string | undefined,
  origin: string,
  leaf: 'credential' | 'nonce',
): boolean {
  if (!endpoint) return true
  const parsed = splitUrlPath(endpoint)
  if (!parsed) return false
  return parsed.origin === origin && parsed.parts.length === 1 && parsed.parts[0] === leaf
}

function deriveSessionCredentialEndpoint(
  offerIssuer: string,
  tokenEndpoint: string,
): string | undefined {
  const offer = splitUrlPath(offerIssuer)
  const token = splitUrlPath(tokenEndpoint)
  if (!offer || !token || offer.origin !== token.origin) return undefined
  if (token.parts.at(-1) !== 'token') return undefined
  const schemaId = token.parts.at(-2)
  if (!schemaId || offer.parts.at(-1) !== schemaId) return undefined
  return `${token.origin}/${token.parts.slice(0, -1).join('/')}/credential`
}

function deriveSessionNonceEndpoint(offerIssuer: string): string | undefined {
  const offer = splitUrlPath(offerIssuer)
  if (!offer || offer.parts.length < 3) return undefined
  return `${offer.origin}/${offer.parts.slice(0, -2).join('/')}/nonce`
}

function readResolvedAuthorizationServerIssuer(
  issuerMetadataResult: IssuerMetadataResult,
): string | undefined {
  const fromServers = readString(issuerMetadataResult.authorizationServers?.[0]?.issuer)
  if (fromServers) return normalizeIssuerIdentifier(fromServers)
  const fromCredentialIssuer = readString(
    issuerMetadataResult.credentialIssuer.authorization_servers?.[0],
  )
  return fromCredentialIssuer ? normalizeIssuerIdentifier(fromCredentialIssuer) : undefined
}

/**
 * Path-based credential issuers often publish origin Credential Issuer metadata
 * (configs, credential_endpoint) while the pre-authorized grant lives on a
 * session-path Authorization Server (RFC 8414 insert well-known). Origin
 * `/token` then returns `invalid_grant` for a code the session AS issued.
 */
export async function overlayOfferAuthorizationServer(
  offerIssuer: string,
  issuerMetadataResult: IssuerMetadataResult,
  fetchImpl: typeof fetch = fetch,
): Promise<IssuerMetadataResult> {
  const offer = normalizeIssuerIdentifier(offerIssuer)
  if (readResolvedAuthorizationServerIssuer(issuerMetadataResult) === offer) {
    return issuerMetadataResult
  }

  let sessionAs: AuthorizationServerMetadata | null
  try {
    sessionAs = await fetchAuthorizationServerMetadata(offer, fetchImpl)
  } catch {
    logWalletStep('oid4vci', 'offer-authorization-server-overlay-skipped', {
      reason: 'fetch-failed',
    })
    return issuerMetadataResult
  }

  if (!sessionAs) {
    logWalletStep('oid4vci', 'offer-authorization-server-overlay-skipped', {
      reason: 'not-found',
    })
    return issuerMetadataResult
  }

  if (!isSameOrigin(offer, sessionAs.issuer) || !isSameOrigin(offer, sessionAs.token_endpoint)) {
    logWalletStep('oid4vci', 'offer-authorization-server-overlay-skipped', {
      reason: 'cross-origin',
    })
    return issuerMetadataResult
  }

  const origin = new URL(offer).origin
  const credentialIssuer = {
    ...issuerMetadataResult.credentialIssuer,
    authorization_servers: [sessionAs.issuer],
  }
  const sessionCredentialEndpoint = deriveSessionCredentialEndpoint(offer, sessionAs.token_endpoint)
  if (
    sessionCredentialEndpoint &&
    isOriginLeafEndpoint(credentialIssuer.credential_endpoint, origin, 'credential')
  ) {
    credentialIssuer.credential_endpoint = sessionCredentialEndpoint
  }
  const sessionNonceEndpoint = deriveSessionNonceEndpoint(offer)
  if (sessionNonceEndpoint && isOriginLeafEndpoint(credentialIssuer.nonce_endpoint, origin, 'nonce')) {
    credentialIssuer.nonce_endpoint = sessionNonceEndpoint
  }

  logWalletStep('oid4vci', 'offer-authorization-server-overlay', {
    tokenEndpoint: sessionAs.token_endpoint,
    credentialEndpoint: credentialIssuer.credential_endpoint,
    nonceEndpoint: credentialIssuer.nonce_endpoint,
    authMethods: sessionAs.token_endpoint_auth_methods_supported,
  })

  return {
    ...issuerMetadataResult,
    authorizationServers: [sessionAs],
    credentialIssuer,
  }
}
