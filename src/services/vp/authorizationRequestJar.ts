import { hashes, verify } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import {
  decodeJsonBase64Url,
  isRecord,
  looksLikeCompactJwt,
  readString,
  toErrorMessage,
} from '@/src/utils/jwtUtils'
import {
  clientIdAllowsUnsignedRequestObject,
  clientIdRequiresSignedRequestObject,
  parseClientId,
  type SupportedClientIdScheme,
} from './clientIdScheme'
import { resolveDidWebVerificationJwk } from './didWebResolver'
import type { TrustedVerifier } from './presentationService'

if (!hashes.sha512) hashes.sha512 = sha512

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
      header,
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl ?? fetch,
    }).catch(() => undefined)

    if (verificationJwk && !verifyAuthorizationRequestSignature(jwt, verificationJwk, alg)) {
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

async function resolveRequestObjectVerificationJwk(input: {
  clientId: string
  header: Record<string, unknown>
  trustedVerifiers: TrustedVerifier[]
  fetchImpl: typeof fetch
}): Promise<Record<string, unknown>> {
  const pinnedJwk = readPinnedVerificationJwk(input.clientId, input.trustedVerifiers)
  if (pinnedJwk) return pinnedJwk

  const parsedClientId = parseClientId(input.clientId)
  if (
    parsedClientId.scheme === 'decentralized_identifier' &&
    parsedClientId.originalClientId.startsWith('did:web:')
  ) {
    return resolveDidWebVerificationJwk(
      parsedClientId.originalClientId,
      readString(input.header.kid),
      input.fetchImpl,
    )
  }

  const headerJwk = input.header.jwk
  if (isRecord(headerJwk)) return headerJwk

  throw new Error('PresentationRequestInvalid: verifier signing key is not available')
}

function readPinnedVerificationJwk(
  clientId: string,
  trustedVerifiers: TrustedVerifier[],
): Record<string, unknown> | undefined {
  const parsedClientId = parseClientId(clientId)

  for (const verifier of trustedVerifiers) {
    if (!verifier.verificationJwk) continue

    const verifierClientId = parseClientId(verifier.clientId)
    if (parsedClientId.scheme !== verifierClientId.scheme) continue

    if (parsedClientId.scheme === 'decentralized_identifier') {
      if (parsedClientId.originalClientId === verifierClientId.originalClientId) {
        return verifier.verificationJwk
      }
      continue
    }

    if (verifier.clientId === clientId || clientId.startsWith(`${verifier.clientId}/`)) {
      return verifier.verificationJwk
    }
  }

  return undefined
}

function verifyAuthorizationRequestSignature(
  jwt: string,
  publicJwk: Record<string, unknown>,
  alg: string,
): boolean {
  if (alg !== 'EdDSA') return false
  if (publicJwk.kty !== 'OKP' || publicJwk.crv !== 'Ed25519') return false

  const x = readString(publicJwk.x)
  if (!x) return false

  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[2]) return false

  try {
    return verify(
      base64UrlDecodeToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      base64UrlDecodeToBytes(x),
    )
  } catch {
    return false
  }
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
