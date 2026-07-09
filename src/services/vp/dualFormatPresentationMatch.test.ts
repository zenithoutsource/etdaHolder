import { isDualFormatDcqlRequest, isExactDualFormatPair, isSdJwtSideCompatibleWithDualFormatRequest, readRequestedDcqlFormats } from './dualFormatPresentationMatch'
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

test('isExactDualFormatPair is true for exactly two credentials with sd-jwt and mso_mdoc', () => {
  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-1', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
        { id: 'cred-2', format: 'mso_mdoc' },
      ],
    }),
  ).toBe(true)

  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-2', format: 'mso_mdoc' },
        { id: 'cred-1', format: 'vc+sd-jwt', meta: { vct_values: ['Transcript'] } },
      ],
    }),
  ).toBe(true)
})

test('isExactDualFormatPair is false for three credentials even when dual formats are present', () => {
  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-1', format: 'dc+sd-jwt' },
        { id: 'cred-2', format: 'mso_mdoc' },
        { id: 'cred-3', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
      ],
    }),
  ).toBe(false)
})

test('isExactDualFormatPair is false for duplicate sd-jwt formats', () => {
  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-1', format: 'dc+sd-jwt' },
        { id: 'cred-2', format: 'dc+sd-jwt' },
      ],
    }),
  ).toBe(false)
})
