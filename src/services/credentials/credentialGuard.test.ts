import {
  canRequestCredentialType,
  hasPidCredential,
  isPidCredentialOffer,
} from './credentialGuard'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'id-card-1',
  type: 'ThaiNationalID',
  rawVc: 'vc',
  claims: {},
  issuedAt: '2026-06-09T00:00:00.000Z',
}

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'BangkokUniversityTranscript',
  rawVc: 'vc',
  claims: {},
  issuedAt: '2026-06-09T00:00:00.000Z',
}

describe('credentialGuard', () => {
  test('detects the foundational PID credential from stored records', () => {
    expect(hasPidCredential([])).toBe(false)
    expect(hasPidCredential([transcriptRecord])).toBe(false)
    expect(hasPidCredential([transcriptRecord, thaiIdRecord])).toBe(true)
  })

  test('recognizes ThaiNationalID and idcard resolved offers as PID offers', () => {
    expect(isPidCredentialOffer({ credentialConfigurations: [{ id: 'ThaiNationalID' }] })).toBe(true)
    expect(isPidCredentialOffer({ credentialConfigurations: [{ id: 'idcard' }] })).toBe(true)
    expect(isPidCredentialOffer({ credentialConfigurations: [{ id: 'TranscriptCredential_dc+sd-jwt' }] })).toBe(false)
  })

  test('allows ThaiNationalID requests before PID and gates other requests until PID exists', () => {
    expect(canRequestCredentialType('ThaiNationalID', [])).toBe(true)
    expect(canRequestCredentialType('DLTDrivingLicence', [])).toBe(false)
    expect(canRequestCredentialType(undefined, [])).toBe(false)
    expect(canRequestCredentialType('DLTDrivingLicence', [thaiIdRecord])).toBe(true)
    expect(canRequestCredentialType(undefined, [thaiIdRecord])).toBe(true)
  })
})
