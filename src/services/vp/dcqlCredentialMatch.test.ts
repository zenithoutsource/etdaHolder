import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  assertNoSetDcqlCardinality,
  assertSupportedDcqlCredentialQuery,
  assertSupportedDcqlRequest,
  canWalletSatisfyDcqlCredentialQuery,
  describeDcqlMatchFailure,
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

  test('satisfies claim_sets when one option group is fully available even if another needs a missing claim', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [
        { id: 'id_number', path: ['id_number'] },
        { id: 'photo', path: ['photo'] },
      ],
      claimSets: [['id_number', 'photo'], ['id_number']],
    }

    expect(canWalletSatisfyDcqlCredentialQuery(thaiIdRecord, credential)).toBe(true)
  })

  test('fails claim_sets when every option group needs a missing claim', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [{ id: 'photo', path: ['photo'] }],
      claimSets: [['photo']],
    }

    expect(canWalletSatisfyDcqlCredentialQuery(thaiIdRecord, credential)).toBe(false)
  })
})

describe('describeDcqlMatchFailure', () => {
  test('reports type gate for unrecognized type_values', () => {
    const failure = describeDcqlMatchFailure(thaiIdRecord, {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['VerifierSpecificCredential'] },
    })

    expect(failure.failedGate).toBe('type')
    expect(failure.recordType).toBe('ThaiNationalID')
  })

  test('reports vct gate when requested vct_values do not contain the stored vct', () => {
    const sdJwtRecord: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2Y3QiOiJ1cm46ZXhhbXBsZTppZGNhcmQifQ.signature~ZGlzY2xvc3VyZQ',
      claims: { vct: 'urn:example:idcard' },
    }

    const failure = describeDcqlMatchFailure(sdJwtRecord, {
      id: 'thai_id',
      format: 'dc+sd-jwt',
      meta: { vct_values: ['urn:other:idcard'] },
    })

    expect(failure.failedGate).toBe('vct')
    expect(failure.recordVct).toBe('urn:example:idcard')
    expect(failure.requestedVctValues).toEqual(['urn:other:idcard'])
  })

  test('reports format gate for sd-jwt record against jwt_vc_json request', () => {
    const sdJwtRecord: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2Y3QiOiJ1cm46ZXhhbXBsZTppZGNhcmQifQ.signature~ZGlzY2xvc3VyZQ',
    }

    const failure = describeDcqlMatchFailure(sdJwtRecord, {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
    })

    expect(failure.failedGate).toBe('format')
    expect(failure.recordFormat).toBe('sd-jwt')
  })

  test('reports none when the credential satisfies the query', () => {
    const failure = describeDcqlMatchFailure(thaiIdRecord, {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
    })

    expect(failure.failedGate).toBe('none')
  })
})
