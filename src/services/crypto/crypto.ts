import {
  deleteKey,
  generateKeypair,
  getPublicBytesForKeyId,
  sign,
} from '@animo-id/expo-secure-environment'
import { ed25519 } from '@noble/curves/ed25519.js'
import { createHash, randomBytes } from 'react-native-quick-crypto'

import { isBiometricDisabledForTesting, isSoftwareEddsaEnabledForTesting } from '@/src/config/runtimeFlags'

import { getMetaStorage } from '../storage/storage'

const KEY_ID = 'etda_wallet_signing_key'
const COMPRESSED_KEY_STORAGE = 'wallet.compressed_pub_key'
const SOFTWARE_ED25519_SECRET_KEY_STORAGE = 'wallet.software_ed25519_secret_key'
const KEY_REGISTERED_AT_STORAGE = 'wallet.key_registered_at'

const metaStorage = getMetaStorage()

// P-256 curve constants
const P256_P = BigInt('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF')
const P256_B = BigInt('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B')

// did:key multicodec prefix for P-256 compressed key (0x1200 varint-encoded)
const P256_MULTICODEC_PREFIX = new Uint8Array([0x80, 0x24])
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])

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

function ed25519PublicKeyToDidKey(publicKey: Uint8Array): string {
  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(publicKey, ED25519_MULTICODEC_PREFIX.length)
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
  metaStorage.set(KEY_REGISTERED_AT_STORAGE, new Date().toISOString())
}

export function hasWalletKey(): boolean {
  return !!metaStorage.getString(COMPRESSED_KEY_STORAGE)
}

/** Returns when the Wallet Signing Key was registered (ISO 8601), or undefined if not yet generated. */
export function getWalletKeyRegisteredAt(): string | undefined {
  return metaStorage.getString(KEY_REGISTERED_AT_STORAGE)
}

/** Returns the Holder DID derived from the Wallet Signing Key. Sync, no biometric. */
export function getHolderDid(): string {
  if (isSoftwareEddsaEnabledForTesting()) {
    return getSoftwareEd25519HolderDid()
  }

  const stored = metaStorage.getString(COMPRESSED_KEY_STORAGE)
  if (!stored) throw new Error('WalletKeyNotInitialized')
  return compressedKeyToDidKey(base64ToUint8Array(stored))
}

/** Returns the public key JWK. Sync, no biometric. */
export function getPublicKeyJwk(): JsonWebKey {
  if (isSoftwareEddsaEnabledForTesting()) {
    return publicKeyToEd25519Jwk(ed25519.getPublicKey(getOrCreateSoftwareEd25519SecretKey()))
  }

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
  if (isSoftwareEddsaEnabledForTesting()) {
    return signSoftwareEddsaProof(nonce, audience)
  }

  const did = getHolderDid()
  // did:key fragment references the same identifier as the DID
  const kid = `${did}#${did.slice('did:key:'.length)}`

  const header = { alg: 'ES256', typ: 'openid4vci-proof+jwt', kid }
  const payload = {
    iss: did,
    sub: did,
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

function signSoftwareEddsaProof(nonce: string, audience: string): string {
  const secretKey = getOrCreateSoftwareEd25519SecretKey()
  const publicKey = ed25519.getPublicKey(secretKey)
  const publicJwk = publicKeyToEd25519Jwk(publicKey)
  const did = ed25519PublicKeyToDidKey(publicKey)
  const kid = `${did}#${did.slice('did:key:'.length)}`

  const header = { alg: 'EdDSA', typ: 'openid4vci-proof+jwt', kid, jwk: publicJwk }
  const payload = {
    iss: did,
    sub: did,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    nonce,
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signatureBytes = ed25519.sign(new TextEncoder().encode(signingInput), secretKey)

  return `${signingInput}.${base64UrlEncode(signatureBytes)}`
}

export type PresentationVpTokenInput = {
  audience: string
  nonce: string
  verifiableCredential: string
}

export type SdJwtKbPresentationTokenInput = {
  audience: string
  nonce: string
  sdJwt: string
}

/**
 * Builds and signs a JWT VP token for OID4VP direct_post.
 * Biometric fires here on every presentation approval.
 */
export async function signPresentationVpToken(input: PresentationVpTokenInput): Promise<string> {
  const did = getHolderDid()
  const kid = `${did}#${did.slice('did:key:'.length)}`
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'ES256', typ: 'JWT', kid }
  const payload = {
    iss: did,
    sub: did,
    jti: `urn:uuid:${createUuid()}`,
    aud: input.audience,
    nbf: now,
    iat: now,
    exp: now + 300,
    nonce: input.nonce,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: did,
      verifiableCredential: [input.verifiableCredential],
    },
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
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

/**
 * Builds an SD-JWT+KB presentation token for OID4VP dc+sd-jwt requests.
 * Biometric fires here on every presentation approval.
 */
export async function signSdJwtKbPresentationToken(input: SdJwtKbPresentationTokenInput): Promise<string> {
  const did = getHolderDid()
  const kid = `${did}#${did.slice('did:key:'.length)}`
  const cnfKid = assertSdJwtHolderBinding(input.sdJwt, { jwk: getPublicKeyJwk(), kid })

  const now = Math.floor(Date.now() / 1000)
  const sdJwtWithoutKb = normalizeSdJwtWithoutKb(input.sdJwt)
  const sdHash = base64UrlEncode(createHash('sha256').update(new TextEncoder().encode(sdJwtWithoutKb)).digest())

  const header = { alg: 'ES256', typ: 'kb+jwt', kid: cnfKid ?? kid }
  const payload = {
    nonce: input.nonce,
    aud: input.audience,
    iat: now,
    sd_hash: sdHash,
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signatureBytes = await sign(
    KEY_ID,
    new TextEncoder().encode(signingInput),
    !isBiometricDisabledForTesting(),
  )

  if (signatureBytes.length !== 64) {
    throw new Error(`InvalidSignatureLength: expected 64 bytes, got ${signatureBytes.length}`)
  }

  return `${sdJwtWithoutKb}${signingInput}.${base64UrlEncode(signatureBytes)}`
}

/**
 * Development-only Ed25519/EdDSA signer for Verifier compatibility testing.
 * The private key is a software key stored in local metadata storage, so this
 * must never be used for production wallet evidence.
 */
export async function signSoftwareEddsaSdJwtKbPresentationToken(
  input: SdJwtKbPresentationTokenInput,
  isDevelopment = __DEV__,
): Promise<string> {
  if (!isSoftwareEddsaEnabledForTesting(isDevelopment)) {
    throw new Error('SoftwareEddsaTestingOnly: software EdDSA signing is disabled outside development testing')
  }

  const secretKey = getOrCreateSoftwareEd25519SecretKey()
  const publicKey = ed25519.getPublicKey(secretKey)
  const publicJwk = publicKeyToEd25519Jwk(publicKey)
  const did = ed25519PublicKeyToDidKey(publicKey)
  const kid = `${did}#${did.slice('did:key:'.length)}`
  const cnfKid = assertSdJwtHolderBinding(input.sdJwt, { jwk: publicJwk, kid })

  const now = Math.floor(Date.now() / 1000)
  const sdJwtWithoutKb = normalizeSdJwtWithoutKb(input.sdJwt)
  const sdHash = base64UrlEncode(createHash('sha256').update(new TextEncoder().encode(sdJwtWithoutKb)).digest())

  const header = cnfKid
    ? { alg: 'EdDSA', typ: 'kb+jwt', kid: cnfKid }
    : { alg: 'EdDSA', typ: 'kb+jwt', jwk: publicJwk }
  const payload = {
    nonce: input.nonce,
    aud: input.audience,
    iat: now,
    sd_hash: sdHash,
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signatureBytes = ed25519.sign(new TextEncoder().encode(signingInput), secretKey)

  return `${sdJwtWithoutKb}${signingInput}.${base64UrlEncode(signatureBytes)}`
}

function getOrCreateSoftwareEd25519SecretKey(): Uint8Array {
  const stored = metaStorage.getString(SOFTWARE_ED25519_SECRET_KEY_STORAGE)
  if (stored) return base64ToUint8Array(stored)

  const secretKey = randomBytes(32)
  metaStorage.set(SOFTWARE_ED25519_SECRET_KEY_STORAGE, uint8ArrayToBase64(secretKey))
  return secretKey
}

function getSoftwareEd25519HolderDid(): string {
  return ed25519PublicKeyToDidKey(ed25519.getPublicKey(getOrCreateSoftwareEd25519SecretKey()))
}

function publicKeyToEd25519Jwk(publicKey: Uint8Array): JsonWebKey {
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncode(publicKey),
  }
}

function normalizeSdJwtWithoutKb(sdJwt: string): string {
  return sdJwt.endsWith('~') ? sdJwt : `${sdJwt}~`
}

function assertSdJwtHolderBinding(sdJwt: string, holder: { jwk: JsonWebKey; kid: string }): string | undefined {
  const claims = decodeJwtPayload(sdJwt.split('~')[0] ?? sdJwt)
  const cnf = readRecord(claims.cnf)
  const cnfJwk = readRecord(cnf?.jwk)
  const cnfKid = typeof cnf?.kid === 'string' ? cnf.kid : undefined
  if (!cnfJwk && !cnfKid) {
    throw new Error('PresentationCredentialHolderBindingMissing: SD-JWT credential has no cnf.jwk or cnf.kid holder binding')
  }

  if (cnfKid && isSameKid(cnfKid, holder.kid)) return cnfKid
  if (cnfJwk && isSameJwk(cnfJwk, holder.jwk)) return undefined

  throw new Error('PresentationCredentialHolderBindingMismatch: SD-JWT credential is not bound to this Wallet Signing Key')
}

function isSameJwk(actual: Record<string, unknown>, expected: JsonWebKey): boolean {
  return (
    actual.kty === expected.kty &&
    actual.crv === expected.crv &&
    actual.x === expected.x &&
    (expected.y ? actual.y === expected.y : !actual.y)
  )
}

function isSameKid(actual: string, expected: string): boolean {
  const expectedDid = expected.split('#')[0]
  return actual === expected || actual === expectedDid
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')
  if (parts.length < 2 || !parts[1]) {
    throw new Error('CredentialJwtInvalid: JWT payload is required')
  }

  try {
    const parsed = JSON.parse(base64UrlDecodeToString(parts[1])) as unknown
    const record = readRecord(parsed)
    if (!record) {
      throw new Error('payload is not an object')
    }
    return record
  } catch (error) {
    throw new Error(`CredentialJwtInvalid: ${toErrorMessage(error)}`)
  }
}

function base64UrlDecodeToString(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new TextDecoder().decode(bytes)
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createUuid(): string {
  const bytes = randomBytes(16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Deletes the hardware key and clears cached public key. Users must re-enrol. */
export async function resetWalletKey(): Promise<void> {
  await deleteKey(KEY_ID)
  metaStorage.remove(COMPRESSED_KEY_STORAGE)
}
