import {
  claimReadyRenewal,
  confirmOldCredentialCleanup,
  refreshAndCompleteRenewals,
  repairInconsistentRenewalPairs,
  requestCredentialRenewal,
  submitRenewalRequest,
} from './credentialRenewalService'
import { findCleanupPendingForCredentialType } from './renewalCleanupNotification'
import { readCredentialRenewal, writeCredentialRenewal } from './credentialKeyRenewal'
import { readStoredCredentials } from './storedCredentials'
import { getCredentialStorage } from '../storage/storage'
import { getPreviousHolderDid } from '../crypto/crypto'
import { logWalletError } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

import { presentOldCredentialForRenewal } from './renewalOid4VpPresentation'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('./credentialHolderBinding', () => ({
  readCredentialHolderDid: () => 'did:key:old',
}))

jest.mock('../crypto/crypto', () => ({
  getHolderDid: () => 'did:key:new',
  getPreviousHolderDid: jest.fn(() => 'did:key:old'),
}))

jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../crypto/walletKeyRotation', () => ({
  clearWalletKeyRotationRecord: jest.fn(),
}))

jest.mock('../notifications/pushNotificationService', () => ({
  syncPushTokenRegistration: jest.fn(),
}))

jest.mock('./renewalOid4VpPresentation', () => ({
  presentOldCredentialForRenewal: jest.fn().mockResolvedValue(undefined),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

const presentOldCredentialForRenewalMock = presentOldCredentialForRenewal as jest.MockedFunction<
  typeof presentOldCredentialForRenewal
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

describe('submitRenewalRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    presentOldCredentialForRenewalMock.mockResolvedValue(undefined)
  })

  test('sets renewal-processing on HTTP 201 and does not claim', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const claimMock = jest.fn()
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        accepted: true,
        authorizationRequest: 'openid4vp://authorize?client_id=redirect_uri:http://localhost:4000/wallet-api/dev/wallet/renewal-vp/response',
      }),
    })

    await submitRenewalRequest(mockCredential.id, {
      fetchImpl: fetchMock,
      claimCredential: claimMock,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(presentOldCredentialForRenewalMock).toHaveBeenCalledWith(
      expect.stringContaining('openid4vp://authorize'),
      mockCredential,
      expect.objectContaining({ fetchImpl: fetchMock }),
    )
    expect(claimMock).not.toHaveBeenCalled()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
  })

  test('clears a stale ready offer marker when a new renewal request is submitted', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      readyOfferUri: 'openid-credential-offer://stale',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        accepted: true,
        authorizationRequest: 'openid4vp://authorize?nonce=renewal',
      }),
    })

    await submitRenewalRequest(mockCredential.id, { fetchImpl: fetchMock })

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()
  })

  test('re-registers the current push token for the rotated holder DID before requesting renewal', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        accepted: true,
        authorizationRequest: 'openid4vp://authorize?nonce=1',
      }),
    })
    const syncPushTokenRegistration = jest.fn().mockResolvedValue(undefined)

    await submitRenewalRequest(mockCredential.id, {
      fetchImpl: fetchMock,
      syncPushTokenRegistration,
    })

    expect(syncPushTokenRegistration).toHaveBeenCalledWith('did:key:new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(presentOldCredentialForRenewalMock).toHaveBeenCalled()
  })

  test('stays renewal-required on HTTP failure', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 502 })

    await expect(
      submitRenewalRequest(mockCredential.id, { fetchImpl: fetchMock }),
    ).rejects.toThrow('CredentialRenewalRequestFailed')

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
  })

  test('stays renewal-required when silent OID4VP fails', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        accepted: true,
        authorizationRequest: 'openid4vp://authorize?nonce=1',
      }),
    })
    presentOldCredentialForRenewalMock.mockRejectedValueOnce(new Error('PresentationSubmissionFailed'))

    await expect(
      submitRenewalRequest(mockCredential.id, { fetchImpl: fetchMock }),
    ).rejects.toThrow('PresentationSubmissionFailed')

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
  })

  test('fails fast when the retained previous key no longer matches the credential binding', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    // Simulate a second rotation having overwritten the previous key slot:
    // the retained previous DID (did:key:gen2) no longer equals the VC binding
    // (did:key:old from the mocked readCredentialHolderDid).
    ;(getPreviousHolderDid as jest.Mock).mockReturnValueOnce('did:key:gen2')

    const fetchMock = jest.fn()

    await expect(
      submitRenewalRequest(mockCredential.id, { fetchImpl: fetchMock }),
    ).rejects.toThrow('CredentialRenewalPreviousKeyUnavailable')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(presentOldCredentialForRenewalMock).not.toHaveBeenCalled()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
  })

  test('throws when already submitted', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await expect(submitRenewalRequest(mockCredential.id)).rejects.toThrow(
      'CredentialRenewalAlreadySubmitted',
    )
  })
})

describe('refreshAndCompleteRenewals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not resolve or claim an offer-ready renewal during passive refresh', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    const replacement: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        renewals: [
          {
            credentialId: mockCredential.id,
            state: 'offer-ready',
            offerUri: 'openid-credential-offer://test',
          },
        ],
      }),
    })

    const resolveOfferMock = jest.fn().mockResolvedValue({ offer: 'resolved' })
    const claimMock = jest.fn().mockResolvedValue(replacement)

    await refreshAndCompleteRenewals({
      fetchImpl: fetchMock,
      resolveOffer: resolveOfferMock,
      claimCredential: claimMock,
    })

    expect(resolveOfferMock).not.toHaveBeenCalled()
    expect(claimMock).not.toHaveBeenCalled()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBe(
      'openid-credential-offer://test',
    )
    expect(readCredentialRenewal(replacement.id)).toBeUndefined()
  })

  test('keeps ready offer marker when offer-ready status has no usable URI', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      readyOfferUri: 'openid-credential-offer://stale',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await refreshAndCompleteRenewals({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [
            {
              credentialId: mockCredential.id,
              state: 'offer-ready',
              offerUri: '   ',
            },
          ],
        }),
      }),
    })

    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBe(
      'openid-credential-offer://stale',
    )
  })

  test('keeps ready offer marker when server status is no longer offer-ready', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      readyOfferUri: 'openid-credential-offer://ready',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await refreshAndCompleteRenewals({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [
            {
              credentialId: mockCredential.id,
              state: 'requested',
            },
          ],
        }),
      }),
    })

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBe(
      'openid-credential-offer://ready',
    )
  })

  test('claims a ready renewal and writes cleanup-pending plus renewed-active states', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    const replacement: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }

    const resolveOfferMock = jest.fn().mockResolvedValue({ offer: 'resolved' })
    const claimMock = jest.fn().mockResolvedValue(replacement)

    await claimReadyRenewal(mockCredential.id, {
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [{ credentialId: mockCredential.id, state: 'offer-ready', offerUri: 'openid-credential-offer://test' }],
        }),
      }),
      resolveOffer: resolveOfferMock,
      claimCredential: claimMock,
    })

    expect(resolveOfferMock).toHaveBeenCalledWith('openid-credential-offer://test')
    expect(claimMock).toHaveBeenCalledWith({ offer: 'resolved' })
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('cleanup-pending')
    expect(readCredentialRenewal(mockCredential.id)?.replacementCredentialId).toBe(replacement.id)
    const replacementRecord = readCredentialRenewal(replacement.id)
    expect(replacementRecord?.state).toBe('renewed-active')
    expect(replacementRecord?.replacementCredentialId).toBeUndefined()
  })

  test('clears stale readiness after a failed claim before a resubmission becomes ready', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      readyOfferUri: 'openid-credential-offer://stale',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await expect(
      claimReadyRenewal(mockCredential.id, {
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [
            {
              credentialId: mockCredential.id,
              state: 'offer-ready',
              offerUri: 'openid-credential-offer://test',
            },
          ],
        }),
      }),
      resolveOffer: jest.fn().mockResolvedValue({ offer: 'resolved' }),
      claimCredential: jest.fn().mockRejectedValue(new Error('E_CRYPTO_FAILED')),
      }),
    ).rejects.toThrow('E_CRYPTO_FAILED')

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()

    await submitRenewalRequest(mockCredential.id, {
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          accepted: true,
          authorizationRequest: 'openid4vp://authorize?nonce=resubmit',
        }),
      }),
    })

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()

    await refreshAndCompleteRenewals({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [
            {
              credentialId: mockCredential.id,
              state: 'offer-ready',
              offerUri: 'openid-credential-offer://resubmitted',
            },
          ],
        }),
      }),
    })

    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBe(
      'openid-credential-offer://resubmitted',
    )
  })

  test('logs and throws a redacted error when explicit renewal status refresh is not OK', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      readyOfferUri: 'openid-credential-offer://stale',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await expect(
      claimReadyRenewal(mockCredential.id, {
        fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 503 }),
      }),
    ).rejects.toThrow('CredentialRenewalStatusFailed: HTTP 503')

    expect(logWalletError).toHaveBeenCalledWith(
      'renewal',
      'status-refresh-failed',
      expect.any(Error),
      { credentialId: mockCredential.id },
    )
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()
  })

  test('clears readiness and rejects with a logged error when explicit status payload is malformed', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      readyOfferUri: 'openid-credential-offer://stale',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await expect(
      claimReadyRenewal(mockCredential.id, {
        fetchImpl: jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ renewals: {} }),
        }),
      }),
    ).rejects.toThrow('CredentialRenewalStatusMalformed')

    expect(logWalletError).toHaveBeenCalledWith(
      'renewal',
      'status-refresh-failed',
      expect.any(Error),
      { credentialId: mockCredential.id },
    )
    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()
  })

  test('clears a stale ready offer marker when explicit refresh has no matching ready offer', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    values.set(
      `credential:renewal:${mockCredential.id}`,
      JSON.stringify({
        credentialId: mockCredential.id,
        previousHolderDid: 'did:key:old',
        readyOfferUri: 'openid-credential-offer://stale',
        state: 'renewal-processing',
        updatedAt: new Date().toISOString(),
      }),
    )

    const resolveOfferMock = jest.fn()
    const claimMock = jest.fn()
    await claimReadyRenewal(mockCredential.id, {
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ renewals: [] }),
      }),
      resolveOffer: resolveOfferMock,
      claimCredential: claimMock,
    })

    expect(readCredentialRenewal(mockCredential.id)?.readyOfferUri).toBeUndefined()
    expect(resolveOfferMock).not.toHaveBeenCalled()
    expect(claimMock).not.toHaveBeenCalled()
  })

  test('shares the explicit claim in-flight guard across repeated receive actions', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    const replacement: VerifiableCredentialRecord = {
      id: 'urn:uuid:new',
      type: 'ThaiNationalID',
      rawVc: 'eyJ.new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }
    let finishClaim: (record: VerifiableCredentialRecord) => void
    let notifyClaimStarted: () => void
    const claimStarted = new Promise<void>((resolve) => {
      notifyClaimStarted = resolve
    })
    const claimMock = jest.fn(
      () =>
        new Promise<VerifiableCredentialRecord>((resolve) => {
          finishClaim = resolve
          notifyClaimStarted!()
        }),
    )
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        renewals: [
          {
            credentialId: mockCredential.id,
            state: 'offer-ready',
            offerUri: 'openid-credential-offer://test',
          },
        ],
      }),
    })

    const firstClaim = claimReadyRenewal(mockCredential.id, {
      fetchImpl: fetchMock,
      resolveOffer: jest.fn().mockResolvedValue({ offer: 'resolved' }),
      claimCredential: claimMock,
    })
    const secondClaim = claimReadyRenewal(mockCredential.id, {
      fetchImpl: fetchMock,
      resolveOffer: jest.fn().mockResolvedValue({ offer: 'resolved' }),
      claimCredential: claimMock,
    })

    await claimStarted

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(claimMock).toHaveBeenCalledTimes(1)

    finishClaim!(replacement)
    await Promise.all([firstClaim, secondClaim])
  })

  test('transitions cleanup-pending to old-revoked when server confirms revocation', async () => {
    const { values } = mockStorage()
    seedCredential(values, mockCredential)
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      replacementCredentialId: 'urn:uuid:new',
      renewedAt: '2026-06-26T00:00:00.000Z',
      state: 'cleanup-pending',
      updatedAt: new Date().toISOString(),
    })

    await refreshAndCompleteRenewals({
      fetchImpl: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          renewals: [{ credentialId: mockCredential.id, state: 'revoked', revokedAt: '2026-06-26T12:00:00.000Z' }],
        }),
      }),
    })

    const record = readCredentialRenewal(mockCredential.id)
    expect(record?.state).toBe('old-revoked')
    expect(record?.revokedAt).toBe('2026-06-26T12:00:00.000Z')
  })
})

describe('requestCredentialRenewal', () => {
  test('throws when the deprecated synchronous renewal API is used', async () => {
    await expect(requestCredentialRenewal(mockCredential.id)).rejects.toThrow(
      'CredentialRenewalManualReceiveRequired',
    )
  })
})

describe('repairInconsistentRenewalPairs', () => {
  test('moves stale old credential to cleanup-pending when renewed-active sibling exists', () => {
    const { values } = mockStorage()
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

    seedCredential(values, oldCredential)
    values.set('credential:index', JSON.stringify([oldCredential.id, newCredential.id]))
    values.set(`credential:${newCredential.id}`, JSON.stringify(newCredential))
    writeCredentialRenewal({
      credentialId: oldCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })
    writeCredentialRenewal({
      credentialId: newCredential.id,
      previousHolderDid: 'did:key:old',
      replacementCredentialId: newCredential.id,
      state: 'renewed-active',
      renewedAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })

    repairInconsistentRenewalPairs()

    expect(readCredentialRenewal(oldCredential.id)?.state).toBe('cleanup-pending')
    expect(readCredentialRenewal(oldCredential.id)?.replacementCredentialId).toBe(newCredential.id)
  })
})

describe('confirmOldCredentialCleanup', () => {
  test('removes old credential and clears renewed-active metadata on replacement', async () => {
    const { values } = mockStorage()
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
    writeCredentialRenewal({
      credentialId: newCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewed-active',
      updatedAt: '2026-06-26T00:00:00.000Z',
    })

    await confirmOldCredentialCleanup(oldCredential.id)

    expect(readStoredCredentials().map((record) => record.id)).toEqual([newCredential.id])
    expect(readCredentialRenewal(oldCredential.id)).toBeUndefined()
    expect(readCredentialRenewal(newCredential.id)).toBeUndefined()
    expect(findCleanupPendingForCredentialType('ThaiNationalID')).toBeUndefined()
  })
})
