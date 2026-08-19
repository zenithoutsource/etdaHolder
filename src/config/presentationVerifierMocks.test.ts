import {
  isGenericVerifierName,
  readPresentationAccessLabel,
  readPresentationConsentHeroIcon,
  readPresentationConsentPartyLabel,
  readPresentationVerifierDisplayName,
  readPresentationVerifierLogoSource,
} from './presentationVerifierMocks'
import {
  isGenericDocumentTitle,
  isGenericIssuerName,
  projectHistoryInfoBoxValue,
  projectHistoryPartyName,
  readHistoryDocumentLabel,
  readHistoryIssuerPartyName,
} from './historyDisplayNames'

describe('presentationVerifierMocks', () => {
  test('uses protocol name when not generic', () => {
    expect(readPresentationVerifierDisplayName('ThaiNationalID', 'ร้านอาหาร ABC')).toBe('ร้านอาหาร ABC')
    expect(readPresentationConsentPartyLabel('ThaiNationalID', 'ร้านอาหาร ABC')).toBe('ร้านอาหาร ABC')
  })

  test('falls back to ThaiNationalID mock when verifier name is generic', () => {
    expect(readPresentationVerifierDisplayName('ThaiNationalID', 'Verifier API')).toBe('ร้านบาร์')
    expect(readPresentationConsentPartyLabel('ThaiNationalID', 'Verifier API')).toBe('ร้านบาร์')
    expect(readPresentationAccessLabel('ThaiNationalID')).toBe('การตรวจสอบอายุ')
  })

  test('maps DLTDrivingLicence to police mock labels', () => {
    expect(readPresentationVerifierDisplayName('DLTDrivingLicence')).toBe('สำนักงานตำรวจแห่งชาติ')
    expect(readPresentationAccessLabel('DLTDrivingLicence')).toBe('ใบขับขี่ดิจิทัล')
  })

  test('uses the white Chula PNG only for transcript consent', () => {
    expect(readPresentationVerifierLogoSource('ChulalongkornUniversityTranscript')).toEqual(
      require('../../assets/images/chulalongkorn-white.png'),
    )
    expect(readPresentationVerifierLogoSource('ThaiNationalID')).toBeUndefined()
    expect(readPresentationVerifierLogoSource('DLTDrivingLicence')).toBeUndefined()
    expect(readPresentationVerifierLogoSource('MedicalCertificate')).toBeUndefined()
    expect(readPresentationVerifierLogoSource('UnknownType')).toBeUndefined()
  })

  test('maps non-transcript types to consent hero icons', () => {
    expect(readPresentationConsentHeroIcon('ThaiNationalID')).toBe('glass-cocktail')
    expect(readPresentationConsentHeroIcon('DLTDrivingLicence')).toBe('car')
    expect(readPresentationConsentHeroIcon('MedicalCertificate')).toBe('medical-bag')
    expect(readPresentationConsentHeroIcon('ChulalongkornUniversityTranscript')).toBeUndefined()
    expect(readPresentationConsentHeroIcon('UnknownType')).toBeUndefined()
  })

  test('falls back to protocol verifier name for unknown credential types', () => {
    expect(readPresentationVerifierDisplayName('UnknownType', 'Custom Verifier')).toBe('Custom Verifier')
    expect(readPresentationConsentPartyLabel('UnknownType', 'Custom Verifier')).toBe('Custom Verifier')
    expect(readPresentationAccessLabel('UnknownType')).toBeUndefined()
  })

  test('isGenericVerifierName detects config defaults', () => {
    expect(isGenericVerifierName('Verifier API')).toBe(true)
    expect(isGenericVerifierName('Trusted Party')).toBe(true)
    expect(isGenericVerifierName('')).toBe(true)
    expect(isGenericVerifierName('Central')).toBe(false)
  })
})

describe('historyDisplayNames', () => {
  test('maps built-in issuer names to Thai issuerLabel', () => {
    expect(
      readHistoryIssuerPartyName({
        credentialType: 'ThaiNationalID',
        protocolIssuerName: 'Department of Provincial Administration',
      }),
    ).toBe('กรมการปกครอง')
    expect(isGenericIssuerName('Department of Provincial Administration')).toBe(true)
  })

  test('keeps non-generic issuer names from protocol', () => {
    expect(
      readHistoryIssuerPartyName({
        credentialType: 'ThaiNationalID',
        protocolIssuerName: 'กรมการปกครองพิเศษ',
      }),
    ).toBe('กรมการปกครองพิเศษ')
  })

  test('maps schema.title EN to Thai documentLabel', () => {
    expect(
      readHistoryDocumentLabel({
        credentialType: 'ThaiNationalID',
        storedDocumentType: 'Thai National ID',
      }),
    ).toBe('บัตรประชาชน')
    expect(isGenericDocumentTitle('Thai National ID', 'ThaiNationalID')).toBe(true)
  })

  test('keeps offer display name even when English', () => {
    expect(
      readHistoryDocumentLabel({
        credentialType: 'ThaiNationalID',
        offerDisplayName: 'Thai National ID',
      }),
    ).toBe('Thai National ID')
  })

  test('MedicalCertificate falls back to Thai mock labels', () => {
    expect(readHistoryDocumentLabel({ credentialType: 'MedicalCertificate' })).toBe('ใบรับรองแพทย์')
    expect(readHistoryIssuerPartyName({ credentialType: 'MedicalCertificate' })).toBe('โรงพยาบาล')
  })

  test('info box prefers disclosed claims over access mock', () => {
    expect(
      projectHistoryInfoBoxValue({
        kind: 'presentation-success',
        disclosedClaims: ['วันเดือนปีเกิด'],
        documentType: 'Thai National ID',
        credentialType: 'ThaiNationalID',
      }),
    ).toBe('วันเดือนปีเกิด')
  })

  test('info box uses Thai access mock when claims are empty', () => {
    expect(
      projectHistoryInfoBoxValue({
        kind: 'presentation-failed',
        disclosedClaims: [],
        documentType: 'Thai National ID',
        credentialType: 'ThaiNationalID',
      }),
    ).toBe('การตรวจสอบอายุ')
  })

  test('projects generic verifier party names to mock', () => {
    expect(
      projectHistoryPartyName({
        partyName: 'Verifier API',
        kind: 'presentation-success',
        channel: 'oid4vp',
        credentialType: 'ThaiNationalID',
      }),
    ).toBe('ร้านบาร์')
  })
})
