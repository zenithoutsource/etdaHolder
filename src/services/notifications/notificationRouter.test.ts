import { buildNotificationRoute, routeNotificationTap } from './notificationRouter'
import { useNotificationRouteStore } from '@/src/store/notificationRouteStore'

describe('notificationRouter', () => {
  beforeEach(() => {
    useNotificationRouteStore.setState({ pendingRoute: null })
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

    test('builds document expiry routes to credential detail', () => {
      expect(buildNotificationRoute({
        event: 'document-expiring-soon',
        credentialId: 'cred-123',
        credentialType: 'ThaiNationalID',
      })).toEqual({
        pathname: '/(tabs)/credential/[id]',
        params: { id: 'cred-123' },
      })
    })

    test('ignores notification taps without a credential id', () => {
      expect(buildNotificationRoute({
        event: 'renewal-ready',
        credentialType: 'ThaiNationalID',
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
  })
})
