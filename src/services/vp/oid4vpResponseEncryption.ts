/**
 * OID4VP direct_post.jwt: select Verifier response-encryption JWK from client_metadata.
 */
import { isRecord, readString } from '@/src/utils/jwtUtils'

import type { Oid4vpEncryptionRecipientJwk, Oid4vpJweEncAlgorithm } from '@/src/services/crypto/jweEcdhEs'

export type Oid4vpResponseMode = 'direct_post' | 'direct_post.jwt'

export type Oid4vpResponseEncryptionParams = {
  alg: 'ECDH-ES'
  enc: Oid4vpJweEncAlgorithm
  jwk: Oid4vpEncryptionRecipientJwk
}

const SUPPORTED_ENC_ALGS: readonly Oid4vpJweEncAlgorithm[] = ['A128GCM', 'A256GCM']
const DEFAULT_ENC: Oid4vpJweEncAlgorithm = 'A128GCM'

function readClientMetadataRecord(authorizationRequest: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = authorizationRequest.client_metadata
  if (isRecord(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return isRecord(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function readJwksKeys(clientMetadata: Record<string, unknown>): unknown[] {
  const jwks = clientMetadata.jwks
  if (!isRecord(jwks) || !Array.isArray(jwks.keys)) return []
  return jwks.keys
}

function isEncryptionUseAllowed(use: string | undefined): boolean {
  return !use || use === 'enc'
}

function readP256EcdhEsRecipientJwk(key: unknown): Oid4vpEncryptionRecipientJwk | undefined {
  if (!isRecord(key)) return undefined
  if (readString(key.kty) !== 'EC') return undefined
  if (readString(key.crv) !== 'P-256') return undefined
  const alg = readString(key.alg)
  if (alg !== 'ECDH-ES') return undefined
  const x = readString(key.x)
  const y = readString(key.y)
  if (!x || !y) return undefined
  if (!isEncryptionUseAllowed(readString(key.use))) return undefined

  const jwk: Oid4vpEncryptionRecipientJwk = {
    kty: 'EC',
    crv: 'P-256',
    alg: 'ECDH-ES',
    x,
    y,
  }
  const kid = readString(key.kid)
  if (kid) jwk.kid = kid
  const use = readString(key.use)
  if (use) jwk.use = use
  return jwk
}

function selectEncAlgorithm(clientMetadata: Record<string, unknown>): Oid4vpJweEncAlgorithm {
  const supported = clientMetadata.encrypted_response_enc_values_supported
  if (!Array.isArray(supported)) return DEFAULT_ENC

  for (const entry of supported) {
    if (typeof entry !== 'string') continue
    if (entry === 'A128GCM' || entry === 'A256GCM') {
      return entry
    }
  }

  return DEFAULT_ENC
}

/**
 * Resolve encryption parameters for direct_post.jwt. Throws when metadata lacks a usable key.
 */
export function resolveOid4vpResponseEncryptionParams(
  authorizationRequest: Record<string, unknown>,
): Oid4vpResponseEncryptionParams {
  const clientMetadata = readClientMetadataRecord(authorizationRequest)
  if (!clientMetadata) {
    throw new Error(
      'PresentationRequestUnsupported: direct_post.jwt requires client_metadata with jwks.keys',
    )
  }

  const enc = selectEncAlgorithm(clientMetadata)
  for (const key of readJwksKeys(clientMetadata)) {
    const jwk = readP256EcdhEsRecipientJwk(key)
    if (jwk) {
      return { alg: 'ECDH-ES', enc, jwk }
    }
  }

  throw new Error(
    'PresentationRequestUnsupported: direct_post.jwt requires an EC P-256 ECDH-ES encryption JWK in client_metadata.jwks',
  )
}

export function isSupportedOid4vpResponseMode(responseMode: string): boolean {
  return responseMode === 'direct_post' || responseMode === 'direct_post.jwt'
}
