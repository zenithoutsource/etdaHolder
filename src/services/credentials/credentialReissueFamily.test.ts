import {
  areCredentialsSameReissueFamily,
  readCredentialIssuerHostname,
} from './credentialReissueFamily'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const FIRST_PARTY_ISSUER = 'https://issuer.zenithcomp.co.th:455/'
const THIRD_PARTY_ISSUER = 'https://demo.tonyhere.work/'

function record(overrides: Partial<VerifiableCredentialRecord>): VerifiableCredentialRecord {
  return {
    id: 'cred-1',
    type: 'DLTDrivingLicence',
    rawVc: 'mdoc:abc',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('credentialReissueFamily', () => {
  test('reads issuer hostname from issuerUrl', () => {
    expect(
      readCredentialIssuerHostname({ issuerUrl: FIRST_PARTY_ISSUER, claims: {} }),
    ).toBe('issuer.zenithcomp.co.th')
  })

  test('first-party DLT siblings with same issuer are the same family', () => {
    const expired = record({
      id: 'old',
      issuerUrl: FIRST_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const fresh = record({
      id: 'new',
      issuerUrl: FIRST_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    expect(areCredentialsSameReissueFamily(expired, fresh)).toBe(true)
  })

  test('first-party expired DLT and third-party mDL are not the same family', () => {
    const firstParty = record({
      id: 'fp-old',
      issuerUrl: FIRST_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const thirdParty = record({
      id: 'tp-new',
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: THIRD_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      credentialConfigurationId: 'org.iso.18013.5.1.mDL',
    })
    expect(areCredentialsSameReissueFamily(firstParty, thirdParty)).toBe(false)
  })

  test('third-party credentials with different issuers are not the same family', () => {
    const a = record({
      id: 'a',
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: THIRD_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const b = record({
      id: 'b',
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: 'https://issuer.example.com',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    expect(areCredentialsSameReissueFamily(a, b)).toBe(false)
  })

  test('matching stored type alone is not enough across issuers', () => {
    const firstParty = record({ id: 'fp', issuerUrl: FIRST_PARTY_ISSUER })
    const thirdParty = record({
      id: 'tp',
      type: 'DLTDrivingLicence',
      issuerUrl: THIRD_PARTY_ISSUER,
      claims: { vct: 'https://demo.tonyhere.work/credentials/DrivingLicense' },
    })
    expect(areCredentialsSameReissueFamily(firstParty, thirdParty)).toBe(false)
  })
})
