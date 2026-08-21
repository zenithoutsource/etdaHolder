import * as Keychain from 'react-native-keychain'
import { randomBytes } from 'react-native-quick-crypto'
import { __resetStore } from '@/src/__mocks__/react-native-keychain'

import {
  clearPreviousWalletKey,
  forceRotateWalletKey,
  generateWalletKeyIfNeeded,
  getHolderDid,
  getPreviousHolderDid,
  getWalletKeyRegisteredAt,
  hasPreviousWalletKey,
  signPresentationVpTokenWithPreviousKey,
} from './crypto'
import { getMetaStorage } from '../storage/storage'
import {
  clearWalletKeyRotationRecord,
  isWalletKeyExpired,
  readWalletKeyRotationRecord,
  rotateWalletKey,
} from './walletKeyRotation'
import { isWalletCryptoV2Enabled } from './walletCryptoActivation'
import { registerCredentialKey } from './credentialKeyRegistry'
import { WALLET_CRYPTO_V2_META_KEY } from '@/src/config/walletCryptoPolicy'

jest.mock('./walletCryptoActivation', () => ({
  isWalletCryptoV2Enabled: jest.fn(() => false),
}))

const isWalletCryptoV2EnabledMock = isWalletCryptoV2Enabled as jest.MockedFunction<typeof isWalletCryptoV2Enabled>
// The guard tests only exercise the rotation-record gate, so an empty credential
// set keeps them off the (uninitialized) credential MMKV storage.
jest.mock('../credentials/storedCredentials', () => ({
  readStoredCredentials: () => [],
}))
jest.mock('../credentials/credentialKeyRenewal', () => ({
  upsertCredentialRenewal: jest.fn(),
}))

const ACTIVE_SERVICE = 'etda.wallet.ed25519_seed'
const PREVIOUS_SERVICE = 'wallet.ed25519_seed.previous'

function seedBytes(fill: number): Buffer {
  return Buffer.alloc(32, fill)
}

describe('wallet key rotation dual-key retention', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
    __resetStore()
    jest.clearAllMocks()
    isWalletCryptoV2EnabledMock.mockReturnValue(false)
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'
    let call = 0
    jest.mocked(randomBytes).mockImplementation((size: number) => {
      call += 1
      return Buffer.alloc(size, call)
    })
  })

  test('retains previous seed on rotate and signs with it', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(1))
    await generateWalletKeyIfNeeded()
    const previousDid = getHolderDid()

    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(2))
    await forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))

    expect(getHolderDid()).not.toBe(previousDid)
    expect(getPreviousHolderDid()).toBe(previousDid)
    expect(hasPreviousWalletKey()).toBe(true)
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-seed-previous',
      expect.any(String),
      expect.objectContaining({ service: PREVIOUS_SERVICE }),
    )
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-seed',
      expect.any(String),
      expect.objectContaining({ service: ACTIVE_SERVICE }),
    )

    const vp = await signPresentationVpTokenWithPreviousKey({
      audience: 'https://issuer.example.com/oid4vp',
      nonce: 'nonce-1',
      verifiableCredential: 'eyJ.test',
    })
    expect(vp.split('.')).toHaveLength(3)
  })

  test('logs wallet-key-rotate-failed with the seed-generate step when the CSPRNG output is invalid', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(1))
    await generateWalletKeyIfNeeded()

    jest.mocked(randomBytes).mockReset()
    jest.mocked(randomBytes).mockImplementationOnce(() => Buffer.alloc(16, 9))

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await expect(
        forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z')),
      ).rejects.toThrow('InvalidGeneratedEd25519SeedLength')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[wallet:crypto] wallet-key-rotate-failed'),
        expect.objectContaining({ step: 'seed-generate', previousKeyRetained: true }),
        expect.objectContaining({ message: expect.stringContaining('InvalidGeneratedEd25519SeedLength') }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  test('logs wallet-key-rotate-failed with the previous-seed-retain step when the retain write fails', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(1))
    await generateWalletKeyIfNeeded()

    jest.mocked(Keychain.setGenericPassword).mockResolvedValueOnce(false)
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await expect(
        forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z')),
      ).rejects.toThrow('Ed25519SeedKeychainWriteFailed')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[wallet:crypto] wallet-key-rotate-failed'),
        expect.objectContaining({ step: 'previous-seed-retain', previousKeyRetained: false }),
        expect.objectContaining({ message: 'Ed25519SeedKeychainWriteFailed' }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  test('clearPreviousWalletKey wipes previous seed and blocks previous signing', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(3))
    await generateWalletKeyIfNeeded()
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(4))
    await forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))
    expect(hasPreviousWalletKey()).toBe(true)

    await clearPreviousWalletKey()

    expect(hasPreviousWalletKey()).toBe(false)
    expect(getPreviousHolderDid()).toBeUndefined()
    await expect(
      signPresentationVpTokenWithPreviousKey({
        audience: 'https://issuer.example.com/oid4vp',
        nonce: 'nonce-1',
        verifiableCredential: 'eyJ.test',
      }),
    ).rejects.toThrow('PreviousWalletKeyNotInitialized')
  })
})

describe('rotateWalletKey re-rotation guard', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
    __resetStore()
    jest.clearAllMocks()
    isWalletCryptoV2EnabledMock.mockReturnValue(false)
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'
  })

  test('blocks a second rotation while a rotation record exists and preserves the previous seed', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(1))
    await generateWalletKeyIfNeeded()
    const gen1Did = getHolderDid()

    // Rotate #1: gen1 seed moves into the single previous slot, gen2 becomes active.
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(2))
    await rotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))
    expect(getPreviousHolderDid()).toBe(gen1Did)
    expect(readWalletKeyRotationRecord()).toBeDefined()

    // Rotate #2 must be refused so it cannot overwrite gen1 in the previous slot.
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(3))
    await expect(
      rotateWalletKey(new Date('2026-06-29T00:05:00.000Z')),
    ).rejects.toThrow('WalletKeyRotationBlockedPendingRenewals')

    // Previous slot still holds gen1 — the key pending renewals need.
    expect(getPreviousHolderDid()).toBe(gen1Did)
  })

  test('allows rotation again after the rotation record is cleared', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(4))
    await generateWalletKeyIfNeeded()

    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(5))
    await rotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))
    expect(readWalletKeyRotationRecord()).toBeDefined()

    await clearWalletKeyRotationRecord()
    expect(readWalletKeyRotationRecord()).toBeUndefined()

    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(6))
    await expect(
      rotateWalletKey(new Date('2026-06-29T00:10:00.000Z')),
    ).resolves.toEqual(
      expect.objectContaining({ holderDid: expect.any(String) }),
    )
    expect(readWalletKeyRotationRecord()).toBeDefined()
  })

  test('skips wallet-wide rotation when v2 crypto is enabled and refreshes registeredAt', async () => {
    isWalletCryptoV2EnabledMock.mockReturnValue(true)
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(7))
    await generateWalletKeyIfNeeded()
    const beforeRotate = getWalletKeyRegisteredAt()

    const result = await rotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))

    expect(result.affectedCredentialIds).toEqual([])
    expect(readWalletKeyRotationRecord()).toBeUndefined()
    expect(getWalletKeyRegisteredAt()).toBe('2026-06-29T00:00:00.000Z')
    expect(getWalletKeyRegisteredAt()).not.toBe(beforeRotate)
  })

  test('skips wallet-wide rotation when hardware P-256 is on', async () => {
    const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    try {
      jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(17))
      await generateWalletKeyIfNeeded()

      const result = await rotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))

      expect(result.affectedCredentialIds).toEqual([])
      expect(readWalletKeyRotationRecord()).toBeUndefined()
    } finally {
      if (originalHardwareFlag === undefined) {
        delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
      } else {
        process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
      }
    }
  })

  test('isWalletKeyExpired respects registeredAt even when v2 crypto is enabled', async () => {
    isWalletCryptoV2EnabledMock.mockReturnValue(true)
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(8))
    await generateWalletKeyIfNeeded()

    expect(isWalletKeyExpired(new Date('2099-01-01T00:00:00.000Z'))).toBe(true)
  })

  test('isWalletKeyExpired is true when wallet key exists but registeredAt is missing', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(9))
    await generateWalletKeyIfNeeded()
    getMetaStorage().remove('wallet.key_registered_at')

    expect(isWalletKeyExpired()).toBe(true)
  })

  test('isWalletKeyExpired backfills v2 registeredAt from earliest credential bind', () => {
    isWalletCryptoV2EnabledMock.mockReturnValue(true)
    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    registerCredentialKey({
      credentialId: 'cred-1',
      holderDid: 'did:key:z6Mkexample',
      keychainService: 'wallet.ed25519_seed.cred.cred-1',
      credentialType: 'ThaID',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    expect(getWalletKeyRegisteredAt()).toBeUndefined()
    expect(isWalletKeyExpired(new Date('2037-01-01T00:00:00.000Z'))).toBe(true)
    expect(getWalletKeyRegisteredAt()).toBe('2026-01-01T00:00:00.000Z')
  })
})
