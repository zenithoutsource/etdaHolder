import {
  assertHardwareSecurityLevel,
  HardwareKeyNotHardwareBackedError,
} from './hardwareEcdsaTypes'

describe('assertHardwareSecurityLevel', () => {
  test('accepts StrongBox and TEE', () => {
    expect(() => assertHardwareSecurityLevel('STRONGBOX', 'wallet.p256.attest')).not.toThrow()
    expect(() => assertHardwareSecurityLevel('TEE', 'wallet.p256.attest')).not.toThrow()
  })

  test('rejects software and unknown Keystore levels', () => {
    expect(() => assertHardwareSecurityLevel('SOFTWARE', 'wallet.p256.attest')).toThrow(
      HardwareKeyNotHardwareBackedError,
    )
    expect(() => assertHardwareSecurityLevel('UNKNOWN_-2', 'wallet.p256.cred.pending.abc')).toThrow(
      /wallet.p256.cred.pending.abc:UNKNOWN_-2/,
    )
  })
})
