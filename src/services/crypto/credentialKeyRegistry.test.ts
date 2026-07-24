import { getMetaStorage } from '../storage/storage'

import {
  getCredentialKeyRecord,
  listCredentialKeyRecords,
  registerCredentialKey,
  removeCredentialKeyRecord,
  type CredentialKeyRecord,
} from './credentialKeyRegistry'

const SAMPLE: CredentialKeyRecord = {
  credentialId: 'cred-1',
  holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  keychainService: 'wallet.ed25519_seed.cred.cred-1',
  credentialType: 'ThaiNationalID',
  createdAt: '2026-07-24T00:00:00.000Z',
}

describe('credentialKeyRegistry', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
  })

  test('registerCredentialKey stores and getCredentialKeyRecord retrieves', () => {
    registerCredentialKey(SAMPLE)
    expect(getCredentialKeyRecord('cred-1')).toEqual(SAMPLE)
  })

  test('getCredentialKeyRecord returns undefined for unknown id', () => {
    expect(getCredentialKeyRecord('missing')).toBeUndefined()
  })

  test('removeCredentialKeyRecord deletes the entry', () => {
    registerCredentialKey(SAMPLE)
    removeCredentialKeyRecord('cred-1')
    expect(getCredentialKeyRecord('cred-1')).toBeUndefined()
  })

  test('listCredentialKeyRecords returns all registered records', () => {
    const second: CredentialKeyRecord = {
      ...SAMPLE,
      credentialId: 'cred-2',
      keychainService: 'wallet.ed25519_seed.cred.cred-2',
    }
    registerCredentialKey(SAMPLE)
    registerCredentialKey(second)

    const records = listCredentialKeyRecords()
    expect(records).toHaveLength(2)
    expect(records).toEqual(expect.arrayContaining([SAMPLE, second]))
  })

  test('registerCredentialKey overwrites an existing record for the same credentialId', () => {
    registerCredentialKey(SAMPLE)
    const updated: CredentialKeyRecord = {
      ...SAMPLE,
      holderDid: 'did:key:z6Mkupdated',
    }
    registerCredentialKey(updated)
    expect(getCredentialKeyRecord('cred-1')).toEqual(updated)
    expect(listCredentialKeyRecords()).toHaveLength(1)
  })

  test('ignores corrupt registry entries', () => {
    getMetaStorage().set('wallet.credential_keys.bad', '{not json')
    registerCredentialKey(SAMPLE)
    expect(listCredentialKeyRecords()).toEqual([SAMPLE])
    expect(getCredentialKeyRecord('bad')).toBeUndefined()
  })
})
