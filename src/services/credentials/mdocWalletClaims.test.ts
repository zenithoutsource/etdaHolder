import { mapIso18013NamespaceClaims } from './mdocWalletClaims'

describe('mdocWalletClaims', () => {
  test('maps ISO 18013 namespace fields into wallet claim keys', () => {
    expect(
      mapIso18013NamespaceClaims({
        'org.iso.18013.5.1': {
          given_name: 'สมชาย',
          family_name: 'ใจดี',
          birth_date: '1990-05-15',
          document_number: '54002891',
          issue_date: '2024-01-20',
          expiry_date: '2030-01-31',
        },
      }),
    ).toEqual({
      givenName: 'สมชาย',
      familyName: 'ใจดี',
      birthDate: '1990-05-15',
      licenceNumber: '54002891',
      issuanceDate: '2024-01-20',
      expiryDate: '2030-01-31',
    })
  })

  test('maps driving privilege vehicle category into licenceClass', () => {
    expect(
      mapIso18013NamespaceClaims({
        'org.iso.18013.5.1': {
          driving_privileges: [{ vehicle_category_code: 'B' }] as unknown as string,
        },
      }),
    ).toEqual({
      licenceClass: 'B',
    })
  })
})
