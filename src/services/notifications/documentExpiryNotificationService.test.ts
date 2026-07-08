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
  cancelScheduledNotificationAsync: jest.fn(),
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
const cancelScheduledNotificationAsyncMock =
  Notifications.cancelScheduledNotificationAsync as jest.Mock

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
    cancelScheduledNotificationAsyncMock.mockResolvedValue(undefined)
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
