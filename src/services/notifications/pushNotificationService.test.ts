import * as Notifications from 'expo-notifications'
import type { EventSubscription } from 'expo-modules-core'
import * as Device from 'expo-device'
import Constants from 'expo-constants'

import { registerPushToken } from '@/src/sdk/pushTokenApi'

import { routeNotificationTap } from './notificationRouter'
import { initPushNotifications, _resetPushNotificationStateForTesting } from './pushNotificationService'

jest.mock('expo-device', () => ({
  isDevice: true,
}))

jest.mock('expo-notifications', () => ({
  AndroidImportance: {
    HIGH: 'high',
  },
  addNotificationResponseReceivedListener: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}))

jest.mock('expo-constants', () => ({
  easConfig: undefined,
  expoConfig: {
    extra: {
      eas: {
        projectId: 'test-project-id',
      },
    },
  },
}))

jest.mock('@/src/sdk/pushTokenApi', () => ({
  registerPushToken: jest.fn(),
}))

jest.mock('./notificationRouter', () => ({
  routeNotificationTap: jest.fn(),
}))

jest.mock('@/src/services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

const getPermissionsAsyncMock = Notifications.getPermissionsAsync as jest.Mock
const requestPermissionsAsyncMock = Notifications.requestPermissionsAsync as jest.Mock
const getExpoPushTokenAsyncMock = Notifications.getExpoPushTokenAsync as jest.Mock
const setNotificationChannelAsyncMock = Notifications.setNotificationChannelAsync as jest.Mock
const setNotificationHandlerMock = Notifications.setNotificationHandler as jest.Mock
const addNotificationResponseReceivedListenerMock =
  Notifications.addNotificationResponseReceivedListener as jest.Mock
const getLastNotificationResponseAsyncMock =
  Notifications.getLastNotificationResponseAsync as jest.Mock
const clearLastNotificationResponseAsyncMock =
  Notifications.clearLastNotificationResponseAsync as jest.Mock
const registerPushTokenMock = registerPushToken as jest.Mock
const routeNotificationTapMock = routeNotificationTap as jest.Mock
const constantsMock = Constants as {
  easConfig?: { projectId?: string }
  expoConfig?: { extra?: { eas?: { projectId?: string } } }
}

describe('pushNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    _resetPushNotificationStateForTesting()
    ;(Device.isDevice as boolean) = true
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    constantsMock.easConfig = undefined
    constantsMock.expoConfig = {
      extra: {
        eas: {
          projectId: 'test-project-id',
        },
      },
    }
    getPermissionsAsyncMock.mockResolvedValue({ status: 'granted', granted: true })
    requestPermissionsAsyncMock.mockResolvedValue({ status: 'granted', granted: true })
    getExpoPushTokenAsyncMock.mockResolvedValue({ data: 'ExponentPushToken[test-token]' })
    setNotificationChannelAsyncMock.mockResolvedValue(undefined)
    addNotificationResponseReceivedListenerMock.mockReturnValue({
      remove: jest.fn(),
    } satisfies EventSubscription)
    getLastNotificationResponseAsyncMock.mockResolvedValue(null)
    registerPushTokenMock.mockResolvedValue(undefined)
  })

  test('registers the Expo push token and installs a tap listener when permission is granted', async () => {
    await initPushNotifications('did:key:zHolder')

    expect(getExpoPushTokenAsyncMock).toHaveBeenCalledWith({ projectId: 'test-project-id' })
    expect(registerPushTokenMock).toHaveBeenCalledWith('ExponentPushToken[test-token]', 'did:key:zHolder')
    expect(setNotificationHandlerMock).toHaveBeenCalledTimes(1)
    expect(addNotificationResponseReceivedListenerMock).toHaveBeenCalledTimes(1)
  })

  test('prefers EXPO_PUBLIC_EAS_PROJECT_ID when provided', async () => {
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID = 'env-project-id'

    await initPushNotifications('did:key:zHolder')

    expect(getExpoPushTokenAsyncMock).toHaveBeenCalledWith({ projectId: 'env-project-id' })
  })

  test('skips registration when notification permission is denied', async () => {
    getPermissionsAsyncMock.mockResolvedValue({ status: 'denied', granted: false })
    requestPermissionsAsyncMock.mockResolvedValue({ status: 'denied', granted: false })

    await initPushNotifications('did:key:zHolder')

    expect(getExpoPushTokenAsyncMock).not.toHaveBeenCalled()
    expect(registerPushTokenMock).not.toHaveBeenCalled()
    expect(addNotificationResponseReceivedListenerMock).not.toHaveBeenCalled()
  })

  test('routes to credential screen when cold-start tap response is present', async () => {
    getLastNotificationResponseAsyncMock.mockResolvedValue({
      notification: {
        request: {
          content: {
            data: { event: 'renewal-ready', credentialId: 'urn:uuid:abc123', credentialType: 'ThaiNationalID' },
          },
        },
      },
    })

    await initPushNotifications('did:key:zHolder')

    expect(routeNotificationTapMock).toHaveBeenCalledWith({
      event: 'renewal-ready',
      credentialId: 'urn:uuid:abc123',
      credentialType: 'ThaiNationalID',
    })
    expect(clearLastNotificationResponseAsyncMock).toHaveBeenCalledTimes(1)
  })
})
