import {
  isIssuerPortalCredentialType,
  resolveIssuerPortalCredentialType,
  resolveIssuerPortalCredentialTypeFromRecord,
  resolveIssuerPortalUrl,
} from './issuerPortalUrls'

describe('issuerPortalUrls', () => {
  const originalLoginUrl = process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL
  const originalReturnUrl = process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/thaiid/login'
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
    expect(isIssuerPortalCredentialType('DLTDrivingLicence')).toBe(true)
    expect(isIssuerPortalCredentialType('ChulalongkornUniversityTranscript')).toBe(true)
    expect(isIssuerPortalCredentialType('UnknownType')).toBe(false)
    expect(isIssuerPortalCredentialType(undefined)).toBe(false)
  })

  test('maps stored wire ids and vct URLs to portal credential types', () => {
    expect(
      resolveIssuerPortalCredentialType(
        'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense',
      ),
    ).toBe('DLTDrivingLicence')
    expect(resolveIssuerPortalCredentialType('TranscriptCredential')).toBe(
      'ChulalongkornUniversityTranscript',
    )
    expect(resolveIssuerPortalCredentialType('Iso18013DriversLicenseCredential_dc+sd-jwt')).toBe(
      'DLTDrivingLicence',
    )
    expect(resolveIssuerPortalCredentialType('MedicalCertificate')).toBeUndefined()
    expect(resolveIssuerPortalCredentialType('UnknownType')).toBeUndefined()
  })

  test('maps a stored first-party record whose type is a wire id', () => {
    expect(
      resolveIssuerPortalCredentialTypeFromRecord({
        type: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
        claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense' },
        issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
      }),
    ).toBe('DLTDrivingLicence')
    expect(
      resolveIssuerPortalCredentialTypeFromRecord({
        type: 'TranscriptCredential',
        claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential' },
        issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
      }),
    ).toBe('ChulalongkornUniversityTranscript')
  })
})
