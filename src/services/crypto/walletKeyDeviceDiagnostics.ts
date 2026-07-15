import { getPublicKey, hashes } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import * as Device from 'expo-device'
import * as LocalAuthentication from 'expo-local-authentication'
import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'
import { randomBytes } from 'react-native-quick-crypto'

hashes.sha512 = sha512

/**
 * Non-secret device capability snapshot logged when wallet EdDSA key creation
 * fails, so logs answer "does this device support Ed25519 generation and what
 * does its keystore/biometric stack support". Never contains key material.
 */
export type WalletKeyDeviceDiagnostics = {
  platform: string
  osVersion: string | null
  apiLevel: number | null
  brand: string | null
  model: string | null
  isPhysicalDevice: boolean
  /** Software Ed25519 (CSPRNG seed + noble public-key derive) works on this device. */
  softwareEd25519Supported: boolean
  softwareEd25519Error?: string
  keychainSecurityLevel?: string
  keychainBiometryType?: string
  biometricHardwarePresent?: boolean
  biometricEnrolled?: boolean
  biometricAuthTypes?: string[]
  /** Native AndroidKeyStore keygen probes: hardware Ed25519 vs P-256 control group. */
  hardwareKeystore?: unknown
}

function probeSoftwareEd25519(): { ok: boolean; error?: string } {
  try {
    const seed = randomBytes(32)
    if (seed.length !== 32) {
      return { ok: false, error: `csprng returned ${seed.length} bytes, expected 32` }
    }
    const publicKey = getPublicKey(seed)
    if (publicKey.length !== 32) {
      return { ok: false, error: `derived public key ${publicKey.length} bytes, expected 32` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function probe<T>(read: () => Promise<T | null>): Promise<T | undefined> {
  try {
    return (await read()) ?? undefined
  } catch {
    return undefined
  }
}

export async function readWalletKeyDeviceDiagnostics(): Promise<WalletKeyDeviceDiagnostics> {
  const softwareEd25519 = probeSoftwareEd25519()

  const keychainSecurityLevel = await probe(() => Keychain.getSecurityLevel())
  const keychainBiometryType = await probe(() => Keychain.getSupportedBiometryType())
  const biometricAuthTypes = await probe(async () =>
    (await LocalAuthentication.supportedAuthenticationTypesAsync()).map(
      (authType) => LocalAuthentication.AuthenticationType[authType] ?? String(authType),
    ),
  )

  return {
    platform: Platform.OS,
    osVersion: Device.osVersion,
    apiLevel: Device.platformApiLevel,
    brand: Device.brand,
    model: Device.modelName,
    isPhysicalDevice: Device.isDevice,
    softwareEd25519Supported: softwareEd25519.ok,
    ...(softwareEd25519.error ? { softwareEd25519Error: softwareEd25519.error } : {}),
    keychainSecurityLevel: keychainSecurityLevel != null ? String(keychainSecurityLevel) : undefined,
    keychainBiometryType: keychainBiometryType != null ? String(keychainBiometryType) : undefined,
    biometricHardwarePresent: await probe(() => LocalAuthentication.hasHardwareAsync()),
    biometricEnrolled: await probe(() => LocalAuthentication.isEnrolledAsync()),
    biometricAuthTypes,
    hardwareKeystore: await probe(async () => {
      const { probeKeystoreKeygen } = await import('@/modules/wallet-keystore-diagnostics')
      return (await probeKeystoreKeygen()) ?? null
    }),
  }
}
