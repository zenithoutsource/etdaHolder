import { requireOptionalNativeModule } from 'expo-modules-core'

export type KeystoreKeygenRecipeResult = {
  label: string
  requestedAlgorithm: string
  requestedPurposes: number
  algorithmParameterSpec: string | null
  requestedStrongBoxBacked?: boolean
  requestedDigests?: string[]
  generatedKeyAlgorithm?: string | null
  publicKeyAlgorithm?: string | null
  publicKeyFormat?: string | null
  publicKeyEncodedBytes?: number
  publicKeySpkiPrefix?: string
  publicKeyLooksEd25519?: boolean
  signVerifyOk?: boolean
  signatureBytes?: number
  keyInfoAlgorithm?: string | null
  securityLevel?: number
  securityLevelLabel?: string
  hardwareBacked?: boolean
  errorClass?: string
  errorMessage?: string | null
}

export type KeystoreKeygenDiagnostics = {
  sdkInt: number
  deviceModel: string
  hasHardwareKeystore: boolean
  hasCurve25519HardwareKeystore: boolean
  hasStrongBoxKeystore: boolean
  hardwareEd25519Supported: boolean
  recipes: KeystoreKeygenRecipeResult[]
}

type WalletKeystoreDiagnosticsModule = {
  probeKeystoreKeygen(): Promise<KeystoreKeygenDiagnostics>
}

const nativeModule = requireOptionalNativeModule<WalletKeystoreDiagnosticsModule>(
  'WalletKeystoreDiagnostics',
)

/**
 * Runs the native AndroidKeyStore keygen probes (Ed25519 recipes + P-256
 * control group). Returns undefined when the native module is unavailable
 * (iOS, web, Expo Go, jest).
 */
export async function probeKeystoreKeygen(): Promise<KeystoreKeygenDiagnostics | undefined> {
  if (!nativeModule) return undefined
  return nativeModule.probeKeystoreKeygen()
}
