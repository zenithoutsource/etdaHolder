import { hasWalletPin, setWalletPin, verifyWalletPin } from './walletPin'
import { getCredentialStorage, isCredentialStorageReady } from '../storage/storage'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
  hasWalletPinMeta: jest.fn(() => false),
  isCredentialStorageReady: jest.fn(() => true),
  persistWalletPinMeta: jest.fn(),
  provisionStoragePinFallback: jest.fn(),
  verifyWalletPinMeta: jest.fn(() => false),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock
const isCredentialStorageReadyMock = isCredentialStorageReady as jest.Mock
const {
  hasWalletPinMeta,
  persistWalletPinMeta,
  provisionStoragePinFallback,
  verifyWalletPinMeta,
} = jest.requireMock('../storage/storage') as {
  hasWalletPinMeta: jest.Mock
  persistWalletPinMeta: jest.Mock
  provisionStoragePinFallback: jest.Mock
  verifyWalletPinMeta: jest.Mock
}

function mockStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    values,
  }
  isCredentialStorageReadyMock.mockReturnValue(true)
  getCredentialStorageMock.mockReturnValue(storage)
  return storage
}

describe('walletPin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isCredentialStorageReadyMock.mockReturnValue(true)
    hasWalletPinMeta.mockReturnValue(false)
    verifyWalletPinMeta.mockReturnValue(false)
  })

  test('reports that no PIN exists before setup', () => {
    mockStorage()

    expect(hasWalletPin()).toBe(false)
    expect(verifyWalletPin('123456')).toBe(false)
  })

  test('treats missing credential storage as no PIN instead of throwing', () => {
    isCredentialStorageReadyMock.mockReturnValue(false)
    getCredentialStorageMock.mockImplementation(() => {
      throw new Error('StorageNotInitialized')
    })

    expect(hasWalletPin()).toBe(false)
    expect(verifyWalletPin('123456')).toBe(false)
    expect(getCredentialStorageMock).not.toHaveBeenCalled()
  })

  test('uses PIN meta when credential storage is not initialized', () => {
    isCredentialStorageReadyMock.mockReturnValue(false)
    hasWalletPinMeta.mockReturnValue(true)
    verifyWalletPinMeta.mockImplementation((pin: string) => pin === '123456')
    getCredentialStorageMock.mockImplementation(() => {
      throw new Error('StorageNotInitialized')
    })

    expect(hasWalletPin()).toBe(true)
    expect(verifyWalletPin('123456')).toBe(true)
    expect(verifyWalletPin('654321')).toBe(false)
    expect(getCredentialStorageMock).not.toHaveBeenCalled()
  })

  test('persists PIN meta without opening credential storage', () => {
    isCredentialStorageReadyMock.mockReturnValue(false)
    getCredentialStorageMock.mockImplementation(() => {
      throw new Error('StorageNotInitialized')
    })

    expect(() => setWalletPin('123456')).not.toThrow()
    expect(persistWalletPinMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        salt: expect.any(String),
        hash: expect.any(String),
      }),
    )
    expect(getCredentialStorageMock).not.toHaveBeenCalled()
    expect(provisionStoragePinFallback).not.toHaveBeenCalled()
  })

  test('stores a hashed six-digit PIN and verifies it', () => {
    const storage = mockStorage()

    setWalletPin('123456')

    const storedRaw = storage.values.get('wallet:pin:v1')
    expect(storedRaw).toEqual(expect.any(String))
    expect(storedRaw).not.toContain('123456')
    expect(hasWalletPin()).toBe(true)
    expect(verifyWalletPin('123456')).toBe(true)
    expect(verifyWalletPin('654321')).toBe(false)
    expect(persistWalletPinMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        salt: expect.any(String),
        hash: expect.any(String),
      }),
    )
    expect(provisionStoragePinFallback).toHaveBeenCalledWith('123456')
  })

  test('rejects non-six-digit PIN values', () => {
    mockStorage()

    expect(() => setWalletPin('12345')).toThrow('InvalidWalletPin')
    expect(() => setWalletPin('abcdef')).toThrow('InvalidWalletPin')
    expect(verifyWalletPin('abcdef')).toBe(false)
  })
})
