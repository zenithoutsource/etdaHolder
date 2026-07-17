import type { VerifiableCredentialRecord } from '../vci/exchangeService'

import { resolvePidVpQrCredential } from './resolvePidVpQrCredential'

jest.mock('./credentialKeyRenewal', () => ({
  readCredentialRenewalStatuses: jest.fn(() => ({})),
}))

jest.mock('./credentialLifecycle', () => ({
  isCredentialPresentable: jest.fn(() => true),
}))

jest.mock('../vp/sdJwtCredential', () => ({
  isSdJwtCredential: (record: VerifiableCredentialRecord) => record.rawVc.includes('~'),
}))

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~disclosure~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'BangkokUniversityTranscript',
  rawVc: 'issuer.jwt~disclosure~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

describe('resolvePidVpQrCredential', () => {
  test('returns presentable ThaiNationalID SD-JWT credential', () => {
    expect(resolvePidVpQrCredential([transcriptRecord, thaiIdRecord])?.id).toBe('thai-1')
  })

  test('returns undefined when ThaiNationalID is not SD-JWT', () => {
    expect(
      resolvePidVpQrCredential([
        {
          ...thaiIdRecord,
          rawVc: 'compact.jwt.without.disclosures',
        },
      ]),
    ).toBeUndefined()
  })

  test('returns undefined when wallet has no ThaiNationalID', () => {
    expect(resolvePidVpQrCredential([transcriptRecord])).toBeUndefined()
  })
})
