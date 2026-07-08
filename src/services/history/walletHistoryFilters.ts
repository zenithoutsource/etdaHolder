import type { WalletHistoryEvent, WalletHistoryEventKind } from './walletEventLog'

export type WalletHistoryFilter = 'all' | 'presentation' | 'issuance' | 'lifecycle'

const PRESENTATION_KINDS = new Set<WalletHistoryEventKind>([
  'presentation-success',
  'presentation-declined',
  'presentation-failed',
  'presentation-access-suspended',
  'nfc-presentation-success',
  'nfc-presentation-failed',
])

const LIFECYCLE_KINDS = new Set<WalletHistoryEventKind>([
  'credential-revoked',
  'credential-deleted',
  'credential-used',
  'credential-renewal-completed',
  'backend-sync-success',
  'backend-sync-failed',
])

export const WALLET_HISTORY_FILTER_OPTIONS: { id: WalletHistoryFilter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'presentation', label: 'แสดงเอกสาร' },
  { id: 'issuance', label: 'รับเอกสาร' },
  { id: 'lifecycle', label: 'จัดการเอกสาร' },
]

export function matchesWalletHistoryFilter(
  event: WalletHistoryEvent,
  filter: WalletHistoryFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'presentation') return PRESENTATION_KINDS.has(event.kind)
  if (filter === 'issuance') return event.kind === 'credential-received'
  return LIFECYCLE_KINDS.has(event.kind)
}
