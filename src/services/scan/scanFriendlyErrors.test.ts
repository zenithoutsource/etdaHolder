import { toFriendlyError } from './scanFriendlyErrors'

describe('toFriendlyError', () => {
  test('maps Wallet Key signing cancellation to a normal biometric cancellation message', () => {
    expect(toFriendlyError('WalletKeySigningCancelled')).toBe(
      'Biometric authentication was cancelled. Try again when you are ready to continue.',
    )
  })

  test('maps Issuer OID4VP untrusted error', () => {
    expect(toFriendlyError('IssuerOid4VpUntrusted: client_id not allowlisted')).toContain('Issuer is not trusted')
  })

  test('maps Issuer OID4VP submission failure', () => {
    expect(toFriendlyError('PresentationSubmissionFailed:issuer: HTTP 400')).toContain('Issuer rejected')
  })

  test('maps missing PID for Issuer presentation', () => {
    expect(toFriendlyError('PresentationCredentialMissing:issuer-pid: no ThaiNationalID')).toContain('Thai National ID')
  })
})
