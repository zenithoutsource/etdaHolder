import { readCredentialDetailDisplay, readCredentialHolderProfile, readCredentialSummaryDisplay } from './credentialDisplay'
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
    englishFullName: 'Ms. Pitchaya Rungruangkit',
    birthDate: '1990-05-15',
  },
  issuedAt: '2026-06-08T00:00:00.000Z',
}

describe('credentialDisplay', () => {
  test('builds a schema-driven driving licence summary without transcript labels', () => {
    const summary = readCredentialSummaryDisplay(drivingLicenceRecord)

    expect(summary.title).toBe('Driving Licence')
    expect(summary.documentTitle).toBe('DRIVING LICENSE')
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
  expect(detail.primaryRows).toEqual([])
    expect(detail.extraRows).toEqual([
      { key: 'customClaim', label: 'customClaim', value: 'Visible value' },
      { key: 'givenName', label: 'givenName', value: 'Ada' },
    ])
  })

  test('reads holder profile values from ThaiNationalID claims', () => {
    expect(readCredentialHolderProfile(thaiIdRecord)).toEqual({
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Ms. Pitchaya Rungruangkit',
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
          nameEn: 'Ms. Pitchaya Rungruangkit',
          Date_Of_Birth: '1990-05-15',
        },
      })
    ).toEqual({
      thaiName: 'พิชญา รุ่งเรืองกิจ',
      englishName: 'Ms. Pitchaya Rungruangkit',
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
})
