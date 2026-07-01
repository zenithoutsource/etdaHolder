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
let notificationHandlerInstalled = false

export function _resetPushNotificationStateForTesting(): void {
  notificationResponseSubscription?.remove()
  notificationResponseSubscription = undefined
  notificationHandlerInstalled = false
}

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

async function retryable<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) {
        logWalletStep('startup', 'push-token-server-register-retry', { attempt })
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt))
      }
    }
  }
  throw lastError
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

function installNotificationPresentationHandler(): void {
  if (notificationHandlerInstalled) {
    return
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
  notificationHandlerInstalled = true
}

async function routeLastNotificationResponseIfPresent(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync()
  if (!response) {
    return
  }

  routeNotificationTap(readNotificationData(response.notification.request.content.data))
  await Notifications.clearLastNotificationResponseAsync()
}

function assertExpoProjectId(projectId: string | undefined): string {
  if (projectId && projectId.length > 0) {
    return projectId
  }

  throw new Error(
    'PushNotificationsProjectIdMissing: configure EXPO_PUBLIC_EAS_PROJECT_ID or app.json expo.extra.eas.projectId for Expo push token registration.',
  )
}

export async function syncPushTokenRegistration(holderDid: string): Promise<boolean> {
  if (__DEV__ && process.env.EXPO_PUBLIC_SKIP_PUSH_REGISTRATION === 'true') {
    logWalletStep('startup', 'push-notifications-skip-dev-flag')
    return false
  }

  const permissionGranted = await ensureNotificationPermission()
  if (!permissionGranted) {
    logWalletStep('startup', 'push-notifications-permission-denied')
    return false
  }

  const projectId = assertExpoProjectId(readExpoProjectId())

  logWalletStep('startup', 'push-token-native-fetch-start')
  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId })
  logWalletStep('startup', 'push-token-native-fetch-complete', { tokenLength: pushToken.data.length })

  logWalletStep('startup', 'push-token-server-register-start')
  await retryable(() => registerPushToken(pushToken.data, holderDid), 3, 2000)
  logWalletStep('startup', 'push-notifications-token-registered', {
    holderDidLength: holderDid.length,
    tokenLength: pushToken.data.length,
  })
  return true
}

export async function initPushNotifications(holderDid: string): Promise<void> {
  if (!Device.isDevice) {
    logWalletStep('startup', 'push-notifications-skip-simulator')
    return
  }

  try {
    installNotificationPresentationHandler()

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      })
    }

    const registered = await syncPushTokenRegistration(holderDid)
    if (!registered) {
      return
    }
    installNotificationTapListener()
    await routeLastNotificationResponseIfPresent()
  } catch (error) {
    logWalletError('startup', 'push-notifications-init-failed', error, {
      holderDid,
    })
  }
}
