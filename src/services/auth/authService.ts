import * as Keychain from 'react-native-keychain'

import { loginUser, registerUser, logoutUser, getWallets } from '../../sdk/walletApi'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getCredentialStorage } from '../storage/storage'

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

export async function login(email: string, password: string): Promise<SessionData> {
  logWalletStep('sdk', 'login-start', { userIdentifierProvided: email.length > 0, authFactorProvided: password.length > 0 })
  try {
    const loginRes = await loginUser({ type: 'email', email, password })
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

    resetCredentialRecordsForAccount(accountId)

    await Keychain.setGenericPassword(KEYCHAIN_USERNAME, JSON.stringify(session), {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    })

    logWalletStep('sdk', 'login-complete', { accountId, walletId })
    return session
  } catch (error) {
    logWalletError('sdk', 'login-failed', error, { userIdentifierProvided: email.length > 0 })
    throw error
  }
}

export async function register(email: string, password: string, name: string): Promise<void> {
  logWalletStep('sdk', 'register-start', {
    userIdentifierProvided: email.length > 0,
    authFactorProvided: password.length > 0,
    nameProvided: name.length > 0,
  })
  try {
    const res = await registerUser({ type: 'email', email, password, name })
    logWalletStep('sdk', 'register-response', { status: res.status })

    if (res.status !== 201) {
      throw new Error(readResponseMessage(res.data) ?? `RegisterFailed: HTTP ${res.status}`)
    }
    logWalletStep('sdk', 'register-complete')
  } catch (error) {
    logWalletError('sdk', 'register-failed', error, { userIdentifierProvided: email.length > 0 })
    throw error
  }
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
    // best-effort server logout
  }
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
  logWalletStep('sdk', 'logout-complete')
}

export async function loadSession(): Promise<SessionData | null> {
  logWalletStep('sdk', 'session-load-start')
  const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
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
