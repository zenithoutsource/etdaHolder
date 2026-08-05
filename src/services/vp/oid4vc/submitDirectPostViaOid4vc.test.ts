import { submitDirectPostViaOid4vc } from './submitDirectPostViaOid4vc'

describe('submitDirectPostViaOid4vc', () => {
  const oid4vcContext = {
    authorizationRequestPayload: {
      response_uri: 'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      client_id: 'redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      response_mode: 'direct_post',
      state: 'request-123',
    },
  }

  it('submits vp_token using stored authorizationRequestPayload', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ status: 'verified' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await submitDirectPostViaOid4vc({
      oid4vcContext,
      responseUri: oid4vcContext.authorizationRequestPayload.response_uri as string,
      vpToken: JSON.stringify({ idcard_credential: ['vp.jwt'] }),
      state: 'request-123',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://verifier.zenithcomp.co.th:455/openid4vc/verify/request-123',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = (fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit] | undefined)?.[1]
    const body = new URLSearchParams(String(init?.body ?? ''))
    expect(body.get('vp_token')).toBe(JSON.stringify({ idcard_credential: ['vp.jwt'] }))
    expect(body.get('state')).toBe('request-123')
    expect(result).toEqual({
      ok: true,
      status: 200,
      parsedBody: { status: 'verified' },
    })
  })

  it('maps HTTP errors to PresentationSubmissionFailed', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }),
    )

    await expect(
      submitDirectPostViaOid4vc({
        oid4vcContext,
        responseUri: oid4vcContext.authorizationRequestPayload.response_uri as string,
        vpToken: 'vp.jwt',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('PresentationSubmissionFailed: HTTP 400')
  })
})
