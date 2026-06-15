import {
  buildPresentationSubmission,
  isOid4VpAuthorizationRequest,
  readPresentationTokenMode,
  readPresentationTokenAudience,
  resolvePresentationRequest,
  submitPresentationResponse,
} from './presentationService'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

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
  type: 'BangkokUniversityTranscript',
  rawVc: `${unsignedJwt({
    iss: 'https://issuer.example.com',
    vct: 'http://192.100.10.48/credentials/TranscriptCredential',
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
    iss: 'http://192.100.10.46',
    vct: 'http://192.100.10.46/credentials/TranscriptCredential',
  })}~disclosure~`,
  claims: {
    ...transcriptRecord.claims,
    iss: 'http://192.100.10.46',
    vct: 'http://192.100.10.46/credentials/TranscriptCredential',
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
  return `openid4vp://authorize?client_id=redirect_uri:http://192.100.10.48/openid4vc/verify/${id}&request_uri=http://192.100.10.48/openid4vc/request/${id}`
}

describe('presentationService', () => {
  const originalSdJwtKbFlag = process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING
  const originalSoftwareEddsaFlag = process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING
  let infoSpy: jest.SpyInstance

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    process.env.EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING = originalSdJwtKbFlag
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = originalSoftwareEddsaFlag
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
    expect(request.disclosures).toEqual([{ key: 'age', label: 'อายุ', value: '25' }])
  })

  test('resolves request_uri JWT using Verifier API redirect_uri client_id and DCQL', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
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
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.100.10.48/openid4vc/request/request-123',
      expect.objectContaining({ headers: { Accept: 'application/json, application/oauth-authz-req+jwt' } }),
    )
    expect(request.verifier.name).toBe('Verifier API')
    expect(request.responseUri).toBe('http://192.100.10.48/openid4vc/verify/request-123')
    expect(request.matchedCredential.id).toBe('thai-id-1')
    expect(request.disclosures).toEqual([{ key: 'credential', label: 'Credential', value: 'Thai National ID' }])
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
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
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
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    expect(request.disclosures).toEqual([
      { key: 'id_number', label: 'เลขบัตรประจำตัวประชาชน', value: '1234567890123' },
      { key: 'full_name', label: 'ชื่อ-นามสกุล', value: 'สมชาย ใจดี' },
      { key: 'birthdate', label: 'วันเดือนปีเกิด', value: '2001-05-15' },
      { key: 'expiry_date', label: 'วันหมดอายุ', value: '2031-01-01' },
      { key: 'religion', label: 'ศาสนา', value: 'Buddhist' },
      { key: 'photo', label: 'รูปถ่าย', value: 'photo-uri' },
    ])
  })

  test('uses schema presentation labels for DCQL BangkokUniversityTranscript requested claim paths', async () => {
    const transcriptWithVerifierClaims: VerifiableCredentialRecord = {
      ...transcriptRecord,
      claims: {
        student_id: '6512345678',
        full_name: 'สมชาย ใจดี',
        faculty: 'Engineering',
        gpa: '3.75',
        graduation_date: '2026-05-31',
        institution_name: 'Bangkok University',
        degree: 'Bachelor of Engineering',
      },
    }
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
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
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    expect(request.disclosures).toEqual([
      { key: 'student_id', label: 'รหัสนักศึกษา', value: '6512345678' },
      { key: 'full_name', label: 'ชื่อ-นามสกุล', value: 'สมชาย ใจดี' },
      { key: 'faculty', label: 'คณะ / สาขาวิชา', value: 'Engineering' },
      { key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75' },
      { key: 'graduation_date', label: 'วันสำเร็จการศึกษา', value: '2026-05-31' },
      { key: 'institution_name', label: 'ชื่อสถาบัน', value: 'Bangkok University' },
      { key: 'degree', label: 'วุฒิการศึกษา', value: 'Bachelor of Engineering' },
    ])
  })

  test('uses schema presentation labels for DCQL DLTDrivingLicence requested claim paths', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
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
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
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
            clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
            name: 'Verifier API',
            allowedOrigins: ['http://192.100.10.48'],
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
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
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
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
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
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    expect(request.matchedCredential.id).toBe('transcript-1')
    expect(request.disclosures).toEqual([{ key: 'credential', label: 'Credential', value: 'Academic Transcript' }])
    expect(infoSpy).toHaveBeenCalledWith(
      '[OID4VP] Resolved Verifier request',
      expect.stringContaining('"disclosureSource": "credential-fallback: dcql claims omitted"'),
    )
    const loggedPayload = infoSpy.mock.calls.find(([label]) => label === '[OID4VP] Resolved Verifier request')?.[1]
    expect(typeof loggedPayload).toBe('string')
    expect(loggedPayload).toContain('"dcql_query": {')
    expect(loggedPayload).toContain('"credentials": [')
    expect(loggedPayload).toContain('"id": "transcript_credential"')
    expect(loggedPayload).toContain('"format": "dc+sd-jwt"')
    expect(loggedPayload).toContain('"http://192.100.10.48/credentials/TranscriptCredential"')
    expect(loggedPayload).not.toContain('[Object]')
    expect(loggedPayload).not.toContain('[Array]')
  })

  test('rejects DCQL SD-JWT requests when stored credential vct does not match requested vct_values', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          unsignedRequestJwt({
            response_type: 'vp_token',
            client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
            response_mode: 'direct_post',
            state: 'request-123',
            nonce: 'request-123',
            response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
            dcql_query: {
              credentials: [
                {
                  id: 'transcript_credential',
                  format: 'dc+sd-jwt',
                  meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
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
            clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
            name: 'Verifier API',
            allowedOrigins: ['http://192.100.10.48'],
          },
        ],
      }),
    ).rejects.toThrow(
      'PresentationCredentialMetadataMismatch: requested vct_values [http://192.100.10.48/credentials/TranscriptCredential]; stored vct [http://192.100.10.46/credentials/TranscriptCredential]',
    )
  })

  test('uses raw credential presentation tokens for DCQL SD-JWT requests', async () => {
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord, transcriptRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    require_cryptographic_holder_binding: false,
                    meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    expect(readPresentationTokenMode(request, true)).toBe('raw-credential')
    expect(readPresentationTokenMode(request, false)).toBe('sd-jwt-kb')
  })

  test('uses software Ed25519 KB tokens for DCQL SD-JWT requests only when the development EdDSA flag is enabled', async () => {
    process.env.EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING = 'true'
    const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord, transcriptRecord], {
      fetchImpl: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
        async () =>
          new Response(
            unsignedRequestJwt({
              response_type: 'vp_token',
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [
                  {
                    id: 'transcript_credential',
                    format: 'dc+sd-jwt',
                    meta: { vct_values: ['http://192.100.10.48/credentials/TranscriptCredential'] },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    expect(readPresentationTokenMode(request, { softwareEddsaEnabledForTesting: true })).toBe('software-ed25519-kb')
    expect(readPresentationTokenMode(request, { softwareEddsaEnabledForTesting: false })).toBe('sd-jwt-kb')
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              state: 'request-123',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
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
              client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
              response_mode: 'direct_post',
              nonce: 'request-123',
              response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
              dcql_query: {
                credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
              },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify',
          name: 'Verifier API',
          allowedOrigins: ['http://192.100.10.48'],
        },
      ],
    })

    try {
      expect(readPresentationTokenAudience(request)).toBe(request.responseUri)
    } finally {
      process.env.EXPO_PUBLIC_VERIFIER_KB_AUD = originalAudience
    }
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
