import { isTrustedIssuerJwtAlg } from '@/src/config/issuerJwtVerifyPolicy'
import {
  decodeJsonBase64Url,
  isRecord,
  isSameJwk,
  looksLikeCompactJwt,
  readString,
  toErrorMessage,
} from '@/src/utils/jwtUtils'
import { verifyEdDsaCompactJwt } from '../crypto/eddsaJwtVerify'
import { verifyEs256CompactJwt } from '../crypto/es256JwtVerify'
import { didKeyToP256PublicJwk } from '../crypto/p256Identity'
import { readTrustAnyOid4vcPeerForClientId, readTrustAnyOid4vcVerifierEnabled } from '@/src/config/oid4vcPeerTrustPolicy'
import {
  clientIdAllowsUnsignedRequestObject,
  clientIdRequiresSignedRequestObject,
  parseClientId,
  readDidWebHttpsOrigin,
  type SupportedClientIdScheme,
} from './clientIdScheme'
import { isX509ClientIdScheme } from './clientIdInteropPolicy'
import { didKeyToEd25519PublicJwk } from './didKeyPublicJwk'
import { resolveDidWebVerificationJwk } from './didWebResolver'
import {
  findTrustedVerifier,
  findTrustedVerifierForDcApiPlatformOrigin,
  type TrustedVerifier,
} from './trustedVerifierMatcher'
import { resolveJwkFromVerifierJwks } from './verifierJwks'
import { resolveX509HashVerificationJwk, resolveX509SanDnsVerificationJwk } from './x509Certificate'

export type ParseAuthorizationRequestBodyOptions = {
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
  /** DC API platform origin used when dc_api requests omit response_uri. */
  trustOrigin?: string
}

export async function parseAuthorizationRequestBody(
  text: string,
  options?: ParseAuthorizationRequestBodyOptions,
): Promise<Record<string, unknown> | undefined> {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  if (!looksLikeCompactJwt(trimmed)) {
    return parseUnsignedAuthorizationRequestJson(trimmed)
  }

  if (!options) {
    return parseAuthorizationRequestJwtPayload(trimmed)
  }

  return parseVerifiedAuthorizationRequestJwt(trimmed, options)
}

async function parseVerifiedAuthorizationRequestJwt(
  jwt: string,
  options: ParseAuthorizationRequestBodyOptions,
): Promise<Record<string, unknown>> {
  const parts = jwt.split('.')
  const headerSegment = parts[0]
  const payloadSegment = parts[1]
  const signatureSegment = parts[2]

  if (!headerSegment || !payloadSegment) {
    throw new Error('PresentationRequestInvalid: request object JWT is malformed')
  }

  const header = decodeJsonBase64Url<Record<string, unknown>>(headerSegment)
  const payload = decodeJsonBase64Url<Record<string, unknown>>(payloadSegment)
  if (!isRecord(header) || !isRecord(payload)) {
    throw new Error('PresentationRequestInvalid: request object JWT is malformed')
  }

  const typ = readString(header.typ)
  if (typ !== 'oauth-authz-req+jwt') {
    throw new Error('PresentationRequestInvalid: request object typ must be oauth-authz-req+jwt')
  }

  const clientId = readString(payload.client_id) ?? readString(header.client_id)
  if (!clientId) {
    throw new Error('PresentationRequestInvalid: client_id is required')
  }

  if (clientId.startsWith('did:')) {
    throw new Error(
      'PresentationRequestInvalid: OID4VP 1.0 requires client_id "decentralized_identifier:did:…"; bare did: is not supported',
    )
  }

  const parsedClientId = parseClientId(clientId)
  if (parsedClientId.scheme === 'unknown' || parsedClientId.scheme === 'openid_federation') {
    throw new Error(`PresentationRequestUnsupported: client_id scheme ${parsedClientId.scheme} is not supported`)
  }
  if (
    !readTrustAnyOid4vcVerifierEnabled()
    && (parsedClientId.scheme === 'x509_san_dns' || parsedClientId.scheme === 'x509_hash')
  ) {
    throw new Error(`PresentationRequestUnsupported: client_id scheme ${parsedClientId.scheme} is not supported`)
  }
  if (
    parsedClientId.scheme === 'verifier_attestation'
    || parsedClientId.scheme === 'origin'
  ) {
    throw new Error(`PresentationRequestUnsupported: client_id scheme ${parsedClientId.scheme} is not supported`)
  }

  const alg = readString(header.alg)
  const scheme = parsedClientId.scheme
  const hasSignature = Boolean(signatureSegment)

  if (clientIdRequiresSignedRequestObject(scheme as SupportedClientIdScheme) || isX509ClientIdScheme(scheme)) {
    if (!hasSignature || !alg || alg === 'none') {
      throw new Error('PresentationRequestInvalid: signed request object is required')
    }

    const verificationJwk = await resolveRequestObjectVerificationJwk({
      clientId,
      responseUri: readString(payload.response_uri),
      trustOrigin: options.trustOrigin,
      header,
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl ?? fetch,
    })

    if (!verifyAuthorizationRequestSignature(jwt, verificationJwk, alg)) {
      throw new Error('PresentationRequestInvalid: request object signature verification failed')
    }

    return mergeAuthorizationRequestClientId(payload, clientId)
  }

  if (hasSignature && alg && alg !== 'none') {
    const verificationJwk = await resolveRequestObjectVerificationJwk({
      clientId,
      responseUri: readString(payload.response_uri),
      trustOrigin: options.trustOrigin,
      header,
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl ?? fetch,
    })

    if (!verifyAuthorizationRequestSignature(jwt, verificationJwk, alg)) {
      throw new Error('PresentationRequestInvalid: request object signature verification failed')
    }
  } else if (!clientIdAllowsUnsignedRequestObject(scheme as SupportedClientIdScheme) && !isX509ClientIdScheme(scheme)) {
    throw new Error('PresentationRequestInvalid: signed request object is required')
  }

  return mergeAuthorizationRequestClientId(payload, clientId)
}

function mergeAuthorizationRequestClientId(
  payload: Record<string, unknown>,
  clientId: string,
): Record<string, unknown> {
  if (readString(payload.client_id)) return payload
  return { ...payload, client_id: clientId }
}

function parseAuthorizationRequestJwtPayload(jwt: string): Record<string, unknown> | undefined {
  const parts = jwt.split('.')
  if (!parts[1]) return undefined

  const payload = decodeJsonBase64Url<Record<string, unknown>>(parts[1])
  return isRecord(payload) ? payload : undefined
}

function parseUnsignedAuthorizationRequestJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: ${toErrorMessage(error)}`)
  }
}

export async function resolveRequestObjectVerificationJwk(input: {
  clientId: string
  responseUri: string | undefined
  trustOrigin?: string
  header: Record<string, unknown>
  trustedVerifiers: TrustedVerifier[]
  fetchImpl: typeof fetch
}): Promise<Record<string, unknown>> {
  const parsedClientId = parseClientId(input.clientId)
  const platformOrigin = readHttpsTrustOrigin(input.trustOrigin)
  const usesDcApiPlatformBinding = !input.responseUri && Boolean(platformOrigin)
  const trustReferenceUri = readTrustReferenceUri({
    clientId: input.clientId,
    responseUri: input.responseUri,
    trustOrigin: input.trustOrigin,
  })
  const trustAnyPeer = readTrustAnyOid4vcPeerForClientId(input.clientId)
  const trustedVerifier = usesDcApiPlatformBinding
    ? findTrustedVerifierForDcApiPlatformOrigin(
        input.clientId,
        platformOrigin!,
        input.trustedVerifiers,
        trustAnyPeer,
      )
    : trustReferenceUri
      ? findTrustedVerifier(
          input.clientId,
          trustReferenceUri,
          input.trustedVerifiers,
          trustAnyPeer,
        )
      : undefined
  const headerKid = readString(input.header.kid)

  let resolved: Record<string, unknown> | undefined

  if (trustedVerifier?.verificationJwk) {
    const pinned = trustedVerifier.verificationJwk
    const pinnedKid = readString(pinned.kid)
    if (!headerKid || !pinnedKid || pinnedKid === headerKid) {
      resolved = pinned
    }
  }

  if (
    !resolved
    && parsedClientId.scheme === 'decentralized_identifier'
    && parsedClientId.originalClientId.startsWith('did:web:')
  ) {
    if (!input.responseUri && !usesDcApiPlatformBinding) {
      const didWebOrigin = readDidWebHttpsOrigin(parsedClientId.originalClientId)
      if (!didWebOrigin || !platformOrigin || didWebOrigin !== platformOrigin) {
        throw new Error('PresentationRequestInvalid: response_uri is required')
      }
    }
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }

    resolved = await resolveDidWebVerificationJwk(
      parsedClientId.originalClientId,
      headerKid,
      input.fetchImpl,
    )
  }

  if (
    !resolved
    && parsedClientId.scheme === 'decentralized_identifier'
    && parsedClientId.originalClientId.startsWith('did:key:')
  ) {
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }
    resolved = resolveDidKeyVerificationJwk(parsedClientId.originalClientId, headerKid)
  }

  if (!resolved && parsedClientId.scheme === 'redirect_uri') {
    const jwksResponseUri = input.responseUri ?? trustReferenceUri
    if (!jwksResponseUri) {
      throw new Error('PresentationRequestInvalid: response_uri is required')
    }
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }

    resolved = await resolveJwkFromVerifierJwks({
      responseUri: jwksResponseUri,
      kid: headerKid,
      fetchImpl: input.fetchImpl,
    })
  }

  if (!resolved && parsedClientId.scheme === 'x509_hash') {
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }
    resolved = resolveX509HashVerificationJwk({
      clientId: input.clientId,
      header: input.header,
    })
  }

  if (!resolved && parsedClientId.scheme === 'x509_san_dns') {
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }
    resolved = resolveX509SanDnsVerificationJwk({
      clientId: input.clientId,
      header: input.header,
    })
  }

  if (!resolved) {
    throw new Error('PresentationRequestInvalid: verifier signing key is not available')
  }

  const headerJwk = input.header.jwk
  if (isRecord(headerJwk) && !isSameJwk(headerJwk, resolved)) {
    throw new Error('PresentationRequestInvalid: request object jwk does not match trusted verifier key')
  }

  return resolved
}

function resolveDidKeyVerificationJwk(did: string, kid: string | undefined): Record<string, unknown> {
  const didWithoutFragment = did.split('#')[0]!
  if (kid) {
    const kidDid = kid.startsWith('did:') ? kid.split('#')[0]! : undefined
    if (kidDid && kidDid !== didWithoutFragment) {
      throw new Error('PresentationRequestInvalid: request object kid does not match client_id')
    }
  }

  try {
    return didKeyToP256PublicJwk(didWithoutFragment)
  } catch {
    // fall through to Ed25519
  }

  try {
    return didKeyToEd25519PublicJwk(didWithoutFragment)
  } catch {
    throw new Error('PresentationRequestInvalid: unsupported did:key verifier signing key')
  }
}

export function verifyAuthorizationRequestSignature(
  jwt: string,
  publicJwk: Record<string, unknown>,
  alg: string,
): boolean {
  if (!isTrustedIssuerJwtAlg(alg)) return false
  if (alg === 'EdDSA') return verifyEdDsaCompactJwt(jwt, publicJwk)
  return verifyEs256CompactJwt(jwt, publicJwk)
}

function readTrustReferenceUri(input: {
  clientId: string
  responseUri?: string
  trustOrigin?: string
}): string | undefined {
  if (input.responseUri) return input.responseUri

  const parsed = parseClientId(input.clientId)
  if (parsed.scheme === 'redirect_uri') {
    return parsed.originalClientId
  }

  return readHttpsTrustOrigin(input.trustOrigin)
}

function readHttpsTrustOrigin(origin: string | undefined): string | undefined {
  const trimmed = origin?.trim()
  if (!trimmed) return undefined

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return undefined
    return parsed.origin
  } catch {
    return undefined
  }
}
