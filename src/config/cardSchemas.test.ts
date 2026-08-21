import { getCardSchema, getCardSchemaForConfigurationId, getAllCardSchemas, resolvePresentationDisclosureLabel, resolveCardSchema } from './cardSchemas'

import { THEME } from './themeColors'

describe('getCardSchema', () => {
  test('returns ThaiNationalID schema', () => {
    const schema = getCardSchema('ThaiNationalID')
    expect(schema.type).toBe('ThaiNationalID')
    expect(schema.title).toBe('บัตรประชาชน')
    expect(schema.primaryColor).toBe(THEME.navy)
    expect(schema.displayFields.length).toBeGreaterThan(0)
  })

  test('returns DLTDrivingLicence schema', () => {
    const schema = getCardSchema('DLTDrivingLicence')
    expect(schema.type).toBe('DLTDrivingLicence')
    expect(schema.title).toBe('ใบขับขี่')
    expect(schema.displayFields.some((f) => f.key === 'licenceNumber')).toBe(true)
  })

  test('maps ISO mDL configuration id to DLTDrivingLicence and leaves unknown licence ids on fallback', () => {
    expect(getCardSchemaForConfigurationId('org.iso.18013.5.1.mDL').type).toBe('DLTDrivingLicence')
    expect(getCardSchemaForConfigurationId('Iso18013DriversLicenseCredential_dc+sd-jwt').type).toBe(
      'DLTDrivingLicence',
    )
    expect(getCardSchemaForConfigurationId('TranscriptCredential_dc+sd-jwt').type).toBe(
      'ChulalongkornUniversityTranscript',
    )
    expect(getCardSchemaForConfigurationId('TestMdocDrivingLicence').type).toBe('__fallback__')
    expect(getCardSchemaForConfigurationId('idcard').type).toBe('ThaiNationalID')
    expect(
      getCardSchemaForConfigurationId(
        'Iso18013DriversLicenseCredential_dc+sd-jwt',
        'https://demo.tonyhere.work/',
      ).type,
    ).toBe('__fallback__')
    expect(
      getCardSchemaForConfigurationId(
        'Iso18013DriversLicenseCredential_dc+sd-jwt',
        'https://issuer.zenithcomp.co.th:455',
      ).type,
    ).toBe('DLTDrivingLicence')
  })

  test('returns ChulalongkornUniversityTranscript schema', () => {
    const schema = getCardSchema('ChulalongkornUniversityTranscript')
    expect(schema.type).toBe('ChulalongkornUniversityTranscript')
    expect(schema.title).toBe('ใบแสดงผลการเรียน')
    expect(schema.displayFields.some((f) => f.key === 'gpa')).toBe(true)
  })

  test('provides issuer confirmation content for every supported issuance document', () => {
    expect(getCardSchema('ThaiNationalID').issuanceVerification).toEqual({
      providerLabel: 'PID',
      imageKey: 'thaid',
    })
    expect(getCardSchema('ThaiNationalID').issuanceConfirmation).toEqual({
      documentLabel: 'บัตรประชาชน',
      issuerLabel: 'กรมการปกครอง',
      imageKey: 'dopa',
      accent: 'navy',
    })
    expect(getCardSchema('DLTDrivingLicence').issuanceConfirmation).toEqual({
      documentLabel: 'ใบอนุญาตขับขี่',
      issuerLabel: 'กรมการขนส่งทางบก',
      imageKey: 'dltt',
      accent: 'navy',
    })
    expect(getCardSchema('ChulalongkornUniversityTranscript').issuanceConfirmation).toEqual({
      documentLabel: 'ใบแสดงผลการเรียน',
      issuerLabel: 'จุฬาลงกรณ์มหาวิทยาลัย',
      imageKey: 'chulalongkorn',
      accent: 'pink',
    })
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

  test('returns fallback for unknown third-party configuration ids', () => {
    const schema = getCardSchemaForConfigurationId('urn:tonyhere:demo:pid-age:1')
    expect(schema.type).toBe('__fallback__')
    expect(schema.title).toBe('Credential')
  })

  test('resolveCardSchema ignores a stored DLT type when the vct is unregistered', () => {
    const schema = resolveCardSchema({
      type: 'DLTDrivingLicence',
      claims: { vct: 'urn:tonyhere:demo:pid-age:1' },
      credentialConfigurationId: 'urn:tonyhere:demo:pid-age:1',
    })
    expect(schema.type).toBe('__fallback__')
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
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'given_name')).toBe('ชื่อ')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'family_name')).toBe('นามสกุล')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'birth_date')).toBe('วันเดือนปีเกิด')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'issue_date')).toBe('วันที่ออกใบอนุญาต')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'expiry_date')).toBe('วันหมดอายุ')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'issuing_country')).toBe('ประเทศผู้ออก')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'issuing_authority')).toBe('หน่วยงานผู้ออก')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'document_number')).toBe('เลขที่ใบอนุญาตขับรถ')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'portrait')).toBe('รูปถ่าย')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'photo')).toBe('รูปถ่าย')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'full_name')).toBe('ชื่อ-นามสกุล')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'license_type')).toBe('ประเภทใบอนุญาต')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'licence_type')).toBe('ประเภทใบอนุญาต')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'driving_privileges')).toBe('ประเภทใบอนุญาต')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'un_distinguishing_sign')).toBe('รหัสประเทศ')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'age_over_18')).toBe('อายุเกิน 18 ปี')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'sex')).toBe('เพศ')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'nationality')).toBe('สัญชาติ')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'resident_address')).toBe('ที่อยู่')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'birth_place')).toBe('สถานที่เกิด')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'height')).toBe('ส่วนสูง')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'weight')).toBe('น้ำหนัก')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'eye_colour')).toBe('สีตา')
    expect(resolvePresentationDisclosureLabel('DLTDrivingLicence', 'hair_colour')).toBe('สีผม')
    expect(
      resolvePresentationDisclosureLabel('DLTDrivingLicence', 'org.iso.18013.5.1.family_name'),
    ).toBe('นามสกุล')
    expect(
      resolvePresentationDisclosureLabel('DLTDrivingLicence', 'org.iso.18013.5.1:given_name'),
    ).toBe('ชื่อ')
    expect(
      resolvePresentationDisclosureLabel('DLTDrivingLicence', 'org.iso.18013.5.1.driving_privileges'),
    ).toBe('ประเภทใบอนุญาต')
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
