import { buildIssuerLoginUrl } from '../services/credentials/buildIssuerLoginUrl'

export type IssuerPortalCredentialType =
  | 'ThaiNationalID'
  | 'DLTDrivingLicence'
  | 'ChulalongkornUniversityTranscript'

const ISSUER_PORTAL_CREDENTIAL_TYPES: readonly IssuerPortalCredentialType[] = [
  'ThaiNationalID',
  'DLTDrivingLicence',
  'ChulalongkornUniversityTranscript',
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
): string {
  return buildIssuerLoginUrl(credentialType)
}

export { readIssuerPortalReturnUrl } from '../services/credentials/buildIssuerLoginUrl'
