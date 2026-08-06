import { readCredentialExpiryPhase } from '@/src/services/credentials/credentialDocumentExpiry'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

export function isStaleDocumentExpiryNotification({
  notificationEvent,
  credential,
  now = new Date(),
}: {
  notificationEvent?: string | string[]
  credential?: Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims' | 'type'>
  now?: Date
}): boolean {
  const event = Array.isArray(notificationEvent)
    ? notificationEvent[0]
    : notificationEvent

  if (
    !credential ||
    (event !== 'document-expired' && event !== 'document-expiring-soon')
  ) {
    return false
  }

  const phase = readCredentialExpiryPhase(credential, now)
  if (event === 'document-expired') return phase !== 'expired'
  return phase !== 'expiring-soon'
}
