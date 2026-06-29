import {
  shouldHideCredentialActionMenu,
  shouldShowRenewedActiveBadge,
} from './credentialRenewalPresentation'
import type { CredentialRenewalRecord } from './credentialKeyRenewal'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { writeCredentialRenewal } from './credentialKeyRenewal'
import { getCredentialStorage, getMetaStorage } from '../storage/storage'
import { writeWalletKeyRotationRecord } from '../crypto/walletKeyRotation'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
  getMetaStorage: jest.fn(),
}))

function mockStorage() {
  const values = new Map<string, string>()
  const metaValues = new Map<string, string>()
  const storage = {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
    remove: (key: string) => values.delete(key),
  }
  const metaStorage = {
    getString: (key: string) => metaValues.get(key),
    set: (key: string, value: string) => {
      metaValues.set(key, value)
    },
    remove: (key: string) => metaValues.delete(key),
  }
  ;(getCredentialStorage as jest.Mock).mockReturnValue(storage)
  ;(getMetaStorage as jest.Mock).mockReturnValue(metaStorage)
  return { values, storage, metaValues, metaStorage }
}

const oldCredential: VerifiableCredentialRecord = {
  id: 'urn:uuid:old',
  type: 'ThaiNationalID',
  rawVc: 'eyJ.old',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

const newCredential: VerifiableCredentialRecord = {
  id: 'urn:uuid:new',
  type: 'ThaiNationalID',
  rawVc: 'eyJ.new',
  claims: {},
  issuedAt: '2026-06-26T00:00:00.000Z',
}

const renewedActiveStatus: CredentialRenewalRecord = {
  credentialId: newCredential.id,
  state: 'renewed-active',
  previousHolderDid: 'did:key:old',
  updatedAt: '2026-06-26T00:00:00.000Z',
}

describe('shouldShowRenewedActiveBadge', () => {
  test('shows only when renewed-active and old VC cleanup is still pending', () => {
    const { values } = mockStorage()
    values.set('credential:index', JSON.stringify([oldCredential.id, newCredential.id]))
    values.set(`credential:${oldCredential.id}`, JSON.stringify(oldCredential))
    values.set(`credential:${newCredential.id}`, JSON.stringify(newCredential))
    writeCredentialRenewal({
      credentialId: oldCredential.id,
      previousHolderDid: 'did:key:old',
      replacementCredentialId: newCredential.id,
      state: 'cleanup-pending',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })

    expect(
      shouldShowRenewedActiveBadge('ThaiNationalID', renewedActiveStatus),
    ).toBe(true)
  })

  test('hides after old credential cleanup even if renewed-active metadata lingers', () => {
    const { values } = mockStorage()
    values.set('credential:index', JSON.stringify([newCredential.id]))
    values.set(`credential:${newCredential.id}`, JSON.stringify(newCredential))

    expect(
      shouldShowRenewedActiveBadge('ThaiNationalID', renewedActiveStatus),
    ).toBe(false)
  })
})

describe('shouldHideCredentialActionMenu', () => {
  test('hides while wallet key rotation metadata exists', () => {
    mockStorage()
    writeWalletKeyRotationRecord({
      previousHolderDid: 'did:key:old',
      rotatedAt: '2026-06-26T00:00:00.000Z',
    })

    expect(shouldHideCredentialActionMenu(undefined)).toBe(true)
  })

  test('hides while credential still has renewal metadata', () => {
    mockStorage()

    expect(
      shouldHideCredentialActionMenu({
        credentialId: 'urn:uuid:old',
        state: 'renewal-required',
        previousHolderDid: 'did:key:old',
        updatedAt: '2026-06-26T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  test('shows after rotation and renewal metadata are cleared', () => {
    mockStorage()

    expect(shouldHideCredentialActionMenu(undefined)).toBe(false)
  })
})
