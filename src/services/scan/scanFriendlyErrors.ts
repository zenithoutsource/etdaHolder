import { WALLET_HOME_COPY } from '../credentials/walletHomeCopy'
import { PRESENTATION_REQUEST_ALREADY_USED_MESSAGE } from '../vp/presentationIntakeRejection'

export function toFriendlyError(raw: string): string {

  if (raw.includes('ScanTimeout')) return 'Request timed out. Check your connection and try again.'

  if (raw.includes('IssuerMetadataFetchFailed')) return 'Could not reach the issuer. Check your connection and try again.'

  if (raw.includes('CredentialOfferParseFailed') || raw.includes('CredentialOfferInvalid') || raw.includes('CredentialOfferIssuerMissing')) return 'Invalid credential offer. Try scanning again.'

  if (raw.includes('CredentialTokenExchangeFailed')) return 'Authentication with the issuer failed. The transaction code may be incorrect or may belong to another request.'

  if (raw.includes('invalid_token')) {
    return 'This issuance link or access token has expired. Request the document again from the issuer (do not reuse an old offer link).'
  }

  if (raw.includes('invalid_grant') && raw.includes('pre-authorized_code')) {
    return 'This issuance link has already been used or has expired. Request the document again from the issuer.'
  }

  if (raw.includes('CredentialHolderBindingMissing')) return formatHolderBindingMissingFriendlyError('issuance')

  if (raw.includes('PresentationCredentialHolderBindingMissing')) return formatHolderBindingMissingFriendlyError('presentation')

  if (raw.includes('PresentationCredentialHolderBindingMismatch')) {

    return formatHolderBindingMismatchFriendlyError(raw, 'presentation')

  }

  if (raw.includes('CredentialHolderBindingMismatch')) {

    return formatHolderBindingMismatchFriendlyError(raw, 'issuance')

  }

  if (raw.includes('Reissue your national ID')) {
    return WALLET_HOME_COPY.hardwarePidReissueRequiredMessage
  }

  if (raw.includes('Legacy key renewal presentation is unsupported')) {
    return WALLET_HOME_COPY.legacyKeyRenewalUnsupportedMessage
  }

  if (
    raw.includes('LegacyHolderSigningUnsupported') ||
    raw.includes('ProximityHardwareDeviceAuthUnavailable')
  ) {
    return WALLET_HOME_COPY.hardwareReissueRequiredMessage
  }

  if (raw.includes('CredentialSignatureAlgUnsupported')) {
    return 'This credential uses a signing algorithm this wallet does not accept. Request a new document from the issuer.'
  }

  if (raw.includes('CredentialIssuerSignatureInvalid')) {
    return 'This credential could not be verified. Request a new document from the issuer.'
  }

  if (raw.includes('CredentialResponseUnsupported')) return 'The issuer response did not include a compact credential.'

  if (raw.includes('CredentialRequestFailed')) return raw

  if (raw.includes('DualFormatClaimFailed')) {
    const detailMatch = raw.match(/DualFormatClaimFailed:[^(]*(\([^)]+\))?/)
    const detail = detailMatch?.[0]?.replace(/^DualFormatClaimFailed:\s*/, '') ?? ''
    if (detail.includes('CredentialKeySigningSessionRequired')) {
      return 'Credential signing session failed during dual-format issuance. Restart the Wallet and try again.'
    }
    if (detail.includes('CredentialRequestFailed')) {
      return `The Issuer rejected both credential formats. ${detail}`
    }
    return detail
      ? `Could not receive the driving licence in either format. ${detail}`
      : 'Could not receive the driving licence in either format. Please try again.'
  }

  if (raw.includes('CredentialFormatUnsupported')) return 'This credential format is not supported by this wallet.'

  if (raw.includes('CredentialStorageFailed')) return 'Could not save the credential to storage. Please try again.'

  if (raw.includes('IssuerMetadataMismatch') || raw.includes('IssuerMetadataInvalid')) return 'The issuer configuration is invalid. Contact the issuer.'

  if (raw.includes('VerifierUntrusted')) return 'This Verifier is not trusted by this wallet.'

  if (raw.includes('PresentationCredentialMetadataMismatch')) {

    const detail = raw.replace(/^PresentationCredentialMetadataMismatch:\s*/, '')

    return `The stored credential does not match this Verifier request. ${detail}. Reissue the credential with the requested vct, or update the Verifier vct_values.`

  }

  if (raw.includes('CredentialRenewalPreviousKeyUnavailable')) return 'This document is bound to a wallet key that is no longer retained, so it cannot be renewed. Request a new document from the issuer.'

  if (raw.includes('WalletKeyRotationBlockedPendingRenewals')) return 'Finish renewing your existing documents before creating a new wallet key.'

  if (raw.includes('PresentationCredentialFormatUnsupported')) return 'The stored credential format does not match this Verifier request. Reissue the credential in the requested format or update the Verifier request.'

  if (raw.includes('PresentationRequestReplay')) return PRESENTATION_REQUEST_ALREADY_USED_MESSAGE

  if (raw.includes('PresentationReplayLedgerWriteFailed')) return 'Wallet security state could not be saved. Restart the Wallet and try again.'

  if (raw.includes('PresentationRequestUnsupported')) return 'This presentation request is not supported by this wallet.'

  if (raw.includes('IssuerOid4VpUntrusted')) {

    return 'This Issuer is not trusted for PID presentation. Configure EXPO_PUBLIC_ISSUER_OID4VP_* env to match the live Issuer.'

  }

  if (raw.includes('PresentationCredentialMissing:issuer-pid')) {

    return 'Store Thai National ID (PID) before presenting to the Issuer.'

  }

  if (raw.includes('PresentationPidRequired')) {

    return 'Store Thai National ID (PID) before presenting other documents.'

  }

  if (raw.includes('PresentationCredentialMissing')) {

    const claimMatch = raw.match(/missing claims:\s*([^;\]]+)/)

    if (claimMatch) {

      return `This Verifier requires information your credential does not include (${claimMatch[1].trim()}). Ask the Verifier to drop it, or have the Issuer reissue the credential with that field.`

    }

    return 'No active credential is available for this Verifier request.'

  }

  if (raw.includes('WalletHardwareUserAuthenticationRequired') || raw.toLowerCase().includes('user not authenticated')) {
    return 'Biometric authentication is required to sign. Confirm with fingerprint or device PIN and try again.'
  }

  if (raw.includes('WalletHardwareEcdsaActivityUnavailable')) {
    return 'The Wallet screen was not ready for biometric authentication. Return to the home screen and scan again.'
  }

  if (raw.includes('PresentationBiometricUnavailable')) return 'Biometric authentication is not available on this device. Enroll biometrics in device settings and try again.'

  if (raw.includes('WalletKeySigningCancelled')) return 'Biometric authentication was cancelled. Try again when you are ready to continue.'

  if (raw.includes('PresentationBiometricCancelled')) return 'Biometric authentication was cancelled. Try again when you are ready to continue.'

  if (raw.includes('PresentationBiometricFailed')) return 'Biometric authentication failed. Please try again.'

  if (raw.includes('PresentationSubmissionFailed:issuer')) {
    return 'The Issuer rejected the presentation response. Try again or contact the Issuer.'
  }

  if (raw.includes('PresentationSubmissionFailed')) {
    return 'The Verifier rejected the presentation response. Try again or contact the Verifier.'
  }

  if (raw.includes('PresentationRequestInvalid')) return 'Invalid presentation request. Try scanning again.'

  return raw

}



function formatHolderBindingMissingFriendlyError(context: 'issuance' | 'presentation'): string {

  const intro =

    context === 'issuance'

      ? 'This document could not be saved because the Issuer did not link it to your wallet key.'

      : 'This document cannot be shown because it is not linked to your wallet key.'



  return joinFriendlyLines([

    intro,

    'The Verifier will reject it without that link.',

    '',

    'What to try:',

    '• Sign out of the Issuer website if you may be logged in as someone else.',

    '• Request the document again on this phone.',

    '• If it still fails, ask the Issuer to link the document to your wallet key when issuing.',

  ])

}



function formatHolderBindingMismatchFriendlyError(

  raw: string,

  context: 'issuance' | 'presentation',

): string {

  const expected = raw.match(/expected=([^;]+)/)?.[1]?.trim()

  const got = raw.match(/got=([^;]+)/)?.[1]?.trim()



  const intro =

    context === 'issuance'

      ? 'This document could not be saved because the Issuer linked it to a different wallet key.'

      : 'This document cannot be shown because it was issued for a different wallet key.'



  const lines = [

    intro,

    '',

    'This often happens when the Issuer portal is signed in with another account, or the Issuer reused an old key.',

    '',

    'What to try:',

    '• Sign out of the Issuer website.',

    '• Request the document again on this phone (do not reuse an old offer link).',

    '• If it still fails, share the details below with the Issuer.',

  ]



  if (expected || got) {

    lines.push('', 'Details:')

    if (expected) lines.push(`Your wallet key: ${expected}`)

    if (got) lines.push(`Issuer linked: ${got}`)

  }



  return joinFriendlyLines(lines)

}



function joinFriendlyLines(lines: string[]): string {

  return lines.join('\n')

}


