import {
  fetchAuthorizationRequestMaterial,
  readRoutingPreviewFromMaterial,
} from './fetchAuthorizationRequestMaterial'

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')

  return `${encode({ alg: 'none', typ: 'oauth-authz-req+jwt' })}.${encode(payload)}.`
}

describe('fetchAuthorizationRequestMaterial', () => {
  it('returns byValueParams for inline openid4vp:// DCQL without fetching', async () => {
    const fetchImpl = jest.fn()
    const uri = `openid4vp://authorize?${new URLSearchParams({
      client_id: 'redirect_uri:http://verifier.example/openid4vc/verify/session',
      response_uri: 'http://verifier.example/openid4vc/verify/session',
      response_mode: 'direct_post',
      dcql_query: JSON.stringify({
        credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json' }],
      }),
    }).toString()}`

    const material = await fetchAuthorizationRequestMaterial(uri, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(material.byValueParams?.client_id).toContain('redirect_uri:')
    expect(material.byValueParams?.dcql_query).toContain('idcard_credential')
    expect(material.rawBody).toBeUndefined()
  })

  it('fetches request_uri exactly once and populates rawBody', async () => {
    const jwt = unsignedJwt({
      response_type: 'vp_token',
      client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      response_mode: 'direct_post',
      response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      dcql_query: {
        credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json' }],
      },
    })
    const fetchImpl = jest.fn(async () => new Response(jwt, { status: 200 }))

    const material = await fetchAuthorizationRequestMaterial(
      'openid4vp://authorize?client_id=redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123&request_uri=http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123',
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123',
      expect.objectContaining({
        headers: { Accept: 'application/json, application/oauth-authz-req+jwt' },
      }),
    )
    expect(material.rawBody).toBe(jwt)
    expect(material.requestUri).toBe('http://verifier.zenithcomp.co.th:455/openid4vc/request/request-123')
  })

  it('throws PresentationRequestFetchFailed when fetch fails', async () => {
    const fetchImpl = jest.fn(async () => new Response('missing', { status: 404 }))

    await expect(
      fetchAuthorizationRequestMaterial(
        'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fmissing',
        { fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toThrow('PresentationRequestFetchFailed: HTTP 404')
  })

  it('throws PresentationRequestFetchFailed when transport fails', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })

    await expect(
      fetchAuthorizationRequestMaterial(
        'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fmissing',
        { fetchImpl: fetchImpl as unknown as typeof fetch },
      ),
    ).rejects.toThrow('PresentationRequestFetchFailed: Network request failed')
  })

  it('reads JWT routing preview without Node Buffer', () => {
    const jwt = unsignedJwt({
      client_id: 'redirect_uri:http://verifier.example/openid4vc/verify/session',
      response_uri: 'http://verifier.example/openid4vc/verify/session',
      dcql_query: {
        credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json' }],
      },
    })
    const originalBuffer = global.Buffer

    // Hermes does not provide Node Buffer.
    // @ts-expect-error simulate Hermes runtime
    delete global.Buffer

    try {
      const preview = readRoutingPreviewFromMaterial({ rawBody: jwt })
      expect(preview.client_id).toContain('redirect_uri:')
      expect(preview.dcql_query).toEqual(
        expect.objectContaining({
          credentials: expect.arrayContaining([
            expect.objectContaining({ id: 'idcard_credential' }),
          ]),
        }),
      )
    } finally {
      global.Buffer = originalBuffer
    }
  })
})
