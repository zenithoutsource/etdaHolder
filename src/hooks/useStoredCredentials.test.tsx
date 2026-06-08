import { renderHook, waitFor } from '@testing-library/react-native'

import { useStoredCredentials } from './useStoredCredentials'
import { getCredentialStorage } from '../services/storage/storage'

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}))

jest.mock('../services/storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

describe('useStoredCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('surfaces storage initialization errors instead of reporting an empty wallet', async () => {
    getCredentialStorageMock.mockImplementation(() => {
      throw new Error('StorageNotInitialized')
    })

    const { result } = renderHook(() => useStoredCredentials())

    await waitFor(() => {
      expect(result.current.error).toBe('Wallet storage is not ready.')
    })
    expect(result.current.status).toBe('storage-not-ready')
    expect(result.current.credentials).toEqual([])
  })
})
