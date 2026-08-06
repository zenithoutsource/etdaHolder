import {
  maybeConsumeSingleUseCredential,
} from './singleUseCredentialConsumption'
import {
  readCredentialLifecycleStatus,
  recordCredentialLifecycleAction,
} from './credentialLifecycle'
import { getCredentialStorage } from '../storage/storage'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

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
  return storage
}

describe('maybeConsumeSingleUseCredential', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStorage()
  })

  test('marks MedicalCertificate as used after first consumption', () => {
    const result = maybeConsumeSingleUseCredential({
      credentialId: 'med-1',
      credentialType: 'MedicalCertificate',
    })

    expect(result).toEqual({ consumed: true })
    expect(readCredentialLifecycleStatus('med-1')?.status).toBe('used')
  })

  test('does not consume ChulalongkornUniversityTranscript', () => {
    const result = maybeConsumeSingleUseCredential({
      credentialId: 'transcript-1',
      credentialType: 'ChulalongkornUniversityTranscript',
    })

    expect(result).toEqual({ consumed: false })
    expect(readCredentialLifecycleStatus('transcript-1')).toBeUndefined()
  })

  test('does not consume ThaiNationalID', () => {
    const result = maybeConsumeSingleUseCredential({
      credentialId: 'thai-id-1',
      credentialType: 'ThaiNationalID',
    })

    expect(result).toEqual({ consumed: false })
    expect(readCredentialLifecycleStatus('thai-id-1')).toBeUndefined()
  })

  test('is idempotent when credential is already used', () => {
    recordCredentialLifecycleAction('med-1', 'Used', 'system')

    const result = maybeConsumeSingleUseCredential({
      credentialId: 'med-1',
      credentialType: 'MedicalCertificate',
    })

    expect(result).toEqual({ consumed: false })
  })

  test('does not consume when credential is already revoked', () => {
    recordCredentialLifecycleAction('med-1', 'Revoke', 'holder')

    const result = maybeConsumeSingleUseCredential({
      credentialId: 'med-1',
      credentialType: 'MedicalCertificate',
    })

    expect(result).toEqual({ consumed: false })
    expect(readCredentialLifecycleStatus('med-1')?.status).toBe('revoked')
  })
})
