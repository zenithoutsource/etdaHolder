import { router } from 'expo-router'

import { routeNotificationTap } from './notificationRouter'

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}))

const routerPushMock = router.push as jest.Mock
const routerReplaceMock = router.replace as jest.Mock

describe('notificationRouter', () => {
  beforeEach(() => {
    routerPushMock.mockReset()
    routerReplaceMock.mockReset()
  })

  test('routes renewal-ready taps with notification context for replacement handoff', () => {
    routeNotificationTap({
      event: 'renewal-ready',
      credentialId: 'cred-123',
      credentialType: 'ThaiNationalID',
    })

    expect(routerReplaceMock).toHaveBeenCalledWith({
      pathname: '/(tabs)/credential/[id]',
      params: {
        id: 'cred-123',
        notificationEvent: 'renewal-ready',
      },
    })
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  test('routes non-renewal-ready credential taps to credential detail', () => {
    routeNotificationTap({
      event: 'issuer-suspended',
      credentialId: 'cred-123',
      credentialType: 'ThaiNationalID',
    })

    expect(routerReplaceMock).toHaveBeenCalledWith({
      pathname: '/(tabs)/credential/[id]',
      params: { id: 'cred-123' },
    })
  })

  test('ignores notification taps without a credential id', () => {
    routeNotificationTap({
      event: 'renewal-ready',
      credentialType: 'ThaiNationalID',
    })

    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
