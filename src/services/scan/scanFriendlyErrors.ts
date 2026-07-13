export function toFriendlyError(raw: string): string {
  if (raw.includes('ScanTimeout')) return 'Request timed out. Check your connection and try again.'
  if (raw.includes('IssuerMetadataFetchFailed')) return 'Could not reach the issuer. Check your connection and try again.'
  if (raw.includes('CredentialOfferParseFailed') || raw.includes('CredentialOfferInvalid') || raw.includes('CredentialOfferIssuerMissing')) return 'Invalid credential offer. Try scanning again.'
  if (raw.includes('CredentialTokenExchangeFailed')) return 'Authentication with the issuer failed. The transaction code may be incorrect.'
  if (raw.includes('CredentialHolderBindingMissing')) return 'The issuer returned an SD-JWT credential without wallet holder binding. This credential cannot pass the Verifier. Ask the Issuer to bind the credential to the Wallet Ed25519 PoP key in cnf.jwk or cnf.kid.'
  if (raw.includes('CredentialHolderBindingMismatch')) return 'The issuer returned an SD-JWT credential bound to a different holder key. Reissue it with this wallet key.'
  if (raw.includes('CredentialResponseUnsupported')) return 'The issuer response did not include a compact credential.'
  if (raw.includes('CredentialRequestFailed')) return raw
  if (raw.includes('CredentialFormatUnsupported')) return 'This credential format is not supported by this wallet.'
  if (raw.includes('CredentialStorageFailed')) return 'Could not save the credential to storage. Please try again.'
  if (raw.includes('IssuerMetadataMismatch') || raw.includes('IssuerMetadataInvalid')) return 'The issuer configuration is invalid. Contact the issuer.'
  if (raw.includes('VerifierUntrusted')) return 'This Verifier is not trusted by this wallet.'
  if (raw.includes('PresentationCredentialMetadataMismatch')) {
    const detail = raw.replace(/^PresentationCredentialMetadataMismatch:\s*/, '')
    return `The stored credential does not match this Verifier request. ${detail}. Reissue the credential with the requested vct, or update the Verifier vct_values.`
  }
  if (raw.includes('PresentationCredentialHolderBindingMissing')) return 'This credential is not holder-bound, but the Verifier requires SD-JWT key binding. Reissue the credential with wallet holder binding or ask the Verifier to set require_cryptographic_holder_binding to false.'
  if (raw.includes('PresentationCredentialHolderBindingMismatch')) return 'This credential is holder-bound to a different Wallet Signing Key. Reissue it on this device before presenting.'
  if (raw.includes('PresentationCredentialFormatUnsupported')) return 'The stored credential format does not match this Verifier request. Reissue the credential in the requested format or update the Verifier request.'
  if (raw.includes('PresentationRequestUnsupported')) return 'This presentation request is not supported by this wallet.'
  if (raw.includes('PresentationCredentialMissing')) {
    const claimMatch = raw.match(/missing claims:\s*([^;\]]+)/)
    if (claimMatch) {
      return `This Verifier requires information your credential does not include (${claimMatch[1].trim()}). Ask the Verifier to drop it, or have the Issuer reissue the credential with that field.`
    }
    return 'No active credential is available for this Verifier request.'
  }
  if (raw.includes('PresentationBiometricUnavailable')) return 'Biometric authentication is not available on this device. Enroll biometrics in device settings and try again.'
  if (raw.includes('WalletKeySigningCancelled')) return 'Biometric authentication was cancelled. Try again when you are ready to continue.'
  if (raw.includes('PresentationBiometricCancelled')) return 'Biometric authentication was cancelled. Try again when you are ready to continue.'
  if (raw.includes('PresentationBiometricFailed')) return 'Biometric authentication failed. Please try again.'
  if (raw.includes('PresentationSubmissionFailed')) {
    const detail = raw.replace(/^PresentationSubmissionFailed:\s*/, '')
    return detail ? `The Verifier rejected the presentation response. ${detail}` : 'The Verifier rejected the presentation response.'
  }
  if (raw.includes('PresentationRequestInvalid')) return 'Invalid presentation request. Try scanning again.'
  return raw
}
