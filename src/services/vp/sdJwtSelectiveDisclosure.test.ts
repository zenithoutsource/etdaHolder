import {
  countSdJwtDisclosureSegments,
  expandClaimKeysForSdJwtMatch,
  selectSdJwtDisclosures,
} from './sdJwtSelectiveDisclosure'

function encodeDisclosure(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const issuerJwt = 'issuer.jwt.signature'
const nameDisclosure = encodeDisclosure(['salt-name', 'name', 'Alice'])
const ageDisclosure = encodeDisclosure(['salt-age', 'age', 25])
const fullNameDisclosure = encodeDisclosure(['salt-fn', 'full_name', 'Alice'])
const graduationDisclosure = encodeDisclosure(['salt-grad', 'graduation_date', '2026-05-31'])

describe('selectSdJwtDisclosures', () => {
  test('keeps only disclosures requested by the Verifier', () => {
    const rawSdJwt = `${issuerJwt}~${nameDisclosure}~${ageDisclosure}~`

    expect(selectSdJwtDisclosures(rawSdJwt, ['name'])).toBe(`${issuerJwt}~${nameDisclosure}~`)
  })

  test('preserves all disclosures when the request has no claim filter', () => {
    const rawSdJwt = `${issuerJwt}~${nameDisclosure}~${ageDisclosure}~`

    expect(selectSdJwtDisclosures(rawSdJwt)).toBe(rawSdJwt)
  })

  test('matches schema keys to Issuer wire claim names via aliases', () => {
    const rawSdJwt = `${issuerJwt}~${fullNameDisclosure}~${graduationDisclosure}~`

    expect(
      selectSdJwtDisclosures(rawSdJwt, ['fullName', 'graduationYear'], {
        documentType: 'ChulalongkornUniversityTranscript',
      }),
    ).toBe(`${issuerJwt}~${fullNameDisclosure}~${graduationDisclosure}~`)
  })

  test('fails closed when requested claims cannot be selected', () => {
    const rawSdJwt = `${issuerJwt}~${nameDisclosure}~`

    expect(() => selectSdJwtDisclosures(rawSdJwt, ['missing_claim'])).toThrow(
      /no SD-JWT disclosures selected/,
    )
  })

  test('fails closed for malformed disclosure segments', () => {
    expect(() => selectSdJwtDisclosures(`${issuerJwt}~not-json~`, ['name'])).toThrow(
      'PresentationCredentialInvalid: SD-JWT disclosure is malformed',
    )
  })

  test('expandClaimKeysForSdJwtMatch includes aliases', () => {
    expect(
      expandClaimKeysForSdJwtMatch(['graduationYear'], 'ChulalongkornUniversityTranscript'),
    ).toEqual(expect.arrayContaining(['graduationYear', 'graduation_date']))
  })

  test('expandClaimKeysForSdJwtMatch maps driving-licence verifier keys to ISO/wallet claims', () => {
    expect(
      expandClaimKeysForSdJwtMatch(['full_name', 'license_type', 'photo'], 'DLTDrivingLicence'),
    ).toEqual(
      expect.arrayContaining([
        'full_name',
        'given_name',
        'family_name',
        'license_type',
        'licenceClass',
        'driving_privileges',
        'photo',
        'portrait',
      ]),
    )
  })

  test('countSdJwtDisclosureSegments ignores KB-looking segments', () => {
    expect(countSdJwtDisclosureSegments(`${issuerJwt}~${nameDisclosure}~aaa.bbb.ccc`)).toBe(1)
  })
})
