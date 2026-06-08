import { hasWalletPin, setWalletPin, verifyWalletPin } from './walletPin'
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
    values,
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return storage
}

describe('walletPin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('reports that no PIN exists before setup', () => {
    mockStorage()

    expect(hasWalletPin()).toBe(false)
    expect(verifyWalletPin('123456')).toBe(false)
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
  })

  test('rejects non-six-digit PIN values', () => {
    mockStorage()

    expect(() => setWalletPin('12345')).toThrow('InvalidWalletPin')
    expect(() => setWalletPin('abcdef')).toThrow('InvalidWalletPin')
    expect(verifyWalletPin('abcdef')).toBe(false)
  })
})
