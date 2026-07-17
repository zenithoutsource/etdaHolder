import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { readCredentialRenewal } from './credentialKeyRenewal'
import { readFirstPendingRenewalCredentialId } from './pendingRenewalNavigation'
import { readStoredCredentials } from './storedCredentials'

jest.mock('./credentialKeyRenewal', () => ({
  readCredentialRenewal: jest.fn(),
}))

jest.mock('./storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

const readCredentialRenewalMock = readCredentialRenewal as jest.Mock
const readStoredCredentialsMock = readStoredCredentials as jest.Mock

const baseRecord = (
  id: string,
  type = 'ThaiNationalID',
): VerifiableCredentialRecord => ({
  id,
  type,
  issuedAt: '2026-01-01T00:00:00.000Z',
  rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
  claims: {},
})

const renewalRecord = (
  credentialId: string,
  state:
    | 'renewal-required'
    | 'renewal-processing'
    | 'cleanup-pending'
    | 'old-revoked',
  replacementCredentialId?: string,
) => ({
  credentialId,
  previousHolderDid: 'did:key:old',
  state,
  replacementCredentialId,
  updatedAt: '2026-06-26T00:00:00.000Z',
})

describe('readFirstPendingRenewalCredentialId', () => {
  beforeEach(() => {
    readCredentialRenewalMock.mockReset()
    readStoredCredentialsMock.mockReset()
    readStoredCredentialsMock.mockReturnValue([])
  })

  test('returns first renewal-required credential in list order', () => {
    const credentials = [
      baseRecord('cred-processing'),
      baseRecord('cred-required'),
      baseRecord('cred-cleanup'),
    ]

    readCredentialRenewalMock.mockImplementation((id: string) => {
      if (id === 'cred-processing') {
        return renewalRecord('cred-processing', 'renewal-processing')
      }
      if (id === 'cred-required') {
        return renewalRecord('cred-required', 'renewal-required')
      }
      if (id === 'cred-cleanup') {
        return renewalRecord('cred-cleanup', 'cleanup-pending', 'new-cred')
      }
      return undefined
    })

    expect(readFirstPendingRenewalCredentialId(credentials)).toBe('cred-required')
  })

  test('returns first renewal-processing when no renewal-required exists', () => {
    const credentials = [
      baseRecord('cred-cleanup'),
      baseRecord('cred-processing'),
    ]

    readCredentialRenewalMock.mockImplementation((id: string) => {
      if (id === 'cred-cleanup') {
        return renewalRecord('cred-cleanup', 'cleanup-pending', 'new-cred')
      }
      if (id === 'cred-processing') {
        return renewalRecord('cred-processing', 'renewal-processing')
      }
      return undefined
    })

    expect(readFirstPendingRenewalCredentialId(credentials)).toBe('cred-processing')
  })

  test('returns first cleanup-awaiting credential when no higher-priority renewal exists', () => {
    const credentials = [baseRecord('cred-old-revoked'), baseRecord('cred-cleanup')]

    readCredentialRenewalMock.mockImplementation((id: string) => {
      if (id === 'cred-old-revoked') {
        return renewalRecord('cred-old-revoked', 'old-revoked', 'new-cred')
      }
      if (id === 'cred-cleanup') {
        return renewalRecord('cred-cleanup', 'cleanup-pending', 'new-cred-2')
      }
      return undefined
    })

    expect(readFirstPendingRenewalCredentialId(credentials)).toBe('cred-old-revoked')
  })

  test('returns undefined when no pending renewal exists', () => {
    const credentials = [baseRecord('cred-active')]

    readCredentialRenewalMock.mockImplementation((id: string) => {
      if (id === 'cred-active') {
        return {
          credentialId: 'cred-active',
          previousHolderDid: 'did:key:old',
          state: 'renewed-active',
          updatedAt: '2026-06-26T00:00:00.000Z',
        }
      }
      return undefined
    })

    expect(readFirstPendingRenewalCredentialId(credentials)).toBeUndefined()
  })

  test('defaults to readStoredCredentials when credentials are omitted', () => {
    const credentials = [baseRecord('stored-cred')]
    readStoredCredentialsMock.mockReturnValue(credentials)
    readCredentialRenewalMock.mockImplementation((id: string) => {
      if (id === 'stored-cred') {
        return renewalRecord('stored-cred', 'renewal-required')
      }
      return undefined
    })

    expect(readFirstPendingRenewalCredentialId()).toBe('stored-cred')
    expect(readStoredCredentialsMock).toHaveBeenCalledTimes(1)
  })
})
