import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  satisfiesDcqlCandidateTypes,
  satisfiesDcqlFormats,
  satisfiesDcqlMetadata,
  satisfiesFullDcqlRequest,
} from './presentationCredentialMatch'
import type { DcqlQuery } from './presentationService'

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encode(payload)}.`
}

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-id-1',
  type: 'ThaiNationalID',
  rawVc: unsignedJwt({
    iss: 'https://issuer.example.com',
    vc: { type: ['VerifiableCredential', 'IDCardCredential'] },
  }),
  claims: {
    birthDate: '2001-05-15',
    givenName: 'Mali',
    familyName: 'Somsri',
  },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'ChulalongkornUniversityTranscript',
  rawVc: `${unsignedJwt({
    iss: 'https://issuer.example.com',
    vct: 'http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential',
  })}~disclosure~`,
  claims: {
    studentId: '6512345678',
    degree: 'Computer Science',
  },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

const jwtVcDcqlQuery: DcqlQuery = {
  credentials: [
    {
      id: 'pid_credential',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [{ path: ['birthDate'] }],
    },
  ],
}

const transcriptDcqlQuery: DcqlQuery = {
  credentials: [
    {
      id: 'transcript_credential',
      format: 'dc+sd-jwt',
      meta: {
        vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'],
      },
      claims: [{ path: ['studentId'] }],
    },
  ],
}

describe('presentationCredentialMatch', () => {
  test('satisfiesFullDcqlRequest matches jwt_vc credentials with required claims', () => {
    expect(satisfiesFullDcqlRequest(thaiIdRecord, jwtVcDcqlQuery)).toBe(true)
    expect(
      satisfiesFullDcqlRequest(
        { ...thaiIdRecord, claims: { givenName: 'Mali' } },
        jwtVcDcqlQuery,
      ),
    ).toBe(false)
  })

  test('satisfiesDcqlCandidateTypes rejects credentials outside mapped types', () => {
    expect(satisfiesDcqlCandidateTypes(thaiIdRecord, jwtVcDcqlQuery)).toBe(true)
    expect(satisfiesDcqlCandidateTypes(transcriptRecord, jwtVcDcqlQuery)).toBe(false)
  })

  test('satisfiesDcqlFormats checks stored credential format', () => {
    expect(satisfiesDcqlFormats(thaiIdRecord, jwtVcDcqlQuery)).toBe(true)
    expect(satisfiesDcqlFormats(transcriptRecord, jwtVcDcqlQuery)).toBe(false)
  })

  test('satisfiesDcqlMetadata checks vct metadata compatibility', () => {
    expect(satisfiesDcqlMetadata(transcriptRecord, transcriptDcqlQuery)).toBe(true)
    expect(
      satisfiesDcqlMetadata(
        {
          ...transcriptRecord,
          rawVc: `${unsignedJwt({
            iss: 'https://issuer.example.com',
            vct: 'http://issuer.example.com/credentials/OtherCredential',
          })}~disclosure~`,
        },
        transcriptDcqlQuery,
      ),
    ).toBe(false)
  })
})
