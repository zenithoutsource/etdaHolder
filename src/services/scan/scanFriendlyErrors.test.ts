import { toFriendlyError } from './scanFriendlyErrors'
import { PRESENTATION_REQUEST_ALREADY_USED_MESSAGE } from '../vp/presentationIntakeRejection'

describe('toFriendlyError', () => {
  test('maps Wallet Key signing cancellation to a normal biometric cancellation message', () => {
    expect(toFriendlyError('WalletKeySigningCancelled')).toBe(
      'Biometric authentication was cancelled. Try again when you are ready to continue.',
    )
  })

  test('maps invalid_token credential request to a fresh-offer message', () => {
    expect(
      toFriendlyError('CredentialRequestFailed: invalid_token - Token is invalid or expired'),
    ).toContain('do not reuse an old offer link')
  })

  test('maps Issuer OID4VP untrusted error', () => {
    expect(toFriendlyError('IssuerOid4VpUntrusted: client_id not allowlisted')).toContain('Issuer is not trusted')
  })

  test('maps Issuer OID4VP submission failure', () => {
    expect(toFriendlyError('PresentationSubmissionFailed:issuer: HTTP 400')).toContain('Issuer rejected')
    expect(toFriendlyError('PresentationSubmissionFailed:issuer: HTTP 400')).not.toContain('HTTP 400')
  })

  test('maps Verifier presentation submission failure without raw HTTP detail', () => {
    const message = toFriendlyError(
      'PresentationSubmissionFailed: HTTP 400: invalid_request. Presentation debug: kb_header_alg=ES256',
    )
    expect(message).toContain('Verifier rejected')
    expect(message).not.toContain('Presentation debug')
    expect(message).not.toContain('invalid_request')
  })

  test('maps missing PID for Issuer presentation', () => {
    expect(toFriendlyError('PresentationCredentialMissing:issuer-pid: no ThaiNationalID')).toContain('Thai National ID')
  })

  test('maps a consumed presentation request to a new-request message', () => {
    expect(toFriendlyError('PresentationRequestReplay')).toBe(
      PRESENTATION_REQUEST_ALREADY_USED_MESSAGE,
    )
  })

  test('maps replay-ledger persistence failure to a safe retry message', () => {
    expect(toFriendlyError('PresentationReplayLedgerWriteFailed')).toBe(
      'Wallet security state could not be saved. Restart the Wallet and try again.',
    )
  })

  test('maps issuance holder binding mismatch with actionable steps and key details', () => {
    const message = toFriendlyError(
      'CredentialHolderBindingMismatch: expected=did:key:z6Mkwallet; got=cnf.kid=did:key:zDnaeold-p256-holder',
    )

    expect(message).toContain('could not be saved')
    expect(message).toContain('Issuer portal is signed in with another account')
    expect(message).toContain('Sign out of the Issuer website')
    expect(message).toContain('Your wallet key: did:key:z6Mkwallet')
    expect(message).toContain('Issuer linked: cnf.kid=did:key:zDnaeold-p256-holder')
  })

  test('maps presentation holder binding mismatch with actionable steps and key details', () => {
    const message = toFriendlyError(
      'PresentationCredentialHolderBindingMismatch: expected=did:key:z6Mkcurrent; got=cnf.kid=did:key:z6Mkold',
    )

    expect(message).toContain('cannot be shown')
    expect(message).toContain('Issuer portal is signed in with another account')
    expect(message).toContain('Your wallet key: did:key:z6Mkcurrent')
    expect(message).toContain('Issuer linked: cnf.kid=did:key:z6Mkold')
  })

  test('maps issuance holder binding missing with retry guidance', () => {
    const message = toFriendlyError('CredentialHolderBindingMissing: Issuer returned SD-JWT credential without cnf')

    expect(message).toContain('could not be saved')
    expect(message).toContain('did not link it to your wallet key')
    expect(message).toContain('Sign out of the Issuer website')
  })

  test('maps hardware user authentication required to biometric guidance', () => {
    expect(toFriendlyError('WalletHardwareUserAuthenticationRequired')).toContain('Biometric authentication is required')
    expect(toFriendlyError('SignatureException: User not authenticated')).toContain('Biometric authentication is required')
  })

  test('maps dual-format total failure with underlying causes', () => {
    const message = toFriendlyError(
      'DualFormatClaimFailed: neither format could be acquired (dc+sd-jwt: CredentialKeySigningSessionRequired; mso_mdoc: CredentialKeySigningSessionRequired)',
    )

    expect(message).toContain('Credential signing session failed')
  })

  test('maps unsupported issuer credential alg to a reissue message', () => {
    expect(toFriendlyError('CredentialSignatureAlgUnsupported: issuer credential alg must be ES256 or EdDSA, got RS256')).toContain(
      'signing algorithm this wallet does not accept',
    )
  })

  test('maps invalid issuer credential signature to a reissue message', () => {
    expect(toFriendlyError('CredentialIssuerSignatureInvalid: issuer JWT signature does not match did:web public key')).toContain(
      'could not be verified',
    )
  })
})
