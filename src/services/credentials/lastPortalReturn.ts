import type { IssuanceCallbackLogSummary } from './describeIssuanceCallbackForLog'

export type LastPortalReturnRecord = {
  at: number
  credentialType?: string
  resultType?: string
  source: 'auth-session' | 'linking-event' | 'android-fallback' | 'callback-route' | 'none'
  summary: IssuanceCallbackLogSummary
  outcome: 'offer' | 'empty-callback' | 'cancelled' | 'unrecognized'
}

let lastPortalReturn: LastPortalReturnRecord | null = null

export function recordLastPortalReturn(record: LastPortalReturnRecord): void {
  lastPortalReturn = record
}

export function consumeLastPortalReturn(): LastPortalReturnRecord | null {
  const current = lastPortalReturn
  lastPortalReturn = null
  return current
}

export function peekLastPortalReturn(): LastPortalReturnRecord | null {
  return lastPortalReturn
}

export function formatPortalReturnDiagnostic(record: LastPortalReturnRecord): string {
  const keys = record.summary.queryKeys.length > 0
    ? record.summary.queryKeys.join(', ')
    : '(none)'
  const offerHost = record.summary.offerUriHost ?? '(none)'
  return [
    `result: ${record.resultType ?? 'n/a'}`,
    `source: ${record.source}`,
    `queryKeys: ${keys}`,
    `hasOfferUri: ${record.summary.hasCredentialOfferUri ? 'yes' : 'no'}`,
    `offerHost: ${offerHost}`,
  ].join('\n')
}
