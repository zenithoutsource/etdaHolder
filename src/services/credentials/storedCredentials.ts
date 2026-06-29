import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'

type CredentialStorageReader = {
  getString: (key: string) => string | undefined
  set?: (key: string, value: string) => void
  remove?: (key: string) => boolean
}

type CredentialsChangeListener = () => void

const credentialsChangeListeners = new Set<CredentialsChangeListener>()

export function subscribeCredentialsChange(
  listener: CredentialsChangeListener,
): () => void {
  credentialsChangeListeners.add(listener)
  return () => {
    credentialsChangeListeners.delete(listener)
  }
}

export function notifyCredentialsChanged(): void {
  for (const listener of credentialsChangeListeners) {
    listener()
  }
}

export function readStoredCredentials(
  getCredentialStorage: () => CredentialStorageReader = getDefaultCredentialStorage,
): VerifiableCredentialRecord[] {
  const storage = getCredentialStorage()
  const indexRaw = storage.getString(CREDENTIAL_INDEX_KEY)
  const ids: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : []

  return ids
    .map((id) => storage.getString(`${CREDENTIAL_KEY_PREFIX}${id}`))
    .filter((raw): raw is string => raw !== undefined)
    .map((raw) => JSON.parse(raw) as VerifiableCredentialRecord)
}

export function removeStoredCredential(
  credentialId: string,
  getCredentialStorage: () => CredentialStorageReader = getDefaultCredentialStorage,
): void {
  const storage = getCredentialStorage()
  const indexRaw = storage.getString(CREDENTIAL_INDEX_KEY)
  const ids: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : []
  storage.set?.(CREDENTIAL_INDEX_KEY, JSON.stringify(ids.filter((id) => id !== credentialId)))
  storage.remove?.(`${CREDENTIAL_KEY_PREFIX}${credentialId}`)
  notifyCredentialsChanged()
}
