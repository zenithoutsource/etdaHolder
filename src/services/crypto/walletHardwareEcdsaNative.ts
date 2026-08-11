import { Platform } from 'react-native'

import { readHardwareSigningSessionTtlMs } from '@/src/config/hardwareSigningPolicy'

import type { EcP256Jwk, HardwareSecurityLevel, OpenSigningSessionOptions } from './hardwareEcdsaTypes'
import {
  HardwareEcdsaUnavailableError,
  HardwareKeyNotFoundError,
  HardwareSigningSessionError,
} from './hardwareEcdsaTypes'

type HardwareEcdsaKeyStoreDiagnostics = {
  apiLevel?: number
  strongBoxFeatureAvailable?: boolean
  manufacturer?: string
  model?: string
}

type HardwareEcdsaKeyCreateDiagnostics = {
  strongBoxAttempted?: boolean
  keyCreatePath?: string
  strongBoxFallbackReason?: string
  authValiditySeconds?: number
  attestationRequested?: boolean
  isInsideSecureHardware?: boolean
  isUserAuthenticationRequired?: boolean
  keyInfoSecurityLevel?: string
  userAuthEnforcedBySecureHardware?: boolean
}

type HardwareEcdsaCreateKeyDiagnostics = {
  keyStore?: HardwareEcdsaKeyStoreDiagnostics
  keyCreate?: HardwareEcdsaKeyCreateDiagnostics
}

type HardwareEcdsaSignDiagnostics = {
  signPath?: string
  userAuthPromptShown?: boolean
  authRetryTrigger?: string | null
  dataBytes?: number
  signaturesUsed?: number
  maxSignatures?: number
}

type CreateKeyNativeResult = {
  publicJwk: EcP256Jwk
  securityLevel: HardwareSecurityLevel
  certificateChainDerBase64: string[]
  diagnostics?: HardwareEcdsaCreateKeyDiagnostics
}

type SignWithSessionNativeResult = {
  signatureBase64: string
  diagnostics?: HardwareEcdsaSignDiagnostics
}

type WalletHardwareEcdsaNative = {
  hasKey(alias: string): Promise<boolean>
  getSecurityLevel(alias: string): Promise<HardwareSecurityLevel>
  getPublicJwk(alias: string): Promise<EcP256Jwk>
  createKey(options: {
    alias: string
    authValiditySeconds: number
    attestationChallengeBase64?: string
  }): Promise<CreateKeyNativeResult>
  deleteKey(alias: string): Promise<void>
  openSigningSession(options: {
    alias: string
    purpose: OpenSigningSessionOptions['purpose']
    maxSignatures: number
    expiresAtMs: number
  }): Promise<{ opaqueNativeHandle: string }>
  signWithSession(options: {
    opaqueNativeHandle: string
    /** Base64-encoded signing input bytes (Expo bridge does not pass Uint8Array to Kotlin). */
    data: string
  }): Promise<SignWithSessionNativeResult | string>
  closeSigningSession(handle: string): Promise<void>
}

let nativeModule: WalletHardwareEcdsaNative | undefined
let nativeModuleChecked = false

function loadNativeModule(): WalletHardwareEcdsaNative | undefined {
  if (nativeModuleChecked) return nativeModule
  nativeModuleChecked = true

  if (Platform.OS !== 'android') return undefined

  try {
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core')
    nativeModule = requireNativeModule<WalletHardwareEcdsaNative>('ExpoWalletHardwareEcdsa')
  } catch {
    nativeModule = undefined
  }

  return nativeModule
}

function requireNativeModule(): WalletHardwareEcdsaNative {
  const native = loadNativeModule()
  if (!native) {
    throw new HardwareEcdsaUnavailableError('WalletHardwareEcdsaNativeUnavailable')
  }
  return native
}

function readAuthValiditySeconds(): number {
  return Math.max(1, Math.floor(readHardwareSigningSessionTtlMs() / 1000))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)!
  }
  return bytes
}

function parseSignWithSessionResult(
  raw: SignWithSessionNativeResult | string,
): SignWithSessionNativeResult {
  if (typeof raw === 'string') {
    return { signatureBase64: raw }
  }
  return raw
}

function mapNativeError(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : undefined
  const message = error instanceof Error ? error.message : String(error)

  if (code === 'WalletHardwareEcdsaKeyNotFound' || message.includes('KeyNotFound')) {
    const alias = message.split(':').pop() ?? 'unknown'
    return new HardwareKeyNotFoundError(alias)
  }

  if (
    code === 'WalletHardwareEcdsaSessionClosed' ||
    code === 'WalletHardwareEcdsaSessionExpired' ||
    code === 'WalletHardwareEcdsaSessionMaxSignaturesExceeded' ||
    code === 'WalletHardwareEcdsaSigningFailed'
  ) {
    return new HardwareSigningSessionError(message)
  }

  if (message.toLowerCase().includes('user not authenticated')) {
    return new HardwareSigningSessionError('WalletHardwareUserAuthenticationRequired')
  }

  return new HardwareEcdsaUnavailableError(message)
}

export async function readAndroidKeySecurityLevel(alias: string): Promise<HardwareSecurityLevel> {
  const native = requireNativeModule()

  if (!(await native.hasKey(alias))) {
    throw new HardwareEcdsaUnavailableError(`WalletHardwareEcdsaKeyMissing:${alias}`)
  }

  return native.getSecurityLevel(alias)
}

export function isWalletHardwareEcdsaNativeAvailable(): boolean {
  return loadNativeModule() !== undefined
}

export function getWalletHardwareEcdsaNativeModule(): WalletHardwareEcdsaNative {
  return requireNativeModule()
}

export function __resetWalletHardwareEcdsaNativeForTests(): void {
  nativeModule = undefined
  nativeModuleChecked = false
}

export function __setWalletHardwareEcdsaNativeForTests(module: WalletHardwareEcdsaNative | undefined): void {
  nativeModule = module
  nativeModuleChecked = true
}

export { bytesToBase64, base64ToBytes, mapNativeError, parseSignWithSessionResult, readAuthValiditySeconds }
export type {
  HardwareEcdsaCreateKeyDiagnostics,
  HardwareEcdsaKeyCreateDiagnostics,
  HardwareEcdsaKeyStoreDiagnostics,
  HardwareEcdsaSignDiagnostics,
}
