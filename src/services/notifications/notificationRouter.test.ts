import { router } from 'expo-router'

import { routeNotificationTap } from './notificationRouter'

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
  },
}))

const routerPushMock = router.push as jest.Mock

describe('notificationRouter', () => {
  beforeEach(() => {
    routerPushMock.mockReset()
  })

  test('routes credential notification taps to the credential detail screen', () => {
    routeNotificationTap({
      event: 'renewal-ready',
      credentialId: 'cred-123',
      credentialType: 'ThaiNationalID',
    })

    expect(routerPushMock).toHaveBeenCalledWith('/(tabs)/credential/cred-123')
  })

  test('ignores notification taps without a credential id', () => {
    routeNotificationTap({
      event: 'renewal-ready',
      credentialType: 'ThaiNationalID',
    })

    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
