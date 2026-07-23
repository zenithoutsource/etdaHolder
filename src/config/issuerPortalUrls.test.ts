import {
  isIssuerPortalCredentialType,
  resolveIssuerPortalUrl,
} from './issuerPortalUrls'

describe('issuerPortalUrls', () => {
  const originalLoginUrl = process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL
  const originalReturnUrl = process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/Account/Login'
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = 'walletapp://callback'
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = originalLoginUrl
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = originalReturnUrl
  })

  test('resolves login portal URL per credential type', () => {
    expect(new URL(resolveIssuerPortalUrl('ThaiNationalID')).searchParams.get('documentType')).toBe('IdCard')
    expect(new URL(resolveIssuerPortalUrl('DLTDrivingLicence')).searchParams.get('documentType')).toBe('DriverLicense')
    expect(new URL(resolveIssuerPortalUrl('ChulalongkornUniversityTranscript')).searchParams.get('documentType')).toBe('Transcript')
  })

  test('narrows portal credential types', () => {
    expect(isIssuerPortalCredentialType('ThaiNationalID')).toBe(true)
    expect(isIssuerPortalCredentialType('ChulalongkornUniversityTranscript')).toBe(true)
    expect(isIssuerPortalCredentialType('UnknownType')).toBe(false)
    expect(isIssuerPortalCredentialType(undefined)).toBe(false)
  })
})
