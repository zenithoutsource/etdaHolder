import type { WalletHistoryEvent, WalletHistoryEventKind } from './walletEventLog'

export type WalletHistoryFilter = 'issuance' | 'presentation' | 'lifecycle'

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
  { id: 'issuance', label: 'รับเอกสาร' },
  { id: 'presentation', label: 'แสดงเอกสาร' },
  { id: 'lifecycle', label: 'จัดการเอกสาร' },
]

export function matchesWalletHistoryFilter(
  event: WalletHistoryEvent,
  filter: WalletHistoryFilter,
): boolean {
  if (filter === 'presentation') return PRESENTATION_KINDS.has(event.kind)
  if (filter === 'issuance') {
    return event.kind === 'credential-received' || event.kind === 'credential-verify-failed'
  }
  return LIFECYCLE_KINDS.has(event.kind)
}

const WALLET_HISTORY_FILTERS = new Set<WalletHistoryFilter>(
  WALLET_HISTORY_FILTER_OPTIONS.map((option) => option.id),
)

export function parseWalletHistoryFilter(value: unknown): WalletHistoryFilter | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return undefined
  return WALLET_HISTORY_FILTERS.has(raw as WalletHistoryFilter)
    ? (raw as WalletHistoryFilter)
    : undefined
}

export function readWalletHistoryFilterForEventKind(
  kind: WalletHistoryEventKind,
): WalletHistoryFilter {
  if (PRESENTATION_KINDS.has(kind)) return 'presentation'
  if (kind === 'credential-received' || kind === 'credential-verify-failed') return 'issuance'
  return 'lifecycle'
}
