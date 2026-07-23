import type { IssuerPortalCredentialType } from './issuerPortalUrls'

const DEFAULT_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/Account/Login'
const DEFAULT_WALLET_RETURN_URL = 'walletapp://callback'
const DEFAULT_CREDENTIAL_ISSUER = 'https://issuer.zenithcomp.co.th:455'
const DEFAULT_OAUTH_CLIENT_ID = 's6BhdRkqt3'
const DEFAULT_TOKEN_URL = 'https://issuer.zenithcomp.co.th:455/token'

export const CREDENTIAL_TYPE_TO_ISSUER_DOCUMENT_TYPE: Record<IssuerPortalCredentialType, string> = {
  ThaiNationalID: 'IdCard',
  DLTDrivingLicence: 'DriverLicense',
  ChulalongkornUniversityTranscript: 'Transcript',
}

export const CREDENTIAL_TYPE_TO_CONFIGURATION_IDS: Record<IssuerPortalCredentialType, readonly string[]> = {
  ThaiNationalID: ['IDCard_dc+sd-jwt'],
  DLTDrivingLicence: [
    'Iso18013DriversLicenseCredential_dc+sd-jwt',
    'org.iso.18013.5.1.mDL',
  ],
  ChulalongkornUniversityTranscript: ['TranscriptCredential_dc+sd-jwt'],
}

export function readIssuerLoginBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL?.trim()
    || DEFAULT_ISSUER_LOGIN_URL
  )
}

export function readWalletReturnUrl(): string {
  return (
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL?.trim()
    || DEFAULT_WALLET_RETURN_URL
  )
}

export function readSameDeviceCredentialIssuer(): string {
  return (
    process.env.EXPO_PUBLIC_ISSUER_CREDENTIAL_ISSUER?.trim()
    || DEFAULT_CREDENTIAL_ISSUER
  )
}

export function readSameDeviceOAuthClientId(): string {
  return (
    process.env.EXPO_PUBLIC_ISSUER_OAUTH_CLIENT_ID?.trim()
    || DEFAULT_OAUTH_CLIENT_ID
  )
}

export function readSameDeviceTokenUrl(): string {
  return (
    process.env.EXPO_PUBLIC_ISSUER_TOKEN_URL?.trim()
    || DEFAULT_TOKEN_URL
  )
}

export function resolveIssuerDocumentType(
  credentialType: IssuerPortalCredentialType,
): string {
  return CREDENTIAL_TYPE_TO_ISSUER_DOCUMENT_TYPE[credentialType]
}

export function resolveCredentialConfigurationIds(
  credentialType: IssuerPortalCredentialType,
): readonly string[] {
  return CREDENTIAL_TYPE_TO_CONFIGURATION_IDS[credentialType]
}

export function sameDeviceIssuanceRequiresPidVp(
  credentialType: IssuerPortalCredentialType,
): boolean {
  return credentialType !== 'ThaiNationalID'
}
