import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const SUSPENSION_KEY_PREFIX = 'credential:suspension:'
const DEV_SUSPENSION_STATUS_ENDPOINT = '/wallet-api/dev/wallet/suspension-status'

export type IssuerSuspensionRecord = {
  credentialId: string
  suspendedAt: string
  acknowledgedAt?: string
  reasonCode?: string
  issuerRef?: string
  updatedAt: string
}

type SuspensionPayload = {
  suspensions: {
    credentialId: string
    suspendedAt: string
    acknowledgedAt?: string
    reasonCode?: string
    issuerRef?: string
    updatedAt?: string
  }[]
}

export function readIssuerSuspension(
  credentialId: string,
): IssuerSuspensionRecord | undefined {
  const raw = getCredentialStorage().getString(`${SUSPENSION_KEY_PREFIX}${credentialId}`)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<IssuerSuspensionRecord>
    if (
      parsed.credentialId === credentialId &&
      typeof parsed.suspendedAt === 'string' &&
      typeof parsed.updatedAt === 'string'
    ) {
      if (
        parsed.acknowledgedAt !== undefined &&
        typeof parsed.acknowledgedAt !== 'string'
      ) {
        return undefined
      }

      return parsed as IssuerSuspensionRecord
    }
  } catch (error) {
    logWalletError('storage', 'issuer-suspension-parse-failed', error, {
      credentialId,
    })
  }

  return undefined
}

export function writeIssuerSuspension(record: IssuerSuspensionRecord): void {
  getCredentialStorage().set(
    `${SUSPENSION_KEY_PREFIX}${record.credentialId}`,
    JSON.stringify(record),
  )
}

export function acknowledgeIssuerSuspension(
  credentialId: string,
  now = new Date(),
): IssuerSuspensionRecord | undefined {
  const current = readIssuerSuspension(credentialId)
  if (!current) return undefined

  const next: IssuerSuspensionRecord = {
    ...current,
    acknowledgedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  writeIssuerSuspension(next)
  return next
}

export function readIssuerSuspensionStatuses(
  credentials: VerifiableCredentialRecord[],
): Record<string, IssuerSuspensionRecord> {
  return Object.fromEntries(
    credentials
      .map((credential) => {
        const status = readIssuerSuspension(credential.id)
        if (!status) return undefined

        if (isSuspensionStatusStaleForCredential(status, credential)) {
          getCredentialStorage().remove(`${SUSPENSION_KEY_PREFIX}${credential.id}`)
          return undefined
        }

        return status
      })
      .filter((status): status is IssuerSuspensionRecord => Boolean(status))
      .map((status) => [status.credentialId, status]),
  )
}

export function hasPendingIssuerSuspensionAck(
  record: IssuerSuspensionRecord | undefined,
): boolean {
  return Boolean(record && !record.acknowledgedAt)
}

export async function refreshIssuerSuspensionsFromServer(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  logWalletStep('storage', 'issuer-suspension-refresh-start')
  try {
    const response = await fetchImpl(DEV_SUSPENSION_STATUS_ENDPOINT)
    if (!response.ok) {
      logWalletStep('storage', 'issuer-suspension-refresh-non-ok', {
        status: response.status,
      })
      return
    }

    const payload = (await response.json()) as Partial<SuspensionPayload>
    if (!Array.isArray(payload.suspensions)) {
      logWalletStep('storage', 'issuer-suspension-refresh-invalid-payload')
      return
    }

    for (const entry of payload.suspensions) {
      if (
        typeof entry.credentialId !== 'string' ||
        typeof entry.suspendedAt !== 'string'
      ) {
        continue
      }

      const updatedAt =
        typeof entry.updatedAt === 'string'
          ? entry.updatedAt
          : new Date().toISOString()

      writeIssuerSuspension({
        credentialId: entry.credentialId,
        suspendedAt: entry.suspendedAt,
        acknowledgedAt: entry.acknowledgedAt,
        reasonCode: entry.reasonCode,
        issuerRef: entry.issuerRef,
        updatedAt,
      })
    }

    logWalletStep('storage', 'issuer-suspension-refresh-complete', {
      count: payload.suspensions.length,
    })
  } catch (error) {
    logWalletError('storage', 'issuer-suspension-refresh-failed', error)
  }
}

function isSuspensionStatusStaleForCredential(
  status: IssuerSuspensionRecord,
  record: VerifiableCredentialRecord,
): boolean {
  const suspensionUpdatedTime = new Date(status.updatedAt).getTime()
  const credentialIssuedTime = new Date(record.issuedAt).getTime()

  if (
    Number.isNaN(suspensionUpdatedTime) ||
    Number.isNaN(credentialIssuedTime)
  ) {
    return false
  }

  return credentialIssuedTime > suspensionUpdatedTime
}
