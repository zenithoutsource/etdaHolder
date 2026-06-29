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
    logWalletStep('startup', 'push-notification-tap-ignored', {
      event: data.event,
      reason: 'missing-credential-id',
    })
    return
  }

  logWalletStep('startup', 'push-notification-tap-route', {
    event: data.event,
    credentialId: data.credentialId,
  })
  router.push(`/(tabs)/credential/${data.credentialId}`)
}
