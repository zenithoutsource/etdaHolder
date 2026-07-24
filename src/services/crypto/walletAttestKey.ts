import { getPublicKey, hashes } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { randomBytes } from 'react-native-quick-crypto'
import * as Keychain from 'react-native-keychain'

import { isBiometricDisabledForTesting } from '@/src/config/runtimeFlags'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getMetaStorage } from '../storage/storage'
import { ed25519PublicKeyToDidKey } from './credentialSigningKey'

hashes.sha512 = sha512

const ATTEST_KEYCHAIN_SERVICE = 'wallet.ed25519_seed.attest'
const ATTEST_KEYCHAIN_USERNAME = 'wallet-ed25519-attest-seed'
const ATTEST_PUBLIC_JWK_META = 'wallet.attest.pub_jwk'

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

function assertEd25519SeedLength(seed: Uint8Array, errorCode: string): void {
  if (seed.length !== 32) {
    throw new Error(`${errorCode}: expected 32 Ed25519 seed bytes, got ${seed.length}`)
  }
}

function assertEd25519PublicKeyLength(publicKey: Uint8Array): void {
  if (publicKey.length !== 32) {
    throw new Error(`InvalidPublicKeyLength: expected 32 Ed25519 bytes, got ${publicKey.length}`)
  }
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function publicKeyToEd25519Jwk(publicKey: Uint8Array): JsonWebKey {
  assertEd25519PublicKeyLength(publicKey)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlEncode(publicKey),
  }
}

function getKeychainSetOptions(service: string): Keychain.SetOptions {
  if (isBiometricDisabledForTesting()) {
    return {
      service,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }
  }

  return {
    service,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
  }
}

function getKeychainGetOptions(service: string): Keychain.GetOptions {
  if (isBiometricDisabledForTesting()) {
    return { service }
  }

  return {
    service,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
  }
}

async function readStoredEd25519Seed(service: string): Promise<Uint8Array | undefined> {
  const credentials = await Keychain.getGenericPassword(getKeychainGetOptions(service))
  if (!credentials) return undefined

  const seed = base64ToUint8Array(credentials.password)
  assertEd25519SeedLength(seed, 'InvalidStoredEd25519SeedLength')
  return seed
}

async function writeEd25519Seed(seed: Uint8Array, service: string): Promise<void> {
  assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
  const result = await Keychain.setGenericPassword(
    ATTEST_KEYCHAIN_USERNAME,
    uint8ArrayToBase64(seed),
    getKeychainSetOptions(service),
  )
  if (!result) throw new Error('Ed25519SeedKeychainWriteFailed')
}

function cacheAttestPublicJwk(publicKey: Uint8Array): JsonWebKey {
  const jwk = publicKeyToEd25519Jwk(publicKey)
  getMetaStorage().set(ATTEST_PUBLIC_JWK_META, JSON.stringify(jwk))
  return jwk
}

function readCachedAttestPublicJwk(): JsonWebKey | undefined {
  const raw = getMetaStorage().getString(ATTEST_PUBLIC_JWK_META)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as JsonWebKey
    if (parsed.kty === 'OKP' && parsed.crv === 'Ed25519' && typeof parsed.x === 'string') {
      return parsed
    }
  } catch {
    return undefined
  }
  return undefined
}

export async function ensureWalletAttestKey(): Promise<{ holderDid: string; publicJwk: JsonWebKey }> {
  try {
    const cachedJwk = readCachedAttestPublicJwk()
    const existingSeed = await readStoredEd25519Seed(ATTEST_KEYCHAIN_SERVICE)
    if (existingSeed && cachedJwk) {
      const publicKey = getPublicKey(existingSeed)
      const holderDid = ed25519PublicKeyToDidKey(publicKey)
      logWalletStep('crypto', 'wallet-attest-key-cache-hit')
      return { holderDid, publicJwk: cachedJwk }
    }

    if (existingSeed) {
      const publicKey = getPublicKey(existingSeed)
      const publicJwk = cacheAttestPublicJwk(publicKey)
      const holderDid = ed25519PublicKeyToDidKey(publicKey)
      logWalletStep('crypto', 'wallet-attest-key-existing')
      return { holderDid, publicJwk }
    }

    const seed = randomBytes(32)
    assertEd25519SeedLength(seed, 'InvalidGeneratedEd25519SeedLength')
    await writeEd25519Seed(seed, ATTEST_KEYCHAIN_SERVICE)
    const publicKey = getPublicKey(seed)
    const publicJwk = cacheAttestPublicJwk(publicKey)
    const holderDid = ed25519PublicKeyToDidKey(publicKey)
    logWalletStep('crypto', 'wallet-attest-key-generated')
    return { holderDid, publicJwk }
  } catch (error) {
    logWalletError('crypto', 'wallet-attest-key-init-failed', error)
    throw error
  }
}

export function readWalletAttestPublicJwk(): JsonWebKey | undefined {
  return readCachedAttestPublicJwk()
}

export async function destroyWalletAttestKey(): Promise<void> {
  await Keychain.resetGenericPassword({ service: ATTEST_KEYCHAIN_SERVICE }).catch(() => undefined)
  getMetaStorage().remove(ATTEST_PUBLIC_JWK_META)
  logWalletStep('crypto', 'wallet-attest-key-destroyed')
}
