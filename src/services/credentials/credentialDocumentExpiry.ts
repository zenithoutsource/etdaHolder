import {
  DOCUMENT_EXPIRY_TIMEZONE,
  DOCUMENT_EXPIRY_WARNING_WINDOW_DAYS,
} from '@/src/config/documentExpiryPolicy'
import { readCredentialDocumentExpiresAt } from '@/src/services/credentials/credentialDocumentExpiresAt'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export type CredentialExpiryPhase =
  | 'no-expiry'
  | 'active'
  | 'expiring-soon'
  | 'expired'

const bangkokDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DOCUMENT_EXPIRY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function readBangkokCalendarDate(value: Date | string): string | undefined {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return bangkokDateFormatter.format(date)
}

function readExpiryEndInstant(expiresAt: string): Date | undefined {
  const calendarDate = readBangkokCalendarDate(expiresAt)
  if (!calendarDate) return undefined

  const endInstant = new Date(`${calendarDate}T23:59:59.999+07:00`)
  if (Number.isNaN(endInstant.getTime())) return undefined
  return endInstant
}

function subtractCalendarDays(calendarDate: string, days: number): string | undefined {
  const [year, month, day] = calendarDate.split('-').map(Number)
  if (!year || !month || !day) return undefined

  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - days)

  const normalizedYear = date.getUTCFullYear()
  const normalizedMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const normalizedDay = String(date.getUTCDate()).padStart(2, '0')
  return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`
}

function readExpirySoonStartInstant(expiresAt: string): Date | undefined {
  const calendarDate = readBangkokCalendarDate(expiresAt)
  if (!calendarDate) return undefined

  const soonCalendarDate = subtractCalendarDays(
    calendarDate,
    DOCUMENT_EXPIRY_WARNING_WINDOW_DAYS,
  )
  if (!soonCalendarDate) return undefined

  const soonStart = new Date(`${soonCalendarDate}T00:00:00.000+07:00`)
  if (Number.isNaN(soonStart.getTime())) return undefined
  return soonStart
}

export function readCredentialExpiryPhase(
  record: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>,
  now = new Date(),
): CredentialExpiryPhase {
  const expiresAt = readCredentialDocumentExpiresAt(record)
  if (!expiresAt) return 'no-expiry'

  const endInstant = readExpiryEndInstant(expiresAt)
  if (!endInstant) return 'no-expiry'

  const nowMs = now.getTime()
  if (nowMs > endInstant.getTime()) return 'expired'

  const soonStart = readExpirySoonStartInstant(expiresAt)
  if (soonStart && nowMs >= soonStart.getTime()) return 'expiring-soon'

  return 'active'
}

export function isCredentialDocumentExpired(
  record: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>,
  now = new Date(),
): boolean {
  return readCredentialExpiryPhase(record, now) === 'expired'
}

export function isCredentialExpiringSoon(
  record: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>,
  now = new Date(),
): boolean {
  return readCredentialExpiryPhase(record, now) === 'expiring-soon'
}

export function readMsUntilDocumentExpiry(
  record: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>,
  now = Date.now(),
): number | undefined {
  const expiresAt = readCredentialDocumentExpiresAt(record)
  if (!expiresAt) return undefined

  const endInstant = readExpiryEndInstant(expiresAt)
  if (!endInstant) return undefined

  return endInstant.getTime() - now
}

export function readMsUntilExpiringSoonWindow(
  record: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>,
  now = Date.now(),
): number | undefined {
  const expiresAt = readCredentialDocumentExpiresAt(record)
  if (!expiresAt) return undefined

  const soonStart = readExpirySoonStartInstant(expiresAt)
  if (!soonStart) return undefined

  return soonStart.getTime() - now
}

export function readNearestCredentialExpiryBoundaryMs(
  credentials: VerifiableCredentialRecord[],
  now = Date.now(),
): number | undefined {
  const boundaries: number[] = []

  for (const credential of credentials) {
    const expiresAt = readCredentialDocumentExpiresAt(credential)
    if (!expiresAt) continue

    const msUntilSoon = readMsUntilExpiringSoonWindow(credential, now)
    if (msUntilSoon !== undefined && msUntilSoon > 0) {
      boundaries.push(msUntilSoon)
    }

    const msUntilExpiry = readMsUntilDocumentExpiry(credential, now)
    if (msUntilExpiry !== undefined && msUntilExpiry > 0) {
      boundaries.push(msUntilExpiry + 50)
    }
  }

  if (boundaries.length === 0) return undefined
  return Math.min(...boundaries)
}

export function findExpiredCredentialsOfSameType(
  newRecord: VerifiableCredentialRecord,
  credentials: VerifiableCredentialRecord[],
  now = new Date(),
): VerifiableCredentialRecord[] {
  return credentials.filter(
    (credential) =>
      credential.id !== newRecord.id &&
      credential.type === newRecord.type &&
      isCredentialDocumentExpired(credential, now),
  )
}
