import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { isWalletKeyExpiredAt } from '@/src/config/walletKeyPolicy'
import { getEncryptedCredentialKeyRecord } from '../crypto/encryptedCredentialKeyRegistry'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import {
  isStoredCredentialKeyTtlExpired,
  shouldMarkCredentialKeyRenewalRequired,
  syncCredentialKeyTtlRenewals,
} from './credentialKeyExpiry'
import { readCredentialRenewal, upsertCredentialRenewal, clearCredentialRenewal } from './credentialKeyRenewal'
import { readStoredCredentials } from './storedCredentials'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('@/src/config/walletKeyPolicy', () => ({
  isWalletKeyExpiredAt: jest.fn(),
  readMsUntilWalletKeyExpiry: jest.fn(),
}))

jest.mock('@/src/config/hardwareSigningPolicy', () => ({
  isHardwareP256SigningEnabled: jest.fn(() => true),
}))

jest.mock('../crypto/encryptedCredentialKeyRegistry', () => ({
  getEncryptedCredentialKeyRecord: jest.fn(),
}))

jest.mock('./credentialDocumentExpiry', () => ({
  isCredentialDocumentExpired: jest.fn(() => false),
}))

jest.mock('./storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('./credentialKeyRenewal', () => ({
  readCredentialRenewal: jest.fn(),
  upsertCredentialRenewal: jest.fn(),
  clearCredentialRenewal: jest.fn(),
}))

const isWalletKeyExpiredAtMock = isWalletKeyExpiredAt as jest.MockedFunction<
  typeof isWalletKeyExpiredAt
>
const isHardwareP256SigningEnabledMock = isHardwareP256SigningEnabled as jest.MockedFunction<
  typeof isHardwareP256SigningEnabled
>
const getEncryptedCredentialKeyRecordMock = getEncryptedCredentialKeyRecord as jest.MockedFunction<
  typeof getEncryptedCredentialKeyRecord
>
const isCredentialDocumentExpiredMock = isCredentialDocumentExpired as jest.MockedFunction<
  typeof isCredentialDocumentExpired
>
const readStoredCredentialsMock = readStoredCredentials as jest.MockedFunction<
  typeof readStoredCredentials
>
const readCredentialRenewalMock = readCredentialRenewal as jest.MockedFunction<
  typeof readCredentialRenewal
>
const upsertCredentialRenewalMock = upsertCredentialRenewal as jest.MockedFunction<
  typeof upsertCredentialRenewal
>
const clearCredentialRenewalMock = clearCredentialRenewal as jest.MockedFunction<
  typeof clearCredentialRenewal
>

const transcript: Pick<VerifiableCredentialRecord, 'id' | 'expiresAt' | 'claims' | 'type'> = {
  id: 'transcript-new',
  type: 'ChulalongkornUniversityTranscript',
  claims: {},
  expiresAt: '2030-06-15T00:00:00.000Z',
}

describe('shouldMarkCredentialKeyRenewalRequired', () => {
  beforeEach(() => {
    isWalletKeyExpiredAtMock.mockReset()
    isWalletKeyExpiredAtMock.mockReturnValue(true)
  })

  test('marks hardware k_cred TTL independently of other credentials', () => {
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-01-01T00:00:00.000Z',
        documentExpired: false,
      }),
    ).toBe(true)
  })

  test('does not mark when the document is already expired', () => {
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-01-01T00:00:00.000Z',
        documentExpired: true,
      }),
    ).toBe(false)
  })

  test('does not mark leftover Ed25519 cards without hardware k_cred', () => {
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: false,
        kCredCreatedAt: '2026-01-01T00:00:00.000Z',
        documentExpired: false,
      }),
    ).toBe(false)
  })

  test('evaluates PID and driving-licence k_cred createdAt independently', () => {
    isWalletKeyExpiredAtMock.mockImplementation((createdAt) => createdAt === '2026-01-01T00:00:00.000Z')
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-01-01T00:00:00.000Z',
        documentExpired: false,
      }),
    ).toBe(true)
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-08-01T00:00:00.000Z',
        documentExpired: false,
      }),
    ).toBe(false)
  })

  test('does not remount in-flight P3 states', () => {
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-01-01T00:00:00.000Z',
        documentExpired: false,
        renewalState: 'renewal-processing',
      }),
    ).toBe(false)
  })

  test('does not write renewal-required while renewed-active', () => {
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-01-01T00:00:00.000Z',
        documentExpired: false,
        renewalState: 'renewed-active',
      }),
    ).toBe(false)
  })

  test('does not mark when k_cred TTL has not elapsed', () => {
    isWalletKeyExpiredAtMock.mockReturnValue(false)
    expect(
      shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: true,
        kCredCreatedAt: '2026-08-01T00:00:00.000Z',
        documentExpired: false,
      }),
    ).toBe(false)
  })
})

describe('isStoredCredentialKeyTtlExpired', () => {
  beforeEach(() => {
    isWalletKeyExpiredAtMock.mockReset()
    isHardwareP256SigningEnabledMock.mockReset()
    getEncryptedCredentialKeyRecordMock.mockReset()
    isCredentialDocumentExpiredMock.mockReset()
    isHardwareP256SigningEnabledMock.mockReturnValue(true)
    isCredentialDocumentExpiredMock.mockReturnValue(false)
    isWalletKeyExpiredAtMock.mockReturnValue(true)
    getEncryptedCredentialKeyRecordMock.mockReturnValue({
      credentialId: transcript.id,
      holderDid: 'did:key:zDna',
      alias: 'wallet.p256.transcript-new',
      credentialType: transcript.type,
      createdAt: '2026-08-19T10:00:00.000Z',
      securityLevelHint: 'TEE',
    })
  })

  test('returns true when hardware k_cred TTL has elapsed', () => {
    expect(isStoredCredentialKeyTtlExpired(transcript)).toBe(true)
  })

  test('returns false when hardware signing is off', () => {
    isHardwareP256SigningEnabledMock.mockReturnValue(false)
    expect(isStoredCredentialKeyTtlExpired(transcript)).toBe(false)
  })

  test('returns false for leftover Ed25519 cards without hardware k_cred', () => {
    getEncryptedCredentialKeyRecordMock.mockReturnValue(undefined)
    expect(isStoredCredentialKeyTtlExpired(transcript)).toBe(false)
  })

  test('returns false for mdoc rawVc even when hardware k_cred TTL elapsed', () => {
    expect(
      isStoredCredentialKeyTtlExpired({
        ...transcript,
        rawVc: 'mdoc:AQIDBA',
      }),
    ).toBe(false)
  })

  test('returns false when the document is already calendar-expired', () => {
    isCredentialDocumentExpiredMock.mockReturnValue(true)
    expect(isStoredCredentialKeyTtlExpired(transcript)).toBe(false)
  })

  test('returns false when k_cred TTL has not elapsed', () => {
    isWalletKeyExpiredAtMock.mockReturnValue(false)
    expect(isStoredCredentialKeyTtlExpired(transcript)).toBe(false)
  })

  test('returns false when credential storage is not initialized', () => {
    getEncryptedCredentialKeyRecordMock.mockImplementation(() => {
      throw new Error('StorageNotInitialized')
    })
    expect(isStoredCredentialKeyTtlExpired(transcript)).toBe(false)
  })
})

describe('syncCredentialKeyTtlRenewals', () => {
  const mdoc: VerifiableCredentialRecord = {
    id: 'mdl-1',
    type: 'DLTDrivingLicence',
    rawVc: 'mdoc:AQIDBA',
    claims: { doctype: 'org.iso.18013.5.1.mDL' },
    issuedAt: '2026-08-01T00:00:00.000Z',
  }

  beforeEach(() => {
    isWalletKeyExpiredAtMock.mockReset()
    isHardwareP256SigningEnabledMock.mockReset()
    getEncryptedCredentialKeyRecordMock.mockReset()
    isCredentialDocumentExpiredMock.mockReset()
    readStoredCredentialsMock.mockReset()
    readCredentialRenewalMock.mockReset()
    upsertCredentialRenewalMock.mockReset()
    clearCredentialRenewalMock.mockReset()
    isHardwareP256SigningEnabledMock.mockReturnValue(true)
    isCredentialDocumentExpiredMock.mockReturnValue(false)
    isWalletKeyExpiredAtMock.mockReturnValue(true)
    readCredentialRenewalMock.mockReturnValue(undefined)
    readStoredCredentialsMock.mockReturnValue([mdoc])
    getEncryptedCredentialKeyRecordMock.mockReturnValue({
      credentialId: mdoc.id,
      holderDid: 'did:key:zDnaMdoc',
      alias: 'wallet.p256.mdl-1',
      credentialType: mdoc.type,
      createdAt: '2026-01-01T00:00:00.000Z',
      securityLevelHint: 'TEE',
    })
  })

  test('does not mark mdoc k_cred TTL as P3 renewal-required', () => {
    expect(() => syncCredentialKeyTtlRenewals()).not.toThrow()
    expect(upsertCredentialRenewalMock).not.toHaveBeenCalled()
    expect(clearCredentialRenewalMock).not.toHaveBeenCalled()
  })

  test('clears leftover P3 overlay written for an mdoc card', () => {
    readCredentialRenewalMock.mockReturnValue({
      credentialId: mdoc.id,
      previousHolderDid: 'did:key:zDnaMdoc',
      state: 'renewal-required',
      updatedAt: '2026-08-21T00:00:00.000Z',
    })
    expect(syncCredentialKeyTtlRenewals()).toBe(0)
    expect(clearCredentialRenewalMock).toHaveBeenCalledWith(mdoc.id)
    expect(upsertCredentialRenewalMock).not.toHaveBeenCalled()
  })
})
