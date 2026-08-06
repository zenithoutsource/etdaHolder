import { buildNotificationRoute, routeNotificationTap } from './notificationRouter'
import { useNotificationRouteStore } from '@/src/store/notificationRouteStore'
import {
  notifyCredentialsChanged,
  readStoredCredentials,
} from '@/src/services/credentials/storedCredentials'
import { rescheduleDocumentExpiryNotifications } from './documentExpiryNotificationService'

jest.mock('@/src/services/credentials/storedCredentials', () => ({
  notifyCredentialsChanged: jest.fn(),
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('./documentExpiryNotificationService', () => ({
  rescheduleDocumentExpiryNotifications: jest.fn(),
}))

const notifyCredentialsChangedMock = notifyCredentialsChanged as jest.Mock
const readStoredCredentialsMock = readStoredCredentials as jest.Mock
const rescheduleDocumentExpiryNotificationsMock =
  rescheduleDocumentExpiryNotifications as jest.Mock

describe('notificationRouter', () => {
  beforeEach(() => {
    useNotificationRouteStore.setState({ pendingRoute: null })
    notifyCredentialsChangedMock.mockClear()
    readStoredCredentialsMock.mockReturnValue([])
    rescheduleDocumentExpiryNotificationsMock.mockClear()
  })

  describe('buildNotificationRoute', () => {
    test('builds renewal-ready routes with notification context for replacement handoff', () => {
      expect(buildNotificationRoute({
        event: 'renewal-ready',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })).toEqual({
        pathname: '/(tabs)/credential/[id]',
        params: {
          id: 'cred-123',
          notificationEvent: 'renewal-ready',
        },
      })
    })

    test('builds non-renewal-ready credential routes to credential detail', () => {
      expect(buildNotificationRoute({
        event: 'issuer-suspended',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })).toEqual({
        pathname: '/(tabs)/credential/[id]',
        params: { id: 'cred-123' },
      })
    })

    test('builds document expiry routes with notification context', () => {
      expect(buildNotificationRoute({
        event: 'document-expiring-soon',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })).toEqual({
        pathname: '/(tabs)/credential/[id]',
        params: {
          id: 'cred-123',
          notificationEvent: 'document-expiring-soon',
        },
      })

      expect(buildNotificationRoute({
        event: 'document-expired',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })).toEqual({
        pathname: '/(tabs)/credential/[id]',
        params: {
          id: 'cred-123',
          notificationEvent: 'document-expired',
        },
      })
    })

    test('ignores notification taps without a credential id', () => {
      expect(buildNotificationRoute({
        event: 'renewal-ready',
        credentialType: 'ThaiNationalID',
      })).toBeUndefined()
    })

    test('routes presentation-request taps to My QR without requiring credentialId', () => {
      expect(buildNotificationRoute({
        event: 'presentation-request',
        session_id: '989cc1b5-6443-41be-b0e2-7c38fabfd14b',
      })).toEqual({
        pathname: '/(tabs)/qr',
        params: { brokerSessionId: '989cc1b5-6443-41be-b0e2-7c38fabfd14b' },
      })
    })

    test('ignores presentation-request taps without a session id', () => {
      expect(buildNotificationRoute({
        event: 'presentation-request',
      })).toBeUndefined()
    })
  })

  describe('routeNotificationTap', () => {
    test('stores a pending route instead of navigating directly, deferring to the PIN gate', () => {
      routeNotificationTap({
        event: 'renewal-ready',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })

      expect(useNotificationRouteStore.getState().pendingRoute).toEqual({
        pathname: '/(tabs)/credential/[id]',
        params: {
          id: 'cred-123',
          notificationEvent: 'renewal-ready',
        },
      })
    })

    test('does not store a pending route for taps without a credential id', () => {
      routeNotificationTap({
        event: 'renewal-ready',
        credentialType: 'ThaiNationalID',
      })

      expect(useNotificationRouteStore.getState().pendingRoute).toBeNull()
    })

    test('publishes an expiry revision when a document expiry notification is tapped', () => {
      routeNotificationTap({
        event: 'document-expired',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })

      expect(notifyCredentialsChangedMock).toHaveBeenCalledTimes(1)
      expect(readStoredCredentialsMock).toHaveBeenCalledTimes(1)
      expect(rescheduleDocumentExpiryNotificationsMock).toHaveBeenCalledWith([])
    })
  })
})
