import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { registerPushToken } from '@/src/sdk/pushTokenApi'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import { routeNotificationTap, type NotificationData } from './notificationRouter'

let notificationResponseSubscription:
  | { remove: () => void }
  | undefined

function readExpoProjectId(): string | undefined {
  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  if (typeof envProjectId === 'string' && envProjectId.length > 0) {
    return envProjectId
  }

  const easProjectId = Constants.easConfig?.projectId
  if (typeof easProjectId === 'string' && easProjectId.length > 0) {
    return easProjectId
  }

  const expoProjectId = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId
  return typeof expoProjectId === 'string' && expoProjectId.length > 0
    ? expoProjectId
    : undefined
}

async function ensureNotificationPermission(): Promise<boolean> {
  const currentPermissions = await Notifications.getPermissionsAsync()
  if (currentPermissions.granted) {
    return true
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync()
  return requestedPermissions.granted
}

function readNotificationData(value: unknown): NotificationData {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const record = value as Record<string, unknown>
  return {
    event: typeof record.event === 'string' ? record.event : undefined,
    credentialId: typeof record.credentialId === 'string' ? record.credentialId : undefined,
    credentialType: typeof record.credentialType === 'string' ? record.credentialType : undefined,
  }
}

function installNotificationTapListener(): void {
  notificationResponseSubscription?.remove()
  notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    routeNotificationTap(readNotificationData(response.notification.request.content.data))
  })
}

async function routeLastNotificationResponseIfPresent(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync()
  if (!response) {
    return
  }

  routeNotificationTap(readNotificationData(response.notification.request.content.data))
}

function assertExpoProjectId(projectId: string | undefined): string {
  if (projectId && projectId.length > 0) {
    return projectId
  }

  throw new Error(
    'PushNotificationsProjectIdMissing: configure EXPO_PUBLIC_EAS_PROJECT_ID or app.json expo.extra.eas.projectId for Expo push token registration.',
  )
}

export async function initPushNotifications(holderDid: string): Promise<void> {
  if (!Device.isDevice) {
    logWalletStep('startup', 'push-notifications-skip-simulator')
    return
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      })
    }

    const permissionGranted = await ensureNotificationPermission()
    if (!permissionGranted) {
      logWalletStep('startup', 'push-notifications-permission-denied')
      return
    }

    const projectId = assertExpoProjectId(readExpoProjectId())
    const pushToken = await Notifications.getExpoPushTokenAsync(
      { projectId },
    )

    await registerPushToken(pushToken.data, holderDid)
    logWalletStep('startup', 'push-notifications-token-registered', {
      holderDid,
      tokenLength: pushToken.data.length,
    })

    installNotificationTapListener()
    await routeLastNotificationResponseIfPresent()
  } catch (error) {
    logWalletError('startup', 'push-notifications-init-failed', error, {
      holderDid,
    })
  }
}
