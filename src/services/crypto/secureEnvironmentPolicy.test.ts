import { assertHardwareSecureEnvironmentSupported } from './secureEnvironmentPolicy'

describe('secure environment policy', () => {
  test('fails loudly instead of installing a software fallback when hardware support is unavailable', () => {
    expect(() =>
      assertHardwareSecureEnvironmentSupported({
        isLocalSecureEnvironmentSupported: () => false,
      }),
    ).toThrow('HardwareSecureEnvironmentRequired')
  })

  test('allows startup when the native secure environment is available', () => {
    expect(() =>
      assertHardwareSecureEnvironmentSupported({
        isLocalSecureEnvironmentSupported: () => true,
      }),
    ).not.toThrow()
  })
})
