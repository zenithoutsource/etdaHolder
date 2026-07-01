import { router } from 'expo-router'

import { logWalletStep } from '@/src/services/debug/walletLogger'

export type NotificationEvent =
  | 'renewal-ready'
  | 'renewal-required'
  | 'issuer-suspended'
  | 'cleanup-pending'
  | 'old-revoked'

export type NotificationData = {
  event?: NotificationEvent | string
  credentialId?: string
  credentialType?: string
}

export function routeNotificationTap(data: NotificationData): void {
  if (!data.credentialId) {
    logWalletStep('push-notifications', 'tap-ignored', {
      event: data.event,
      reason: 'missing-credential-id',
    })
    return
  }

  if (!/^[\w:.-]+$/.test(data.credentialId)) {
    logWalletStep('push-notifications', 'tap-ignored', {
      event: data.event,
      reason: 'invalid-credential-id',
    })
    return
  }

  logWalletStep('push-notifications', 'tap-route', { event: data.event })
  router.replace({
    pathname: '/(tabs)/credential/[id]',
    params: data.event === 'renewal-ready'
      ? {
          id: data.credentialId,
          notificationEvent: 'renewal-ready',
        }
      : { id: data.credentialId },
  })
}
