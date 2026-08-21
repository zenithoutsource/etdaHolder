import { getCardSchema } from '../../config/cardSchemas'
import {
  readCredentialDetailDisplay,
  readCredentialHolderProfile,
  readCredentialSummaryDisplay,
  readPresentationFieldValue,
  resolveDisplayHolderProfile,
  resolvePidMdocNameOverlay,
  splitThaiGivenAndFamily,
  overlayPresentationDisclosureValue,
} from './credentialDisplay'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'Mali',
    familyName: 'Somsri',
    licenceNumber: 'DLT-12345',
    licenceClass: 'Private car',
    expiryDate: '2030-01-31',
  },
  issuedAt: '2026-06-08T00:00:00.000Z',
}

const unknownRecord: VerifiableCredentialRecord = {
  id: 'credential-1',
  type: 'UnknownCredential',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'Ada',
    customClaim: 'Visible value',
    iss: 'issuer metadata',
  },
  issuedAt: '2026-06-08T00:00:00.000Z',
}

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-id-1',
  type: 'ThaiNationalID',
  rawVc: 'header.payload.signature',
  claims: {
    thaiFullName: 'นางสาว พิชญา รุ่งเรืองกิจ',
    englishFullName: 'Ms. Thodsopp Eekkasandigital',
    birthDate: '1990-05-15',
  },
  issuedAt: '2026-06-08T00:00:00.000Z',
}

describe('credentialDisplay', () => {
  test('builds a schema-driven driving licence summary without transcript labels', () => {
    const summary = readCredentialSummaryDisplay(drivingLicenceRecord)

    expect(summary.title).toBe('ใบขับขี่')
    expect(summary.documentTitle).toBe('DRIVER LICENSE')
    expect(summary.primaryText).toBe('Mali Somsri')
    expect(summary.rows).toEqual([
      { key: 'licenceNumber', label: 'Licence Number', value: 'DLT-12345' },
      { key: 'licenceClass', label: 'Class', value: 'Private car' },
      { key: 'expiryDate', label: 'Expiry Date', value: '2030-01-31' },
    ])
    expect(summary.rows.map((row) => row.label)).not.toContain('Student ID')
  })

  test('builds detail rows from configured fields and safe extra claims', () => {
    const detail = readCredentialDetailDisplay(unknownRecord)

  expect(detail.title).toBe('Credential')
  expect(detail.documentTitle).toBe('DIGITAL DOCUMENT')
  expect(detail.issuedAt).toBe('2026-06-08T00:00:00.000Z')
  expect(detail.primaryRows).toEqual([
      { key: 'customClaim', label: 'Custom Claim', value: 'Visible value' },
      { key: 'givenName', label: 'Given Name', value: 'Ada' },
    ])
    expect(detail.extraRows).toEqual([])
  })

  test('renders tonyhere claims with persisted labels instead of DLT chrome', () => {
    const detail = readCredentialDetailDisplay({
      id: 'tonyhere-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        vct: 'urn:tonyhere:demo:pid-age:1',
        given_name: 'Ada',
        age_over_18: true,
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      credentialConfigurationId: 'urn:tonyhere:demo:pid-age:1',
      credentialDisplayName: 'PID Age Credential',
      claimDisplayLabels: { given_name: 'Given name', age_over_18: 'Over 18' },
      issuerName: 'tonyhere',
    })

    expect(detail.title).toBe('PID Age Credential')
    expect(detail.issuerName).toBe('tonyhere')
    expect(detail.imageKey).toBe('profile')
    expect(detail.primaryRows).toEqual([
      { key: 'age_over_18', label: 'Over 18', value: 'Yes' },
      { key: 'given_name', label: 'Given name', value: 'Ada' },
    ])
  })

  test('lists tonyhere DrivingLicense ISO-style claims on generic detail', () => {
    const detail = readCredentialDetailDisplay({
      id: 'tonyhere-dl-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        vct: 'https://demo.tonyhere.work/credentials/DrivingLicense',
        given_name: 'Ada',
        issuing_authority: 'Demo Transport',
        age_over_18: true,
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
      credentialConfigurationId: 'https://demo.tonyhere.work/credentials/DrivingLicense',
      credentialDisplayName: 'Demo Driving License',
      claimDisplayLabels: {
        given_name: 'Given name',
        issuing_authority: 'Issuing authority',
      },
    })

    expect(detail.imageKey).toBe('profile')
    expect(detail.primaryRows).toEqual(
      expect.arrayContaining([
        { key: 'given_name', label: 'Given name', value: 'Ada' },
        { key: 'issuing_authority', label: 'Issuing authority', value: 'Demo Transport' },
        { key: 'age_over_18', label: 'Age Over 18', value: 'Yes' },
      ]),
    )
    expect(detail.primaryRows.find((row) => row.key === 'licenceNumber')).toBeUndefined()
  })

  test('reads holder profile values from ThaiNationalID claims', () => {
    expect(readCredentialHolderProfile(thaiIdRecord)).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Ms. Thodsopp Eekkasandigital',
      birthDate: '1990-05-15',
    })
  })

  test('reads holder profile from loose ID card aliases', () => {
    expect(
      readCredentialHolderProfile({
        ...thaiIdRecord,
        claims: {
          Given_Name: 'พิชญา',
          Family_Name: 'รุ่งเรืองกิจ',
          nameEn: 'Ms. Thodsopp Eekkasandigital',
          Date_Of_Birth: '1990-05-15',
        },
      })
    ).toEqual({
      thaiName: 'พิชญา รุ่งเรืองกิจ',
      englishName: 'Ms. Thodsopp Eekkasandigital',
      birthDate: '1990-05-15',
    })
  })

  test('reads holder profile from issuer full_name and birthdate keys', () => {
    expect(
      readCredentialHolderProfile({
        ...thaiIdRecord,
        claims: {
          full_name: 'นางสาว พิชญา รุ่งเรืองกิจ',
          birthdate: '10 มิ.ย. 2530',
        },
      })
    ).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      birthDate: '10 มิ.ย. 2530',
    })
  })

  test('composes driving-licence given and family names for a full_name presentation field', () => {
    const fullNameField = getCardSchema('DLTDrivingLicence').displayFields.find((field) => field.key === 'fullName')
    expect(fullNameField).toBeDefined()
    expect(readPresentationFieldValue(drivingLicenceRecord.claims, fullNameField!)).toBe('Mali Somsri')
  })

  test('does not treat Thai given and family names as the English name', () => {
    expect(
      readCredentialHolderProfile({
        ...thaiIdRecord,
        claims: {
          givenName: 'พิชญา',
          familyName: 'รุ่งเรืองกิจ',
        },
      }),
    ).toEqual({
      thaiName: 'พิชญา รุ่งเรืองกิจ',
    })
  })

  test('composes Latin given_name_en and family_name_en into the English name', () => {
    expect(
      readCredentialHolderProfile({
        ...thaiIdRecord,
        claims: {
          thaiFullName: 'นางสาว พิชญา รุ่งเรืองกิจ',
          given_name_en: 'Pitchaya',
          family_name_en: 'Rungruangkit',
        },
      }),
    ).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Pitchaya Rungruangkit',
    })
  })

  test('keeps issuer values and fills only missing holder fields from PID', () => {
    expect(
      resolveDisplayHolderProfile(drivingLicenceRecord, [thaiIdRecord, drivingLicenceRecord]),
    ).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Mali Somsri',
      birthDate: '1990-05-15',
    })
  })

  test('keeps the document birth date when the issuer provided one', () => {
    const licenceWithBirthDate: VerifiableCredentialRecord = {
      ...drivingLicenceRecord,
      claims: {
        ...drivingLicenceRecord.claims,
        birthDate: '1980-01-01',
      },
    }

    expect(resolveDisplayHolderProfile(licenceWithBirthDate, [thaiIdRecord, licenceWithBirthDate])).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Mali Somsri',
      birthDate: '1980-01-01',
    })
  })

  test('keeps a PID record on its own holder profile', () => {
    expect(resolveDisplayHolderProfile(thaiIdRecord, [thaiIdRecord, drivingLicenceRecord])).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Ms. Thodsopp Eekkasandigital',
      birthDate: '1990-05-15',
    })
  })

  test('keeps the document profile when no PID is stored', () => {
    expect(resolveDisplayHolderProfile(drivingLicenceRecord, [drivingLicenceRecord])).toEqual({
      englishName: 'Mali Somsri',
    })
  })

  test('splits a Thai PID full name into ISO given_name and family_name', () => {
    expect(splitThaiGivenAndFamily('นางสาว พิชญา รุ่งเรืองกิจ')).toEqual({
      given_name: 'นางสาว พิชญา',
      family_name: 'รุ่งเรืองกิจ',
    })
  })

  test('does not overlay NFC names when the licence already has given and family names', () => {
    expect(resolvePidMdocNameOverlay(drivingLicenceRecord, [thaiIdRecord, drivingLicenceRecord])).toBeUndefined()
    expect(resolvePidMdocNameOverlay(thaiIdRecord, [thaiIdRecord])).toBeUndefined()
  })

  test('builds a session NFC name overlay only for missing licence name fields', () => {
    const namelessLicence: VerifiableCredentialRecord = {
      ...drivingLicenceRecord,
      claims: { licenceNumber: 'DLT-12345' },
    }
    expect(resolvePidMdocNameOverlay(namelessLicence, [thaiIdRecord, namelessLicence])).toEqual({
      given_name: 'นางสาว พิชญา',
      family_name: 'รุ่งเรืองกิจ',
    })
  })

  test('keeps issuer presentment disclosure values and fills missing name fields from PID', () => {
    const profile = {
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Pitchaya Rungruangkit',
    }
    expect(overlayPresentationDisclosureValue('given_name', 'สมชาย', profile)).toBe('สมชาย')
    expect(overlayPresentationDisclosureValue('family_name', 'ใจดี', profile)).toBe('ใจดี')
    expect(overlayPresentationDisclosureValue('full_name', 'สมชาย ใจดี', profile)).toBe('สมชาย ใจดี')
    expect(overlayPresentationDisclosureValue('given_name', '', profile)).toBe('นางสาว พิชญา')
    expect(overlayPresentationDisclosureValue('family_name', undefined, profile)).toBe('รุ่งเรืองกิจ')
    expect(overlayPresentationDisclosureValue('licenceClass', 'B', profile)).toBe('B')
    expect(overlayPresentationDisclosureValue('english_name', 'Somchai Jaidee', { thaiName: profile.thaiName })).toBe(
      'Somchai Jaidee',
    )
    expect(overlayPresentationDisclosureValue('english_name', '', { thaiName: profile.thaiName })).toBe('-')
    expect(
      overlayPresentationDisclosureValue('org.iso.18013.5.1:given_name', 'สมชาย', profile),
    ).toBe('สมชาย')
  })
})
