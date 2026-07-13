import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'
import * as LocalAuthentication from 'expo-local-authentication'

import { createHash } from 'react-native-quick-crypto'

import {
  initStorage,
  initStorageWithPin,
  getCredentialStorage,
  canVerifyStoragePinUnlock,
  isStoragePinFallbackAvailable,
  needsStoragePinFallbackMigration,
  persistWalletPinMeta,
  provisionStoragePinFallback,
  resetStorage,
} from './storage'

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}))

const STORAGE_BIOMETRIC_TITLE = 'ปลดล็อกพื้นที่จัดเก็บ Wallet'
const STORAGE_BIOMETRIC_CANCEL = 'ยกเลิก'

function hashWalletPinForTest(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

describe('credential storage keychain policy', () => {
  const originalFlag = process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING

  beforeEach(async () => {
    await resetStorage()
    jest.clearAllMocks()
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true)
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true })
    delete process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    })
  })

  afterEach(async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = originalFlag
    await resetStorage()
  })

  test('keeps biometric keychain access control by default', async () => {
    await initStorage()

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-credentials',
      expect.any(String),
      expect.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      })
    )
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
        authenticationPrompt: {
          title: 'Unlock Wallet Storage',
          cancel: 'Cancel',
        },
      })
    )
  })

  test('omits biometric keychain prompts when the dev-only tester flag is enabled', async () => {
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'

    await initStorage()

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-credentials',
      expect.any(String),
      expect.not.objectContaining({
        accessControl: expect.anything(),
      })
    )
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith(
      expect.not.objectContaining({
        accessControl: expect.anything(),
        authenticationPrompt: expect.anything(),
      })
    )
  })

  test('can initialize storage without prompting when no authenticated session exists', async () => {
    await initStorage({ requireBiometric: false })

    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled()
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
      service: 'etda.wallet.credential_storage_key',
    })
  })

  test('shares one Keychain read across concurrent storage initialization calls', async () => {
    let resolveRead: ((value: false) => void) | undefined
    jest.mocked(Keychain.getGenericPassword).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRead = resolve
      }),
    )

    const firstInit = initStorage()
    const secondInit = initStorage()

    expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(1)
    resolveRead?.(false)

    await Promise.all([firstInit, secondInit])

    expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(1)
    expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1)
  })

  test('uses NO_AUTH Android keychain storage guarded by the biometric gate', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    })

    await initStorage()

    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: STORAGE_BIOMETRIC_TITLE,
      cancelLabel: STORAGE_BIOMETRIC_CANCEL,
      disableDeviceFallback: true,
    })
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-credentials',
      expect.any(String),
      expect.objectContaining({
        storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
      }),
    )
    expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
      service: 'etda.wallet.credential_storage_key',
    })
  })

  test('maps Android weak biometric cancellation to a retryable storage unlock error', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    })
    jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValueOnce({
      success: false,
      error: 'user_cancel',
    })

    await expect(initStorage()).rejects.toThrow('StorageUnlockCancelled')

    expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
  })

  test('maps Android Keychain prompt cancellation to a retryable storage unlock error', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    })
    const cancellationError = Object.assign(new Error('code: 13, msg: Cancel'), {
      code: 'E_CRYPTO_FAILED',
      name: 'com.oblador.keychain.exceptions.CryptoFailedException',
    })
    jest.mocked(Keychain.getGenericPassword)
      .mockRejectedValueOnce(cancellationError)
      .mockResolvedValueOnce(false)

    await expect(initStorage()).rejects.toThrow('StorageUnlockCancelled')
    await initStorage()

    expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(2)
    expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1)
  })

  test('maps localized Android biometric dismiss to a retryable storage unlock error', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    })
    const cancellationError = Object.assign(
      new Error('code: 10, msg: ผู้ใช้ยกเลิกการทำงานของลายนิ้วมือ'),
      {
        code: 'E_CRYPTO_FAILED',
        name: 'com.oblador.keychain.exceptions.CryptoFailedException',
      },
    )
    jest.mocked(Keychain.getGenericPassword)
      .mockRejectedValueOnce(cancellationError)
      .mockResolvedValueOnce(false)

    await expect(initStorage()).rejects.toThrow('StorageUnlockCancelled')
    await initStorage()

    expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(2)
    expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1)
  })

  test('keeps non-cancel Android crypto failures as storage initialization errors', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    })
    const cryptoError = Object.assign(new Error('code: 42, msg: keystore unavailable'), {
      code: 'E_CRYPTO_FAILED',
      name: 'com.oblador.keychain.exceptions.CryptoFailedException',
    })
    jest.mocked(Keychain.getGenericPassword).mockRejectedValueOnce(cryptoError)

    await expect(initStorage()).rejects.toThrow('StorageInitializationFailed')

    expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(1)
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
  })

  test('opens credential storage with the PIN-wrapped fallback after biometric cancellation', async () => {
    await initStorage()
    provisionStoragePinFallback('123456')
    await resetStorage({ keepPinFallback: true })
    jest.clearAllMocks()

    expect(isStoragePinFallbackAvailable()).toBe(true)
    await initStorageWithPin('123456')

    expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
  })

  test('does not clear PIN-opened storage when an older biometric unlock later cancels', async () => {
    await initStorage()
    provisionStoragePinFallback('123456')
    await resetStorage({ keepPinFallback: true })
    jest.clearAllMocks()

    let rejectRead: ((reason: Error) => void) | undefined
    jest.mocked(Keychain.getGenericPassword).mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectRead = reject
      }),
    )

    const biometricInit = initStorage()
    await initStorageWithPin('123456')
    rejectRead?.(Object.assign(new Error('code: 13, msg: Cancel'), {
      code: 'E_CRYPTO_FAILED',
      name: 'com.oblador.keychain.exceptions.CryptoFailedException',
    }))

    await expect(biometricInit).rejects.toThrow('StorageUnlockCancelled')
    expect(() => getCredentialStorage()).not.toThrow()
  })

  test('rejects wrong PIN against wallet pin meta when storage fallback is missing', async () => {
    await resetStorage()
    const salt = 'meta-salt'
    persistWalletPinMeta({ salt, hash: hashWalletPinForTest('123456', salt) })

    await expect(initStorageWithPin('654321')).rejects.toThrow('StoragePinVerifierMismatch')
  })

  test('requires biometric when wallet pin meta matches but storage fallback is missing', async () => {
    await resetStorage()
    const salt = 'meta-salt'
    persistWalletPinMeta({ salt, hash: hashWalletPinForTest('123456', salt) })

    await expect(initStorageWithPin('123456')).rejects.toThrow('StoragePinFallbackRequired')
  })

  test('reports whether storage PIN unlock can be verified from meta or fallback', async () => {
    await resetStorage()
    expect(canVerifyStoragePinUnlock()).toBe(false)

    persistWalletPinMeta({ salt: 'meta-salt', hash: hashWalletPinForTest('123456', 'meta-salt') })
    expect(canVerifyStoragePinUnlock()).toBe(true)

    await resetStorage()
    await initStorage()
    provisionStoragePinFallback('123456')
    await resetStorage({ keepPinFallback: true })
    expect(canVerifyStoragePinUnlock()).toBe(true)
  })

  test('reports when storage PIN fallback migration is required', async () => {
    await resetStorage()
    expect(needsStoragePinFallbackMigration()).toBe(false)

    await initStorage()
    persistWalletPinMeta({ salt: 'meta-salt', hash: hashWalletPinForTest('123456', 'meta-salt') })
    getCredentialStorage().set(
      'wallet:pin:v1',
      JSON.stringify({ salt: 'meta-salt', hash: hashWalletPinForTest('123456', 'meta-salt') }),
    )
    expect(needsStoragePinFallbackMigration()).toBe(true)

    provisionStoragePinFallback('123456')
    expect(needsStoragePinFallbackMigration()).toBe(false)
  })

  test('rejects wrong PIN fallback without initializing credential storage', async () => {
    await initStorage()
    provisionStoragePinFallback('123456')
    await resetStorage({ keepPinFallback: true })

    await expect(initStorageWithPin('654321')).rejects.toThrow('StoragePinVerifierMismatch')
    await expect(initStorageWithPin('abcdef')).rejects.toThrow('InvalidWalletPin')
  })

  test('resetStorage clears PIN fallback metadata by default', async () => {
    await initStorage()
    provisionStoragePinFallback('123456')

    expect(isStoragePinFallbackAvailable()).toBe(true)
    await resetStorage()

    expect(isStoragePinFallbackAvailable()).toBe(false)
  })
})
