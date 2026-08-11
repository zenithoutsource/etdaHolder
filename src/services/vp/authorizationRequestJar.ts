import {
  decodeJsonBase64Url,
  isRecord,
  looksLikeCompactJwt,
  readString,
  toErrorMessage,
} from '@/src/utils/jwtUtils'
import { verifyEdDsaCompactJwt } from '../crypto/eddsaJwtVerify'
import { verifyEs256CompactJwt } from '../crypto/es256JwtVerify'
import { didKeyToP256PublicJwk } from '../crypto/p256Identity'
import {
  clientIdAllowsUnsignedRequestObject,
  clientIdRequiresSignedRequestObject,
  parseClientId,
  type SupportedClientIdScheme,
} from './clientIdScheme'
import { didKeyToEd25519PublicJwk } from './didKeyPublicJwk'
import { resolveDidWebVerificationJwk } from './didWebResolver'
import { findTrustedVerifier, type TrustedVerifier } from './trustedVerifierMatcher'
import { resolveJwkFromVerifierJwks } from './verifierJwks'

export type ParseAuthorizationRequestBodyOptions = {
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
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

  const clientId = readString(payload.client_id)
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
    parsedClientId.scheme === 'verifier_attestation' ||
    parsedClientId.scheme === 'x509_san_dns' ||
    parsedClientId.scheme === 'x509_hash' ||
    parsedClientId.scheme === 'origin'
  ) {
    throw new Error(`PresentationRequestUnsupported: client_id scheme ${parsedClientId.scheme} is not supported`)
  }

  const alg = readString(header.alg)
  const scheme = parsedClientId.scheme as SupportedClientIdScheme
  const hasSignature = Boolean(signatureSegment)

  if (clientIdRequiresSignedRequestObject(scheme)) {
    if (!hasSignature || !alg || alg === 'none') {
      throw new Error('PresentationRequestInvalid: signed request object is required')
    }

    const verificationJwk = await resolveRequestObjectVerificationJwk({
      clientId,
      responseUri: readString(payload.response_uri),
      header,
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl ?? fetch,
    })

    if (!verifyAuthorizationRequestSignature(jwt, verificationJwk, alg)) {
      throw new Error('PresentationRequestInvalid: request object signature verification failed')
    }

    return payload
  }

  if (hasSignature && alg && alg !== 'none') {
    const verificationJwk = await resolveRequestObjectVerificationJwk({
      clientId,
      responseUri: readString(payload.response_uri),
      header,
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl ?? fetch,
    })

    if (!verifyAuthorizationRequestSignature(jwt, verificationJwk, alg)) {
      throw new Error('PresentationRequestInvalid: request object signature verification failed')
    }
  } else if (!clientIdAllowsUnsignedRequestObject(scheme)) {
    throw new Error('PresentationRequestInvalid: signed request object is required')
  }

  return payload
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
  header: Record<string, unknown>
  trustedVerifiers: TrustedVerifier[]
  fetchImpl: typeof fetch
}): Promise<Record<string, unknown>> {
  const parsedClientId = parseClientId(input.clientId)
  const trustedVerifier = input.responseUri
    ? findTrustedVerifier(input.clientId, input.responseUri, input.trustedVerifiers)
    : undefined
  const headerKid = readString(input.header.kid)

  if (trustedVerifier?.verificationJwk) {
    const pinned = trustedVerifier.verificationJwk
    const pinnedKid = readString(pinned.kid)
    if (!headerKid || !pinnedKid || pinnedKid === headerKid) {
      return pinned
    }
  }

  if (
    parsedClientId.scheme === 'decentralized_identifier' &&
    parsedClientId.originalClientId.startsWith('did:web:')
  ) {
    if (!input.responseUri) {
      throw new Error('PresentationRequestInvalid: response_uri is required')
    }
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }

    return resolveDidWebVerificationJwk(
      parsedClientId.originalClientId,
      headerKid,
      input.fetchImpl,
    )
  }

  if (
    parsedClientId.scheme === 'decentralized_identifier' &&
    parsedClientId.originalClientId.startsWith('did:key:')
  ) {
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }
    return resolveDidKeyVerificationJwk(parsedClientId.originalClientId, headerKid)
  }

  const headerJwk = input.header.jwk
  if (isRecord(headerJwk)) return headerJwk

  if (parsedClientId.scheme === 'redirect_uri') {
    if (!input.responseUri) {
      throw new Error('PresentationRequestInvalid: response_uri is required')
    }
    if (!trustedVerifier) {
      throw new Error('PresentationRequestInvalid: verifier is not trusted')
    }

    return resolveJwkFromVerifierJwks({
      responseUri: input.responseUri,
      kid: headerKid,
      fetchImpl: input.fetchImpl,
    })
  }

  throw new Error('PresentationRequestInvalid: verifier signing key is not available')
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
  if (alg === 'EdDSA') return verifyEdDsaCompactJwt(jwt, publicJwk)
  if (alg === 'ES256') return verifyEs256CompactJwt(jwt, publicJwk)
  return false
}
