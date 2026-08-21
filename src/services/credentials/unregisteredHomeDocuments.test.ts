import { listUnregisteredHomeDocuments, isCatalogFirstPartyMatch } from './unregisteredHomeDocuments'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

function record(overrides: Partial<VerifiableCredentialRecord>): VerifiableCredentialRecord {
  return {
    id: 'cred-1',
    type: 'Unknown',
    rawVc: 'header.payload.signature',
    claims: {},
    issuedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('unregisteredHomeDocuments', () => {
  test('appends tonyhere cards and keeps DLT catalog matches separate', () => {
    const tonyhere = record({
      id: 'tonyhere-1',
      type: 'DLTDrivingLicence',
      claims: { vct: 'urn:tonyhere:demo:pid-age:1' },
      credentialConfigurationId: 'urn:tonyhere:demo:pid-age:1',
      credentialDisplayName: 'PID Age Credential',
    })
    const dlt = record({
      id: 'dlt-1',
      type: 'DLTDrivingLicence',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      credentialConfigurationId: 'org.iso.18013.5.1.mDL',
    })

    expect(isCatalogFirstPartyMatch(tonyhere, 'DLTDrivingLicence')).toBe(false)
    expect(isCatalogFirstPartyMatch(dlt, 'DLTDrivingLicence')).toBe(true)
    expect(listUnregisteredHomeDocuments([tonyhere, dlt], {})).toEqual([
      { record: tonyhere, label: 'PID Age Credential' },
    ])
  })

  test('keeps first-party issuer Driving License and Transcript on catalog rows', () => {
    const drivingLicence = record({
      id: 'dlt-url-1',
      type: 'DLTDrivingLicence',
      claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense' },
      credentialConfigurationId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
    })
    const transcript = record({
      id: 'transcript-1',
      type: 'ChulalongkornUniversityTranscript',
      claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential' },
      credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    })

    expect(isCatalogFirstPartyMatch(drivingLicence, 'DLTDrivingLicence')).toBe(true)
    expect(isCatalogFirstPartyMatch(transcript, 'ChulalongkornUniversityTranscript')).toBe(true)
    expect(listUnregisteredHomeDocuments([drivingLicence, transcript], {})).toEqual([])
  })

  test('keeps a tonyhere DrivingLicense card off the first-party catalog row', () => {
    const zenithcomp = record({
      id: 'dlt-1',
      type: 'DLTDrivingLicence',
      claims: { vct: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense' },
      issuerUrl: 'https://issuer.zenithcomp.co.th:455',
    })
    const tonyhere = record({
      id: 'tonyhere-dl-1',
      type: 'DLTDrivingLicence',
      claims: { vct: 'https://demo.tonyhere.work/credentials/DrivingLicense' },
      issuerUrl: 'https://demo.tonyhere.work/',
      credentialDisplayName: 'Demo Driving License',
    })

    expect(isCatalogFirstPartyMatch(zenithcomp, 'DLTDrivingLicence')).toBe(true)
    expect(isCatalogFirstPartyMatch(tonyhere, 'DLTDrivingLicence')).toBe(false)
    expect(listUnregisteredHomeDocuments([zenithcomp, tonyhere], {})).toEqual([
      { record: tonyhere, label: 'Demo Driving License' },
    ])
  })
})
