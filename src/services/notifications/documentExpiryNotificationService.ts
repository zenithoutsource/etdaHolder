import * as Notifications from 'expo-notifications'

import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { readCredentialDocumentExpiresAt } from '@/src/services/credentials/credentialDocumentExpiresAt'
import {
  isCredentialDocumentExpired,
  isCredentialExpiringSoon,
  readMsUntilDocumentExpiry,
  readMsUntilExpiringSoonWindow,
} from '@/src/services/credentials/credentialDocumentExpiry'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { getCredentialStorage } from '@/src/services/storage/storage'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

const EXPIRY_NOTIFICATION_SCHEDULED_PREFIX = 'credential:expiry-notif-scheduled:'
const EXPIRY_NOTIFICATION_ID_PREFIX = 'credential:expiry-notif-id:'

export type DocumentExpiryNotificationEvent =
  | 'document-expiring-soon'
  | 'document-expired'

type ScheduledNotificationRecord = {
  notificationId: string
  event: DocumentExpiryNotificationEvent
}

function readScheduledNotificationKey(
  credentialId: string,
  event: DocumentExpiryNotificationEvent,
): string {
  return `${EXPIRY_NOTIFICATION_SCHEDULED_PREFIX}${event}:${credentialId}`
}

function readNotificationIdKey(
  credentialId: string,
  event: DocumentExpiryNotificationEvent,
): string {
  return `${EXPIRY_NOTIFICATION_ID_PREFIX}${event}:${credentialId}`
}

function hasScheduledNotification(
  credentialId: string,
  event: DocumentExpiryNotificationEvent,
): boolean {
  return Boolean(
    getCredentialStorage().getString(readScheduledNotificationKey(credentialId, event)),
  )
}

function markScheduledNotification(
  credentialId: string,
  event: DocumentExpiryNotificationEvent,
  notificationId: string,
): void {
  const storage = getCredentialStorage()
  storage.set(
    readScheduledNotificationKey(credentialId, event),
    JSON.stringify({ notificationId, event } satisfies ScheduledNotificationRecord),
  )
  storage.set(readNotificationIdKey(credentialId, event), notificationId)
}

async function cancelScheduledNotification(
  credentialId: string,
  event: DocumentExpiryNotificationEvent,
): Promise<void> {
  const storage = getCredentialStorage()
  const notificationId = storage.getString(readNotificationIdKey(credentialId, event))
  if (notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId)
    } catch (error) {
      logWalletError('document-expiry-notifications', 'cancel-failed', error, {
        credentialId,
        event,
      })
    }
  }

  storage.remove(readScheduledNotificationKey(credentialId, event))
  storage.remove(readNotificationIdKey(credentialId, event))
}

async function scheduleNotificationAt(
  credential: VerifiableCredentialRecord,
  event: DocumentExpiryNotificationEvent,
  fireAtMs: number,
  now = Date.now(),
): Promise<void> {
  if (hasScheduledNotification(credential.id, event)) {
    return
  }

  const delayMs = fireAtMs - now
  if (delayMs <= 0) {
    return
  }

  const content =
    event === 'document-expiring-soon'
      ? {
          title: WALLET_HOME_COPY.documentExpiringSoonNotificationTitle,
          body: WALLET_HOME_COPY.documentExpiringSoonNotificationBody,
        }
      : {
          title: WALLET_HOME_COPY.documentExpiredNotificationTitle,
          body: WALLET_HOME_COPY.documentExpiredNotificationBody,
        }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        ...content,
        data: {
          event,
          credentialId: credential.id,
          credentialType: credential.type,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAtMs),
      },
    })

    markScheduledNotification(credential.id, event, notificationId)
    logWalletStep('document-expiry-notifications', 'scheduled', {
      credentialId: credential.id,
      event,
      fireAtMs,
    })
  } catch (error) {
    logWalletError('document-expiry-notifications', 'schedule-failed', error, {
      credentialId: credential.id,
      event,
    })
  }
}

export async function scheduleDocumentExpiryNotifications(
  credentials: VerifiableCredentialRecord[],
  now = Date.now(),
): Promise<void> {
  for (const credential of credentials) {
    if (!readCredentialDocumentExpiresAt(credential)) continue

    if (isCredentialDocumentExpired(credential, new Date(now))) {
      await cancelScheduledNotification(credential.id, 'document-expiring-soon')
      continue
    }

    await cancelScheduledNotification(credential.id, 'document-expired')

    const msUntilSoon = readMsUntilExpiringSoonWindow(credential, now)
    if (
      msUntilSoon !== undefined &&
      (isCredentialExpiringSoon(credential, new Date(now)) || msUntilSoon <= 0)
    ) {
      const soonFireAt = msUntilSoon > 0 ? now + msUntilSoon : now + 1000
      await scheduleNotificationAt(
        credential,
        'document-expiring-soon',
        soonFireAt,
        now,
      )
    } else if (msUntilSoon !== undefined && msUntilSoon > 0) {
      await scheduleNotificationAt(
        credential,
        'document-expiring-soon',
        now + msUntilSoon,
        now,
      )
    }

    const msUntilExpiry = readMsUntilDocumentExpiry(credential, now)
    if (msUntilExpiry !== undefined && msUntilExpiry > 0) {
      await scheduleNotificationAt(
        credential,
        'document-expired',
        now + msUntilExpiry + 60_000,
        now,
      )
    }
  }
}

export async function cancelDocumentExpiryNotifications(
  credentialId: string,
): Promise<void> {
  await cancelScheduledNotification(credentialId, 'document-expiring-soon')
  await cancelScheduledNotification(credentialId, 'document-expired')
}

export async function rescheduleDocumentExpiryNotifications(
  credentials: VerifiableCredentialRecord[],
): Promise<void> {
  for (const credential of credentials) {
    await cancelDocumentExpiryNotifications(credential.id)
  }

  await scheduleDocumentExpiryNotifications(credentials)
}
