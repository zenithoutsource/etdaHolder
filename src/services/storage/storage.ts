import * as Keychain from 'react-native-keychain'
import { createMMKV } from 'react-native-mmkv'
import type { MMKV } from 'react-native-mmkv'

const KEYCHAIN_SERVICE = 'wallet.credential_storage_key'
const KEYCHAIN_USERNAME = 'mmkv_enc_key'

let credentialStorage: MMKV | null = null

// 24 random bytes → 32-char base64 = valid AES-256 key (≤ 32 bytes)
function generateEncryptionKey(): string {
  const bytes = new Uint8Array(24)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).crypto.getRandomValues(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Must be called once at app startup before any credential read/write.
 * Biometric fires here on every launch (key retrieval from hardware keychain).
 * Idempotent — no-ops if already initialised.
 */
export async function initStorage(): Promise<void> {
  if (credentialStorage !== null) return

  let encKey: string

  const hasKey = await Keychain.hasGenericPassword({ service: KEYCHAIN_SERVICE })

  if (hasKey) {
    const creds = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
      authenticationPrompt: { title: 'Unlock Wallet Storage' },
    })
    if (!creds) throw new Error('KeychainReadFailed')
    encKey = creds.password
  } else {
    encKey = generateEncryptionKey()
    const result = await Keychain.setGenericPassword(KEYCHAIN_USERNAME, encKey, {
      service: KEYCHAIN_SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
    if (!result) throw new Error('KeychainWriteFailed')
  }

  credentialStorage = createMMKV({
    id: 'wallet-credentials',
    encryptionKey: encKey,
    encryptionType: 'AES-256',
  })
}

/** Throws `StorageNotInitialized` if called before `initStorage()`. */
export function getCredentialStorage(): MMKV {
  if (!credentialStorage) throw new Error('StorageNotInitialized')
  return credentialStorage
}

/** Wipes keychain entry and credential storage. Users must re-enrol. */
export async function resetStorage(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  credentialStorage = null
}
