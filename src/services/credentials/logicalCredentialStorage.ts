import type { CredentialStorage } from '../vci/exchangeService'
import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'

import type { LogicalCredential } from './logicalCredentialTypes'

export const LOGICAL_CREDENTIAL_KEY_PREFIX = 'logicalCredential:'
export const LOGICAL_CREDENTIAL_INDEX_KEY = 'logicalCredential:index'

export function getLogicalCredentialStorage(
  storage: CredentialStorage = getDefaultCredentialStorage(),
): CredentialStorage {
  return storage
}

export function saveLogicalCredential(
  credential: LogicalCredential,
  storage: CredentialStorage = getDefaultCredentialStorage(),
): void {
  storage.set(
    `${LOGICAL_CREDENTIAL_KEY_PREFIX}${credential.logicalCredentialId}`,
    JSON.stringify(credential),
  )

  const existingIndex = storage.getString(LOGICAL_CREDENTIAL_INDEX_KEY)
  const parsedIndex = existingIndex ? (JSON.parse(existingIndex) as unknown) : []
  const index = Array.isArray(parsedIndex)
    ? parsedIndex.filter((item): item is string => typeof item === 'string')
    : []

  if (!index.includes(credential.logicalCredentialId)) {
    storage.set(
      LOGICAL_CREDENTIAL_INDEX_KEY,
      JSON.stringify([...index, credential.logicalCredentialId]),
    )
  }
}

export function readLogicalCredential(
  logicalCredentialId: string,
  storage: CredentialStorage = getDefaultCredentialStorage(),
): LogicalCredential | undefined {
  const raw = storage.getString(`${LOGICAL_CREDENTIAL_KEY_PREFIX}${logicalCredentialId}`)
  if (!raw) return undefined

  try {
    return JSON.parse(raw) as LogicalCredential
  } catch {
    return undefined
  }
}

export function listLogicalCredentialIds(
  storage: CredentialStorage = getDefaultCredentialStorage(),
): string[] {
  const raw = storage.getString(LOGICAL_CREDENTIAL_INDEX_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export function listLogicalCredentials(
  storage: CredentialStorage = getDefaultCredentialStorage(),
): LogicalCredential[] {
  return listLogicalCredentialIds(storage)
    .map((id) => readLogicalCredential(id, storage))
    .filter((credential): credential is LogicalCredential => Boolean(credential))
}

export function findLogicalCredentialBySdJwtRecordId(
  recordId: string,
  storage: CredentialStorage = getDefaultCredentialStorage(),
): LogicalCredential | undefined {
  return listLogicalCredentials(storage).find(
    (credential) => credential.formats['dc+sd-jwt']?.rawCredentialRef === recordId,
  )
}
