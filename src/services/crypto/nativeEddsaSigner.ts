import { requireNativeModule } from 'expo'
import { Platform } from 'react-native'

type NativeEddsaSignerModule = {
  generateKeypair: (keyId: string, biometricsBacked: boolean) => Promise<void>
  getPublicBytesForKeyId: (keyId: string) => Uint8Array
  sign: (keyId: string, message: Uint8Array, biometricsBacked: boolean) => Promise<Uint8Array>
  deleteKey: (keyId: string) => Promise<void>
  supportsSecureEnvironment: () => boolean
  getEd25519Diagnostics: () => NativeEd25519Diagnostics
  authenticateWeakBiometric?: (promptMessage: string, cancelButtonText: string) => Promise<boolean>
}

let nativeModule: NativeEddsaSignerModule | null | undefined

export type NativeEd25519DiagnosticRecipe = {
  label: string
  requestedAlgorithm: string
  requestedPurposes: number
  requestedStrongBoxBacked?: boolean
  algorithmParameterSpec?: string
  privateKeyAlgorithm?: string
  publicKeyAlgorithm?: string
  publicKeyFormat?: string
  publicKeyEncodedBytes?: number
  publicKeySpkiPrefix?: string
  publicKeyLooksEd25519?: boolean
  signVerifyOk?: boolean
  keyInfoAlgorithm?: string
  securityLevel?: number
  securityLevelLabel?: string
  hardwareBacked?: boolean
  userAuthenticationRequired?: boolean
  userAuthenticationHardwareEnforced?: boolean
  errorClass?: string
  errorMessage?: string
}

export type NativeEd25519Diagnostics = {
  sdkInt: number
  deviceModel: string
  hasHardwareKeystore: boolean
  hasCurve25519HardwareKeystore: boolean
  hasStrongBoxKeystore: boolean
  supported: boolean
  recipes: NativeEd25519DiagnosticRecipe[]
}

function getNativeModule(): NativeEddsaSignerModule | null {
  if (nativeModule !== undefined) return nativeModule

  if (Platform.OS !== 'android') {
    nativeModule = null
    return nativeModule
  }

  try {
    nativeModule = requireNativeModule<NativeEddsaSignerModule>('EtdaWalletEddsa')
  } catch {
    nativeModule = null
  }

  return nativeModule
}

function requireNativeEd25519Signer(): NativeEddsaSignerModule {
  const signer = getNativeModule()
  if (!signer) {
    throw new Error('NativeEd25519SignerRequired: Android native Ed25519 signer is unavailable')
  }
  return signer
}

export function isNativeEd25519SignerAvailable(): boolean {
  return Boolean(getNativeModule()?.supportsSecureEnvironment())
}

export function isNativeWeakBiometricAvailable(): boolean {
  return Boolean(getNativeModule()?.authenticateWeakBiometric)
}

export async function authenticateWeakBiometric(
  promptMessage: string,
  cancelButtonText: string,
): Promise<boolean> {
  const signer = getNativeModule()
  if (!signer?.authenticateWeakBiometric) {
    throw new Error('NativeWeakBiometricUnavailable: Android weak biometric prompt is unavailable')
  }

  return signer.authenticateWeakBiometric(promptMessage, cancelButtonText)
}

export function getNativeEd25519Diagnostics(): NativeEd25519Diagnostics {
  return requireNativeEd25519Signer().getEd25519Diagnostics()
}

export async function generateKeypair(keyId: string, biometricsBacked: boolean): Promise<void> {
  await requireNativeEd25519Signer().generateKeypair(keyId, biometricsBacked)
}

export async function getPublicBytesForKeyId(keyId: string): Promise<Uint8Array> {
  return requireNativeEd25519Signer().getPublicBytesForKeyId(keyId)
}

export async function sign(keyId: string, message: Uint8Array, biometricsBacked: boolean): Promise<Uint8Array> {
  return requireNativeEd25519Signer().sign(keyId, message, biometricsBacked)
}

export async function deleteKey(keyId: string): Promise<void> {
  await requireNativeEd25519Signer().deleteKey(keyId)
}
