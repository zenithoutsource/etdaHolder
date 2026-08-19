import { p256 } from '@noble/curves/nist.js'
import { randomBytes } from 'react-native-quick-crypto'
import * as Keychain from 'react-native-keychain'

import { getCredentialStorage, getMetaStorage } from '../storage/storage'
import { __resetHardwareEcdsaSignerCacheForTests, getHardwareEcdsaSigner } from './hardwareEcdsaSigner'
import {
  bindPendingHardwareKeyToCredential,
  commitHardwareCredentialKeyReplacement,
  createPendingHardwareCredentialKey,
  destroyHardwareCredentialKey,
  discardHardwareCredentialKeyReplacement,
  discardPendingHardwareCredentialKey,
  getHardwareCredentialKeyReplacement,
  hasHardwareCredentialKey,
  openHardwareCredentialSigningSession,
  readHardwareCredentialHolderDid,
  readHardwareCredentialSigningPublicJwk,
  resolveHardwareCredentialHolderDid,
} from './hardwareCredentialSigningKey'
import { getEncryptedCredentialKeyRecord } from './encryptedCredentialKeyRegistry'
import { getWalletKeyRegisteredAt } from './crypto'
import { isWalletKeyExpired } from './walletKeyRotation'
import {
  bindPendingKeyToCredential,
  createPendingCredentialKey,
} from './credentialSigningKey'
import { getCredentialKeyRecord } from './credentialKeyRegistry'
import { p256JwkToPublicKey, verifyEs256Prehash } from './p256Identity'

jest.mock('../storage/storage', () => {
  const actual = jest.requireActual('../storage/storage')
  return {
    ...actual,
    getCredentialStorage: jest.fn(),
  }
})

const getCredentialStorageMock = getCredentialStorage as jest.Mock

function mockCredentialStorage() {
  const values = new Map<string, string>()
  const storage = {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
    remove: (key: string) => {
      values.delete(key)
      return true
    },
    getAllKeys: () => [...values.keys()],
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { values, storage }
}

describe('hardwareCredentialSigningKey', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
    mockCredentialStorage()
    __resetHardwareEcdsaSignerCacheForTests()
    ;(Keychain as unknown as { __resetStore: () => void }).__resetStore()
    jest.mocked(randomBytes).mockImplementation((size: number) => Buffer.alloc(size, 0))
  })

  test('createPendingHardwareCredentialKey returns unique id and pending holder did', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    expect(pendingId).toMatch(/^[0-9a-f]{32}$/)
    expect(resolveHardwareCredentialHolderDid(pendingId)).toMatch(/^did:key:z/)
  })

  test('bindPendingHardwareKeyToCredential writes encrypted registry row', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    const record = await bindPendingHardwareKeyToCredential(pendingId, 'cred-hw-1', 'ThaiNationalID')

    expect(record.credentialId).toBe('cred-hw-1')
    expect(record.credentialType).toBe('ThaiNationalID')
    expect(record.holderDid).toMatch(/^did:key:z/)
    expect(getEncryptedCredentialKeyRecord('cred-hw-1')).toEqual(record)
    expect(getWalletKeyRegisteredAt()).toBe(record.createdAt)
    expect(readHardwareCredentialHolderDid('cred-hw-1')).toBe(record.holderDid)
    expect(() => resolveHardwareCredentialHolderDid(pendingId)).toThrow('HardwareCredentialKeyNotFound')
  })

  test('isWalletKeyExpired backfills from hardware k_cred when Ed25519 wallet key is absent', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    const record = await bindPendingHardwareKeyToCredential(pendingId, 'cred-hw-ttl', 'ThaiNationalID')
    getMetaStorage().remove('wallet.key_registered_at')

    expect(getWalletKeyRegisteredAt()).toBeUndefined()
    expect(isWalletKeyExpired(new Date(new Date(record.createdAt).getTime() + 6 * 60 * 1000))).toBe(
      true,
    )
    expect(getWalletKeyRegisteredAt()).toBe(record.createdAt)
  })

  test('bindPendingHardwareKeyToCredential deletes same-type Ed25519 keys and keeps other types', async () => {
    const pidPending = await createPendingCredentialKey()
    await bindPendingKeyToCredential(pidPending, 'cred-pid-old', 'ThaiNationalID')
    const transcriptPending = await createPendingCredentialKey()
    await bindPendingKeyToCredential(transcriptPending, 'cred-transcript', 'ChulalongkornUniversityTranscript')

    const hardwarePending = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(hardwarePending, 'cred-pid-new', 'ThaiNationalID')

    expect(getEncryptedCredentialKeyRecord('cred-pid-new')).toBeDefined()
    expect(getCredentialKeyRecord('cred-pid-old')).toBeUndefined()
    expect(getCredentialKeyRecord('cred-transcript')?.credentialId).toBe('cred-transcript')
  })

  test('openHardwareCredentialSigningSession signs ES256 prehash', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    const session = await openHardwareCredentialSigningSession(pendingId, 'oid4vci')
    const message = new TextEncoder().encode('hardware-credential-sign-test')

    try {
      const signature = await session.sign(message)
      expect(signature).toHaveLength(64)

      const publicKey = p256JwkToPublicKey(await readHardwareCredentialSigningPublicJwk(pendingId))
      expect(verifyEs256Prehash(message, signature, publicKey)).toBe(true)
      expect(resolveHardwareCredentialHolderDid(pendingId)).toMatch(/^did:key:z/)
    } finally {
      await session.close()
    }
  })

  test('discardPendingHardwareCredentialKey removes pending metadata', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    await discardPendingHardwareCredentialKey(pendingId)
    expect(() => resolveHardwareCredentialHolderDid(pendingId)).toThrow('HardwareCredentialKeyNotFound')
  })

  test('rebind keeps the live alias until replacement is committed', async () => {
    let nonce = 1
    jest.mocked(randomBytes).mockImplementation((size: number) => Buffer.alloc(size, nonce++))

    const firstPending = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(firstPending, 'cred-rebind', 'ThaiNationalID')
    const firstAlias = getEncryptedCredentialKeyRecord('cred-rebind')!.alias
    const firstDid = getEncryptedCredentialKeyRecord('cred-rebind')!.holderDid

    const secondPending = await createPendingHardwareCredentialKey()
    const liveAfterPreview = await bindPendingHardwareKeyToCredential(
      secondPending,
      'cred-rebind',
      'ThaiNationalID',
    )

    const signer = getHardwareEcdsaSigner()
    expect(liveAfterPreview.alias).toBe(firstAlias)
    expect(liveAfterPreview.holderDid).toBe(firstDid)
    expect(await signer.hasKey(firstAlias)).toBe(true)
    expect(getEncryptedCredentialKeyRecord('cred-rebind')?.alias).toBe(firstAlias)

    await commitHardwareCredentialKeyReplacement('cred-rebind')
    expect(await signer.hasKey(firstAlias)).toBe(false)
    expect(getEncryptedCredentialKeyRecord('cred-rebind')?.alias).not.toBe(firstAlias)
  })

  test('discarding a staged replacement restores the previous live alias', async () => {
    let nonce = 1
    jest.mocked(randomBytes).mockImplementation((size: number) => Buffer.alloc(size, nonce++))

    const firstPending = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(firstPending, 'cred-rebind-cancel', 'ThaiNationalID')
    const firstAlias = getEncryptedCredentialKeyRecord('cred-rebind-cancel')!.alias

    const secondPending = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(secondPending, 'cred-rebind-cancel', 'ThaiNationalID')
    const replacementAlias = getHardwareCredentialKeyReplacement('cred-rebind-cancel')!.alias

    const discarded = await discardHardwareCredentialKeyReplacement('cred-rebind-cancel')
    const signer = getHardwareEcdsaSigner()
    expect(discarded).toBe(true)
    expect(getEncryptedCredentialKeyRecord('cred-rebind-cancel')?.alias).toBe(firstAlias)
    expect(await signer.hasKey(firstAlias)).toBe(true)
    expect(await signer.hasKey(replacementAlias)).toBe(false)
  })

  test('hasHardwareCredentialKey is true for pending and bound aliases only', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    expect(hasHardwareCredentialKey(pendingId)).toBe(true)
    expect(hasHardwareCredentialKey('missing-cred')).toBe(false)

    await bindPendingHardwareKeyToCredential(pendingId, 'cred-has-hw', 'ThaiNationalID')
    expect(hasHardwareCredentialKey('cred-has-hw')).toBe(true)
    expect(hasHardwareCredentialKey(pendingId)).toBe(false)
  })

  test('failed pending-key delete is retried by later createPending sweep', async () => {
    let nonce = 1
    jest.mocked(randomBytes).mockImplementation((size: number) => Buffer.alloc(size, nonce++))

    const pendingId = await createPendingHardwareCredentialKey()
    const signer = getHardwareEcdsaSigner()
    const originalDelete = signer.deleteKey.bind(signer)
    let attempts = 0
    signer.deleteKey = async (alias: string) => {
      attempts += 1
      if (attempts === 1) throw new Error('KeystoreBusy')
      return originalDelete(alias)
    }

    await discardPendingHardwareCredentialKey(pendingId)
    expect(() => resolveHardwareCredentialHolderDid(pendingId)).not.toThrow()

    await createPendingHardwareCredentialKey()
    expect(() => resolveHardwareCredentialHolderDid(pendingId)).toThrow('HardwareCredentialKeyNotFound')
  })

  test('destroyHardwareCredentialKey removes registry row', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(pendingId, 'cred-destroy-hw', 'ThaiNationalID')

    await destroyHardwareCredentialKey('cred-destroy-hw')
    expect(getEncryptedCredentialKeyRecord('cred-destroy-hw')).toBeUndefined()
  })

  test('commitHardwareCredentialKeyReplacement binds the new alias even if deleting the old alias fails', async () => {
    let nonce = 1
    jest.mocked(randomBytes).mockImplementation((size: number) => Buffer.alloc(size, nonce++))

    const firstPending = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(firstPending, 'cred-replace-hw', 'ThaiNationalID')
    const firstAlias = getEncryptedCredentialKeyRecord('cred-replace-hw')!.alias

    const secondPending = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(secondPending, 'cred-replace-hw', 'ThaiNationalID')
    const replacementAlias = getHardwareCredentialKeyReplacement('cred-replace-hw')!.alias

    const signer = getHardwareEcdsaSigner()
    signer.deleteKey = async () => {
      throw new Error('KeystoreBusy')
    }

    await commitHardwareCredentialKeyReplacement('cred-replace-hw')
    expect(getEncryptedCredentialKeyRecord('cred-replace-hw')?.alias).toBe(replacementAlias)
    expect(getEncryptedCredentialKeyRecord('cred-replace-hw')?.alias).not.toBe(firstAlias)
  })
})
