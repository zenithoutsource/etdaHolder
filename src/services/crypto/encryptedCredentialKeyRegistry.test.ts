import { getCredentialStorage } from '../storage/storage'
import {
  bindPendingCredentialAlias,
  destroyEncryptedCredentialKey,
  findEncryptedCredentialKeyByType,
  getEncryptedCredentialKeyRecord,
  listEncryptedCredentialKeyRecords,
  readEarliestEncryptedCredentialKeyCreatedAt,
  registerEncryptedCredentialKey,
  removeEncryptedCredentialKeyRecord,
  retryEncryptedCredentialKeyRegistryCleanup,
  type EncryptedCredentialKeyRecord,
} from './encryptedCredentialKeyRegistry'
import { createMockHardwareEcdsaSigner } from './hardwareEcdsaSigner.mock'
import { HardwareKeyNotFoundError } from './hardwareEcdsaTypes'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

function mockStorage() {
  const values = new Map<string, string>()
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
      return true
    }),
    getAllKeys: jest.fn(() => [...values.keys()]),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { storage, values }
}

const SAMPLE: EncryptedCredentialKeyRecord = {
  credentialId: 'cred-1',
  holderDid: 'did:key:zExamplePid',
  alias: 'wallet.p256.cred.pending.abc',
  credentialType: 'ThaiNationalID',
  createdAt: '2026-08-04T00:00:00.000Z',
  securityLevelHint: 'STRONGBOX',
}

describe('encryptedCredentialKeyRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('registerEncryptedCredentialKey stores and retrieves records from encrypted storage', () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    expect(getEncryptedCredentialKeyRecord('cred-1')).toEqual(SAMPLE)
  })

  test('readEarliestEncryptedCredentialKeyCreatedAt returns the oldest bind time', () => {
    mockStorage()
    registerEncryptedCredentialKey({
      ...SAMPLE,
      credentialId: 'cred-newer',
      createdAt: '2026-08-05T00:00:00.000Z',
    })
    registerEncryptedCredentialKey(SAMPLE)
    expect(readEarliestEncryptedCredentialKeyCreatedAt()).toBe('2026-08-04T00:00:00.000Z')
  })

  test('bindPendingCredentialAlias writes alias without renaming it', () => {
    mockStorage()
    const record = bindPendingCredentialAlias({
      credentialId: 'cred-1',
      alias: 'wallet.p256.cred.pending.abc',
      holderDid: 'did:key:zExamplePid',
      credentialType: 'ThaiNationalID',
      securityLevelHint: 'TEE',
    })
    expect(record.alias).toBe('wallet.p256.cred.pending.abc')
    expect(getEncryptedCredentialKeyRecord('cred-1')?.alias).toBe('wallet.p256.cred.pending.abc')
  })

  test('destroyEncryptedCredentialKey deletes keystore alias before registry row', async () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey(SAMPLE.alias)

    await destroyEncryptedCredentialKey('cred-1', signer)

    expect(await signer.hasKey(SAMPLE.alias)).toBe(false)
    expect(getEncryptedCredentialKeyRecord('cred-1')).toBeUndefined()
  })

  test('retryEncryptedCredentialKeyRegistryCleanup removes registry row after keystore delete', async () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey(SAMPLE.alias)
    await signer.deleteKey(SAMPLE.alias)

    retryEncryptedCredentialKeyRegistryCleanup('cred-1')
    expect(getEncryptedCredentialKeyRecord('cred-1')).toBeUndefined()
  })

  test('destroyEncryptedCredentialKey removes registry when alias is already gone', async () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    const inner = createMockHardwareEcdsaSigner()
    await inner.createKey(SAMPLE.alias)
    await inner.deleteKey(SAMPLE.alias)
    const signer = {
      ...inner,
      async deleteKey(alias: string) {
        if (!(await inner.hasKey(alias))) {
          throw new HardwareKeyNotFoundError(alias)
        }
        await inner.deleteKey(alias)
      },
    }

    await destroyEncryptedCredentialKey('cred-1', signer)

    expect(getEncryptedCredentialKeyRecord('cred-1')).toBeUndefined()
  })

  test('destroyEncryptedCredentialKey removes registry when deleteKey throws after alias is gone', async () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    const inner = createMockHardwareEcdsaSigner()
    await inner.createKey(SAMPLE.alias)
    const signer = {
      ...inner,
      async deleteKey(alias: string) {
        await inner.deleteKey(alias)
        throw new HardwareKeyNotFoundError(alias)
      },
    }

    await destroyEncryptedCredentialKey('cred-1', signer)

    expect(await inner.hasKey(SAMPLE.alias)).toBe(false)
    expect(getEncryptedCredentialKeyRecord('cred-1')).toBeUndefined()
  })

  test('findEncryptedCredentialKeyByType locates PID records', () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    registerEncryptedCredentialKey({
      ...SAMPLE,
      credentialId: 'cred-2',
      credentialType: 'ChulalongkornUniversityTranscript',
    })

    expect(findEncryptedCredentialKeyByType('ThaiNationalID')?.credentialId).toBe('cred-1')
    expect(listEncryptedCredentialKeyRecords()).toHaveLength(2)
  })

  test('destroying credential C does not remove credential D registry or alias', async () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    const other: EncryptedCredentialKeyRecord = {
      ...SAMPLE,
      credentialId: 'cred-d',
      alias: 'wallet.p256.cred.pending.def',
      credentialType: 'ChulalongkornUniversityTranscript',
    }
    registerEncryptedCredentialKey(other)
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey(SAMPLE.alias)
    await signer.createKey(other.alias)

    await destroyEncryptedCredentialKey('cred-1', signer)

    expect(getEncryptedCredentialKeyRecord('cred-1')).toBeUndefined()
    expect(await signer.hasKey(SAMPLE.alias)).toBe(false)
    expect(getEncryptedCredentialKeyRecord('cred-d')).toEqual(other)
    expect(await signer.hasKey(other.alias)).toBe(true)
  })

  test('removeEncryptedCredentialKeyRecord deletes the entry', () => {
    mockStorage()
    registerEncryptedCredentialKey(SAMPLE)
    removeEncryptedCredentialKeyRecord('cred-1')
    expect(getEncryptedCredentialKeyRecord('cred-1')).toBeUndefined()
  })
})
