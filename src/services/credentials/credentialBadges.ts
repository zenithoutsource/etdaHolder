import { getCredentialStorage } from '../storage/storage'

const NEW_CREDENTIAL_BADGES_KEY = 'credential:new:index'

export function markCredentialAsNew(credentialId: string): void {
  const ids = readNewCredentialBadgeIds()
  if (ids.includes(credentialId)) return

  getCredentialStorage().set(NEW_CREDENTIAL_BADGES_KEY, JSON.stringify([...ids, credentialId]))
}

export function clearNewCredentialBadge(credentialId: string): void {
  const ids = readNewCredentialBadgeIds().filter((id) => id !== credentialId)
  getCredentialStorage().set(NEW_CREDENTIAL_BADGES_KEY, JSON.stringify(ids))
}

export function readNewCredentialBadgeIds(): string[] {
  const raw = getCredentialStorage().getString(NEW_CREDENTIAL_BADGES_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}
