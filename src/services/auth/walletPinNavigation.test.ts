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

  test('routes authenticated native startup without a PIN to setup', () => {
    expect(readStartupRoute({
      isAuthenticated: true,
      currentSegment: '(tabs)',
      platform: 'android',
      hasWalletPin: false,
    })).toBe('/pin-setup')
    expect(readStartupRoute({
      isAuthenticated: true,
      currentSegment: '(tabs)',
      platform: 'ios',
      hasWalletPin: false,
    })).toBe('/pin-setup')
  })

  test('routes authenticated startup to Wallet Home when PIN setup is not required', () => {
    expect(readStartupRoute({
      isAuthenticated: true,
      currentSegment: '(tabs)',
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/(tabs)')
    expect(readStartupRoute({
      isAuthenticated: true,
      currentSegment: '(tabs)',
      platform: 'web',
      hasWalletPin: false,
    })).toBe('/(tabs)')
  })

  test('routes unauthenticated cold start to auth and never routes resume to PIN screens', () => {
    expect(readStartupRoute({
      isAuthenticated: false,
      platform: 'android',
      hasWalletPin: false,
    })).toBe('/auth')
    expect(readResumeRoute()).toBeUndefined()
  })

  test('does not redirect unauthenticated public auth routes', () => {
    expect(readStartupRoute({
      isAuthenticated: false,
      currentSegment: 'auth',
      platform: 'android',
      hasWalletPin: false,
    })).toBeUndefined()
    expect(readStartupRoute({
      isAuthenticated: false,
      currentSegment: 'login',
      platform: 'android',
      hasWalletPin: false,
    })).toBeUndefined()
    expect(readStartupRoute({
      isAuthenticated: false,
      currentSegment: 'register',
      platform: 'android',
      hasWalletPin: false,
    })).toBeUndefined()
  })

  test('redirects unauthenticated protected routes to auth', () => {
    expect(readStartupRoute({
      isAuthenticated: false,
      currentSegment: '(tabs)',
      platform: 'android',
      hasWalletPin: false,
    })).toBe('/auth')
  })

  test('does not override auth-driven PIN setup routes after authentication changes', () => {
    expect(readStartupRoute({
      isAuthenticated: true,
      currentSegment: 'auth',
      platform: 'android',
      hasWalletPin: false,
    })).toBeUndefined()
    expect(readStartupRoute({
      isAuthenticated: true,
      currentSegment: 'pin-setup',
      platform: 'android',
      hasWalletPin: false,
    })).toBeUndefined()
  })
})
