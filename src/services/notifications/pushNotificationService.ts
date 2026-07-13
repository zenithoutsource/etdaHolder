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
let pushInitialization:
  | { holderDid: string; promise: Promise<void> }
  | undefined

export function _resetPushNotificationStateForTesting(): void {
  notificationResponseSubscription?.remove()
  notificationResponseSubscription = undefined
  notificationHandlerInstalled = false
  pushInitialization = undefined
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

type RetryOptions = {
  retryEvent: string
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

async function retryable<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
  options?: RetryOptions,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const hasMoreAttempts = attempt < maxAttempts
      const shouldRetry = options?.shouldRetry ? options.shouldRetry(error, attempt) : true
      if (!hasMoreAttempts || !shouldRetry) {
        throw error
      }

      logWalletStep('startup', options?.retryEvent ?? 'push-token-retry', { attempt })
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt))
    }
  }
  throw lastError
}

function isTransientPushTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toUpperCase()
  if (message.includes('SERVICE_NOT_AVAILABLE')) {
    return true
  }

  const code = (error as Error & { code?: unknown }).code
  return code === 'E_REGISTRATION_FAILED' && message.includes('UNAVAILABLE')
}

async function fetchExpoPushToken(projectId: string): Promise<Notifications.ExpoPushToken> {
  return retryable(
    () => Notifications.getExpoPushTokenAsync({ projectId }),
    3,
    2000,
    {
      retryEvent: 'push-token-native-fetch-retry',
      shouldRetry: (error) => isTransientPushTokenError(error),
    },
  )
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

async function registerPushTokenWithBackend(holderDid: string): Promise<boolean> {
  if (__DEV__ && process.env.EXPO_PUBLIC_SKIP_PUSH_REGISTRATION === 'true') {
    logWalletStep('startup', 'push-notifications-skip-dev-flag')
    return false
  }

  const projectId = assertExpoProjectId(readExpoProjectId())

  logWalletStep('startup', 'push-token-native-fetch-start')
  const pushToken = await fetchExpoPushToken(projectId)
  logWalletStep('startup', 'push-token-native-fetch-complete', { tokenLength: pushToken.data.length })

  logWalletStep('startup', 'push-token-server-register-start')
  await retryable(() => registerPushToken(pushToken.data, holderDid), 3, 2000, {
    retryEvent: 'push-token-server-register-retry',
  })
  logWalletStep('startup', 'push-notifications-token-registered', {
    holderDidLength: holderDid.length,
    tokenLength: pushToken.data.length,
  })
  return true
}

export async function syncPushTokenRegistration(holderDid: string): Promise<boolean> {
  const permissionGranted = await ensureNotificationPermission()
  if (!permissionGranted) {
    logWalletStep('startup', 'push-notifications-permission-denied')
    return false
  }

  return registerPushTokenWithBackend(holderDid)
}

async function initializePushNotifications(holderDid: string): Promise<void> {
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

    const permissionGranted = await ensureNotificationPermission()
    if (!permissionGranted) {
      logWalletStep('startup', 'push-notifications-permission-denied')
      return
    }
    await registerPushTokenWithBackend(holderDid)
    installNotificationTapListener()
    await routeLastNotificationResponseIfPresent()
  } catch (error) {
    logWalletError('startup', 'push-notifications-init-failed', error, {
      holderDid,
      ...(isTransientPushTokenError(error)
        ? {
            hint: 'Google Play services or network to FCM may be unavailable. Update Play services, check connectivity, or rebuild the native app after google-services.json changes.',
          }
        : {}),
    })
  }
}

export function initPushNotifications(holderDid: string): Promise<void> {
  if (pushInitialization?.holderDid === holderDid) {
    return pushInitialization.promise
  }

  const promise = initializePushNotifications(holderDid)
  const state = { holderDid, promise }
  pushInitialization = state
  void promise.catch(() => {
    if (pushInitialization === state) {
      pushInitialization = undefined
    }
  })
  return promise
}

export function launchPushNotificationsInBackground(
  holderDid: string,
  initializer: (did: string) => Promise<void> = initPushNotifications,
): void {
  void initializer(holderDid).catch((error: unknown) => {
    logWalletError('startup', 'push-notifications-background-init-failed', error)
  })
}
