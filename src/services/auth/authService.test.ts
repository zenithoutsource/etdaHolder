import * as Keychain from 'react-native-keychain'

import { getWallets, loginUser, logoutUser, registerUser } from '../../sdk/walletApi'
import { getCredentialStorage } from '../storage/storage'
import { loadSession, login, logout, register } from './authService'

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  },
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}))

jest.mock('../../sdk/walletApi', () => ({
  getWallets: jest.fn(),
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  registerUser: jest.fn(),
}))

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const loginUserMock = loginUser as jest.Mock
const registerUserMock = registerUser as jest.Mock
const logoutUserMock = logoutUser as jest.Mock
const getWalletsMock = getWallets as jest.Mock
const getGenericPasswordMock = Keychain.getGenericPassword as jest.Mock
const setGenericPasswordMock = Keychain.setGenericPassword as jest.Mock
const resetGenericPasswordMock = Keychain.resetGenericPassword as jest.Mock
const getCredentialStorageMock = getCredentialStorage as jest.Mock

function mockCredentialStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
    }),
    values,
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return storage
}

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCredentialStorage()
  })

  test('login stores session from login and wallet APIs', async () => {
    loginUserMock.mockResolvedValueOnce({
      status: 200,
      data: { id: 'account-1', token: 'session-token' },
      headers: new Headers(),
    })
    getWalletsMock.mockResolvedValueOnce({
      status: 200,
      data: { account: 'account-1', wallets: [{ id: 'wallet-1' }] },
      headers: new Headers(),
    })

    const session = await login('TEST@Example.COM', 'password')

    expect(session).toEqual({
      accountId: 'account-1',
      token: 'session-token',
      walletId: 'wallet-1',
    })
    expect(getWalletsMock).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer session-token' },
    })
    expect(setGenericPasswordMock).toHaveBeenCalledWith(
      'session',
      JSON.stringify(session),
      expect.objectContaining({ service: 'etda.wallet.session' }),
    )
  })

  test('login surfaces backend error message', async () => {
    loginUserMock.mockResolvedValueOnce({
      status: 400,
      data: { message: 'Invalid email or password' },
      headers: new Headers(),
    })

    await expect(login('test@example.com', 'wrong-password')).rejects.toThrow('Invalid email or password')
  })

  test('login clears unowned local credential records before storing new account session', async () => {
    const storage = mockCredentialStorage({
      'credential:index': JSON.stringify(['old-id-card']),
      'credential:old-id-card': '{"type":"ThaiNationalID"}',
    })
    loginUserMock.mockResolvedValueOnce({
      status: 200,
      data: { id: 'account-2', token: 'session-token' },
      headers: new Headers(),
    })
    getWalletsMock.mockResolvedValueOnce({
      status: 200,
      data: { account: 'account-2', wallets: [{ id: 'wallet-2' }] },
      headers: new Headers(),
    })

    await login('new@example.com', 'password')

    expect(storage.remove).toHaveBeenCalledWith('credential:old-id-card')
    expect(storage.remove).toHaveBeenCalledWith('credential:index')
    expect(storage.set).toHaveBeenCalledWith('credential:ownerAccountId', 'account-2')
  })

  test('login preserves local credential records owned by same account', async () => {
    const storage = mockCredentialStorage({
      'credential:ownerAccountId': 'account-1',
      'credential:index': JSON.stringify(['id-card']),
      'credential:id-card': '{"type":"ThaiNationalID"}',
    })
    loginUserMock.mockResolvedValueOnce({
      status: 200,
      data: { id: 'account-1', token: 'session-token' },
      headers: new Headers(),
    })
    getWalletsMock.mockResolvedValueOnce({
      status: 200,
      data: { account: 'account-1', wallets: [{ id: 'wallet-1' }] },
      headers: new Headers(),
    })

    await login('same@example.com', 'password')

    expect(storage.remove).not.toHaveBeenCalledWith('credential:id-card')
    expect(storage.remove).not.toHaveBeenCalledWith('credential:index')
    expect(storage.set).toHaveBeenCalledWith('credential:ownerAccountId', 'account-1')
  })

  test('register requires 201 response', async () => {
    registerUserMock.mockResolvedValueOnce({ status: 201, data: {}, headers: new Headers() })

    await expect(register('test@example.com', 'password', 'Test User')).resolves.toBeUndefined()
    expect(registerUserMock).toHaveBeenCalledWith({
      type: 'email',
      email: 'test@example.com',
      password: 'password',
      name: 'Test User',
    })
  })

  test('logout sends bearer token and clears local session', async () => {
    getGenericPasswordMock.mockResolvedValueOnce({
      username: 'session',
      password: JSON.stringify({ accountId: 'account-1', token: 'session-token', walletId: 'wallet-1' }),
    })
    logoutUserMock.mockResolvedValueOnce({ status: 200, data: {}, headers: new Headers() })

    await logout()

    expect(logoutUserMock).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer session-token' },
    })
    expect(resetGenericPasswordMock).toHaveBeenCalledWith({ service: 'etda.wallet.session' })
  })

  test('logout clears local session when server logout fails', async () => {
    getGenericPasswordMock.mockResolvedValueOnce({
      username: 'session',
      password: JSON.stringify({ accountId: 'account-1', token: 'session-token', walletId: 'wallet-1' }),
    })
    logoutUserMock.mockRejectedValueOnce(new Error('network failed'))

    await logout()

    expect(resetGenericPasswordMock).toHaveBeenCalledWith({ service: 'etda.wallet.session' })
  })

  test('loadSession returns null for invalid stored JSON', async () => {
    getGenericPasswordMock.mockResolvedValueOnce({
      username: 'session',
      password: 'not-json',
    })

    await expect(loadSession()).resolves.toBeNull()
  })
})
