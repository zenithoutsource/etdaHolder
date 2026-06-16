import { assertNativeEd25519SignerSupported } from './secureEnvironmentPolicy'

describe('secure environment policy', () => {
  test('fails loudly instead of installing a software fallback when native Ed25519 signing is unavailable', () => {
    expect(() =>
      assertNativeEd25519SignerSupported({
        isNativeEd25519SignerAvailable: () => false,
      }),
    ).toThrow('NativeEd25519SignerRequired')
  })

  test('allows startup when the native Ed25519 signer is available', () => {
    expect(() =>
      assertNativeEd25519SignerSupported({
        isNativeEd25519SignerAvailable: () => true,
      }),
    ).not.toThrow()
  })
})
