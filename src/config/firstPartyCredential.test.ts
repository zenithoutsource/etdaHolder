import {
  canonicalFirstPartyType,
  isFirstPartyCredential,
  isFirstPartyDrivingLicence,
  isFirstPartyIdentifier,
  isFirstPartyIssuerOrigin,
  readUnregisteredDocumentGroupKey,
  resolveFirstPartyType,
} from './firstPartyCredential'

describe('firstPartyCredential', () => {
  test('maps exact first-party types and known wire ids', () => {
    expect(canonicalFirstPartyType('ThaiNationalID')).toBe('ThaiNationalID')
    expect(canonicalFirstPartyType('idcard')).toBe('ThaiNationalID')
    expect(canonicalFirstPartyType('IdCard_dc+sd-jwt')).toBe('ThaiNationalID')
    expect(canonicalFirstPartyType('org.iso.18013.5.1.mDL')).toBe('DLTDrivingLicence')
    expect(canonicalFirstPartyType('DLTDrivingLicence')).toBe('DLTDrivingLicence')
    expect(canonicalFirstPartyType('ChulalongkornUniversityTranscript')).toBe(
      'ChulalongkornUniversityTranscript',
    )
    expect(canonicalFirstPartyType('MedicalCertificate')).toBe('MedicalCertificate')
  })

  test('maps a URL vct whose last path segment is a known id', () => {
    expect(canonicalFirstPartyType('https://issuer.example.com/vct/idcard')).toBe('ThaiNationalID')
    expect(
      canonicalFirstPartyType('https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense'),
    ).toBe('DLTDrivingLicence')
    expect(
      canonicalFirstPartyType('https://issuer.zenithcomp.co.th:455/credentials/DrivingLicence'),
    ).toBe('DLTDrivingLicence')
    expect(
      canonicalFirstPartyType(
        'https://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential',
      ),
    ).toBe('ChulalongkornUniversityTranscript')
  })

  test('maps first-party configuration ids after stripping format suffixes', () => {
    expect(canonicalFirstPartyType('Iso18013DriversLicenseCredential_dc+sd-jwt')).toBe(
      'DLTDrivingLicence',
    )
    expect(canonicalFirstPartyType('TranscriptCredential_dc+sd-jwt')).toBe(
      'ChulalongkornUniversityTranscript',
    )
  })

  test('keeps first-party catalog matches when stored type plus first-party vct are present', () => {
    expect(
      resolveFirstPartyType({
        type: 'DLTDrivingLicence',
        claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense' },
        credentialConfigurationId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
      }),
    ).toBe('DLTDrivingLicence')
    expect(
      resolveFirstPartyType({
        type: 'ChulalongkornUniversityTranscript',
        claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential' },
        credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
      }),
    ).toBe('ChulalongkornUniversityTranscript')
  })

  test('does not fold substring licence or mdl ids', () => {
    expect(canonicalFirstPartyType('TestMdocDrivingLicence')).toBeUndefined()
    expect(canonicalFirstPartyType('urn:tonyhere:demo:pid-age:1')).toBeUndefined()
    expect(canonicalFirstPartyType('org.example.licence')).toBeUndefined()
    expect(isFirstPartyIdentifier('urn:tonyhere:demo:pid-age:1')).toBe(false)
  })

  test('reclassifies a mis-folded DLT record with a tonyhere vct as unregistered', () => {
    const record = {
      type: 'DLTDrivingLicence',
      claims: { vct: 'urn:tonyhere:demo:pid-age:1' },
      credentialConfigurationId: 'urn:tonyhere:demo:pid-age:1',
    }
    expect(resolveFirstPartyType(record)).toBeUndefined()
    expect(isFirstPartyCredential(record)).toBe(false)
    expect(isFirstPartyDrivingLicence(record)).toBe(false)
  })

  test('keeps ISO mDL as DLT even when the offer id is not on the allowlist', () => {
    expect(
      resolveFirstPartyType({
        type: 'TestMdocDrivingLicence',
        claims: { doctype: 'org.iso.18013.5.1.mDL' },
        credentialConfigurationId: 'TestMdocDrivingLicence',
      }),
    ).toBe('DLTDrivingLicence')
  })

  test('does not treat a tonyhere DrivingLicense vct as first-party DLT', () => {
    const record = {
      type: 'DLTDrivingLicence',
      claims: { vct: 'https://demo.tonyhere.work/credentials/DrivingLicense' },
      credentialConfigurationId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
      issuerUrl: 'https://demo.tonyhere.work/',
    }
    expect(resolveFirstPartyType(record)).toBeUndefined()
    expect(isFirstPartyCredential(record)).toBe(false)
    expect(isFirstPartyDrivingLicence(record)).toBe(false)
  })

  test('recognizes the first-party issuer origin by hostname', () => {
    expect(isFirstPartyIssuerOrigin('https://issuer.zenithcomp.co.th:455/')).toBe(true)
    expect(isFirstPartyIssuerOrigin('http://issuer.zenithcomp.co.th:455')).toBe(true)
    expect(isFirstPartyIssuerOrigin('https://demo.tonyhere.work/')).toBe(false)
    expect(isFirstPartyIssuerOrigin('https://wallet.zenithcomp.co.th:455')).toBe(false)
  })

  test('trusts stored first-party type when no wire ids are present', () => {
    expect(resolveFirstPartyType({ type: 'ThaiNationalID', claims: {} })).toBe('ThaiNationalID')
  })

  test('groups unregistered documents by vct then configuration id', () => {
    expect(
      readUnregisteredDocumentGroupKey({
        type: 'DLTDrivingLicence',
        claims: { vct: 'urn:tonyhere:demo:pid-age:1' },
        credentialConfigurationId: 'other',
      }),
    ).toBe('urn:tonyhere:demo:pid-age:1')
  })
})
