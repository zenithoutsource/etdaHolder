import * as Notifications from 'expo-notifications'

import {
  rescheduleDocumentExpiryNotifications,
  scheduleDocumentExpiryNotifications,
} from './documentExpiryNotificationService'
import { getCredentialStorage } from '@/src/services/storage/storage'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}))

jest.mock('@/src/services/storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

jest.mock('@/src/services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock
const scheduleNotificationAsyncMock =
  Notifications.scheduleNotificationAsync as jest.Mock
const cancelAllScheduledNotificationsAsyncMock =
  Notifications.cancelAllScheduledNotificationsAsync as jest.Mock
const cancelScheduledNotificationAsyncMock =
  Notifications.cancelScheduledNotificationAsync as jest.Mock
const getAllScheduledNotificationsAsyncMock =
  Notifications.getAllScheduledNotificationsAsync as jest.Mock

function mockStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
      return true
    }),
    getAllKeys: jest.fn(() => Array.from(values.keys())),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { storage, values }
}

const thaiIdCredential: VerifiableCredentialRecord = {
  id: 'credential-1',
  type: 'ThaiNationalID',
  rawVc: 'vc',
  claims: {
    expiryDate: '11 มิถุนายน 2575',
    exp: Math.floor(new Date('2032-05-11T00:00:00.000Z').getTime() / 1000),
  },
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2032-05-11T00:00:00.000Z',
}

describe('documentExpiryNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    scheduleNotificationAsyncMock.mockResolvedValue('notification-id')
    cancelAllScheduledNotificationsAsyncMock.mockResolvedValue(undefined)
    cancelScheduledNotificationAsyncMock.mockResolvedValue(undefined)
    getAllScheduledNotificationsAsyncMock.mockResolvedValue([
      { identifier: 'notification-id' },
      { identifier: 'stale-id' },
      { identifier: 'stale-soon-id' },
      { identifier: 'old-notification-id' },
    ])
  })

  test('schedules expiry notifications from Thai claim expiry instead of JWT exp', async () => {
    mockStorage()
    const now = new Date('2032-05-12T12:00:00+07:00').getTime()

    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)

    const scheduledEvents = scheduleNotificationAsyncMock.mock.calls.map(
      ([request]) => request.content.data.event,
    )
    expect(scheduledEvents).toContain('document-expiring-soon')
    expect(scheduledEvents).toContain('document-expired')

    const expiredSchedule = scheduleNotificationAsyncMock.mock.calls.find(
      ([request]) => request.content.data.event === 'document-expired',
    )
    expect(expiredSchedule?.[0].trigger.date.getTime()).toBeGreaterThan(now)
  })

  test('does not schedule document-expired when the credential is already expired', async () => {
    mockStorage()
    const now = new Date('2032-06-12T12:00:00+07:00').getTime()

    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)

    const scheduledEvents = scheduleNotificationAsyncMock.mock.calls.map(
      ([request]) => request.content.data.event,
    )
    expect(scheduledEvents).not.toContain('document-expired')
    expect(scheduledEvents).not.toContain('document-expiring-soon')
  })

  test('keeps repeated scheduling idempotent for an unchanged credential', async () => {
    mockStorage()
    const now = new Date('2032-05-12T12:00:00+07:00').getTime()

    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)
    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)

    const scheduledEvents = scheduleNotificationAsyncMock.mock.calls.map(
      ([request]) => request.content.data.event,
    )
    expect(scheduledEvents.filter((event) => event === 'document-expired')).toHaveLength(1)
    expect(scheduledEvents.filter((event) => event === 'document-expiring-soon')).toHaveLength(1)
    expect(cancelScheduledNotificationAsyncMock).not.toHaveBeenCalled()
  })

  test('rebuilds a stored scheduled marker when the native alarm is missing', async () => {
    const { values } = mockStorage({
      'credential:expiry-notif-scheduled:document-expiring-soon:credential-1':
        JSON.stringify({ notificationId: 'missing-native-id', event: 'document-expiring-soon' }),
      'credential:expiry-notif-id:document-expiring-soon:credential-1': 'missing-native-id',
    })
    getAllScheduledNotificationsAsyncMock.mockResolvedValue([])
    const now = new Date('2032-05-20T12:00:00+07:00').getTime()

    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)

    expect(values.get('credential:expiry-notif-id:document-expiring-soon:credential-1')).toBe(
      'notification-id',
    )
    expect(scheduleNotificationAsyncMock).toHaveBeenCalled()
  })

  test('recovers from Android alarm cap by clearing stale scheduled notification state and retrying once', async () => {
    const { values } = mockStorage({
      'credential:expiry-notif-scheduled:document-expired:old-credential':
        JSON.stringify({ notificationId: 'old-notification-id', event: 'document-expired' }),
      'credential:expiry-notif-id:document-expired:old-credential': 'old-notification-id',
    })
    const alarmCapError = Object.assign(
      new Error('Failed to schedule the notification. Maximum limit of concurrent alarms 500 reached'),
      { code: 'ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE' },
    )
    scheduleNotificationAsyncMock
      .mockRejectedValueOnce(alarmCapError)
      .mockResolvedValueOnce('recovered-notification-id')
    const now = new Date('2032-05-20T12:00:00+07:00').getTime()
    getAllScheduledNotificationsAsyncMock.mockResolvedValue([
      { identifier: 'recovered-notification-id' },
      { identifier: 'notification-id' },
    ])

    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)

    expect(cancelAllScheduledNotificationsAsyncMock).toHaveBeenCalledTimes(1)
    expect(scheduleNotificationAsyncMock).toHaveBeenCalledTimes(3)
    expect(values.has('credential:expiry-notif-id:document-expired:old-credential')).toBe(false)
    expect(values.get('credential:expiry-notif-id:document-expiring-soon:credential-1')).toBe(
      'recovered-notification-id',
    )
    expect(values.get('credential:expiry-notif-id:document-expired:credential-1')).toBe(
      'notification-id',
    )
  })

  test('rebuilds marker-skipped notifications after alarm-cap recovery clears native alarms', async () => {
    const { values } = mockStorage({
      'credential:expiry-notif-scheduled:document-expiring-soon:credential-1':
        JSON.stringify({ notificationId: 'stale-soon-id', event: 'document-expiring-soon' }),
      'credential:expiry-notif-id:document-expiring-soon:credential-1': 'stale-soon-id',
    })
    const alarmCapError = Object.assign(
      new Error('Failed to schedule the notification. Maximum limit of concurrent alarms 500 reached'),
      { code: 'ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE' },
    )
    scheduleNotificationAsyncMock
      .mockRejectedValueOnce(alarmCapError)
      .mockResolvedValueOnce('recovered-expired-id')
      .mockResolvedValueOnce('rebuilt-soon-id')
    const now = new Date('2032-05-20T12:00:00+07:00').getTime()
    getAllScheduledNotificationsAsyncMock
      .mockResolvedValueOnce([{ identifier: 'stale-soon-id' }])
      .mockResolvedValueOnce([{ identifier: 'recovered-expired-id' }])

    await scheduleDocumentExpiryNotifications([thaiIdCredential], now)

    expect(cancelAllScheduledNotificationsAsyncMock).toHaveBeenCalledTimes(1)
    expect(values.get('credential:expiry-notif-id:document-expiring-soon:credential-1')).toBe(
      'rebuilt-soon-id',
    )
    expect(values.get('credential:expiry-notif-id:document-expired:credential-1')).toBe(
      'recovered-expired-id',
    )
  })

  test('cancels stale scheduled document-expired notifications on reschedule', async () => {
    mockStorage({
      'credential:expiry-notif-scheduled:document-expired:credential-1':
        JSON.stringify({ notificationId: 'stale-id', event: 'document-expired' }),
      'credential:expiry-notif-id:document-expired:credential-1': 'stale-id',
    })

    await rescheduleDocumentExpiryNotifications([thaiIdCredential])

    expect(cancelScheduledNotificationAsyncMock).toHaveBeenCalledWith('stale-id')
  })
})
