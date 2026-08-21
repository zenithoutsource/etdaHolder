import { canonicalFirstPartyType, resolveFirstPartyType, type FirstPartyRecordLike } from './firstPartyCredential'
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

export function resolveIssuerPortalCredentialType(
  credentialType: string | undefined,
): IssuerPortalCredentialType | undefined {
  if (isIssuerPortalCredentialType(credentialType)) return credentialType
  const canonical = canonicalFirstPartyType(credentialType)
  if (isIssuerPortalCredentialType(canonical)) return canonical
  return undefined
}

export function resolveIssuerPortalCredentialTypeFromRecord(
  record: FirstPartyRecordLike,
): IssuerPortalCredentialType | undefined {
  const firstParty = resolveFirstPartyType(record)
  if (isIssuerPortalCredentialType(firstParty)) return firstParty
  return resolveIssuerPortalCredentialType(record.type)
}

export function resolveIssuerPortalUrl(
  credentialType: IssuerPortalCredentialType,
): string {
  return buildIssuerLoginUrl(credentialType)
}

export { readIssuerPortalReturnUrl } from '../services/credentials/buildIssuerLoginUrl'
