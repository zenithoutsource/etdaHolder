/**
 * Compact JWE encryption for OID4VP direct_post.jwt (ECDH-ES + AES-GCM).
 * Ephemeral P-256 only — does not use holder k_cred or AndroidKeyStore.
 */
import { p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { Buffer } from '@craftzdog/react-native-buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'react-native-quick-crypto'

import { parseP256JwkPublicKey, p256JwkToPublicKey, p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'
import type { EcP256Jwk } from '@/src/services/crypto/hardwareEcdsaTypes'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import { base64UrlToBytes, decodeJsonBase64Url } from '@/src/utils/jwtUtils'

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

export type Oid4vpJweAgreementParties = {
  /** PartyUInfo octets for Concat KDF (JWE `apu` when set). */
  partyUInfo?: Uint8Array
  /** PartyVInfo octets for Concat KDF (JWE `apv`; OID4VP binds authorization request `nonce`). */
  partyVInfo?: Uint8Array
}

function deriveEcdhEsContentKey(
  sharedSecret: Uint8Array,
  encAlg: Oid4vpJweEncAlgorithm,
  agreementParties: Oid4vpJweAgreementParties = {},
): Uint8Array {
  const keydatalenBits = ENC_KEY_BITS[encAlg]
  const algId = new TextEncoder().encode(encAlg)
  const partyUInfo = agreementParties.partyUInfo ?? new Uint8Array(0)
  const partyVInfo = agreementParties.partyVInfo ?? new Uint8Array(0)
  const otherInfo = concatUint8Arrays([
    encodeLengthPrefixed(algId),
    encodeLengthPrefixed(partyUInfo),
    encodeLengthPrefixed(partyVInfo),
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

const P256_COORDINATE_BYTES = 32

/**
 * ECDH shared secret Z for Concat KDF input. Per RFC 6090 / NIST SP 800-56A the
 * shared secret is the x-coordinate of the agreed point only — never x || y.
 */
function readEcdhSharedSecretX(privateKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  const agreedPoint = p256.getSharedSecret(privateKey, peerPublicKey, false)
  return agreedPoint.slice(1, 1 + P256_COORDINATE_BYTES)
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
  lenientRecipientCoordinates?: boolean
  agreementParties?: Oid4vpJweAgreementParties
}): string {
  const recipientPublicKey = parseP256JwkPublicKey(input.recipientJwk, {
    lenientCoordinates: input.lenientRecipientCoordinates === true,
  }).publicKey
  const ephemeralPrivateKey = p256.keygen().secretKey
  const ephemeralPublicJwk = readEphemeralPublicJwk(ephemeralPrivateKey)
  const sharedSecret = readEcdhSharedSecretX(ephemeralPrivateKey, recipientPublicKey)
  const agreementParties = input.agreementParties ?? {}
  const contentKey = deriveEcdhEsContentKey(sharedSecret, input.enc, agreementParties)

  const protectedHeader: Record<string, unknown> = {
    alg: 'ECDH-ES',
    enc: input.enc,
    kid: input.recipientJwk.kid ?? '',
    epk: {
      kty: 'EC',
      crv: 'P-256',
      x: ephemeralPublicJwk.x,
      y: ephemeralPublicJwk.y,
    },
  }
  if (agreementParties.partyUInfo?.length) {
    protectedHeader.apu = base64UrlEncodeBytes(agreementParties.partyUInfo)
  }
  if (agreementParties.partyVInfo?.length) {
    protectedHeader.apv = base64UrlEncodeBytes(agreementParties.partyVInfo)
  }

  const protectedSegment = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(protectedHeader)))
  const plaintext = new TextEncoder().encode(JSON.stringify(input.payload))
  const iv = new Uint8Array(randomBytes(GCM_IV_BYTES))
  const cipherAlg = input.enc === 'A128GCM' ? 'aes-128-gcm' : 'aes-256-gcm'
  const cipher = createCipheriv(cipherAlg, Buffer.from(contentKey), Buffer.from(iv))
  cipher.setAAD(Buffer.from(protectedSegment))
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

/**
 * Test-only CEK derivation over the exact production key-agreement and Concat KDF
 * path. Round-trip tests cannot catch a symmetric derivation defect, so this exists
 * to pin the derivation against the RFC 7518 Appendix C vector.
 */
export function deriveEcdhEsContentKeyForTest(input: {
  privateKey: Uint8Array
  peerPublicKey: Uint8Array
  enc: Oid4vpJweEncAlgorithm
  agreementParties?: Oid4vpJweAgreementParties
}): Uint8Array {
  return deriveEcdhEsContentKey(
    readEcdhSharedSecretX(input.privateKey, input.peerPublicKey),
    input.enc,
    input.agreementParties ?? {},
  )
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
  const sharedSecret = readEcdhSharedSecretX(recipientPrivateKey, ephemeralPublicKey)
  const agreementParties: Oid4vpJweAgreementParties = {
    ...(typeof protectedHeader.apu === 'string'
      ? { partyUInfo: base64UrlToBytes(protectedHeader.apu) }
      : {}),
    ...(typeof protectedHeader.apv === 'string'
      ? { partyVInfo: base64UrlToBytes(protectedHeader.apv) }
      : {}),
  }
  const contentKey = deriveEcdhEsContentKey(sharedSecret, enc, agreementParties)

  const iv = Buffer.from(segments[2]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const ciphertext = Buffer.from(segments[3]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const authTag = Buffer.from(segments[4]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  const cipherAlg = enc === 'A128GCM' ? 'aes-128-gcm' : 'aes-256-gcm'
  const decipher = createDecipheriv(cipherAlg, Buffer.from(contentKey), iv)
  decipher.setAAD(Buffer.from(segments[0]!))
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const parsed = JSON.parse(plaintext.toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('InvalidJwePayload')
  }
  return parsed as Record<string, unknown>
}
