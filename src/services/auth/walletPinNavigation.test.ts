import {
  readPostLoginRoute,
  readResumeRoute,
  readStartupRoute,
} from './walletPinNavigation'

describe('walletPinNavigation', () => {
  test('routes first successful native login without a PIN to setup', () => {
    expect(readPostLoginRoute({ platform: 'ios', hasWalletPin: false })).toBe('/pin-setup')
    expect(readPostLoginRoute({ platform: 'android', hasWalletPin: false })).toBe('/pin-setup')
  })

  test('routes post-login to Wallet Home when a PIN already exists or platform is web', () => {
    expect(readPostLoginRoute({ platform: 'ios', hasWalletPin: true })).toBe('/(tabs)')
    expect(readPostLoginRoute({ platform: 'web', hasWalletPin: false })).toBe('/(tabs)')
  })

  test('never routes cold start or resume to PIN screens', () => {
    expect(readStartupRoute({ isAuthenticated: true })).toBe('/(tabs)')
    expect(readStartupRoute({ isAuthenticated: false })).toBe('/login')
    expect(readResumeRoute()).toBeUndefined()
  })

  test('does not override login-driven PIN setup routes after authentication changes', () => {
    expect(readStartupRoute({ isAuthenticated: true, currentSegment: 'login' })).toBeUndefined()
    expect(readStartupRoute({ isAuthenticated: true, currentSegment: 'pin-setup' })).toBeUndefined()
  })
})
