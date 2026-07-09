import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  assertNoSetDcqlCardinality,
  assertSupportedDcqlCredentialQuery,
  assertSupportedDcqlRequest,
  canWalletSatisfyDcqlCredentialQuery,
} from './dcqlCredentialMatch'
import type { DcqlCredentialQuery, DcqlQuery } from './presentationService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-id-1',
  type: 'ThaiNationalID',
  rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6eyJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRDYXJkQ3JlZGVudGlhbCJdfX0.signature',
  claims: { id_number: '1234567890123', birthdate: '2001-05-15' },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

describe('assertSupportedDcqlCredentialQuery', () => {
  test('rejects omitted format', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      meta: { type_values: ['IDCardCredential'] },
    }

    expect(() => assertSupportedDcqlCredentialQuery(credential)).toThrow(
      'PresentationRequestInvalid: dcql credential format is required',
    )
  })

  test('rejects nested claim paths', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [{ path: ['address', 'street_address'] }],
    }

    expect(() => assertSupportedDcqlCredentialQuery(credential)).toThrow(
      'PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1',
    )
  })

  test('accepts supported jwt_vc_json type_values credential', () => {
    expect(() =>
      assertSupportedDcqlCredentialQuery({
        id: 'thai_id',
        format: 'jwt_vc_json',
        meta: { type_values: ['IDCardCredential'] },
      }),
    ).not.toThrow()
  })
})

describe('assertSupportedDcqlRequest', () => {
  test('no-ops for exact dual-format pair with meta-less mso_mdoc', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'transcript_sd_jwt', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
        { id: 'transcript_mdoc', format: 'mso_mdoc' },
      ],
    }

    expect(() => assertSupportedDcqlRequest(query)).not.toThrow()
  })

  test('rejects unsupported type on non-dual-format query', () => {
    const query: DcqlQuery = {
      credentials: [
        {
          id: 'unknown',
          format: 'jwt_vc_json',
          meta: { type_values: ['VerifierSpecificCredential'] },
        },
      ],
    }

    expect(() => assertSupportedDcqlRequest(query)).toThrow(
      'PresentationRequestUnsupported: requested DCQL credential type is not supported',
    )
  })
})

describe('assertNoSetDcqlCardinality', () => {
  test('rejects two single-format credentials without credential_sets', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        { id: 'driving_licence', format: 'jwt_vc_json', meta: { type_values: ['DrivingLicenceCredential'] } },
      ],
    }

    expect(() => assertNoSetDcqlCardinality(query)).toThrow(
      'PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1',
    )
  })

  test('no-ops for exact dual-format pair', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'transcript_sd_jwt', format: 'dc+sd-jwt' },
        { id: 'transcript_mdoc', format: 'mso_mdoc' },
      ],
    }

    expect(() => assertNoSetDcqlCardinality(query)).not.toThrow()
  })

  test('rejects three credentials even when dual formats are present', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'transcript_sd_jwt', format: 'dc+sd-jwt' },
        { id: 'transcript_mdoc', format: 'mso_mdoc' },
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
      ],
    }

    expect(() => assertNoSetDcqlCardinality(query)).toThrow(
      'PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1',
    )
  })
})

describe('canWalletSatisfyDcqlCredentialQuery', () => {
  test('returns false when requested DCQL claim is missing on stored credential', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [{ path: ['religion'] }],
    }

    expect(canWalletSatisfyDcqlCredentialQuery(thaiIdRecord, credential)).toBe(false)
  })

  test('returns true when claims omitted and type/format match', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
    }

    expect(canWalletSatisfyDcqlCredentialQuery(thaiIdRecord, credential)).toBe(true)
  })
})
