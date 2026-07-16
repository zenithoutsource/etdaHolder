import {
  clearCachedExpoPushToken,
  getCachedExpoPushToken,
  resolveDeviceTokenForBroker,
  setCachedExpoPushToken,
} from './expoPushTokenCache'

// expoPushTokenCache.ts imports pushNotificationService.ts (for the default fetch
// helper), which imports these native modules at module scope. Mock them here too
// so loading the cache module under test never touches native code.
jest.mock('expo-device', () => ({
  isDevice: true,
}))

jest.mock('expo-notifications', () => ({
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
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
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

describe('expoPushTokenCache', () => {
  beforeEach(() => {
    clearCachedExpoPushToken()
  })

  test('getCachedExpoPushToken returns null before any set', () => {
    expect(getCachedExpoPushToken()).toBeNull()
  })

  test('set then get returns the cached token', () => {
    setCachedExpoPushToken('ExponentPushToken[abc]')

    expect(getCachedExpoPushToken()).toBe('ExponentPushToken[abc]')
  })

  test('clearCachedExpoPushToken resets the cache to null', () => {
    setCachedExpoPushToken('ExponentPushToken[abc]')
    clearCachedExpoPushToken()

    expect(getCachedExpoPushToken()).toBeNull()
  })

  describe('resolveDeviceTokenForBroker', () => {
    test('returns the cached token without invoking the fetch helper', async () => {
      setCachedExpoPushToken('ExponentPushToken[cached]')
      const fetchToken = jest.fn()

      const result = await resolveDeviceTokenForBroker(fetchToken)

      expect(result).toBe('ExponentPushToken[cached]')
      expect(fetchToken).not.toHaveBeenCalled()
    })

    test('fetches and caches the token once when nothing is cached', async () => {
      const fetchToken = jest.fn().mockResolvedValue('ExponentPushToken[fetched]')

      const result = await resolveDeviceTokenForBroker(fetchToken)

      expect(result).toBe('ExponentPushToken[fetched]')
      expect(fetchToken).toHaveBeenCalledTimes(1)
      expect(getCachedExpoPushToken()).toBe('ExponentPushToken[fetched]')
    })

    test('resolves to an empty string when the fetch helper throws', async () => {
      const fetchToken = jest.fn().mockRejectedValue(new Error('native-fetch-failed'))

      const result = await resolveDeviceTokenForBroker(fetchToken)

      expect(result).toBe('')
      expect(getCachedExpoPushToken()).toBeNull()
    })
  })
})
