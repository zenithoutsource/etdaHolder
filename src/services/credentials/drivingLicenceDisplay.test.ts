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
  test('maps issuer claims into the driving-licence card view', () => {
    const view = readDrivingLicenceCardView(drivingLicenceRecord)

    expect(view.documentTitle).toBe('DRIVING LICENSE')
    expect(view.thaiName).toBe('สมชาย ใจดี')
    expect(view.licenceNumber).toBe('DLT-12345')
    expect(view.type).toBe('รถยนต์ส่วนบุคคล')
    expect(view.birthDate).toContain('2533')
    expect(view.expiryDate).toContain('2573')
  })
})
