/**
 * OID4VP direct_post.jwt: select Verifier response-encryption JWK from client_metadata.
 */
import { isRecord, readString } from '@/src/utils/jwtUtils'
import { readOid4vpJweEncOverride, readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { parseP256JwkPublicKey } from '@/src/services/crypto/p256Identity'

import type { Oid4vpEncryptionRecipientJwk, Oid4vpJweEncAlgorithm } from '@/src/services/crypto/jweEcdhEs'

export type Oid4vpResponseMode = 'direct_post' | 'direct_post.jwt'

export type Oid4vpResponseEncryptionParams = {
  alg: 'ECDH-ES'
  enc: Oid4vpJweEncAlgorithm
  jwk: Oid4vpEncryptionRecipientJwk
  jwkCoordinatePadded?: boolean
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

function readP256EcdhEsRecipientJwk(
  key: unknown,
): { jwk: Oid4vpEncryptionRecipientJwk; coordinatePadded: boolean } | undefined {
  if (!isRecord(key)) return undefined
  if (readString(key.kty) !== 'EC') return undefined
  if (readString(key.crv) !== 'P-256') return undefined
  const alg = readString(key.alg)
  if (alg !== 'ECDH-ES') return undefined
  const x = readString(key.x)
  const y = readString(key.y)
  if (!x || !y) return undefined
  if (!isEncryptionUseAllowed(readString(key.use))) return undefined

  let coordinatePadded = false
  if (readWalletDemoInteropEnabled()) {
    const parsed = parseP256JwkPublicKey(
      { kty: 'EC', crv: 'P-256', x, y },
      { lenientCoordinates: true },
    )
    coordinatePadded = parsed.coordinatePadded
    if (coordinatePadded) {
      logWalletStep('oid4vp', 'encryption-jwk-coordinate-padded', { kid: readString(key.kid) })
    }
  }

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
  return { jwk, coordinatePadded }
}

function selectEncAlgorithm(clientMetadata: Record<string, unknown>): Oid4vpJweEncAlgorithm {
  const supported = clientMetadata.encrypted_response_enc_values_supported
  if (!Array.isArray(supported)) return DEFAULT_ENC

  const override = readOid4vpJweEncOverride()
  if (override && supported.includes(override)) return override

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
  const keys = readJwksKeys(clientMetadata)
  for (const key of keys) {
    const recipient = readP256EcdhEsRecipientJwk(key)
    if (recipient) {
      const { jwk, coordinatePadded } = recipient
      logWalletStep('oid4vp', 'response-encryption-selected', {
        enc,
        advertisedEncValues: Array.isArray(clientMetadata.encrypted_response_enc_values_supported)
          ? clientMetadata.encrypted_response_enc_values_supported.filter((value): value is string => typeof value === 'string')
          : [],
        jwksKeyCount: keys.length,
        selectedKey: {
          alg: jwk.alg,
          crv: jwk.crv,
          kidPresent: Boolean(jwk.kid),
          use: jwk.use ?? undefined,
        },
      })
      return {
        alg: 'ECDH-ES',
        enc,
        jwk,
        ...(coordinatePadded ? { jwkCoordinatePadded: true } : {}),
      }
    }
  }

  throw new Error(
    'PresentationRequestUnsupported: direct_post.jwt requires an EC P-256 ECDH-ES encryption JWK in client_metadata.jwks',
  )
}

export function isSupportedOid4vpResponseMode(responseMode: string): boolean {
  return responseMode === 'direct_post' || responseMode === 'direct_post.jwt'
}
