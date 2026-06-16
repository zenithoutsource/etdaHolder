import { requireNativeModule } from 'expo'
import { Platform } from 'react-native'

type NativeEddsaSignerModule = {
  generateKeypair: (keyId: string, biometricsBacked: boolean) => Promise<void>
  getPublicBytesForKeyId: (keyId: string) => Uint8Array
  sign: (keyId: string, message: Uint8Array, biometricsBacked: boolean) => Promise<Uint8Array>
  deleteKey: (keyId: string) => Promise<void>
  supportsSecureEnvironment: () => boolean
}

let nativeModule: NativeEddsaSignerModule | null | undefined

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
