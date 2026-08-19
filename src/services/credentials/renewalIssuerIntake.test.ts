import {
  abortRenewalIssuerIntake,
  pairRenewalReplacementForSavedCredential,
  readRenewalIntakePendingKeyForOffer,
  startRenewalIssuerIntake,
} from './renewalIssuerIntake'
import { readCredentialRenewal, writeCredentialRenewal } from './credentialKeyRenewal'
import { getCredentialStorage } from '../storage/storage'
import { getPreviousHolderDid } from '../crypto/crypto'
import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  createPendingHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  hasHardwareCredentialKey,
  resolveHardwareCredentialHolderDid,
} from '../crypto/hardwareCredentialSigningKey'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { syncPushTokenRegistration } from '../notifications/pushNotificationService'
import { recordCredentialRenewalCompleted } from '../history/walletHistoryRecording'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('./credentialHolderBinding', () => ({
  readCredentialHolderDid: () => 'did:key:old',
}))

jest.mock('../crypto/crypto', () => ({
  getPreviousHolderDid: jest.fn(() => 'did:key:old'),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../notifications/pushNotificationService', () => ({
  syncPushTokenRegistration: jest.fn(),
}))

jest.mock('../history/walletHistoryRecording', () => ({
  recordCredentialRenewalCompleted: jest.fn(),
}))

jest.mock('../crypto/hardwareCredentialSigningKey', () => ({
  createPendingHardwareCredentialKey: jest.fn(),
  discardPendingHardwareCredentialKey: jest.fn(async () => undefined),
  hasHardwareCredentialKey: jest.fn(() => false),
  resolveHardwareCredentialHolderDid: jest.fn(),
  credentialRequiresHardwareReissue: jest.fn(() => false),
}))

jest.mock('@/src/config/hardwareSigningPolicy', () => ({
  isHardwareP256SigningEnabled: jest.fn(() => true),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock
const createPendingHardwareCredentialKeyMock =
  createPendingHardwareCredentialKey as jest.MockedFunction<typeof createPendingHardwareCredentialKey>
const discardPendingHardwareCredentialKeyMock =
  discardPendingHardwareCredentialKey as jest.MockedFunction<
    typeof discardPendingHardwareCredentialKey
  >
const hasHardwareCredentialKeyMock = hasHardwareCredentialKey as jest.MockedFunction<
  typeof hasHardwareCredentialKey
>
const resolveHardwareCredentialHolderDidMock =
  resolveHardwareCredentialHolderDid as jest.MockedFunction<
    typeof resolveHardwareCredentialHolderDid
  >
const isHardwareP256SigningEnabledMock = isHardwareP256SigningEnabled as jest.MockedFunction<
  typeof isHardwareP256SigningEnabled
>
const syncPushTokenRegistrationMock = syncPushTokenRegistration as jest.MockedFunction<
  typeof syncPushTokenRegistration
>
const recordCredentialRenewalCompletedMock =
  recordCredentialRenewalCompleted as jest.MockedFunction<
    typeof recordCredentialRenewalCompleted
  >

const mockCredential: VerifiableCredentialRecord = {
  id: 'urn:uuid:old',
  type: 'ThaiNationalID',
  rawVc: 'eyJ.test',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

function mockStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
      return true
    }),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { storage, values }
}

function seedCredential(values: Map<string, string>, credential: VerifiableCredentialRecord) {
  values.set('credential:index', JSON.stringify([credential.id]))
  values.set(`credential:${credential.id}`, JSON.stringify(credential))
}

function seedRenewalRequired(credentialId = mockCredential.id) {
  writeCredentialRenewal({
    credentialId,
    previousHolderDid: 'did:key:old',
    state: 'renewal-required',
    updatedAt: new Date().toISOString(),
  })
}

describe('startRenewalIssuerIntake', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hasHardwareCredentialKeyMock.mockReturnValue(false)
    isHardwareP256SigningEnabledMock.mockReturnValue(true)
    discardPendingHardwareCredentialKeyMock.mockResolvedValue(undefined)
    syncPushTokenRegistrationMock.mockResolvedValue(true)
    ;(getPreviousHolderDid as jest.Mock).mockReturnValue('did:key:old')
    global.fetch = jest.fn()
  })

  test('mints pending k_cred, stays renewal-required, and does not POST the stub', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    seedRenewalRequired()
    hasHardwareCredentialKeyMock.mockReturnValue(true)
    createPendingHardwareCredentialKeyMock.mockResolvedValue('pending-hw-1')
    resolveHardwareCredentialHolderDidMock.mockReturnValue('did:key:pending-new')

    const intake = await startRenewalIssuerIntake(mockCredential.id)

    expect(intake).toEqual({
      credentialId: mockCredential.id,
      credentialType: 'ThaiNationalID',
      pendingCredentialKeyId: 'pending-hw-1',
    })
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
    expect(readCredentialRenewal(mockCredential.id)?.pendingCredentialKeyId).toBe('pending-hw-1')
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(syncPushTokenRegistrationMock).toHaveBeenCalledWith('did:key:pending-new')
  })

  test('does not mint when the card has no hardware key', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    seedRenewalRequired()

    const intake = await startRenewalIssuerIntake(mockCredential.id)

    expect(createPendingHardwareCredentialKeyMock).not.toHaveBeenCalled()
    expect(intake.pendingCredentialKeyId).toBeUndefined()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('rejects document-expired cards without minting', async () => {
    const { values } = mockStorage()
    const expired = {
      ...mockCredential,
      expiresAt: '2020-01-01T00:00:00.000Z',
    }
    seedCredential(values, expired)
    seedRenewalRequired()
    hasHardwareCredentialKeyMock.mockReturnValue(true)

    await expect(startRenewalIssuerIntake(expired.id)).rejects.toThrow(
      'CredentialRenewalNotSubmittable',
    )
    expect(createPendingHardwareCredentialKeyMock).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('abortRenewalIssuerIntake', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    discardPendingHardwareCredentialKeyMock.mockResolvedValue(undefined)
  })

  test('discards the pending key and stays renewal-required', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      pendingCredentialKeyId: 'pending-hw-1',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    await abortRenewalIssuerIntake(mockCredential.id)

    expect(discardPendingHardwareCredentialKeyMock).toHaveBeenCalledWith('pending-hw-1')
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
    expect(readCredentialRenewal(mockCredential.id)?.pendingCredentialKeyId).toBeUndefined()
  })
})

describe('pairRenewalReplacementForSavedCredential', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('pairs a same-type claim onto cleanup-pending / renewed-active', () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    seedRenewalRequired()

    const replacement: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-08-19T00:00:00.000Z',
    }

    expect(pairRenewalReplacementForSavedCredential(replacement)).toBe(true)
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('cleanup-pending')
    expect(readCredentialRenewal(mockCredential.id)?.replacementCredentialId).toBe(replacement.id)
    expect(readCredentialRenewal(replacement.id)?.state).toBe('renewed-active')
    expect(recordCredentialRenewalCompletedMock).toHaveBeenCalledWith(replacement)
  })

  test('does not pair a different credential type', () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    seedRenewalRequired()

    expect(
      pairRenewalReplacementForSavedCredential({
        ...mockCredential,
        id: 'urn:uuid:dl',
        type: 'DLTDrivingLicence',
      }),
    ).toBe(false)
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
  })
})

describe('readRenewalIntakePendingKeyForOffer', () => {
  test('returns the pending key for a same-type renewal-required card', () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      pendingCredentialKeyId: 'pending-hw-1',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const offer = {
      credentialConfigurations: [
        { id: 'IDCard_dc+sd-jwt', format: 'dc+sd-jwt', rawConfiguration: {} },
      ],
      issuer: 'https://issuer.example',
    } as ResolvedCredentialOffer

    expect(readRenewalIntakePendingKeyForOffer(offer)).toBe('pending-hw-1')
  })
})
