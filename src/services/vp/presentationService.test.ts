import {
  buildPresentationSubmission,
  isDirectPostResponseEndpoint,
  isHolderPortalReturnUrl,
  isOid4VpAuthorizationRequest,
  isOpenId4VcApiEndpointUrl,
  readPresentationTokenMode,
  readPresentationTokenAudience,
  readVerifierReturnUrl,
  resolvePresentationRequest,
  submitPresentationResponse,
} from './presentationService'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encode(payload)}.`
}

function disclosure(
  entry: {
    key: string
    label: string
    value: string
    mandatory?: boolean
    selective?: boolean
  },
) {
  return {
    mandatory: false,
    selective: true,
    ...entry,
  }
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
    birthDate: '2001-05-15',
  },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'driving-licence-1',
  type: 'DLTDrivingLicence',
  rawVc: unsignedJwt({
    iss: 'https://issuer.example.com',
    vc: { type: ['VerifiableCredential', 'DrivingLicenceCredential'] },
  }),
  claims: {
    licence_number: 'DLT-123456',
    full_name: 'สมชาย ใจดี',
    birthdate: '2001-05-15',
    licence_class: 'Private Car',
    issue_date: '2026-01-01',
    expiry_date: '2031-01-01',
    photo: 'photo-uri',
  },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

const issuerTranscriptRecord: VerifiableCredentialRecord = {
  ...transcriptRecord,
  id: 'issuer-transcript-1',
  rawVc: `${unsignedJwt({
    iss: 'http://issuer.zenithcomp.co.th:455',
    vct: 'http://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential',
  })}~disclosure~`,
  claims: {
    ...transcriptRecord.claims,
    iss: 'http://issuer.zenithcomp.co.th:455',
    vct: 'http://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential',
  },
}

const presentationDefinition = {
  id: 'age-over-20',
  input_descriptors: [
    {
      id: 'thai-id-age',
      constraints: {
        fields: [{ path: ['$.birthDate', '$.birth_date', '$.dateOfBirth'] }],
      },
    },
  ],
}

const unsignedRequestJwt = unsignedJwt

function compactSdJwt(): string {
  return `${unsignedJwt({ iss: 'https://issuer.example.com', vct: 'IDCardCredential' })}~disclosure~`
}

function authorizationRequestUri(overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    client_id: 'did:web:verifier.example.com',
    response_uri: 'https://verifier.example.com/oid4vp/direct-post',
    response_mode: 'direct_post',
    nonce: 'nonce-123',
    state: 'state-123',
    presentation_definition: JSON.stringify(presentationDefinition),
    ...overrides,
  })

  return `openid4vp://authorize?${params.toString()}`
}

function verifierRequestUri(id = 'request-123'): string {
  return `openid4vp://authorize?client_id=redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/${id}&request_uri=http://verifier.zenithcomp.co.th:455/openid4vc/request/${id}`
}

function issuerPidRequestUri(): string {
  const params = new URLSearchParams({
    response_type: 'vp_token',
    client_id: 'decentralized_identifier:did:web:issuer.example.com',
    response_mode: 'direct_post',
    state: 'issuer-state-123',
    nonce: 'issuer-nonce-123',
    response_uri: 'https://issuer.example.com/oid4vp/direct-post',
    dcql_query: JSON.stringify({
      credentials: [
        {
          id: 'pid_credential',
          format: 'jwt_vc_json',
          meta: { type_values: ['IDCardCredential'] },
          claims: [{ path: ['birthDate'] }],
        },
      ],
    }),
  })

  return `openid4vp://authorize?${params.toString()}`
}

describe('presentationService', () => {
  const originalSdJwtKbFlag = process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING
  let infoSpy: jest.SpyInstance

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = originalSdJwtKbFlag
    infoSpy.mockRestore()
  })

  test('detects OID4VP authorization request QR payloads', () => {
    expect(isOid4VpAuthorizationRequest(authorizationRequestUri())).toBe(true)
    expect(isOid4VpAuthorizationRequest('openid-credential-offer://?credential_offer={}')).toBe(false)
  })

  test('resolves trusted Verifier request and matches ThaiNationalID birth date disclosure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00.000Z'))
    const request = await resolvePresentationRequest(authorizationRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    })

    expect(request.verifier.name).toBe('Entertainment Venue')
    expect(request.matchedCredential.id).toBe('thai-id-1')
    expect(request.disclosures).toEqual([disclosure({ key: 'age', label: 'อายุ', value: '25' })])
  })

  test('resolves presentation_definition_uri after trusting the verifier', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00.000Z'))
    const fetchMock = jest.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes('/pd/age-over-20.json')) {
        return new Response(JSON.stringify(presentationDefinition), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })

    const params = new URLSearchParams({
      client_id: 'did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      response_mode: 'direct_post',
      nonce: 'nonce-123',
      state: 'state-123',
      presentation_definition_uri: 'https://verifier.example.com/pd/age-over-20.json',
    })

    const request = await resolvePresentationRequest(`openid4vp://authorize?${params.toString()}`, [thaiIdRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    })

    expect(request.matchedCredential.id).toBe('thai-id-1')
    expect(request.disclosures).toEqual([disclosure({ key: 'age', label: 'อายุ', value: '25' })])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com/pd/age-over-20.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  test('rejects presentation_definition combined with dcql_query', async () => {
    const params = new URLSearchParams({
      client_id: 'did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      response_mode: 'direct_post',
      nonce: 'nonce-123',
      presentation_definition: JSON.stringify(presentationDefinition),
      dcql_query: JSON.stringify({
        credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      }),
    })

    await expect(
      resolvePresentationRequest(`openid4vp://authorize?${params.toString()}`, [thaiIdRecord], {
        trustedVerifiers: [
          {
            clientId: 'did:web:verifier.example.com',
            name: 'Entertainment Venue',
            allowedOrigins: ['https://verifier.example.com'],
          },
        ],
      }),
    ).rejects.toThrow('PresentationRequestInvalid: Presentation Exchange and dcql_query are mutually exclusive')
  })

  test('rejects presentation_definition_uri combined with dcql_query', async () => {
    const params = new URLSearchParams({
      client_id: 'did:web:verifier.example.com',
      response_uri: 'https://verifier.example.com/oid4vp/direct-post',
      response_mode: 'direct_post',
      nonce: 'nonce-123',
      presentation_definition_uri: 'https://verifier.example.com/pd/age-over-20.json',
      dcql_query: JSON.stringify({
        credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      }),
    })

    await expect(
      resolvePresentationRequest(`openid4vp://authorize?${params.toString()}`, [thaiIdRecord], {
        trustedVerifiers: [
          {
            clientId: 'did:web:verifier.example.com',
            name: 'Entertainment Venue',
            allowedOrigins: ['https://verifier.example.com'],
          },
        ],
      }),
    ).rejects.toThrow('PresentationRequestInvalid: Presentation Exchange and dcql_query are mutually exclusive')
  })

  test('resolves request_uri JWT using Verifier API redirect_uri client_id and DCQL', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'idcard_credential',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['IDCardCredential'] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123',
      expect.objectContaining({ headers: { Accept: 'application/json, application/oauth-authz-req+jwt' } }),
    )
    expect(request.verifier.name).toBe('Verifier API')
    expect(request.responseUri).toBe('http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123')
    expect(request.matchedCredential.id).toBe('thai-id-1')
    expect(request.disclosures).toEqual([
      disclosure({ key: 'credential', label: 'Credential', value: 'Thai National ID' }),
    ])
  })

  test('resolves DCQL credential_sets OR when wallet holds only the first alternative', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'thai_id',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['IDCardCredential'] },
                },
                {
                  id: 'driving_licence',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['DrivingLicenceCredential'] },
                },
              ],
              credential_sets: [{ options: [['thai_id'], ['driving_licence']] }],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.dcqlQuery?.credentials).toHaveLength(1)
    expect(request.dcqlQuery?.credentials[0]?.id).toBe('thai_id')
    expect(request.matchedCredential.id).toBe('thai-id-1')
  })

  test('rejects no-set DCQL request when explicit claims are missing on stored credential', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'idcard_credential',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['IDCardCredential'] },
                  claims: [{ path: ['religion'] }],
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    await expect(
      resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
        fetchImpl: fetchMock as unknown as typeof fetch,
        trustedVerifiers: [
          {
            clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
            name: 'Verifier API',
            allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
          },
        ],
      }),
    ).rejects.toThrow('PresentationCredentialMissing: requested credential is not available')
  })

  test('uses schema presentation labels for DCQL ThaiNationalID requested claim paths', async () => {
    const thaiIdWithVerifierClaims: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      claims: {
        id_number: '1234567890123',
        full_name: 'สมชาย ใจดี',
        birthdate: '2001-05-15',
        expiry_date: '2031-01-01',
        religion: 'Buddhist',
        photo: 'photo-uri',
      },
    }
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'idcard_credential',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['IDCardCredential'] },
                  claims: [
                    { path: ['id_number'] },
                    { path: ['full_name'] },
                    { path: ['birthdate'] },
                    { path: ['expiry_date'] },
                    { path: ['religion'] },
                    { path: ['photo'] },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdWithVerifierClaims], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.disclosures).toEqual([
      disclosure({ key: 'id_number', label: 'เลขบัตรประจำตัวประชาชน', value: '1234567890123' }),
      disclosure({ key: 'full_name', label: 'ชื่อ-นามสกุล', value: 'สมชาย ใจดี' }),
      disclosure({ key: 'birthdate', label: 'วันเดือนปีเกิด', value: '2001-05-15' }),
      disclosure({ key: 'expiry_date', label: 'วันหมดอายุ', value: '2031-01-01' }),
      disclosure({ key: 'religion', label: 'ศาสนา', value: 'Buddhist' }),
      disclosure({ key: 'photo', label: 'รูปถ่าย', value: 'photo-uri' }),
    ])
  })

  test('uses schema presentation labels for DCQL ChulalongkornUniversityTranscript requested claim paths', async () => {
    const transcriptWithVerifierClaims: VerifiableCredentialRecord = {
      ...transcriptRecord,
      claims: {
        student_id: '6512345678',
        full_name: 'สมชาย ใจดี',
        faculty: 'Engineering',
        gpa: '3.75',
        graduation_date: '2026-05-31',
        institution_name: 'Chulalongkorn University',
        degree: 'Bachelor of Engineering',
      },
    }
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                  claims: [
                    { path: ['student_id'] },
                    { path: ['full_name'] },
                    { path: ['faculty'] },
                    { path: ['gpa'] },
                    { path: ['graduation_date'] },
                    { path: ['institution_name'] },
                    { path: ['degree'] },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [transcriptWithVerifierClaims], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.disclosures).toEqual([
      disclosure({ key: 'student_id', label: 'รหัสนักศึกษา', value: '6512345678', mandatory: true, selective: false }),
      disclosure({ key: 'full_name', label: 'ชื่อ-นามสกุล', value: 'สมชาย ใจดี', mandatory: true, selective: false }),
      disclosure({ key: 'faculty', label: 'คณะ / สาขาวิชา', value: 'Engineering', mandatory: true, selective: false }),
      disclosure({ key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75' }),
      disclosure({ key: 'graduation_date', label: 'วันสำเร็จการศึกษา', value: '2026-05-31' }),
      disclosure({ key: 'institution_name', label: 'ชื่อสถาบัน', value: 'Chulalongkorn University', mandatory: true, selective: false }),
      disclosure({ key: 'degree', label: 'วุฒิการศึกษา', value: 'Bachelor of Engineering', mandatory: true, selective: false }),
    ])
  })

  test('uses schema presentation labels when DCQL requests student_id but claims store studentId', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                  claims: [{ path: ['student_id'] }],
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [transcriptRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.disclosures).toEqual([
      { key: 'studentId', label: 'รหัสนักศึกษา', value: '6512345678', mandatory: true, selective: false },
    ])
  })

  test('uses schema presentation labels for DCQL DLTDrivingLicence requested claim paths', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'driving_licence_credential',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['DrivingLicenceCredential'] },
                  claims: [
                    { path: ['licence_number'] },
                    { path: ['full_name'] },
                    { path: ['birthdate'] },
                    { path: ['licence_class'] },
                    { path: ['issue_date'] },
                    { path: ['expiry_date'] },
                    { path: ['photo'] },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [drivingLicenceRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.matchedCredential.id).toBe('driving-licence-1')
    expect(request.disclosures).toEqual([
      { key: 'licence_number', label: 'เลขที่ใบอนุญาตขับรถ', value: 'DLT-123456' },
      { key: 'full_name', label: 'ชื่อ-นามสกุล', value: 'สมชาย ใจดี' },
      { key: 'birthdate', label: 'วันเดือนปีเกิด', value: '2001-05-15' },
      { key: 'licence_class', label: 'ประเภทใบอนุญาต', value: 'Private Car' },
      { key: 'issue_date', label: 'วันที่ออกใบอนุญาต', value: '2026-01-01' },
      { key: 'expiry_date', label: 'วันหมดอายุ', value: '2031-01-01' },
      { key: 'photo', label: 'รูปถ่าย', value: 'photo-uri' },
    ])
  })

  test('rejects DCQL requests when the stored credential format does not match', async () => {
    const sdJwtThaiIdRecord = { ...thaiIdRecord, rawVc: compactSdJwt() }
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'idcard_credential',
                  format: 'jwt_vc_json',
                  meta: { type_values: ['IDCardCredential'] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    await expect(
      resolvePresentationRequest(verifierRequestUri(), [sdJwtThaiIdRecord], {
        fetchImpl: fetchMock as unknown as typeof fetch,
        trustedVerifiers: [
          {
            clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
            name: 'Verifier API',
            allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
          },
        ],
      }),
    ).rejects.toThrow('PresentationCredentialFormatUnsupported')
  })

  test('resolves DCQL dc+sd-jwt requests with vct_values for stored SD-JWT ThaiNationalID', async () => {
    const sdJwtThaiIdRecord = { ...thaiIdRecord, rawVc: compactSdJwt() }
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'idcard_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['IDCardCredential'] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [sdJwtThaiIdRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.matchedCredential.rawVc).toBe(sdJwtThaiIdRecord.rawVc)
    expect(request.dcqlQuery?.credentials[0]).toMatchObject({
      id: 'idcard_credential',
      format: 'dc+sd-jwt',
      meta: { vct_values: ['IDCardCredential'] },
    })
  })

  test('resolves DCQL dc+sd-jwt Transcript request with vct_values', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord, transcriptRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(request.matchedCredential.id).toBe('transcript-1')
    expect(request.disclosures).toEqual([
      disclosure({ key: 'credential', label: 'Credential', value: 'Academic Transcript' }),
    ])
    expect(infoSpy).toHaveBeenCalledWith(
      '[wallet:oid4vp] resolved-request-debug',
      expect.objectContaining({
        selectionSource: 'credential-fallback: dcql claims omitted',
        dcql_query: expect.objectContaining({
          credentials: expect.arrayContaining([
            expect.objectContaining({
              id: 'transcript_credential',
              format: 'dc+sd-jwt',
              meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
            }),
          ]),
        }),
      }),
    )
  })

  test('rejects DCQL SD-JWT requests when stored credential vct does not match requested vct_values', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    )

    await expect(
      resolvePresentationRequest(verifierRequestUri(), [issuerTranscriptRecord], {
        fetchImpl: fetchMock as unknown as typeof fetch,
        trustedVerifiers: [
          {
            clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
            name: 'Verifier API',
            allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
          },
        ],
      }),
    ).rejects.toThrow(
      'PresentationCredentialMetadataMismatch: requested vct_values [http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential]; stored vct [http://issuer.zenithcomp.co.th:455/credentials/TranscriptCredential]',
    )
  })

  test('uses raw credential presentation tokens for DCQL SD-JWT requests', async () => {
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord, transcriptRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    require_cryptographic_holder_binding: false,
                    meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(readPresentationTokenMode(request)).toBe('raw-credential')
  })

  test('uses SD-JWT+KB presentation tokens for DCQL SD-JWT requests by default', async () => {
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord, transcriptRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(readPresentationTokenMode(request)).toBe('sd-jwt-kb')
  })

  test('uses raw credential presentation tokens for omitted holder binding only when the development bypass is enabled', async () => {
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = 'true'
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord, transcriptRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    meta: { vct_values: ['http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(readPresentationTokenMode(request, true)).toBe('raw-credential')
    expect(readPresentationTokenMode(request, false)).toBe('sd-jwt-kb')
  })

  test('uses signed JWT VP tokens for Presentation Exchange requests', async () => {
    const request = await resolvePresentationRequest(authorizationRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    })

    expect(readPresentationTokenMode(request)).toBe('signed-vp-jwt')
  })

  test('rejects untrusted Verifier requests', async () => {
    await expect(
      resolvePresentationRequest(authorizationRequestUri(), [thaiIdRecord], { trustedVerifiers: [] }),
    ).rejects.toThrow('VerifierUntrusted')
  })

  test('rejects unsupported requested claim sets', async () => {
    await expect(
      resolvePresentationRequest(
        authorizationRequestUri({
          presentation_definition: JSON.stringify({
            id: 'full-id',
            input_descriptors: [{ id: 'name', constraints: { fields: [{ path: ['$.givenName'] }] } }],
          }),
        }),
        [thaiIdRecord],
        {
          trustedVerifiers: [
            {
              clientId: 'did:web:verifier.example.com',
              name: 'Entertainment Venue',
              allowedOrigins: ['https://verifier.example.com'],
            },
          ],
        },
      ),
    ).rejects.toThrow('PresentationRequestUnsupported')
  })

  test('builds a Presentation Exchange submission for the matched credential', async () => {
    const request = await resolvePresentationRequest(authorizationRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    })

    expect(buildPresentationSubmission(request)).toEqual({
      id: expect.any(String),
      definition_id: 'age-over-20',
      descriptor_map: [
        {
          id: 'thai-id-age',
          format: 'jwt_vc',
          path: '$.vp.verifiableCredential[0]',
        },
      ],
    })
  })

  test('submits vp_token and presentation_submission to direct_post response_uri', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(JSON.stringify({ status: 'verified', message: 'Verification succeeded' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const request = await resolvePresentationRequest(authorizationRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    })

    const result = await submitPresentationResponse(request, {
      vpToken: 'vp.jwt',
      presentationSubmission: buildPresentationSubmission(request),
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com/oid4vp/direct-post',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual({ status: 'verified', message: 'Verification succeeded' })
  })

  test('resolves issuer OID4VP PID DCQL request and posts VP body to issuer response_uri', async () => {
    const submitFetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({ status: 'accepted' }), { status: 200 }),
    )
    const request = await resolvePresentationRequest(issuerPidRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'decentralized_identifier:did:web:issuer.example.com',
          name: 'PID Issuer',
          allowedOrigins: ['https://issuer.example.com'],
        },
      ],
    })

    expect(request.verifier.name).toBe('PID Issuer')
    expect(request.matchedCredential.id).toBe('thai-id-1')
    expect(request.disclosures).toEqual([
      expect.objectContaining({ key: 'birthDate', value: '2001-05-15' }),
    ])

    const result = await submitPresentationResponse(request, {
      vpToken: 'issuer.vp.jwt',
      fetchImpl: submitFetchMock as unknown as typeof fetch,
    })

    expect(submitFetchMock).toHaveBeenCalledWith(
      'https://issuer.example.com/oid4vp/direct-post',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = submitFetchMock.mock.calls[0]
    const body = new URLSearchParams(String(init?.body))
    expect(JSON.parse(body.get('vp_token') ?? '')).toEqual({ pid_credential: ['issuer.vp.jwt'] })
    expect(body.get('state')).toBe('issuer-state-123')
    expect(result).toEqual({ status: 'accepted' })
  })

  test('submits DCQL vp_token as a query-id response object', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({ status: 'verified' }), { status: 200 }),
    )
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    await submitPresentationResponse(request, {
      vpToken: 'vp.jwt',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = new URLSearchParams(String(init?.body))
    expect(JSON.parse(body.get('vp_token') ?? '')).toEqual({ idcard_credential: ['vp.jwt'] })
    expect(body.get('state')).toBe('request-123')
  })

  test('can submit DCQL vp_token as a query-id string for verifier compatibility testing', async () => {
    const originalShape = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = 'object_string'
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({ status: 'verified' }), { status: 200 }),
    )
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    try {
      await submitPresentationResponse(request, {
        vpToken: 'vp.jwt',
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
    } finally {
      process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = originalShape
    }

    const [, init] = fetchMock.mock.calls[0]
    const body = new URLSearchParams(String(init?.body))
    expect(JSON.parse(body.get('vp_token') ?? '')).toEqual({ idcard_credential: 'vp.jwt' })
  })

  test('can submit DCQL vp_token as a raw token for verifier compatibility testing', async () => {
    const originalShape = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = 'raw'
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({ status: 'verified' }), { status: 200 }),
    )
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    try {
      await submitPresentationResponse(request, {
        vpToken: 'vp.jwt',
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
    } finally {
      process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = originalShape
    }

    const [, init] = fetchMock.mock.calls[0]
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('vp_token')).toBe('vp.jwt')
  })

  test('selects client_id as the default presentation token audience', async () => {
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    expect(readPresentationTokenAudience(request)).toBe(request.clientId)
  })

  test('can select response_uri as the presentation token audience for verifier compatibility testing', async () => {
    const originalAudience = process.env.EXPO_PUBLIC_VERIFIER_KB_AUD
    process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = 'response_uri'
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    try {
      expect(readPresentationTokenAudience(request)).toBe(request.responseUri)
    } finally {
      process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = originalAudience
    }
  })

  test('does not surface redirectUri when verifier POST body returns an API endpoint redirect', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            status: 'verified',
            redirect_uri: 'https://verifier.zenithcomp.co.th:455/',
          }),
          { status: 200 },
        ),
    )
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    const result = await submitPresentationResponse(request, {
      vpToken: 'vp.jwt',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result.redirectUri).toBeUndefined()
    expect(result.status).toBe('verified')
  })

  test('does not surface redirectUri for Verifier API direct_post even when body returns a portal path', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            status: 'verified',
            redirect_uri: 'https://verifier.zenithcomp.co.th:455/portal/callback?session=1',
          }),
          { status: 200 },
        ),
    )
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      ],
    })

    const result = await submitPresentationResponse(request, {
      vpToken: 'vp.jwt',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(result.redirectUri).toBeUndefined()
  })

  test('surfaces Verifier error descriptions from direct_post failures', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_request', error_description: 'Present VP is invalid' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const request = await resolvePresentationRequest(authorizationRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    })

    await expect(
      submitPresentationResponse(request, { vpToken: 'vp.jwt', fetchImpl: fetchMock as unknown as typeof fetch }),
    ).rejects.toThrow('PresentationSubmissionFailed: HTTP 400: invalid_request - Present VP is invalid')
  })
})

describe('readVerifierReturnUrl', () => {
  const verifier = {
    clientId: 'redirect_uri:https://verifier.example.com/cb',
    name: 'Verifier',
    allowedOrigins: ['https://verifier.example.com'],
  }

  test('returns redirect_uri from verifier response body when allowlisted', () => {
    const url = readVerifierReturnUrl(
      { redirect_uri: 'https://verifier.example.com/done?session=1' },
      {
        clientId: verifier.clientId,
        state: 'state-1',
        responseUri: 'https://verifier.example.com/oid4vp/direct-post',
        verifier,
      },
    )

    expect(url).toBe('https://verifier.example.com/done?session=1')
  })

  test('falls back to redirect_uri client_id with state when it is a portal callback', () => {
    const url = readVerifierReturnUrl(
      {},
      {
        clientId: 'redirect_uri:https://verifier.example.com/portal/callback',
        state: 'state-1',
        responseUri: 'https://verifier.example.com/oid4vp/direct-post',
        verifier,
      },
    )

    expect(url).toBe('https://verifier.example.com/portal/callback?state=state-1')
  })

  test('does not open redirect_uri client_id when it matches the direct_post response_uri', () => {
    const url = readVerifierReturnUrl(
      {},
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        state: 'state-1',
        responseUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        verifier: {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      },
    )

    expect(url).toBeUndefined()
  })

  test('does not return verifier POST redirect_uri when it matches response_uri under http/https mismatch', () => {
    const url = readVerifierReturnUrl(
      {
        redirect_uri: 'https://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      },
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        state: 'state-1',
        responseUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        verifier: {
          clientId: 'redirect_uri:https://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['https://verifier.zenithcomp.co.th:455'],
        },
      },
    )

    expect(url).toBeUndefined()
  })

  test('does not return verifier POST redirect_uri when it points at the verifier site root', () => {
    const url = readVerifierReturnUrl(
      {
        redirect_uri: 'https://verifier.zenithcomp.co.th:455/',
      },
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        state: 'state-1',
        responseUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        verifier: {
          clientId: 'redirect_uri:https://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['https://verifier.zenithcomp.co.th:455'],
        },
      },
    )

    expect(url).toBeUndefined()
  })

  test('does not return redirect_uri client_id when it is an openid4vc verify API path', () => {
    const url = readVerifierReturnUrl(
      {},
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
        state: 'state-1',
        responseUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        verifier: {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      },
    )

    expect(url).toBeUndefined()
  })

  test('does not return verifier POST redirect_uri when it points at another openid4vc request endpoint', () => {
    const url = readVerifierReturnUrl(
      {
        redirect_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123',
      },
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        state: 'state-1',
        responseUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        verifier: {
          clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
        },
      },
    )

    expect(url).toBeUndefined()
  })

  test('does not return portal callback redirect for Verifier API direct_post flows', () => {
    const url = readVerifierReturnUrl(
      {
        redirect_uri: 'https://verifier.zenithcomp.co.th:455/portal/callback?session=1',
      },
      {
        clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        state: 'state-1',
        responseUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        verifier: {
          clientId: 'redirect_uri:https://verifier.zenithcomp.co.th:455/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['https://verifier.zenithcomp.co.th:455'],
        },
      },
    )

    expect(url).toBeUndefined()
  })
})

describe('verifier return URL helpers', () => {
  test('isDirectPostResponseEndpoint treats http and https as equivalent', () => {
    expect(
      isDirectPostResponseEndpoint(
        'https://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
        'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      ),
    ).toBe(true)
  })

  test('isOpenId4VcApiEndpointUrl detects verify and request routes', () => {
    expect(isOpenId4VcApiEndpointUrl('http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123')).toBe(true)
    expect(isOpenId4VcApiEndpointUrl('http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123')).toBe(true)
    expect(isOpenId4VcApiEndpointUrl('https://verifier.zenithcomp.co.th:455/portal/callback')).toBe(false)
  })

  test('isHolderPortalReturnUrl rejects API endpoints and verifier root for verify direct_post flows', () => {
    const responseUri = 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123'
    expect(isHolderPortalReturnUrl('https://verifier.zenithcomp.co.th:455/', responseUri)).toBe(false)
    expect(isHolderPortalReturnUrl('https://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123', responseUri)).toBe(
      false,
    )
    expect(isHolderPortalReturnUrl('https://verifier.zenithcomp.co.th:455/portal/callback', responseUri)).toBe(true)
  })
})

describe('presentationService MSW harness', () => {
  test('MSW verifier handler accepts issuer direct_post (node smoke)', () => {
    const smokeScript = path.join(__dirname, '../../__tests__/setup/mswHarnessSmoke.cjs')
    const output = execFileSync(process.execPath, [smokeScript], { encoding: 'utf8' })
    expect(output.trim()).toBe('accepted')
  })

  test('submits issuer PID VP through issuer direct_post contract', async () => {
    const request = await resolvePresentationRequest(issuerPidRequestUri(), [thaiIdRecord], {
      trustedVerifiers: [
        {
          clientId: 'decentralized_identifier:did:web:issuer.example.com',
          name: 'PID Issuer',
          allowedOrigins: ['https://issuer.example.com'],
        },
      ],
    })

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === 'https://issuer.example.com/oid4vp/direct-post' && init?.method?.toUpperCase() === 'POST') {
        const body = String(init.body ?? '')
        if (!body.includes('vp_token')) {
          return new Response(JSON.stringify({ error: 'invalid_request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ status: 'accepted' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`Unhandled fetch in MSW harness integration test: ${url}`)
    }

    const result = await submitPresentationResponse(request, {
      vpToken: 'issuer.vp.jwt',
      fetchImpl,
    })

    expect(request.verifier.name).toBe('PID Issuer')
    expect(request.matchedCredential.id).toBe('thai-id-1')
    expect(result).toEqual({ status: 'accepted' })
  })
})
