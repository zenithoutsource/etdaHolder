import { Platform } from 'react-native'
import * as Keychain from 'react-native-keychain'

import {
  checkEmailStatus as checkEmailStatusApi,
  confirmPinReset as confirmPinResetApi,
  getWallets,
  loginUser,
  logoutUser,
  registerUser,
  requestPinReset as requestPinResetApi,
  verifyPinResetOtp as verifyPinResetOtpApi,
} from '../../sdk/walletApi'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getCredentialStorage, isCredentialStorageReady } from '../storage/storage'
import { setWalletPin } from './walletPin'

const KEYCHAIN_SERVICE = 'etda.wallet.session'
const KEYCHAIN_USERNAME = 'session'
const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'
const CREDENTIAL_OWNER_KEY = 'credential:ownerAccountId'

export type SessionData = {
  token: string
  walletId: string
  accountId: string
}

function readCredentialIds(): string[] {
  const storage = getCredentialStorage()
  const raw = storage.getString(CREDENTIAL_INDEX_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch (error) {
    logWalletError('storage', 'credential-index-parse-failed', error)
    return []
  }
}

function clearLocalCredentialRecords(): void {
  const storage = getCredentialStorage()
  for (const id of readCredentialIds()) {
    storage.remove(`${CREDENTIAL_KEY_PREFIX}${id}`)
  }
  storage.remove(CREDENTIAL_INDEX_KEY)
}

function resetCredentialRecordsForAccount(accountId: string): void {
  const storage = getCredentialStorage()
  const currentOwner = storage.getString(CREDENTIAL_OWNER_KEY)
  const hasCredentials = readCredentialIds().length > 0

  if ((currentOwner && currentOwner !== accountId) || (!currentOwner && hasCredentials)) {
    clearLocalCredentialRecords()
  }

  storage.set(CREDENTIAL_OWNER_KEY, accountId)
}

function readResponseMessage(data: unknown): string | undefined {
  return typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string' &&
    data.message.trim().length > 0
    ? data.message
    : undefined
}

function persistLocalWalletPin(pin: string): void {
  if (Platform.OS !== 'web') {
    setWalletPin(pin)
  }
}

function persistLocalWalletPinAfterPinReset(pin: string): void {
  try {
    persistLocalWalletPin(pin)
  } catch (error) {
    if (error instanceof Error && error.message === 'StorageNotInitialized') {
      logWalletStep('sdk', 'pin-reset-confirm-local-pin-skipped')
      return
    }
    throw error
  }
}

async function completeLogin(email: string, pin: string): Promise<SessionData> {
  logWalletStep('sdk', 'login-start', { userIdentifierProvided: email.length > 0, authFactorProvided: pin.length > 0 })
  const loginRes = await loginUser({ type: 'email', email, pin })
  logWalletStep('sdk', 'login-response', { status: loginRes.status })

  if (loginRes.status !== 200) {
    throw new Error(readResponseMessage(loginRes.data) ?? `LoginFailed: HTTP ${loginRes.status}`)
  }

  const { id: accountId, token } = loginRes.data

  logWalletStep('sdk', 'wallets-fetch-start', { accountId })
  const walletsRes = await getWallets({
    headers: { Authorization: `Bearer ${token}` },
  })
  logWalletStep('sdk', 'wallets-fetch-response', { status: walletsRes.status })

  if (walletsRes.status !== 200) {
    throw new Error(readResponseMessage(walletsRes.data) ?? `WalletsFetchFailed: HTTP ${walletsRes.status}`)
  }

  const wallets = walletsRes.data.wallets
  if (!wallets || wallets.length === 0) {
    throw new Error('WalletsFetchFailed: No wallets found for account')
  }

  const walletId = wallets[0].id
  const session: SessionData = { token, walletId, accountId }

  if (isCredentialStorageReady()) {
    resetCredentialRecordsForAccount(accountId)
  } else {
    logWalletStep('sdk', 'login-credential-owner-skipped')
  }

  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, JSON.stringify(session), {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  })

  persistLocalWalletPin(pin)
  logWalletStep('sdk', 'login-complete', { accountId, walletId })
  return session
}

export async function checkEmailStatus(email: string): Promise<{ exists: boolean }> {
  logWalletStep('sdk', 'email-status-start', { userIdentifierProvided: email.length > 0 })
  try {
    const res = await checkEmailStatusApi({ email })
    logWalletStep('sdk', 'email-status-response', { status: res.status })

    if (res.status !== 200) {
      throw new Error(readResponseMessage(res.data) ?? `EmailStatusFailed: HTTP ${res.status}`)
    }

    return { exists: Boolean(res.data.exists) }
  } catch (error) {
    logWalletError('sdk', 'email-status-failed', error, { userIdentifierProvided: email.length > 0 })
    throw error
  }
}

export async function login(email: string, pin: string): Promise<SessionData> {
  try {
    return await completeLogin(email, pin)
  } catch (error) {
    logWalletError('sdk', 'login-failed', error, { userIdentifierProvided: email.length > 0 })
    throw error
  }
}

export async function register(name: string, email: string, pin: string): Promise<SessionData> {
  logWalletStep('sdk', 'register-start', {
    userIdentifierProvided: email.length > 0,
    authFactorProvided: pin.length > 0,
    nameProvided: name.length > 0,
  })
  try {
    const res = await registerUser({ type: 'email', email, pin, name })
    logWalletStep('sdk', 'register-response', { status: res.status })

    if (res.status !== 201) {
      throw new Error(readResponseMessage(res.data) ?? `RegisterFailed: HTTP ${res.status}`)
    }

    logWalletStep('sdk', 'register-complete')
    return await completeLogin(email, pin)
  } catch (error) {
    logWalletError('sdk', 'register-failed', error, { userIdentifierProvided: email.length > 0 })
    throw error
  }
}

export async function requestPinReset(email: string): Promise<void> {
  await completePinResetCall('pin-reset-request', email, () => requestPinResetApi({ email }))
}

export async function verifyPinResetOtp(email: string, otp: string): Promise<void> {
  await completePinResetCall('pin-reset-verify', email, () => verifyPinResetOtpApi({ email, otp }))
}

export async function confirmPinReset(email: string, otp: string, pin: string): Promise<void> {
  await completePinResetCall('pin-reset-confirm', email, () => confirmPinResetApi({ email, otp, pin }))
  persistLocalWalletPinAfterPinReset(pin)
}

type PinResetEvent = 'pin-reset-request' | 'pin-reset-verify' | 'pin-reset-confirm'

const PIN_RESET_FAILURE_FALLBACK: Record<PinResetEvent, string> = {
  'pin-reset-request': 'PinResetRequestFailed',
  'pin-reset-verify': 'PinResetVerifyFailed',
  'pin-reset-confirm': 'PinResetConfirmFailed',
}

async function completePinResetCall(
  event: PinResetEvent,
  email: string,
  run: () => Promise<{ status: number; data: unknown }>,
): Promise<void> {
  logWalletStep('sdk', `${event}-start`, { userIdentifierProvided: email.length > 0 })
  let res: { status: number; data: unknown }
  try {
    res = await run()
  } catch (error) {
    logWalletError('sdk', `${event}-failed`, error, { userIdentifierProvided: email.length > 0 })
    throw error
  }

  logWalletStep('sdk', `${event}-response`, { status: res.status })
  if (res.status === 204) return

  const message = readResponseMessage(res.data) ?? `${PIN_RESET_FAILURE_FALLBACK[event]}: HTTP ${res.status}`
  if (res.status === 400 || res.status === 429) {
    logWalletStep('sdk', `${event}-rejected`, { status: res.status })
  } else {
    logWalletError('sdk', `${event}-failed`, new Error(message), { userIdentifierProvided: email.length > 0 })
  }
  throw new Error(message)
}

export async function logout(): Promise<void> {
  logWalletStep('sdk', 'logout-start')
  try {
    const session = await loadSession()
    if (session) {
      logWalletStep('sdk', 'logout-server-start', { accountId: session.accountId, walletId: session.walletId })
      await logoutUser({
        headers: { Authorization: `Bearer ${session.token}` },
      })
      logWalletStep('sdk', 'logout-server-complete', { accountId: session.accountId, walletId: session.walletId })
    }
  } catch (error) {
    logWalletError('sdk', 'logout-server-failed', error)
  }
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  logWalletStep('sdk', 'logout-complete')
}

export async function loadSession(): Promise<SessionData | null> {
  logWalletStep('sdk', 'session-load-start')
  let credentials: Awaited<ReturnType<typeof Keychain.getGenericPassword>>
  try {
    credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
  } catch (error) {
    logWalletError('sdk', 'session-keychain-read-failed', error, { service: KEYCHAIN_SERVICE })
    try {
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
      logWalletStep('sdk', 'session-keychain-cleared-after-read-failure')
    } catch (resetError) {
      logWalletError('sdk', 'session-keychain-clear-after-read-failure-failed', resetError, {
        service: KEYCHAIN_SERVICE,
      })
    }
    return null
  }
  if (!credentials) {
    logWalletStep('sdk', 'session-load-empty')
    return null
  }

  try {
    const session = JSON.parse(credentials.password) as SessionData
    logWalletStep('sdk', 'session-load-complete', { accountId: session.accountId, walletId: session.walletId })
    return session
  } catch (error) {
    logWalletError('sdk', 'session-parse-failed', error)
    return null
  }
}
