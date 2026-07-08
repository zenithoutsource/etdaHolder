import { toFriendlyError } from './scanFriendlyErrors'

describe('toFriendlyError', () => {
  test('maps Wallet Key signing cancellation to a normal biometric cancellation message', () => {
    expect(toFriendlyError('WalletKeySigningCancelled')).toBe(
      'Biometric authentication was cancelled. Try again when you are ready to continue.',
    )
  })
})
