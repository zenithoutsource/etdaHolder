import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'

type CredentialStorageReader = {
  getString: (key: string) => string | undefined
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
