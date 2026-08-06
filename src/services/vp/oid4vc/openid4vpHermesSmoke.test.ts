import { parseOpenid4vpAuthorizationRequest } from '@openid4vc/openid4vp'

describe('openid4vp Hermes smoke', () => {
  it('parses a by-value redirect_uri DCQL openid4vp:// URI', () => {
    const uri = `openid4vp://authorize?${new URLSearchParams({
      response_type: 'vp_token',
      client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/smoke',
      response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/smoke',
      response_mode: 'direct_post',
      nonce: 'smoke-nonce',
      state: 'smoke-state',
      dcql_query: JSON.stringify({
        credentials: [
          {
            id: 'idcard_credential',
            format: 'jwt_vc_json',
            meta: { type_values: ['IDCardCredential'] },
          },
        ],
      }),
    }).toString()}`

    const parsed = parseOpenid4vpAuthorizationRequest({ authorizationRequest: uri })

    expect(parsed.type).toBe('openid4vp')
    expect(parsed.params.client_id).toContain('redirect_uri:')
    expect(parsed.params.response_mode).toBe('direct_post')
    expect(parsed.params.dcql_query).toEqual(
      expect.objectContaining({
        credentials: expect.arrayContaining([
          expect.objectContaining({ id: 'idcard_credential', format: 'jwt_vc_json' }),
        ]),
      }),
    )
  })
})
