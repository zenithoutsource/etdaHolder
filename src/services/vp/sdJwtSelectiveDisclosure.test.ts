import { selectSdJwtDisclosures } from './sdJwtSelectiveDisclosure'

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

describe('selectSdJwtDisclosures', () => {
  test('keeps only disclosures requested by the Verifier', () => {
    const rawSdJwt = `${issuerJwt}~${nameDisclosure}~${ageDisclosure}~`

    expect(selectSdJwtDisclosures(rawSdJwt, ['name'])).toBe(`${issuerJwt}~${nameDisclosure}~`)
  })

  test('preserves all disclosures when the request has no claim filter', () => {
    const rawSdJwt = `${issuerJwt}~${nameDisclosure}~${ageDisclosure}~`

    expect(selectSdJwtDisclosures(rawSdJwt)).toBe(rawSdJwt)
  })

  test('fails closed for malformed disclosure segments', () => {
    expect(() => selectSdJwtDisclosures(`${issuerJwt}~not-json~`, ['name'])).toThrow(
      'PresentationCredentialInvalid: SD-JWT disclosure is malformed',
    )
  })
})
