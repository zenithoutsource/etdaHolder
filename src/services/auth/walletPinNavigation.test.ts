import {

  readPostLoginRoute,

  readResumeRoute,

  readStartupRoute,
  readWalletAccessRedirect,
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

      isPinVerified: false,

      currentSegment: '(tabs)',

      platform: 'android',

      hasWalletPin: false,

    })).toBe('/pin-setup')

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: false,

      currentSegment: '(tabs)',

      platform: 'ios',

      hasWalletPin: false,

    })).toBe('/pin-setup')

  })



  test('routes authenticated cold start with a PIN to pin-lock until verified', () => {

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: false,

      currentSegment: '(tabs)',

      platform: 'android',

      hasWalletPin: true,

    })).toBe('/pin-lock')

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: false,

      currentSegment: '(tabs)',

      platform: 'ios',

      hasWalletPin: true,

    })).toBe('/pin-lock')

  })



  test('routes authenticated startup to Wallet Home after PIN unlock', () => {

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: true,

      currentSegment: '(tabs)',

      platform: 'android',

      hasWalletPin: true,

    })).toBe('/(tabs)')

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: true,

      currentSegment: '(tabs)',

      platform: 'web',

      hasWalletPin: false,

    })).toBe('/(tabs)')

  })



  test('routes verified users away from pin-lock', () => {

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: true,

      currentSegment: 'pin-lock',

      platform: 'android',

      hasWalletPin: true,

    })).toBe('/(tabs)')

  })



  test('routes unauthenticated cold start to auth and never routes resume to PIN screens', () => {

    expect(readStartupRoute({

      isAuthenticated: false,

      isPinVerified: false,

      platform: 'android',

      hasWalletPin: false,

    })).toBe('/auth')

    expect(readResumeRoute()).toBeUndefined()

  })



  test('does not redirect unauthenticated public auth routes', () => {

    expect(readStartupRoute({

      isAuthenticated: false,

      isPinVerified: false,

      currentSegment: 'auth',

      platform: 'android',

      hasWalletPin: false,

    })).toBeUndefined()

    expect(readStartupRoute({

      isAuthenticated: false,

      isPinVerified: false,

      currentSegment: 'forgot-pin',

      platform: 'android',

      hasWalletPin: false,

    })).toBeUndefined()

    expect(readStartupRoute({

      isAuthenticated: false,

      isPinVerified: false,

      currentSegment: 'login',

      platform: 'android',

      hasWalletPin: false,

    })).toBeUndefined()

    expect(readStartupRoute({

      isAuthenticated: false,

      isPinVerified: false,

      currentSegment: 'register',

      platform: 'android',

      hasWalletPin: false,

    })).toBeUndefined()

  })



  test('redirects unauthenticated protected routes to auth', () => {

    expect(readStartupRoute({

      isAuthenticated: false,

      isPinVerified: false,

      currentSegment: '(tabs)',

      platform: 'android',

      hasWalletPin: false,

    })).toBe('/auth')

  })



  test('does not override auth-driven PIN setup routes after authentication changes', () => {

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: false,

      currentSegment: 'auth',

      platform: 'android',

      hasWalletPin: false,

    })).toBeUndefined()

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: false,

      currentSegment: 'pin-setup',

      platform: 'android',

      hasWalletPin: false,

    })).toBeUndefined()

    expect(readStartupRoute({

      isAuthenticated: true,

      isPinVerified: false,

      currentSegment: 'pin-lock',

      platform: 'android',

      hasWalletPin: true,

    })).toBeUndefined()

  })

  test('readWalletAccessRedirect sends cold start tabs traffic to pin-lock', () => {
    expect(readWalletAccessRedirect({
      isAuthenticated: true,
      isPinVerified: false,
      currentSegment: '(tabs)',
      platform: 'android',
      hasWalletPin: true,
    })).toBe('/pin-lock')
  })

  test('readWalletAccessRedirect waits during resume PIN session checks', () => {
    expect(readWalletAccessRedirect({
      isAuthenticated: true,
      isPinVerified: false,
      currentSegment: '(tabs)',
      platform: 'android',
      hasWalletPin: true,
      isResumePinCheckPending: true,
    })).toBeUndefined()
  })

  test('readWalletAccessRedirect stays on pin-lock until verified', () => {
    expect(readWalletAccessRedirect({
      isAuthenticated: true,
      isPinVerified: false,
      currentSegment: 'pin-lock',
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
  })

  test('readWalletAccessRedirect allows forgot-pin during lock', () => {
    expect(readWalletAccessRedirect({
      isAuthenticated: true,
      isPinVerified: false,
      currentSegment: 'forgot-pin',
      platform: 'android',
      hasWalletPin: true,
    })).toBeUndefined()
  })

})

