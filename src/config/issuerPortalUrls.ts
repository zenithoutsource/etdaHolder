export type IssuerPortalCredentialType =
  | 'ThaiNationalID'
  | 'DLTDrivingLicence'
  | 'BangkokUniversityTranscript'

const ISSUER_PORTAL_CREDENTIAL_TYPES: readonly IssuerPortalCredentialType[] = [
  'ThaiNationalID',
  'DLTDrivingLicence',
  'BangkokUniversityTranscript',
]

export function isIssuerPortalCredentialType(
  credentialType: string | undefined,
): credentialType is IssuerPortalCredentialType {
  return ISSUER_PORTAL_CREDENTIAL_TYPES.includes(
    credentialType as IssuerPortalCredentialType,
  )
}

export function resolveIssuerPortalUrl(
  credentialType: IssuerPortalCredentialType,
): string | undefined {
  // Expo inlines EXPO_PUBLIC_* only for static member access, so each var
  // must be referenced literally rather than via a dynamic key lookup.
  const value =
    credentialType === 'ThaiNationalID'
      ? process.env.EXPO_PUBLIC_ISSUER_PORTAL_THAI_NATIONAL_ID
      : credentialType === 'DLTDrivingLicence'
        ? process.env.EXPO_PUBLIC_ISSUER_PORTAL_DLT
        : process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT

  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
