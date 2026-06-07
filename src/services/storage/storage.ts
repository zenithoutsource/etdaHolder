import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'
import type { MMKV } from 'react-native-mmkv'
import { createMMKV } from 'react-native-mmkv'
import { randomBytes } from 'react-native-quick-crypto'

const KEYCHAIN_SERVICE = 'etda.wallet.credential_storage_key'
const KEYCHAIN_USERNAME = 'wallet-credentials'
const META_STORAGE_ID = 'wallet-meta'
const CREDENTIAL_STORAGE_ID = 'wallet-credentials'
const MMKV_AES_256_KEY_BYTES = 32
const RANDOM_BYTES_FOR_BASE64_KEY = 24

const metaStorage = createMMKV({ id: META_STORAGE_ID })
let credentialStorage: MMKV | null = null

function generateEncryptionKey(): string {
  const key = randomBytes(RANDOM_BYTES_FOR_BASE64_KEY).toString('base64')
  if (key.length !== MMKV_AES_256_KEY_BYTES) {
    throw new Error(`InvalidStorageKeyLength: expected ${MMKV_AES_256_KEY_BYTES}, got ${key.length}`)
  }
  return key
}

function getKeychainSetOptions(): Keychain.SetOptions {
  if (Platform.OS === 'android') {
    return {
      service: KEYCHAIN_SERVICE,
      securityLevel: __DEV__
        ? Keychain.SECURITY_LEVEL.SECURE_SOFTWARE
        : Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      storage: Keychain.STORAGE_TYPE.AES_GCM,
    }
  }
  return {
    service: KEYCHAIN_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  }
}

function getKeychainGetOptions(): Keychain.GetOptions {
  if (Platform.OS === 'android') {
    return {
      service: KEYCHAIN_SERVICE,
      authenticationPrompt: {
        title: 'Unlock Wallet Storage',
        cancel: 'Cancel',
      },
    }
  }
  return {
    service: KEYCHAIN_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    authenticationPrompt: {
      title: 'Unlock Wallet Storage',
      cancel: 'Cancel',
    },
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function getOrCreateEncryptionKey(): Promise<string> {
  const credentials = await Keychain.getGenericPassword(getKeychainGetOptions())

  if (credentials) {
    if (credentials.password.length !== MMKV_AES_256_KEY_BYTES) {
      throw new Error(
        `InvalidStoredStorageKeyLength: expected ${MMKV_AES_256_KEY_BYTES}, got ${credentials.password.length}`
      )
    }
    return credentials.password
  }

  const encryptionKey = generateEncryptionKey()
  const result = await Keychain.setGenericPassword(
    KEYCHAIN_USERNAME,
    encryptionKey,
    getKeychainSetOptions()
  )

  if (!result) throw new Error('KeychainWriteFailed')
  return encryptionKey
}

/**
 * Must be called once at app startup before any credential read/write.
 * Biometric/device auth may fire when the MMKV key is retrieved from Keychain.
 */
export async function initStorage(): Promise<void> {
  if (credentialStorage !== null) return

  try {
    const encryptionKey = await getOrCreateEncryptionKey()
    credentialStorage = createMMKV({
      id: CREDENTIAL_STORAGE_ID,
      encryptionKey,
      encryptionType: 'AES-256',
    })
  } catch (error) {
    credentialStorage = null
    throw new Error(`StorageInitializationFailed: ${toErrorMessage(error)}`)
  }
}

export function getMetaStorage(): MMKV {
  return metaStorage
}

/** Throws `StorageNotInitialized` if called before `initStorage()`. */
export function getCredentialStorage(): MMKV {
  if (!credentialStorage) throw new Error('StorageNotInitialized')
  return credentialStorage
}

/** Wipes keychain entry and forgets the encrypted credential storage instance. */
export async function resetStorage(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  credentialStorage = null
}
