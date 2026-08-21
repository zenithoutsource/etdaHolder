/**
 * Compact JWE encryption for OID4VP direct_post.jwt (ECDH-ES + AES-GCM).
 * Ephemeral P-256 only — does not use holder k_cred or AndroidKeyStore.
 */
import { p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createCipheriv, createDecipheriv, randomBytes } from 'react-native-quick-crypto'

import { p256JwkToPublicKey, p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'
import type { EcP256Jwk } from '@/src/services/crypto/hardwareEcdsaTypes'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import { decodeJsonBase64Url } from '@/src/utils/jwtUtils'

export type Oid4vpJweEncAlgorithm = 'A128GCM' | 'A256GCM'

export type Oid4vpEncryptionRecipientJwk = EcP256Jwk & {
  alg: 'ECDH-ES'
  kid?: string
  use?: string
}

const ENC_KEY_BITS: Record<Oid4vpJweEncAlgorithm, number> = {
  A128GCM: 128,
  A256GCM: 256,
}

const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function int32BigEndian(value: number): Uint8Array {
  const buf = new Uint8Array(4)
  new DataView(buf.buffer).setUint32(0, value, false)
  return buf
}

function encodeLengthPrefixed(bytes: Uint8Array): Uint8Array {
  return concatUint8Arrays([int32BigEndian(bytes.length), bytes])
}

function deriveEcdhEsContentKey(
  sharedSecret: Uint8Array,
  encAlg: Oid4vpJweEncAlgorithm,
): Uint8Array {
  const keydatalenBits = ENC_KEY_BITS[encAlg]
  const algId = new TextEncoder().encode(encAlg)
  const otherInfo = concatUint8Arrays([
    int32BigEndian(keydatalenBits),
    encodeLengthPrefixed(algId),
    encodeLengthPrefixed(new Uint8Array(0)),
    encodeLengthPrefixed(new Uint8Array(0)),
    int32BigEndian(keydatalenBits),
  ])

  const hashLenBytes = 32
  const reps = Math.ceil(keydatalenBits / (hashLenBytes * 8))
  const derived = new Uint8Array(reps * hashLenBytes)

  for (let counter = 1; counter <= reps; counter += 1) {
    const hashInput = concatUint8Arrays([
      int32BigEndian(counter),
      sharedSecret,
      otherInfo,
    ])
    derived.set(sha256(hashInput), (counter - 1) * hashLenBytes)
  }

  return derived.slice(0, keydatalenBits / 8)
}

function readEphemeralPublicJwk(ephemeralPrivateKey: Uint8Array): EcP256Jwk {
  const uncompressed = p256.getPublicKey(ephemeralPrivateKey, false)
  return p256PublicKeyToJwk(uncompressed)
}

/**
 * Encrypt a JSON Authorization Response payload as compact JWE (ECDH-ES direct).
 */
export function encryptCompactJweEcdhEsP256(input: {
  recipientJwk: Oid4vpEncryptionRecipientJwk
  enc: Oid4vpJweEncAlgorithm
  payload: Record<string, unknown>
}): string {
  const recipientPublicKey = p256JwkToPublicKey(input.recipientJwk)
  const ephemeralPrivateKey = p256.keygen().secretKey
  const ephemeralPublicJwk = readEphemeralPublicJwk(ephemeralPrivateKey)
  const sharedSecret = p256.getSharedSecret(ephemeralPrivateKey, recipientPublicKey, false)
  const contentKey = deriveEcdhEsContentKey(sharedSecret, input.enc)

  const protectedHeader: Record<string, unknown> = {
    alg: 'ECDH-ES',
    enc: input.enc,
    epk: {
      kty: 'EC',
      crv: 'P-256',
      x: ephemeralPublicJwk.x,
      y: ephemeralPublicJwk.y,
    },
  }
  if (input.recipientJwk.kid) {
    protectedHeader.kid = input.recipientJwk.kid
  }

  const protectedSegment = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(protectedHeader)))
  const plaintext = new TextEncoder().encode(JSON.stringify(input.payload))
  const iv = new Uint8Array(randomBytes(GCM_IV_BYTES))
  const cipherAlg = input.enc === 'A128GCM' ? 'aes-128-gcm' : 'aes-256-gcm'
  const cipher = createCipheriv(cipherAlg, Buffer.from(contentKey), Buffer.from(iv))
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    protectedSegment,
    '',
    base64UrlEncodeBytes(iv),
    base64UrlEncodeBytes(new Uint8Array(ciphertext)),
    base64UrlEncodeBytes(new Uint8Array(authTag)),
  ].join('.')
}

/** Test-only decrypt for round-trip verification (Node/Jest). */
export function decryptCompactJweEcdhEsP256ForTest(
  compactJwe: string,
  recipientPrivateKey: Uint8Array,
): Record<string, unknown> {
  const segments = compactJwe.split('.')
  if (segments.length !== 5) {
    throw new Error('InvalidJwe: expected five compact segments')
  }

  const protectedHeader = decodeJsonBase64Url<Record<string, unknown>>(segments[0]!)
  const enc = protectedHeader?.enc
  if (enc !== 'A128GCM' && enc !== 'A256GCM') {
    throw new Error(`InvalidJweEnc: ${String(enc)}`)
  }

  const epk = protectedHeader?.epk
  if (!epk || typeof epk !== 'object') {
    throw new Error('InvalidJweEpk')
  }

  const ephemeralPublicKey = p256JwkToPublicKey(epk as EcP256Jwk)
  const sharedSecret = p256.getSharedSecret(recipientPrivateKey, ephemeralPublicKey, false)
  const contentKey = deriveEcdhEsContentKey(sharedSecret, enc)

  const iv = Buffer.from(segments[2]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const ciphertext = Buffer.from(segments[3]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const authTag = Buffer.from(segments[4]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  const cipherAlg = enc === 'A128GCM' ? 'aes-128-gcm' : 'aes-256-gcm'
  const decipher = createDecipheriv(cipherAlg, Buffer.from(contentKey), iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const parsed = JSON.parse(plaintext.toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('InvalidJwePayload')
  }
  return parsed as Record<string, unknown>
}
