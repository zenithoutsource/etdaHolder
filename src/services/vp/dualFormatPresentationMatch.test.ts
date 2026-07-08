import { isDualFormatDcqlRequest, isSdJwtSideCompatibleWithDualFormatRequest, readRequestedDcqlFormats } from './dualFormatPresentationMatch'
import type { DcqlQuery } from './presentationService'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

test('detects dual-format DCQL requests', () => {
  const query: DcqlQuery = {
    credentials: [
      { id: 'cred-1', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
      { id: 'cred-2', format: 'mso_mdoc', meta: { type_values: ['org.iso.18013.5.1.mDL'] } },
    ],
  }

  expect(readRequestedDcqlFormats(query)).toEqual(['dc+sd-jwt', 'mso_mdoc'])
  expect(isDualFormatDcqlRequest(query)).toBe(true)
})

test('matches dual-format requests against the SD-JWT record only', () => {
  const query: DcqlQuery = {
    credentials: [
      { id: 'cred-1', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
      { id: 'cred-2', format: 'mso_mdoc' },
    ],
  }

  const record: VerifiableCredentialRecord = {
    id: 'credential-1',
    type: 'BangkokUniversityTranscript',
    rawVc: 'issuer.sd.jwt~disclosure~',
    claims: { vct: 'Transcript' },
    issuedAt: '2026-06-01T10:00:00.000Z',
  }

  expect(isSdJwtSideCompatibleWithDualFormatRequest(record, query)).toBe(true)
})
