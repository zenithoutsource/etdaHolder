import { useNotificationRouteStore } from './notificationRouteStore'

describe('notificationRouteStore', () => {
  beforeEach(() => {
    useNotificationRouteStore.setState({ pendingRoute: null })
  })

  it('consumes a pending notification route only once', () => {
    useNotificationRouteStore.getState().setPendingNotificationRoute({
      pathname: '/(tabs)/credential/[id]',
      params: { id: 'cred-123', notificationEvent: 'renewal-ready' },
    })

    expect(useNotificationRouteStore.getState().consumePendingNotificationRoute()).toEqual({
      pathname: '/(tabs)/credential/[id]',
      params: { id: 'cred-123', notificationEvent: 'renewal-ready' },
    })
    expect(useNotificationRouteStore.getState().consumePendingNotificationRoute()).toBeNull()
  })

  it('starts with no pending route', () => {
    expect(useNotificationRouteStore.getState().pendingRoute).toBeNull()
  })
})
