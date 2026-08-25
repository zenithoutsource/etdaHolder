import { p256 } from '@noble/curves/nist.js'

import { derEcdsaSignatureToJoseRaw } from './animoDerP256'
import type { EcP256Jwk } from './hardwareEcdsaTypes'

/** multicodec varint(0x1200) for P-256 compressed public keys */
export const P256_MULTICODEC_PREFIX = new Uint8Array([0x80, 0x24])

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export type P256CoseKey = {
  1: 2
  3: -7
} & { [K in -1 | -2 | -3]: K extends -1 ? 1 : Uint8Array }

export type P256JwkParseResult = {
  publicKey: Uint8Array
  coordinatePadded: boolean
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

export function base58btcEncode(bytes: Uint8Array): string {
  let leadingOnes = 0
  for (const b of bytes) {
    if (b !== 0) break
    leadingOnes++
  }
  let n = bytesToBigInt(bytes)
  let result = ''
  while (n > 0n) {
    const rem = Number(n % 58n)
    result = BASE58_ALPHABET[rem] + result
    n = n / 58n
  }
  return '1'.repeat(leadingOnes) + result
}

function base58btcDecode(input: string): Uint8Array {
  let zeros = 0
  for (const char of input) {
    if (char !== '1') break
    zeros += 1
  }

  let value = 0n
  for (const char of input) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('InvalidBase58')
    value = value * 58n + BigInt(index)
  }

  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`
  const decoded = hex.length > 0 ? hex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)) : []
  const bytes = new Uint8Array(zeros + decoded.length)
  bytes.set(decoded, zeros)
  return bytes
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!
  return bytes
}

/** Accepts 33-byte compressed or 65-byte uncompressed SEC1 public key bytes. */
export function compressP256PublicKey(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 33) return publicKey
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error(`InvalidP256PublicKeyLength: expected 33 or 65 bytes, got ${publicKey.length}`)
  }
  return p256.Point.fromBytes(publicKey).toBytes(true)
}

function toUncompressedP256PublicKey(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 65 && publicKey[0] === 0x04) return publicKey
  if (publicKey.length === 33) return p256.Point.fromBytes(publicKey).toBytes(false)
  throw new Error(`InvalidP256PublicKeyLength: expected 33 or 65 bytes, got ${publicKey.length}`)
}

export function p256PublicKeyToJwk(publicKey: Uint8Array): EcP256Jwk {
  const uncompressed = toUncompressedP256PublicKey(publicKey)
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(uncompressed.slice(1, 33)),
    y: base64UrlEncode(uncompressed.slice(33, 65)),
  }
}

function parseP256JwkCoordinate(
  value: string,
  lenientCoordinates: boolean,
): { bytes: Uint8Array; padded: boolean } {
  const decoded = base64UrlDecode(value)
  if (decoded.length === 32) return { bytes: decoded, padded: false }
  if (!lenientCoordinates || decoded.length > 32) {
    throw new Error('InvalidP256JwkCoordinateLength')
  }

  const bytes = new Uint8Array(32)
  bytes.set(decoded, 32 - decoded.length)
  return { bytes, padded: true }
}

export function parseP256JwkPublicKey(
  jwk: EcP256Jwk,
  options?: { lenientCoordinates?: boolean },
): P256JwkParseResult {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('InvalidP256Jwk')
  }

  const x = parseP256JwkCoordinate(jwk.x, options?.lenientCoordinates === true)
  const y = parseP256JwkCoordinate(jwk.y, options?.lenientCoordinates === true)
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 0x04
  uncompressed.set(x.bytes, 1)
  uncompressed.set(y.bytes, 33)

  return {
    publicKey: compressP256PublicKey(uncompressed),
    coordinatePadded: x.padded || y.padded,
  }
}

export function p256JwkToPublicKey(jwk: EcP256Jwk): Uint8Array {
  return parseP256JwkPublicKey(jwk).publicKey
}

export function p256PublicKeyToDidKey(publicKey: Uint8Array): string {
  const compressed = compressP256PublicKey(publicKey)
  const multicodecBytes = new Uint8Array(P256_MULTICODEC_PREFIX.length + compressed.length)
  multicodecBytes.set(P256_MULTICODEC_PREFIX)
  multicodecBytes.set(compressed, P256_MULTICODEC_PREFIX.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

export function didKeyToP256PublicJwk(didKey: string): EcP256Jwk {
  const did = didKey.startsWith('did:key:') ? didKey.split('#')[0]! : `did:key:${didKey.split('#')[0]!}`
  const multibase = did.slice('did:key:'.length)
  if (!multibase.startsWith('z')) throw new Error('UnsupportedDidKeyEncoding')

  const raw = base58btcDecode(multibase.slice(1))
  if (
    raw.length !== P256_MULTICODEC_PREFIX.length + 33 ||
    raw[0] !== P256_MULTICODEC_PREFIX[0] ||
    raw[1] !== P256_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('UnsupportedDidKeyType')
  }

  const compressed = raw.slice(P256_MULTICODEC_PREFIX.length)
  return p256PublicKeyToJwk(compressed)
}

export function p256PublicKeyToCoseKey(publicKey: Uint8Array): P256CoseKey {
  const uncompressed = toUncompressedP256PublicKey(publicKey)
  return {
    1: 2,
    3: -7,
    [-1]: 1,
    [-2]: uncompressed.slice(1, 33),
    [-3]: uncompressed.slice(33, 65),
  }
}

/** JOSE ES256 signature bytes: exactly 64-byte r‖s (P1363), not DER. */
export function assertEs256SignatureBytes(signature: Uint8Array): void {
  if (signature.length !== 64) {
    throw new Error(`InvalidEs256SignatureLength: expected 64 bytes, got ${signature.length}`)
  }
}

/**
 * Normalize a compact-JWT ES256 signature to JOSE r‖s.
 * Accepts 64-byte JOSE, or DER SEQUENCE (common from Java Signatures) converted via ASN.1.
 */
export function normalizeEs256SignatureToJoseRaw(signature: Uint8Array): Uint8Array {
  if (signature.length === 64) return signature
  if (signature.length > 64 && signature[0] === 0x30) {
    return derEcdsaSignatureToJoseRaw(signature)
  }
  throw new Error(
    `InvalidEs256SignatureLength: expected 64-byte JOSE or DER ECDSA, got ${signature.length}`,
  )
}

export function signEs256Prehash(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const signature = p256.sign(message, privateKey, { lowS: true, prehash: true })
  assertEs256SignatureBytes(signature)
  return signature
}

/**
 * Verify ES256 over a prehashed-or-raw message digest input (noble `prehash: true`).
 * Accepts JOSE r‖s or DER; does not require low-S (JOSE/JWS does not mandate it).
 */
export function verifyEs256Prehash(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  const joseSignature = normalizeEs256SignatureToJoseRaw(signature)
  return p256.verify(joseSignature, message, publicKey, { prehash: true, lowS: false })
}
