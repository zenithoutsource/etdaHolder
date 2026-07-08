import {
  isIssuerPortalCredentialType,
  resolveIssuerPortalUrl,
} from './issuerPortalUrls'

describe('issuerPortalUrls', () => {
  const originalThaId = process.env.EXPO_PUBLIC_ISSUER_PORTAL_THAI_NATIONAL_ID
  const originalDlt = process.env.EXPO_PUBLIC_ISSUER_PORTAL_DLT
  const originalTranscript = process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT

  afterEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_THAI_NATIONAL_ID = originalThaId
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_DLT = originalDlt
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT = originalTranscript
  })

  test('resolves configured portal URL per credential type', () => {
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_THAI_NATIONAL_ID = 'http://issuer.local/thaid'
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_DLT = 'http://issuer.local/dlt'
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT = 'http://issuer.local/transcript'

    expect(resolveIssuerPortalUrl('ThaiNationalID')).toBe('http://issuer.local/thaid')
    expect(resolveIssuerPortalUrl('DLTDrivingLicence')).toBe('http://issuer.local/dlt')
    expect(resolveIssuerPortalUrl('BangkokUniversityTranscript')).toBe(
      'http://issuer.local/transcript',
    )
  })

  test('returns undefined when env var missing or blank', () => {
    delete process.env.EXPO_PUBLIC_ISSUER_PORTAL_THAI_NATIONAL_ID
    process.env.EXPO_PUBLIC_ISSUER_PORTAL_DLT = '   '

    expect(resolveIssuerPortalUrl('ThaiNationalID')).toBeUndefined()
    expect(resolveIssuerPortalUrl('DLTDrivingLicence')).toBeUndefined()
  })

  test('narrows portal credential types', () => {
    expect(isIssuerPortalCredentialType('ThaiNationalID')).toBe(true)
    expect(isIssuerPortalCredentialType('BangkokUniversityTranscript')).toBe(true)
    expect(isIssuerPortalCredentialType('UnknownType')).toBe(false)
    expect(isIssuerPortalCredentialType(undefined)).toBe(false)
  })
})
