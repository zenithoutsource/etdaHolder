import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { resolveDcqlCredentialSelection } from './dcqlCredentialSetResolver'
import type { DcqlQuery } from './presentationService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-id-1',
  type: 'ThaiNationalID',
  rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6eyJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRDYXJkQ3JlZGVudGlhbCJdfX0.signature',
  claims: { id_number: '1234567890123' },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

describe('resolveDcqlCredentialSelection', () => {
  test('picks first satisfiable OR option and filters credentials', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        { id: 'driving_licence', format: 'jwt_vc_json', meta: { type_values: ['DrivingLicenceCredential'] } },
      ],
      credentialSets: [{ options: [['thai_id'], ['driving_licence']] }],
    }

    const effective = resolveDcqlCredentialSelection(query, [thaiIdRecord])

    expect(effective.credentials).toHaveLength(1)
    expect(effective.credentials[0]?.id).toBe('thai_id')
    expect(effective.credentialSets).toBeUndefined()
  })

  test('falls through to second option when first is missing from wallet', () => {
    const drivingRecord: VerifiableCredentialRecord = {
      id: 'driving-1',
      type: 'DLTDrivingLicence',
      rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6eyJ0eXBlIjpbIkRyaXZpbmdMaWNlbmNlQ3JlZGVudGlhbCJdfX0.signature',
      claims: { licence_number: 'DL-123' },
      issuedAt: '2026-06-01T10:00:00.000Z',
    }

    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        { id: 'driving_licence', format: 'jwt_vc_json', meta: { type_values: ['DrivingLicenceCredential'] } },
      ],
      credentialSets: [{ options: [['thai_id'], ['driving_licence']] }],
    }

    const effective = resolveDcqlCredentialSelection(query, [drivingRecord])

    expect(effective.credentials[0]?.id).toBe('driving_licence')
  })

  test('rejects unknown credential id before support pre-pass', () => {
    const query: DcqlQuery = {
      credentials: [{ id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      credentialSets: [{ options: [['missing_id']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [thaiIdRecord])).toThrow(
      'PresentationRequestInvalid: credential_sets option references unknown credential id',
    )
  })

  test('rejects required:false sets', () => {
    const query: DcqlQuery = {
      credentials: [{ id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      credentialSets: [{ required: false, options: [['thai_id']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [thaiIdRecord])).toThrow(
      'PresentationRequestUnsupported: optional credential_sets are not supported in v1',
    )
  })

  test('returns PresentationCredentialMissing when supported but no wallet record satisfies', () => {
    const query: DcqlQuery = {
      credentials: [{ id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      credentialSets: [{ options: [['thai_id']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [])).toThrow(
      'PresentationCredentialMissing: no credential satisfies the required credential set',
    )
  })

  test('succeeds via supported alternative when another option is unsupported', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        {
          id: 'unsupported',
          format: 'jwt_vc_json',
          meta: { type_values: ['VerifierSpecificCredential'] },
        },
      ],
      credentialSets: [{ options: [['unsupported'], ['thai_id']] }],
    }

    const effective = resolveDcqlCredentialSelection(query, [thaiIdRecord])

    expect(effective.credentials[0]?.id).toBe('thai_id')
  })

  test('throws unsupported when all options reference unsupported types', () => {
    const query: DcqlQuery = {
      credentials: [
        {
          id: 'unsupported_a',
          format: 'jwt_vc_json',
          meta: { type_values: ['VerifierSpecificCredentialA'] },
        },
        {
          id: 'unsupported_b',
          format: 'jwt_vc_json',
          meta: { type_values: ['VerifierSpecificCredentialB'] },
        },
      ],
      credentialSets: [{ options: [['unsupported_a'], ['unsupported_b']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [thaiIdRecord])).toThrow(
      'PresentationRequestUnsupported: requested DCQL credential type is not supported',
    )
  })
})
