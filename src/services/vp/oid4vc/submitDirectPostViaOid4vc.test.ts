import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'

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

  const baseRequest = {
    responseMode: 'direct_post' as const,
    state: 'request-123',
    dcqlQuery: { credentials: [{ id: 'idcard_credential' }] },
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
      responseMode: 'direct_post',
      vpToken: JSON.stringify({ idcard_credential: ['vp.jwt'] }),
      state: 'request-123',
      request: baseRequest,
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

  it('submits encrypted response for direct_post.jwt', async () => {
    const privateKey = p256.keygen().secretKey
    const publicJwk = {
      ...p256PublicKeyToJwk(p256.getPublicKey(privateKey, false)),
      alg: 'ECDH-ES' as const,
      kid: 'enc-1',
      use: 'enc',
    }

    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ status: 'verified' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await submitDirectPostViaOid4vc({
      oid4vcContext: {
        authorizationRequestPayload: {
          ...oid4vcContext.authorizationRequestPayload,
          response_mode: 'direct_post.jwt',
        },
      },
      responseUri: oid4vcContext.authorizationRequestPayload.response_uri as string,
      responseMode: 'direct_post.jwt',
      responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
      vpToken: JSON.stringify({ idcard_credential: ['vp.jwt'] }),
      state: 'request-123',
      request: {
        responseMode: 'direct_post.jwt',
        responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
        state: 'request-123',
        dcqlQuery: { credentials: [{ id: 'idcard_credential' }] },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const init = (fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit] | undefined)?.[1]
    const body = new URLSearchParams(String(init?.body ?? ''))
    expect(body.get('vp_token')).toBeNull()
    expect(body.get('response')).toBeTruthy()
  })

  it('maps HTTP errors to PresentationSubmissionFailed', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }),
    )

    await expect(
      submitDirectPostViaOid4vc({
        oid4vcContext,
        responseUri: oid4vcContext.authorizationRequestPayload.response_uri as string,
        responseMode: 'direct_post',
        vpToken: 'vp.jwt',
        request: baseRequest,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('PresentationSubmissionFailed: HTTP 400')
  })
})
