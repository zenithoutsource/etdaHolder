import { parseAuthorizationRequestBody } from '../authorizationRequestJar'
import { parseAuthorizationRequestViaOid4vc } from './parseAuthorizationRequestViaOid4vc'

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encode(payload)}.`
}

const trustedVerifiers = [
  {
    clientId: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify',
    name: 'Verifier API',
    allowedOrigins: ['http://verifier.zenithcomp.co.th:455'],
  },
]

const requestPayload = {
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
}

describe('parseAuthorizationRequestViaOid4vc', () => {
  it('matches legacy parseAuthorizationRequestBody fields for redirect_uri dev fixture', async () => {
    const jwt = unsignedJwt(requestPayload)
    const fetchImpl = jest.fn()

    const adapterResult = await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt },
      { trustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const legacyResult = await parseAuthorizationRequestBody(jwt, { trustedVerifiers })

    expect(adapterResult.authorizationRequest.client_id).toBe(legacyResult?.client_id)
    expect(adapterResult.authorizationRequest.response_uri).toBe(legacyResult?.response_uri)
    expect(adapterResult.authorizationRequest.response_mode).toBe(legacyResult?.response_mode)
    expect(adapterResult.authorizationRequest.nonce).toBe(legacyResult?.nonce)
    expect(adapterResult.authorizationRequest.state).toBe(legacyResult?.state)
    expect(adapterResult.authorizationRequest.dcql_query).toEqual(legacyResult?.dcql_query)
  })

  it('throws PresentationRequestInvalid for untrusted verifier without did.json fetch', async () => {
    const jwt = unsignedJwt(requestPayload)
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))

    await expect(
      parseAuthorizationRequestViaOid4vc(
        { rawBody: jwt },
        {
          trustedVerifiers: [],
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow('PresentationRequestInvalid: verifier is not trusted')

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not perform additional fetch when rawBody material is provided', async () => {
    const jwt = unsignedJwt(requestPayload)
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))

    await parseAuthorizationRequestViaOid4vc(
      { rawBody: jwt, requestUri: 'http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123' },
      { trustedVerifiers, fetchImpl: fetchImpl as unknown as typeof fetch },
    )

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('parses by-value inline DCQL params', async () => {
    const result = await parseAuthorizationRequestViaOid4vc(
      {
        byValueParams: {
          response_type: 'vp_token',
          client_id: requestPayload.client_id,
          response_uri: requestPayload.response_uri,
          response_mode: 'direct_post',
          nonce: requestPayload.nonce,
          state: requestPayload.state,
          dcql_query: JSON.stringify(requestPayload.dcql_query),
        },
      },
      { trustedVerifiers },
    )

    expect(result.authorizationRequest.client_id).toBe(requestPayload.client_id)
    expect(result.oid4vcContext.authorizationRequestPayload.response_uri).toBe(requestPayload.response_uri)
  })
})
