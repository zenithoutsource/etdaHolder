import {
  deleteKey,
  generateKeypair,
  getPublicBytesForKeyId,
  sign,
} from '@animo-id/expo-secure-environment'

import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'

import { getMetaStorage } from '../storage/storage'

const KEY_ID = 'etda_wallet_signing_key'
const COMPRESSED_KEY_STORAGE = 'wallet.compressed_pub_key'

const metaStorage = getMetaStorage()

// P-256 curve constants
const P256_P = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF')
const P256_B = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B')

// did:key multicodec prefix for P-256 compressed key (0x1200 varint-encoded)
const P256_MULTICODEC_PREFIX = new Uint8Array([0x80, 0x24])

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base = base % mod
  while (exp > 0n) {
    if (exp % 2n === 1n) result = (result * base) % mod
    exp = exp >> 1n
    base = (base * base) % mod
  }
  return result
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn)
    n >>= 8n
  }
  return out
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function base58btcEncode(bytes: Uint8Array): string {
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

// Decompress a 33-byte P-256 compressed key into a JWK with x and y coordinates.
// Both iOS (.ecdsaSignatureMessageX962SHA256) and Android (SHA256withECDSA) return
// the public key as a compressed EC point, so we recover y using P-256 curve math.
function compressedKeyToJwk(compressedKey: Uint8Array): JsonWebKey {
  const prefix = compressedKey[0] // 0x02 = even y, 0x03 = odd y
  const xBytes = compressedKey.slice(1, 33)
  const x = bytesToBigInt(xBytes)

  // y² ≡ x³ − 3x + b (mod p)
  const x3 = modPow(x, 3n, P256_P)
  const threeX = (3n * x) % P256_P
  const ySquared = ((x3 - threeX + P256_B) % P256_P + P256_P) % P256_P

  // p ≡ 3 (mod 4), so y = ySquared^((p+1)/4) mod p
  let y = modPow(ySquared, (P256_P + 1n) / 4n, P256_P)
  if ((y % 2n === 0n) !== (prefix === 0x02)) y = P256_P - y

  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(xBytes),
    y: base64UrlEncode(bigIntToBytes(y, 32)),
  }
}

function compressedKeyToDidKey(compressedKey: Uint8Array): string {
  const multicodecBytes = new Uint8Array(P256_MULTICODEC_PREFIX.length + compressedKey.length)
  multicodecBytes.set(P256_MULTICODEC_PREFIX)
  multicodecBytes.set(compressedKey, P256_MULTICODEC_PREFIX.length)
  const identifier = 'z' + base58btcEncode(multicodecBytes)
  return `did:key:${identifier}`
}

/**
 * Called once at app startup (_layout.tsx). Idempotent — no-ops if key exists.
 * Biometric is NOT required here; it fires only on signProof().
 */
export async function generateWalletKeyIfNeeded(): Promise<void> {
  if (metaStorage.getString(COMPRESSED_KEY_STORAGE)) return

  await generateKeypair(KEY_ID, !isBiometricDisabledForTesting())
  const compressedKey = await getPublicBytesForKeyId(KEY_ID)
  metaStorage.set(COMPRESSED_KEY_STORAGE, uint8ArrayToBase64(compressedKey))
}

export function hasWalletKey(): boolean {
  return !!metaStorage.getString(COMPRESSED_KEY_STORAGE)
}

/** Returns the Holder DID derived from the Wallet Signing Key. Sync, no biometric. */
export function getHolderDid(): string {
  const stored = metaStorage.getString(COMPRESSED_KEY_STORAGE)
  if (!stored) throw new Error('WalletKeyNotInitialized')
  return compressedKeyToDidKey(base64ToUint8Array(stored))
}

/** Returns the public key JWK. Sync, no biometric. */
export function getPublicKeyJwk(): JsonWebKey {
  const stored = metaStorage.getString(COMPRESSED_KEY_STORAGE)
  if (!stored) throw new Error('WalletKeyNotInitialized')
  return compressedKeyToJwk(base64ToUint8Array(stored))
}

/**
 * Builds and signs an OID4VCI Proof of Possession JWT.
 * Biometric fires here on every call (sign-time gate).
 * iss = Holder DID (did:key), kid = DID key fragment.
 *
 * @param nonce    c_nonce from the token endpoint response
 * @param audience Issuer URL (aud claim)
 */
export async function signProof(nonce: string, audience: string): Promise<string> {
  const did = getHolderDid()
  // did:key fragment references the same identifier as the DID
  const kid = `${did}#${did.slice('did:key:'.length)}`

  const header = { alg: 'ES256', typ: 'openid4vci-proof+jwt', kid }
  const payload = {
    iss: did,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    nonce,
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  // Hardware applies SHA-256 internally; pass raw UTF-8 bytes.
  // sign() returns raw R‖S — DER→raw conversion done inside the module.
  const signatureBytes = await sign(
    KEY_ID,
    new TextEncoder().encode(signingInput),
    !isBiometricDisabledForTesting(),
  )

  if (signatureBytes.length !== 64) {
    throw new Error(`InvalidSignatureLength: expected 64 bytes, got ${signatureBytes.length}`)
  }

  return `${signingInput}.${base64UrlEncode(signatureBytes)}`
}

/** Deletes the hardware key and clears cached public key. Users must re-enrol. */
export async function resetWalletKey(): Promise<void> {
  await deleteKey(KEY_ID)
  metaStorage.remove(COMPRESSED_KEY_STORAGE)
}
