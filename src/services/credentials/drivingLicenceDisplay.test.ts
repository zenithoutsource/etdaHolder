import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { readDrivingLicenceCardView } from './drivingLicenceDisplay'

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'สมชาย',
    familyName: 'ใจดี',
    givenNameEn: 'Somchai',
    familyNameEn: 'Jaidee',
    licenceNumber: 'DLT-12345',
    licenceClass: 'รถยนต์ส่วนบุคคล',
    birthDate: '1990-05-15',
    issuanceDate: '2024-01-20',
    expiryDate: '2030-01-31',
  },
  issuedAt: '2024-01-20T00:00:00.000Z',
  expiresAt: '2030-01-31T00:00:00.000Z',
}

describe('readDrivingLicenceCardView', () => {
  test('maps tonyhere synthetic mDL claims into the driving-licence card view', () => {
    const view = readDrivingLicenceCardView({
      id: 'tonyhere-mdl',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        vct: 'https://demo.tonyhere.work/credentials/DrivingLicense',
        givenName: 'SOMCHAI',
        familyName: 'SUKJAI',
        givenNameTh: 'สมชาย',
        familyNameTh: 'สุขใจ',
        licenceNumber: 'DL-DEMO-000001',
        birthDate: '15/01/1990',
        issuanceDate: '20/08/2026',
        expiryDate: '19/08/2031',
        licenceClass: 'B',
      },
      issuedAt: '2026-08-20T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
    })

    expect(view.thaiName).toBe('สมชาย สุขใจ')
    expect(view.englishName).toBe('SOMCHAI SUKJAI')
    expect(view.licenceNumber).toBe('DL-DEMO-000001')
    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
    expect(view.birthDate).toContain('2533')
    expect(view.issueDate).toContain('2569')
    expect(view.expiryDate).toContain('2574')
  })

  test('maps issuer claims into the driving-licence card view', () => {
    const view = readDrivingLicenceCardView(drivingLicenceRecord)

    expect(view.documentTitle).toBe('DRIVER LICENSE')
    expect(view.thaiName).toBe('สมชาย ใจดี')
    expect(view.licenceNumber).toBe('DLT-12345')
    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
    expect(view.englishType).toBe('Private Motor Car')
    expect(view.englishName).toBe('Somchai Jaidee')
    expect(view.birthDate).toContain('2533')
    expect(view.expiryDate).toContain('2573')
  })

  test('treats Buddhist Era birth dates as already BE and does not add 543 again', () => {
    const view = readDrivingLicenceCardView({
      ...drivingLicenceRecord,
      claims: {
        ...drivingLicenceRecord.claims,
        birthDate: '2530-06-10',
      },
    })

    expect(view.birthDate).toContain('มิถุนายน')
    expect(view.birthDate).toContain('2530')
    expect(view.birthDate).not.toContain('3073')
  })

  test('converts Gregorian birth dates to Thai Buddhist Era display', () => {
    const view = readDrivingLicenceCardView({
      ...drivingLicenceRecord,
      claims: {
        ...drivingLicenceRecord.claims,
        birthDate: '1987-06-10',
      },
    })

    expect(view.birthDate).toContain('มิถุนายน')
    expect(view.birthDate).toContain('2530')
  })

  test('maps the first mdoc vehicle category to Thai and English type names', () => {
    const view = readDrivingLicenceCardView({
      id: 'licence-mdoc',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'สมชาย',
        familyName: 'ใจดี',
        licenceNumber: '123456789',
        licenceClass: 'B',
        birthDate: '1985-01-01',
        issuanceDate: '2023-01-01',
        expiryDate: '2033-01-01',
      },
      issuedAt: '2023-01-01T00:00:00.000Z',
      expiresAt: '2033-01-01T00:00:00.000Z',
    })

    expect(view.thaiName).toBe('สมชาย ใจดี')
    expect(view.englishName).toBe('Ms. Thodsopp Eekkasandigital')
    expect(view.licenceNumber).toBe('123456789')
    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
    expect(view.englishType).toBe('Private Motor Car')
    expect(view.type).not.toBe('B')
    expect(view.englishType).not.toBe('B')
  })

  test('maps driving_privileges vehicle_category_code arrays to Thai and English type names', () => {
    const view = readDrivingLicenceCardView({
      ...drivingLicenceRecord,
      claims: {
        givenName: 'สมชาย',
        familyName: 'ใจดี',
        licenceNumber: 'DLT-12345',
        driving_privileges: [{ vehicle_category_code: 'B' }],
        birthDate: '1990-05-15',
        issuanceDate: '2024-01-20',
        expiryDate: '2030-01-31',
      },
    })

    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
    expect(view.englishType).toBe('Private Motor Car')
    expect(view.type).not.toContain('vehicle_category_code')
    expect(view.type).not.toContain('[')
  })

  test('maps ISO category A to motorcycle labels', () => {
    const view = readDrivingLicenceCardView({
      ...drivingLicenceRecord,
      claims: {
        ...drivingLicenceRecord.claims,
        licenceClass: 'A',
      },
    })

    expect(view.type).toBe('รถจักรยานยนต์')
    expect(view.englishType).toBe('Motorcycle')
  })

  test('hides unknown or joined ISO category letters', () => {
    const view = readDrivingLicenceCardView({
      ...drivingLicenceRecord,
      claims: {
        ...drivingLicenceRecord.claims,
        licenceClass: 'A, B',
      },
    })

    expect(view.type).toBe('-')
    expect(view.englishType).toBe('-')
  })

  test('keeps first-party vehicle type from license_type when leftover privilege objects replace licenceClass', () => {
    const view = readDrivingLicenceCardView({
      id: 'dl-zenith',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      issuedAt: '2024-01-20T00:00:00.000Z',
      issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
      claims: {
        vct: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense',
        givenName: 'สมชาย',
        familyName: 'ใจดี',
        licenceNumber: '54002891',
        license_type: 'รถยนต์ส่วนบุคคล',
        driving_privileges: { vehicle_category_code: 'B' },
        sex: '1',
        issuing_authority: 'Department of Land Transport',
      },
    })

    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
    expect(view.englishType).toBe('Private Motor Car')
  })

  test('fills missing Thai name from the holder profile and uses the mock English name', () => {
    const view = readDrivingLicenceCardView(
      {
        ...drivingLicenceRecord,
        claims: {
          licenceNumber: 'DLT-12345',
          licenceClass: 'รถยนต์ส่วนบุคคล',
        },
      },
      {
        thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
        englishName: 'Pitchaya Rungruangkit',
      },
    )

    expect(view.thaiName).toBe('นางสาว พิชญา รุ่งเรืองกิจ')
    expect(view.englishName).toBe('Ms. Thodsopp Eekkasandigital')
    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
  })

  test('keeps the licence birth date when the issuer provided one', () => {
    const view = readDrivingLicenceCardView(drivingLicenceRecord, {
      thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
      englishName: 'Pitchaya Rungruangkit',
      birthDate: '1987-06-10',
    })

    expect(view.birthDate).toContain('พฤษภาคม')
    expect(view.birthDate).toContain('2533')
    expect(view.birthDate).not.toContain('2530')
  })
})
