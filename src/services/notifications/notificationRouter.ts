import { logWalletStep } from '@/src/services/debug/walletLogger'
import { notifyCredentialsChanged , readStoredCredentials } from '@/src/services/credentials/storedCredentials'
import { rescheduleDocumentExpiryNotifications } from '@/src/services/notifications/documentExpiryNotificationService'

import { useNotificationRouteStore, type PendingNotificationRoute } from '@/src/store/notificationRouteStore'

export type NotificationEvent =
  | 'renewal-ready'
  | 'renewal-required'
  | 'issuer-suspended'
  | 'cleanup-pending'
  | 'old-revoked'
  | 'document-expiring-soon'
  | 'document-expired'

export type NotificationData = {
  event?: NotificationEvent | string
  credentialId?: string
  credentialType?: string
}

export function buildNotificationRoute(data: NotificationData): PendingNotificationRoute | undefined {
  if (!data.credentialId) {
    logWalletStep('push-notifications', 'tap-ignored', {
      event: data.event,
      reason: 'missing-credential-id',
    })
    return undefined
  }

  if (!/^[\w:.-]+$/.test(data.credentialId)) {
    logWalletStep('push-notifications', 'tap-ignored', {
      event: data.event,
      reason: 'invalid-credential-id',
    })
    return undefined
  }

  return {
    pathname: '/(tabs)/credential/[id]',
    params:
      data.event === 'renewal-ready'
        ? {
            id: data.credentialId,
            notificationEvent: 'renewal-ready',
          }
        : data.event === 'document-expiring-soon' || data.event === 'document-expired'
          ? {
              id: data.credentialId,
              notificationEvent: data.event,
            }
          : { id: data.credentialId },
  }
}

export function routeNotificationTap(data: NotificationData): void {
  const route = buildNotificationRoute(data)
  if (!route) return

  if (data.event === 'document-expiring-soon' || data.event === 'document-expired') {
    notifyCredentialsChanged()
    void rescheduleDocumentExpiryNotifications(readStoredCredentials())
  }

  logWalletStep('push-notifications', 'tap-route', { event: data.event })
  useNotificationRouteStore.getState().setPendingNotificationRoute(route)
}
