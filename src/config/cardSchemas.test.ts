import { getCardSchema, getCardSchemaForConfigurationId, getAllCardSchemas, resolvePresentationDisclosureLabel } from './cardSchemas'

import { THEME } from './themeColors'

describe('getCardSchema', () => {
  test('returns ThaiNationalID schema', () => {
    const schema = getCardSchema('ThaiNationalID')
    expect(schema.type).toBe('ThaiNationalID')
    expect(schema.title).toBe('Thai National ID')
    expect(schema.primaryColor).toBe(THEME.navy)
    expect(schema.displayFields.length).toBeGreaterThan(0)
  })

  test('returns DLTDrivingLicence schema', () => {
    const schema = getCardSchema('DLTDrivingLicence')
    expect(schema.type).toBe('DLTDrivingLicence')
    expect(schema.title).toBe('Driving Licence')
    expect(schema.displayFields.some((f) => f.key === 'licenceNumber')).toBe(true)
  })

  test('maps ISO mDL configuration id and doctype to DLTDrivingLicence', () => {
    expect(getCardSchemaForConfigurationId('org.iso.18013.5.1.mDL').type).toBe('DLTDrivingLicence')
    expect(getCardSchemaForConfigurationId('TestMdocDrivingLicence').type).toBe('DLTDrivingLicence')
  })

  test('returns ChulalongkornUniversityTranscript schema', () => {
    const schema = getCardSchema('ChulalongkornUniversityTranscript')
    expect(schema.type).toBe('ChulalongkornUniversityTranscript')
    expect(schema.title).toBe('Academic Transcript')
    expect(schema.displayFields.some((f) => f.key === 'gpa')).toBe(true)
  })

  test('returns fallback for unknown type', () => {
    const schema = getCardSchema('UnknownCredentialType')
    expect(schema.title).toBe('Credential')
    expect(schema.issuerName).toBe('Unknown Issuer')
    expect(schema.displayFields).toHaveLength(0)
  })

  test('returns fallback for empty string', () => {
    const schema = getCardSchema('')
    expect(schema.title).toBe('Credential')
  })

  test('each schema has non-empty displayFields with key and label', () => {
    for (const schema of getAllCardSchemas()) {
      expect(schema.displayFields.length).toBeGreaterThan(0)
      for (const field of schema.displayFields) {
        expect(field.key).toBeTruthy()
        expect(field.label).toBeTruthy()
      }
    }
  })

  test('resolvePresentationDisclosureLabel returns Thai presentation labels from schema aliases', () => {
    expect(resolvePresentationDisclosureLabel('ThaiNationalID', 'full_name')).toBe('ชื่อ-นามสกุล')
    expect(resolvePresentationDisclosureLabel('ChulalongkornUniversityTranscript', 'gpa')).toBe('เกรดเฉลี่ย')
  })

  test('getAllCardSchemas returns registered card types', () => {
    const schemas = getAllCardSchemas()
    expect(schemas.length).toBeGreaterThanOrEqual(3)
    const types = schemas.map((s) => s.type)
    expect(types).toContain('ThaiNationalID')
    expect(types).toContain('DLTDrivingLicence')
    expect(types).toContain('ChulalongkornUniversityTranscript')
  })
})
