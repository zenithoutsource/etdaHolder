import { finalizeCredentialClaim } from './finalizeCredentialClaim'
import { deleteExpiredCredentialAfterReissue } from './documentExpiryCleanup'
import { pairRenewalReplacementForSavedCredential } from './renewalIssuerIntake'
import { readStoredCredentials } from './storedCredentials'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('./renewalIssuerIntake', () => ({
  pairRenewalReplacementForSavedCredential: jest.fn(() => false),
}))

jest.mock('./documentExpiryCleanup', () => ({
  deleteExpiredCredentialAfterReissue: jest.fn(),
}))

jest.mock('./storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

const pairMock = pairRenewalReplacementForSavedCredential as jest.MockedFunction<
  typeof pairRenewalReplacementForSavedCredential
>
const deleteMock = deleteExpiredCredentialAfterReissue as jest.MockedFunction<
  typeof deleteExpiredCredentialAfterReissue
>
const readStoredMock = readStoredCredentials as jest.MockedFunction<typeof readStoredCredentials>

const newRecord: VerifiableCredentialRecord = {
  id: 'new-transcript',
  type: 'ChulalongkornUniversityTranscript',
  rawVc: 'vc-new',
  claims: {},
  issuedAt: '2026-08-24T00:00:00.000Z',
  issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
}

describe('finalizeCredentialClaim', () => {
  beforeEach(() => {
    pairMock.mockReset()
    pairMock.mockReturnValue(false)
    deleteMock.mockReset()
    readStoredMock.mockReset()
  })

  test('attempts P3 pairing on the new record', () => {
    readStoredMock.mockReturnValue([newRecord])
    finalizeCredentialClaim(newRecord)
    expect(pairMock).toHaveBeenCalledWith(newRecord)
  })

  test('removes calendar-expired same-family sibling', () => {
    const expiredSibling: VerifiableCredentialRecord = {
      id: 'old-transcript',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'vc-old',
      claims: {},
      issuedAt: '2020-01-01T00:00:00.000Z',
      issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
      expiresAt: '2020-06-01T00:00:00.000Z',
    }
    readStoredMock.mockReturnValue([expiredSibling, newRecord])
    finalizeCredentialClaim(newRecord)
    expect(deleteMock).toHaveBeenCalledWith('old-transcript')
  })

  test('does not remove active same-family sibling', () => {
    const activeSibling: VerifiableCredentialRecord = {
      id: 'old-transcript',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'vc-old',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
      issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
    }
    readStoredMock.mockReturnValue([activeSibling, newRecord])
    finalizeCredentialClaim(newRecord)
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
