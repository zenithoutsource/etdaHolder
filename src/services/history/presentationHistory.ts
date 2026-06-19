import { getCredentialStorage } from '../storage/storage'
import type { SuccessfulPresentationHistoryEvent } from './walletHistory'

const PRESENTATION_HISTORY_INDEX_KEY = 'presentation:history:index'
const PRESENTATION_HISTORY_KEY_PREFIX = 'presentation:history:'
const PRESENTATION_BADGE_CLEARED_KEY_PREFIX = 'presentation:badge-cleared:'

export type RecordSuccessfulPresentationInput = {
  credentialId: string
  verifierName: string
  documentType: string
  disclosedClaims: string[]
  now?: Date
}

export function recordSuccessfulPresentation(
  input: RecordSuccessfulPresentationInput,
): SuccessfulPresentationHistoryEvent {
  const occurredAt = (input.now ?? new Date()).toISOString()
  const event: SuccessfulPresentationHistoryEvent = {
    id: createPresentationHistoryId(input.credentialId, occurredAt),
    credentialId: input.credentialId,
    verifierName: input.verifierName,
    documentType: input.documentType,
    disclosedClaims: input.disclosedClaims,
    occurredAt,
  }

  const storage = getCredentialStorage()
  storage.set(`${PRESENTATION_HISTORY_KEY_PREFIX}${event.id}`, JSON.stringify(event))
  storage.set(PRESENTATION_HISTORY_INDEX_KEY, JSON.stringify([...readPresentationIds(storage), event.id]))

  return event
}

export function readSuccessfulPresentationHistory(): SuccessfulPresentationHistoryEvent[] {
  const storage = getCredentialStorage()
  return readPresentationIds(storage)
    .map((id) => storage.getString(`${PRESENTATION_HISTORY_KEY_PREFIX}${id}`))
    .filter((raw): raw is string => Boolean(raw))
    .map(parsePresentationHistoryEvent)
    .filter((event): event is SuccessfulPresentationHistoryEvent => Boolean(event))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
}

export function readSuccessfullyPresentedCredentialIds(): string[] {
  const latestEvents = new Map<string, SuccessfulPresentationHistoryEvent>()
  for (const event of readSuccessfulPresentationHistory()) {
    if (!latestEvents.has(event.credentialId)) latestEvents.set(event.credentialId, event)
  }

  const storage = getCredentialStorage()
  return [...latestEvents.values()]
    .filter((event) => {
      const clearedAt = storage.getString(`${PRESENTATION_BADGE_CLEARED_KEY_PREFIX}${event.credentialId}`)
      return !clearedAt || Date.parse(event.occurredAt) > Date.parse(clearedAt)
    })
    .map((event) => event.credentialId)
}

export function clearSuccessfulPresentationBadge(credentialId: string, now = new Date()): void {
  getCredentialStorage().set(`${PRESENTATION_BADGE_CLEARED_KEY_PREFIX}${credentialId}`, now.toISOString())
}

type PresentationHistoryStorage = {
  getString: (key: string) => string | undefined
}

function readPresentationIds(storage: PresentationHistoryStorage): string[] {
  const raw = storage.getString(PRESENTATION_HISTORY_INDEX_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parsePresentationHistoryEvent(raw: string): SuccessfulPresentationHistoryEvent | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<SuccessfulPresentationHistoryEvent>
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.credentialId === 'string' &&
      typeof parsed.verifierName === 'string' &&
      typeof parsed.documentType === 'string' &&
      Array.isArray(parsed.disclosedClaims) &&
      parsed.disclosedClaims.every((claim) => typeof claim === 'string') &&
      typeof parsed.occurredAt === 'string'
    ) {
      return parsed as SuccessfulPresentationHistoryEvent
    }
  } catch {
    return undefined
  }

  return undefined
}

function createPresentationHistoryId(credentialId: string, occurredAt: string): string {
  return `${credentialId}:${occurredAt}:${Math.random().toString(36).slice(2, 8)}`
}
