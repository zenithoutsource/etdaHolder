import { createHash, randomBytes } from 'react-native-quick-crypto'

import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'

import { getMetaStorage } from '../storage/storage'
import {
  deleteKey,
  generateKeypair,
  getPublicBytesForKeyId,
  sign,
} from './nativeEddsaSigner'

const KEY_ID = 'etda_wallet_signing_key'
const ED25519_PUBLIC_KEY_STORAGE = 'wallet.ed25519_pub_key'
const KEY_REGISTERED_AT_STORAGE = 'wallet.key_registered_at'

const LEGACY_COMPRESSED_KEY_STORAGE = 'wallet.compressed_pub_key'
const LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE = 'wallet.software_ed25519_secret_key'

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const metaStorage = getMetaStorage()

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
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

function ed25519PublicKeyToDidKey(publicKey: Uint8Array): string {
  assertEd25519PublicKeyLength(publicKey)
  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(publicKey, ED25519_MULTICODEC_PREFIX.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

function publicKeyToEd25519Jwk(publicKey: Uint8Array): JsonWebKey {
  assertEd25519PublicKeyLength(publicKey)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncode(publicKey),
  }
}

function assertEd25519PublicKeyLength(publicKey: Uint8Array): void {
  if (publicKey.length !== 32) {
    throw new Error(`InvalidPublicKeyLength: expected 32 Ed25519 bytes, got ${publicKey.length}`)
  }
}

async function readExistingNativeEd25519PublicKey(): Promise<Uint8Array | undefined> {
  try {
    const publicKey = await getPublicBytesForKeyId(KEY_ID)
    assertEd25519PublicKeyLength(publicKey)
    return publicKey
  } catch {
    return undefined
  }
}

async function replaceLegacyWalletKeyIfNeeded(): Promise<void> {
  const hasLegacyKeyMaterial =
    metaStorage.getString(LEGACY_COMPRESSED_KEY_STORAGE) ||
    metaStorage.getString(LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE)

  if (!hasLegacyKeyMaterial) return

  await deleteKey(KEY_ID).catch(() => undefined)
  metaStorage.remove(LEGACY_COMPRESSED_KEY_STORAGE)
  metaStorage.remove(LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE)
}

/**
 * Called once at app startup (_layout.tsx). Idempotent: no-ops if the native
 * Ed25519 Wallet Signing Key and cached public key are already available.
 * Biometric is NOT required here; it fires only on sign operations.
 */
export async function generateWalletKeyIfNeeded(): Promise<void> {
  if (metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)) return

  await replaceLegacyWalletKeyIfNeeded()

  const existingPublicKey = await readExistingNativeEd25519PublicKey()
  if (existingPublicKey) {
    metaStorage.set(ED25519_PUBLIC_KEY_STORAGE, uint8ArrayToBase64(existingPublicKey))
    return
  }

  await deleteKey(KEY_ID).catch(() => undefined)
  await generateKeypair(KEY_ID, !isBiometricDisabledForTesting())
  const publicKey = await getPublicBytesForKeyId(KEY_ID)
  assertEd25519PublicKeyLength(publicKey)
  metaStorage.set(ED25519_PUBLIC_KEY_STORAGE, uint8ArrayToBase64(publicKey))
  metaStorage.set(KEY_REGISTERED_AT_STORAGE, new Date().toISOString())
}

export function hasWalletKey(): boolean {
  return !!metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)
}

/** Returns when the Wallet Signing Key was registered (ISO 8601), or undefined if not yet generated. */
export function getWalletKeyRegisteredAt(): string | undefined {
  return metaStorage.getString(KEY_REGISTERED_AT_STORAGE)
}

/** Returns the Holder DID derived from the native Ed25519 Wallet Signing Key. Sync, no biometric. */
export function getHolderDid(): string {
  return ed25519PublicKeyToDidKey(readStoredEd25519PublicKey())
}

/** Returns the public key JWK. Sync, no biometric. */
export function getPublicKeyJwk(): JsonWebKey {
  return publicKeyToEd25519Jwk(readStoredEd25519PublicKey())
}

function readStoredEd25519PublicKey(): Uint8Array {
  const stored = metaStorage.getString(ED25519_PUBLIC_KEY_STORAGE)
  if (!stored) throw new Error('WalletKeyNotInitialized')
  const publicKey = base64ToUint8Array(stored)
  assertEd25519PublicKeyLength(publicKey)
  return publicKey
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
  const kid = `${did}#${did.slice('did:key:'.length)}`

  const header = { alg: 'EdDSA', typ: 'openid4vci-proof+jwt', kid }
  const payload = {
    iss: did,
    sub: did,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    nonce,
  }

  return signJwtLikeObject(header, payload, 'proof')
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

  const header = { alg: 'EdDSA', typ: 'JWT', kid }
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

  return signJwtLikeObject(header, payload, 'vp')
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

  const header = { alg: 'EdDSA', typ: 'kb+jwt', kid: cnfKid ?? kid }
  const payload = {
    nonce: input.nonce,
    aud: input.audience,
    iat: now,
    sd_hash: sdHash,
  }

  const kbJwt = await signJwtLikeObject(header, payload, 'kb')
  return `${sdJwtWithoutKb}${kbJwt}`
}

async function signJwtLikeObject(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  tokenKind: string,
): Promise<string> {
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signatureBytes = await sign(
    KEY_ID,
    new TextEncoder().encode(signingInput),
    !isBiometricDisabledForTesting(),
  )

  if (signatureBytes.length !== 64) {
    throw new Error(`InvalidSignatureLength: expected 64 Ed25519 bytes for ${tokenKind}, got ${signatureBytes.length}`)
  }

  return `${signingInput}.${base64UrlEncode(signatureBytes)}`
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

/** Deletes the native Ed25519 key and clears cached public key. Users must re-enrol. */
export async function resetWalletKey(): Promise<void> {
  await deleteKey(KEY_ID)
  metaStorage.remove(ED25519_PUBLIC_KEY_STORAGE)
  metaStorage.remove(LEGACY_COMPRESSED_KEY_STORAGE)
  metaStorage.remove(LEGACY_SOFTWARE_ED25519_SECRET_KEY_STORAGE)
}
