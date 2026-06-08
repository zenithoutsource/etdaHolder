import { getCardSchema } from '../../config/cardSchemas'
import type { CredentialLifecycleStatus } from '../credentials/credentialLifecycle'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export type WalletHistoryEvent = {
  id: string
  credentialId: string
  title: string
  subtitle: string
  occurredAt: string
  status: 'completed' | 'revoked' | 'deleted'
}

export type WalletHistory = {
  transactions: WalletHistoryEvent[]
  presentations: WalletHistoryEvent[]
}

export function readWalletHistory(
  credentials: VerifiableCredentialRecord[],
  lifecycleStatuses: Record<string, CredentialLifecycleStatus> = {},
): WalletHistory {
  const lifecycleEvents = credentials.reduce<WalletHistoryEvent[]>((events, record) => {
      const lifecycleStatus = lifecycleStatuses[record.id]
      if (!lifecycleStatus) return events

      events.push({
        id: `credential-lifecycle:${record.id}:${lifecycleStatus.status}`,
        credentialId: record.id,
        title: getCardSchema(record.type).title,
        subtitle:
          lifecycleStatus.action === 'Revoke'
            ? 'Credential revocation approved by Wallet'
            : 'Credential deletion approved by Wallet',
        occurredAt: lifecycleStatus.occurredAt,
        status: lifecycleStatus.status,
      })
      return events
    }, [])

  return {
    transactions: [
      ...credentials.map((record) => ({
        id: `credential-issued:${record.id}`,
        credentialId: record.id,
        title: getCardSchema(record.type).title,
        subtitle: 'Credential saved to Wallet',
        occurredAt: record.issuedAt,
        status: 'completed' as const,
      })),
      ...lifecycleEvents,
    ]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)),
    presentations: [],
  }
}
