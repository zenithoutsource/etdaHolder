import { requireOptionalNativeModule } from 'expo-modules-core'

export type KeystoreRecipeStatus = 'EXECUTED' | 'SKIPPED_FEATURE_ABSENT'

export type KeystoreKeygenRecipeResult = {
  label: string
  status: KeystoreRecipeStatus
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
  errorStage?: 'GENERATION' | 'ENTRY_READ' | 'RESULT_INSPECTION' | 'SIGN' | 'VERIFY'
  errorClass?: string
  errorMessage?: string | null
  aliasCleanupErrorClass?: string
  aliasCleanupErrorMessage?: string | null
  keyInfoErrorClass?: string
  keyInfoErrorMessage?: string | null
}

export type KeystoreKeygenDiagnostics = {
  sdkInt: number
  deviceModel: string
  hasHardwareKeystore: boolean
  hasCurve25519HardwareKeystore: boolean
  hasStrongBoxKeystore: boolean
  hardwareEd25519Supported: boolean
  strongBoxEd25519Supported: boolean
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
