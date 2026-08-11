import { p256 } from '@noble/curves/nist.js'

import { getCredentialStorage, getMetaStorage } from '../storage/storage'
import { __resetHardwareEcdsaSignerCacheForTests } from './hardwareEcdsaSigner'
import {
  bindPendingHardwareKeyToCredential,
  createPendingHardwareCredentialKey,
  destroyHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  openHardwareCredentialSigningSession,
  readHardwareCredentialHolderDid,
  readHardwareCredentialSigningPublicJwk,
  resolveHardwareCredentialHolderDid,
} from './hardwareCredentialSigningKey'
import { getEncryptedCredentialKeyRecord } from './encryptedCredentialKeyRegistry'
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
    expect(readHardwareCredentialHolderDid('cred-hw-1')).toBe(record.holderDid)
    expect(() => resolveHardwareCredentialHolderDid(pendingId)).toThrow('HardwareCredentialKeyNotFound')
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

  test('destroyHardwareCredentialKey removes registry row', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(pendingId, 'cred-destroy-hw', 'ThaiNationalID')

    await destroyHardwareCredentialKey('cred-destroy-hw')
    expect(getEncryptedCredentialKeyRecord('cred-destroy-hw')).toBeUndefined()
  })
})
