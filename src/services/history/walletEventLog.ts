import { WALLET_HISTORY_RETENTION_DAYS } from '../../config/walletHistoryPolicy'
import { getCardSchema } from '../../config/cardSchemas'
import { readCredentialLifecycleStatus } from '../credentials/credentialLifecycle'
import { readStoredCredentials } from '../credentials/storedCredentials'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getCredentialStorage } from '../storage/storage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export type WalletHistoryEventKind =
  | 'credential-received'
  | 'credential-verify-failed'
  | 'presentation-success'
  | 'presentation-declined'
  | 'presentation-failed'
  | 'presentation-access-suspended'
  | 'credential-revoked'
  | 'credential-deleted'
  | 'credential-used'
  | 'credential-renewal-completed'
  | 'nfc-presentation-success'
  | 'nfc-presentation-failed'
  | 'backend-sync-success'
  | 'backend-sync-failed'

export type WalletHistoryEventStatus =
  | 'completed'
  | 'cancelled'
  | 'revoked'
  | 'deleted'
  | 'used'
  | 'failed'

export type WalletHistoryFailureReason =
  | 'verifier-rejected'
  | 'network-error'
  | 'biometric-cancel'
  | 'timeout'
  | 'nfc-error'
  | 'signature-invalid'
  | 'holder-binding-mismatch'
  | 'unknown'

export type WalletHistoryEvent = {
  id: string
  kind: WalletHistoryEventKind
  status: WalletHistoryEventStatus
  occurredAt: string
  credentialId: string
  documentType: string
  partyName: string
  disclosedClaims: string[]
  channel: 'oid4vp' | 'oid4vci' | 'wallet' | 'nfc' | 'backend' | 'renewal'
  initiatedBy?: 'holder' | 'system'
  reasonCode?: WalletHistoryFailureReason
  relatedEventId?: string
}

export type AppendWalletHistoryEventInput = {
  id?: string
  kind: WalletHistoryEventKind
  credentialId: string
  documentType: string
  partyName: string
  disclosedClaims?: string[]
  channel: WalletHistoryEvent['channel']
  initiatedBy?: 'holder' | 'system'
  reasonCode?: WalletHistoryFailureReason
  relatedEventId?: string
  occurredAt?: string
  now?: Date
}

const HISTORY_INDEX_KEY = 'wallet:history:index'
const HISTORY_EVENT_PREFIX = 'wallet:history:event:'
const HISTORY_HIDDEN_INDEX_KEY = 'wallet:history:hidden:index'
const BACKFILL_FLAG_KEY = 'wallet:history:backfill:v1'
const PRESENTATION_HISTORY_INDEX_KEY = 'presentation:history:index'
const PRESENTATION_HISTORY_KEY_PREFIX = 'presentation:history:'
export const PRESENTATION_BADGE_CLEARED_KEY_PREFIX = 'presentation:badge-cleared:'

type HistoryStorage = {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
  remove: (key: string) => void
}

function statusForKind(kind: WalletHistoryEventKind): WalletHistoryEventStatus {
  switch (kind) {
    case 'presentation-declined':
      return 'cancelled'
    case 'presentation-failed':
    case 'nfc-presentation-failed':
    case 'backend-sync-failed':
    case 'credential-verify-failed':
      return 'failed'
    case 'credential-revoked':
      return 'revoked'
    case 'credential-deleted':
      return 'deleted'
    case 'credential-used':
      return 'used'
    default:
      return 'completed'
  }
}

export function appendWalletHistoryEvent(
  input: AppendWalletHistoryEventInput,
): WalletHistoryEvent | undefined {
  try {
    const occurredAt = input.occurredAt ?? (input.now ?? new Date()).toISOString()
    const event: WalletHistoryEvent = {
      id:
        input.id ??
        `${input.kind}:${input.credentialId}:${occurredAt}:${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      status: statusForKind(input.kind),
      occurredAt,
      credentialId: input.credentialId,
      documentType: input.documentType,
      partyName: input.partyName,
      disclosedClaims: input.disclosedClaims ?? [],
      channel: input.channel,
      ...(input.initiatedBy ? { initiatedBy: input.initiatedBy } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input.relatedEventId ? { relatedEventId: input.relatedEventId } : {}),
    }

    const storage = getCredentialStorage()
    storage.set(`${HISTORY_EVENT_PREFIX}${event.id}`, JSON.stringify(event))
    const ids = readHistoryIds(storage)
    if (!ids.includes(event.id)) {
      storage.set(HISTORY_INDEX_KEY, JSON.stringify([...ids, event.id]))
    }

    logWalletStep('history', 'event-appended', {
      kind: event.kind,
      credentialId: event.credentialId,
    })
    return event
  } catch (error) {
    logWalletError('history', 'event-append-failed', error, { kind: input.kind })
    return undefined
  }
}

export function readWalletHistoryEvents(): WalletHistoryEvent[] {
  const storage = getCredentialStorage()
  return readHistoryIds(storage)
    .map((id) => storage.getString(`${HISTORY_EVENT_PREFIX}${id}`))
    .filter((raw): raw is string => Boolean(raw))
    .map(parseWalletHistoryEvent)
    .filter((event): event is WalletHistoryEvent => Boolean(event))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
}

export function readWalletHistoryEvent(id: string): WalletHistoryEvent | undefined {
  const raw = getCredentialStorage().getString(`${HISTORY_EVENT_PREFIX}${id}`)
  return raw ? parseWalletHistoryEvent(raw) : undefined
}

export function readHiddenWalletHistoryEventIds(): Set<string> {
  const raw = getCredentialStorage().getString(HISTORY_HIDDEN_INDEX_KEY)
  if (!raw) return new Set()

  try {
    const parsed = JSON.parse(raw) as unknown
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

export function hideWalletHistoryEvent(eventId: string): void {
  const hidden = readHiddenWalletHistoryEventIds()
  if (hidden.has(eventId)) return
  hidden.add(eventId)
  getCredentialStorage().set(HISTORY_HIDDEN_INDEX_KEY, JSON.stringify([...hidden]))
  logWalletStep('history', 'event-hidden', { eventId })
}

export function hasPresentationAccessSuspension(eventId: string): boolean {
  return readWalletHistoryEvents().some(
    (event) =>
      event.kind === 'presentation-access-suspended' && event.relatedEventId === eventId,
  )
}

export function canRequestPresentationAccessSuspension(event: WalletHistoryEvent): boolean {
  return (
    event.kind === 'presentation-success' &&
    (event.channel === 'oid4vp' || event.channel === 'wallet') &&
    !hasPresentationAccessSuspension(event.id)
  )
}

export function pruneWalletHistoryByRetention(now = new Date()): void {
  if (WALLET_HISTORY_RETENTION_DAYS <= 0) return

  const storage = getCredentialStorage()
  const cutoffMs = now.getTime() - WALLET_HISTORY_RETENTION_DAYS * 86_400_000
  const ids = readHistoryIds(storage)
  const kept: string[] = []
  let pruned = 0

  for (const id of ids) {
    const event = readWalletHistoryEvent(id)
    if (event && Date.parse(event.occurredAt) < cutoffMs) {
      storage.remove(`${HISTORY_EVENT_PREFIX}${id}`)
      pruned += 1
      continue
    }
    kept.push(id)
  }

  if (pruned > 0) {
    storage.set(HISTORY_INDEX_KEY, JSON.stringify(kept))
    logWalletStep('history', 'retention-pruned', { pruned, retained: kept.length })
  }
}

export function ensureWalletHistoryBackfill(): void {
  const storage = getCredentialStorage()
  if (storage.getString(BACKFILL_FLAG_KEY) !== 'done') {
    migratePresentationHistory(storage)
    const credentials = readStoredCredentials()
    backfillCredentialReceivedEvents(credentials)
    backfillLifecycleEvents(credentials)
    storage.set(BACKFILL_FLAG_KEY, 'done')
    logWalletStep('history', 'backfill-complete', {
      eventCount: readHistoryIds(storage).length,
    })
  }

  pruneWalletHistoryByRetention()
}

export function readSuccessfullyPresentedCredentialIds(): string[] {
  const latestByCredential = new Map<string, WalletHistoryEvent>()
  for (const event of readWalletHistoryEvents()) {
    if (event.kind !== 'presentation-success') continue
    if (!latestByCredential.has(event.credentialId)) {
      latestByCredential.set(event.credentialId, event)
    }
  }

  const storage = getCredentialStorage()
  return [...latestByCredential.values()]
    .filter((event) => {
      const clearedAt = storage.getString(
        `${PRESENTATION_BADGE_CLEARED_KEY_PREFIX}${event.credentialId}`,
      )
      return !clearedAt || Date.parse(event.occurredAt) > Date.parse(clearedAt)
    })
    .map((event) => event.credentialId)
}

export function clearSuccessfulPresentationBadge(credentialId: string, now = new Date()): void {
  getCredentialStorage().set(
    `${PRESENTATION_BADGE_CLEARED_KEY_PREFIX}${credentialId}`,
    now.toISOString(),
  )
}

export function hasCredentialKindInLog(
  credentialId: string,
  kind: WalletHistoryEventKind,
): boolean {
  return readWalletHistoryEvents().some(
    (event) => event.credentialId === credentialId && event.kind === kind,
  )
}

export function classifyPresentationFailure(error: unknown): WalletHistoryFailureReason {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('scantimeout') || lower.includes('timed out')) {
    return 'timeout'
  }
  if (
    lower.includes('storageunlockcancelled') ||
    lower.includes('usercancel') ||
    lower.includes('biometric') ||
    lower.includes('authentication was canceled')
  ) {
    return 'biometric-cancel'
  }
  if (lower.includes('presentationsubmissionfailed')) {
    return 'verifier-rejected'
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch')
  ) {
    return 'network-error'
  }

  return 'unknown'
}

export function classifyCredentialVerifyFailure(error: unknown): WalletHistoryFailureReason {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (
    lower.includes('credentialissuersignatureinvalid') ||
    lower.includes('credentialsignaturealgunsupported') ||
    lower.includes('signature')
  ) {
    return 'signature-invalid'
  }
  if (
    lower.includes('holderbinding') ||
    lower.includes('holder-binding') ||
    lower.includes('cnf')
  ) {
    return 'holder-binding-mismatch'
  }

  return 'unknown'
}

function migratePresentationHistory(storage: HistoryStorage): void {
  const raw = storage.getString(PRESENTATION_HISTORY_INDEX_KEY)
  if (!raw) return

  let legacyIds: string[] = []
  try {
    const parsed = JSON.parse(raw) as unknown
    legacyIds = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return
  }

  for (const legacyId of legacyIds) {
    if (storage.getString(`${HISTORY_EVENT_PREFIX}${legacyId}`)) continue

    const legacyRaw = storage.getString(`${PRESENTATION_HISTORY_KEY_PREFIX}${legacyId}`)
    if (!legacyRaw) continue

    try {
      const legacy = JSON.parse(legacyRaw) as {
        id: string
        credentialId: string
        verifierName: string
        documentType: string
        disclosedClaims: string[]
        occurredAt: string
      }
      if (
        typeof legacy.id !== 'string' ||
        typeof legacy.credentialId !== 'string' ||
        typeof legacy.verifierName !== 'string' ||
        typeof legacy.documentType !== 'string' ||
        !Array.isArray(legacy.disclosedClaims) ||
        typeof legacy.occurredAt !== 'string'
      ) {
        logWalletStep('history', 'event-parse-failed', {})
        continue
      }

      appendWalletHistoryEvent({
        id: legacy.id,
        kind: 'presentation-success',
        credentialId: legacy.credentialId,
        documentType: legacy.documentType,
        partyName: legacy.verifierName,
        disclosedClaims: legacy.disclosedClaims,
        channel: 'oid4vp',
        occurredAt: legacy.occurredAt,
      })
    } catch {
      logWalletStep('history', 'event-parse-failed', {})
    }
  }

  logWalletStep('history', 'presentation-history-migrated', { count: legacyIds.length })
}

function backfillCredentialReceivedEvents(credentials: VerifiableCredentialRecord[]): void {
  for (const record of credentials) {
    if (hasCredentialKindInLog(record.id, 'credential-received')) continue

    const schema = getCardSchema(record.type)
    appendWalletHistoryEvent({
      kind: 'credential-received',
      credentialId: record.id,
      documentType: schema.title,
      partyName: schema.issuerName,
      channel: 'oid4vci',
      occurredAt: record.issuedAt,
    })
  }
}

function backfillLifecycleEvents(credentials: VerifiableCredentialRecord[]): void {
  for (const record of credentials) {
    const lifecycle = readCredentialLifecycleStatus(record.id)
    if (!lifecycle) continue

    const kind =
      lifecycle.status === 'revoked'
        ? 'credential-revoked'
        : lifecycle.status === 'deleted'
          ? 'credential-deleted'
          : 'credential-used'
    if (hasCredentialKindInLog(record.id, kind)) continue

    const schema = getCardSchema(record.type)
    appendWalletHistoryEvent({
      kind,
      credentialId: record.id,
      documentType: schema.title,
      partyName: schema.issuerName,
      channel: 'wallet',
      initiatedBy: 'holder',
      occurredAt: lifecycle.occurredAt,
    })
  }
}

function readHistoryIds(storage: HistoryStorage): string[] {
  const raw = storage.getString(HISTORY_INDEX_KEY)
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

function parseWalletHistoryEvent(raw: string): WalletHistoryEvent | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<WalletHistoryEvent>
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.kind === 'string' &&
      typeof parsed.status === 'string' &&
      typeof parsed.occurredAt === 'string' &&
      typeof parsed.credentialId === 'string' &&
      typeof parsed.documentType === 'string' &&
      typeof parsed.partyName === 'string' &&
      Array.isArray(parsed.disclosedClaims) &&
      parsed.disclosedClaims.every((claim) => typeof claim === 'string') &&
      typeof parsed.channel === 'string'
    ) {
      return parsed as WalletHistoryEvent
    }
  } catch {
    logWalletStep('history', 'event-parse-failed', {})
  }

  return undefined
}
