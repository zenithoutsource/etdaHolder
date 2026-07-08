import { appendWalletHistoryEvent, type WalletHistoryEvent } from './walletEventLog'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

const DEV_SUSPEND_ACCESS_ENDPOINT = '/wallet-api/dev/presentation/suspend-access'

export async function requestPresentationAccessSuspension(
  event: WalletHistoryEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<WalletHistoryEvent | undefined> {
  try {
    const response = await fetchImpl(DEV_SUSPEND_ACCESS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        eventId: event.id,
        credentialId: event.credentialId,
        partyName: event.partyName,
      }),
    })

    if (!response.ok) {
      logWalletError(
        'history',
        'suspend-access-request-failed',
        new Error(`Http${response.status}`),
        { eventId: event.id },
      )
    } else {
      logWalletStep('history', 'suspend-access-request-sent', { eventId: event.id })
    }
  } catch (error) {
    logWalletError('history', 'suspend-access-request-failed', error, { eventId: event.id })
  }

  return appendWalletHistoryEvent({
    kind: 'presentation-access-suspended',
    credentialId: event.credentialId,
    documentType: event.documentType,
    partyName: event.partyName,
    disclosedClaims: event.disclosedClaims,
    channel: event.channel === 'wallet' ? 'wallet' : 'oid4vp',
    relatedEventId: event.id,
  })
}
