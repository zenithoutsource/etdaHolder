import { getCardSchema } from '../../config/cardSchemas'
import { appendWalletHistoryEvent } from '../history/walletEventLog'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import { blocksCredentialPresentation, readCredentialRenewalStatuses } from './credentialKeyRenewal'
import { readIssuerSuspensionStatuses } from './issuerSuspension'
import { readStoredCredentialById } from './storedCredentials'

const LIFECYCLE_KEY_PREFIX = 'credential:lifecycle:'

export type CredentialLifecycleAction = 'Revoke' | 'Delete' | 'Used'

export type CredentialLifecycleStatus = {
  credentialId: string
  action: CredentialLifecycleAction
  status: 'revoked' | 'deleted' | 'used'
  occurredAt: string
}

export type CredentialLifecycleInitiator = 'holder' | 'system'

function statusForLifecycleAction(action: CredentialLifecycleAction): CredentialLifecycleStatus['status'] {
  if (action === 'Revoke') return 'revoked'
  if (action === 'Delete') return 'deleted'
  return 'used'
}

function historyKindForLifecycleAction(
  action: CredentialLifecycleAction,
): 'credential-revoked' | 'credential-deleted' | 'credential-used' {
  if (action === 'Revoke') return 'credential-revoked'
  if (action === 'Delete') return 'credential-deleted'
  return 'credential-used'
}

export function recordCredentialLifecycleAction(
  credentialId: string,
  action: CredentialLifecycleAction,
  initiatedBy: CredentialLifecycleInitiator = 'holder',
  now = new Date(),
): CredentialLifecycleStatus {
  const status: CredentialLifecycleStatus = {
    credentialId,
    action,
    status: statusForLifecycleAction(action),
    occurredAt: now.toISOString(),
  }
  getCredentialStorage().set(`${LIFECYCLE_KEY_PREFIX}${credentialId}`, JSON.stringify(status))

  const record = readStoredCredentialById(credentialId)
  if (record) {
    const schema = getCardSchema(record.type)
    appendWalletHistoryEvent({
      kind: historyKindForLifecycleAction(action),
      credentialId,
      documentType: schema.title,
      partyName: schema.issuerName,
      channel: 'wallet',
      initiatedBy,
      occurredAt: status.occurredAt,
    })
  }

  return status
}

export function clearCredentialLifecycleStatus(credentialId: string): void {
  getCredentialStorage().remove(`${LIFECYCLE_KEY_PREFIX}${credentialId}`)
}

export function readCredentialLifecycleStatus(
  credentialId: string,
): CredentialLifecycleStatus | undefined {
  const raw = getCredentialStorage().getString(`${LIFECYCLE_KEY_PREFIX}${credentialId}`)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<CredentialLifecycleStatus>
    if (
      parsed.credentialId === credentialId &&
      (parsed.action === 'Revoke' || parsed.action === 'Delete' || parsed.action === 'Used') &&
      (parsed.status === 'revoked' || parsed.status === 'deleted' || parsed.status === 'used') &&
      typeof parsed.occurredAt === 'string'
    ) {
      return parsed as CredentialLifecycleStatus
    }
  } catch {
    return undefined
  }

  return undefined
}

export function readCredentialLifecycleStatuses(
  credentials: VerifiableCredentialRecord[],
): Record<string, CredentialLifecycleStatus> {
  return Object.fromEntries(
    credentials
      .map((record) => {
        const status = readCredentialLifecycleStatus(record.id)
        if (!status) return undefined

        if (isLifecycleStatusStaleForCredential(status, record)) {
          getCredentialStorage().remove(`${LIFECYCLE_KEY_PREFIX}${record.id}`)
          return undefined
        }

        return status
      })
      .filter((status): status is CredentialLifecycleStatus => Boolean(status))
      .map((status) => [status.credentialId, status]),
  )
}

export function filterPresentableCredentials(
  credentials: VerifiableCredentialRecord[],
): VerifiableCredentialRecord[] {
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials)
  const suspensionStatuses = readIssuerSuspensionStatuses(credentials)
  const renewalStatuses = readCredentialRenewalStatuses(credentials)
  return credentials.filter(
    (record) =>
      !lifecycleStatuses[record.id] &&
      !suspensionStatuses[record.id] &&
      !blocksCredentialPresentation(renewalStatuses[record.id]) &&
      !isCredentialDocumentExpired(record),
  )
}

export function isCredentialPresentable(record: VerifiableCredentialRecord): boolean {
  return filterPresentableCredentials([record]).length > 0
}

function isLifecycleStatusStaleForCredential(
  status: CredentialLifecycleStatus,
  record: VerifiableCredentialRecord,
): boolean {
  const lifecycleTime = new Date(status.occurredAt).getTime()
  const credentialIssuedTime = new Date(record.issuedAt).getTime()

  if (Number.isNaN(lifecycleTime) || Number.isNaN(credentialIssuedTime)) {
    return false
  }

  return credentialIssuedTime > lifecycleTime
}
