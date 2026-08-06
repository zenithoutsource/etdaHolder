import * as Keychain from 'react-native-keychain'

import {
  checkEmailStatus as checkEmailStatusApi,
  getWallets,
  loginUser,
  logoutUser,
  registerUser,
  requestPinReset as requestPinResetApi,
} from '../../sdk/walletApi'
import { getCredentialStorage } from '../storage/storage'
import { checkEmailStatus, loadSession, login, logout, register, requestPinReset as requestPinResetService } from './authService'

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  },
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}))

jest.mock('../../sdk/walletApi', () => ({
  checkEmailStatus: jest.fn(),
  confirmPinReset: jest.fn(),
  getWallets: jest.fn(),
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  registerUser: jest.fn(),
  requestPinReset: jest.fn(),
}))

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('./walletPin', () => ({
  setWalletPin: jest.fn(),
  hasWalletPin: jest.fn(() => true),
  verifyWalletPin: jest.fn(),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

const loginUserMock = loginUser as jest.Mock
const registerUserMock = registerUser as jest.Mock
const checkEmailStatusMock = checkEmailStatusApi as jest.Mock
const requestPinResetMock = requestPinResetApi as jest.Mock
const logoutUserMock = logoutUser as jest.Mock
const getWalletsMock = getWallets as jest.Mock
const getGenericPasswordMock = Keychain.getGenericPassword as jest.Mock
const setGenericPasswordMock = Keychain.setGenericPassword as jest.Mock
const resetGenericPasswordMock = Keychain.resetGenericPassword as jest.Mock
const getCredentialStorageMock = getCredentialStorage as jest.Mock
const { setWalletPin: setWalletPinMock } = jest.requireMock('./walletPin') as { setWalletPin: jest.Mock }

const VALID_PIN = '482910'

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

  test('checkEmailStatus returns exists flag', async () => {
    checkEmailStatusMock.mockResolvedValueOnce({
      status: 200,
      data: { exists: true },
      headers: new Headers(),
    })

    await expect(checkEmailStatus('test@example.com')).resolves.toEqual({ exists: true })
  })

  test('login stores session and local wallet PIN', async () => {
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

    const session = await login('TEST@Example.COM', VALID_PIN)

    expect(session).toEqual({
      accountId: 'account-1',
      token: 'session-token',
      walletId: 'wallet-1',
    })
    expect(loginUserMock).toHaveBeenCalledWith({ type: 'email', email: 'TEST@Example.COM', pin: VALID_PIN })
    expect(setGenericPasswordMock).toHaveBeenCalled()
    expect(setWalletPinMock).toHaveBeenCalledWith(VALID_PIN)
  })

  test('login surfaces backend error message', async () => {
    loginUserMock.mockResolvedValueOnce({
      status: 400,
      data: { message: 'Invalid email or PIN' },
      headers: new Headers(),
    })

    await expect(login('test@example.com', '000001')).rejects.toThrow('Invalid email or PIN')
  })

  test('register requires 201 then logs in', async () => {
    registerUserMock.mockResolvedValueOnce({ status: 201, data: {}, headers: new Headers() })
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

    const session = await register('Test User', 'test@example.com', VALID_PIN)

    expect(registerUserMock).toHaveBeenCalledWith({
      type: 'email',
      email: 'test@example.com',
      pin: VALID_PIN,
      name: 'Test User',
    })
    expect(session.accountId).toBe('account-1')
    expect(setWalletPinMock).toHaveBeenCalledWith(VALID_PIN)
  })

  test('requestPinReset requires 204 response', async () => {
    requestPinResetMock.mockResolvedValueOnce({ status: 204, data: {}, headers: new Headers() })

    await expect(requestPinResetService('test@example.com')).resolves.toBeUndefined()
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

  test('loadSession returns null for invalid stored JSON', async () => {
    getGenericPasswordMock.mockResolvedValueOnce({
      username: 'session',
      password: 'not-json',
    })

    await expect(loadSession()).resolves.toBeNull()
  })

  test('treats an unreadable Keychain session as signed out and clears it', async () => {
    const keychainError = Object.assign(new Error('Wrapped error: null'), {
      code: 'E_CRYPTO_FAILED',
      name: 'CryptoFailedException',
    })
    getGenericPasswordMock.mockRejectedValueOnce(keychainError)

    await expect(loadSession()).resolves.toBeNull()

    expect(resetGenericPasswordMock).toHaveBeenCalledWith({ service: 'etda.wallet.session' })
  })
})
