import { p256 } from '@noble/curves/nist.js'

import { decryptCompactJweEcdhEsP256ForTest } from '@/src/services/crypto/jweEcdhEs'
import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'

import { buildDcApiPresentationPayload, formatDcApiDigitalCredentialResponse } from './dcApiResponseBuilder'

describe('buildDcApiPresentationPayload', () => {
  const privateKey = p256.keygen().secretKey
  const recipientJwk = {
    ...p256PublicKeyToJwk(p256.getPublicKey(privateKey, false)),
    alg: 'ECDH-ES' as const,
    kid: 'dc-api-encryption-key',
    use: 'enc',
  }
  const authorizationRequest = {
    dcql_query: { credentials: [{ id: 'cred1', format: 'mso_mdoc' }] },
    client_metadata: { jwks: { keys: [recipientJwk] } },
  }

  it('builds an object_array vp_token keyed by the DCQL credential query ID', () => {
    const payload = buildDcApiPresentationPayload({
      responseMode: 'dc_api',
      authorizationRequest,
      selectedDcqlQueryId: 'cred1',
      deviceResponse: 'base64urlDeviceResponse',
    })

    expect(payload).toEqual({
      responseMode: 'dc_api',
      data: { vp_token: { cred1: ['base64urlDeviceResponse'] } },
    })
  })

  it('returns only a compact JWE whose plaintext omits state for dc_api.jwt', () => {
    const payload = buildDcApiPresentationPayload({
      responseMode: 'dc_api.jwt',
      authorizationRequest: { ...authorizationRequest, state: 'must-not-be-sent' },
      selectedDcqlQueryId: 'cred1',
      deviceResponse: 'base64urlDeviceResponse',
    })

    expect(payload.responseMode).toBe('dc_api.jwt')
    expect(payload).toEqual({ responseMode: 'dc_api.jwt', response: expect.any(String) })
    if (payload.responseMode !== 'dc_api.jwt') throw new Error('ExpectedDcApiJwtPayload')
    expect(payload.response.split('.')).toHaveLength(5)
    expect(decryptCompactJweEcdhEsP256ForTest(payload.response, privateKey)).toEqual({
      vp_token: { cred1: ['base64urlDeviceResponse'] },
    })
  })

  it('uses the explicitly selected later DCQL query ID for dc_api', () => {
    const payloadInput = {
      responseMode: 'dc_api' as const,
      authorizationRequest: {
        ...authorizationRequest,
        dcql_query: {
          credentials: [
            { id: 'cred1', format: 'mso_mdoc' },
            { id: 'cred2', format: 'mso_mdoc' },
          ],
        },
      },
      selectedDcqlQueryId: 'cred2',
      deviceResponse: 'base64urlDeviceResponse',
    }

    expect(buildDcApiPresentationPayload(payloadInput)).toEqual({
      responseMode: 'dc_api',
      data: { vp_token: { cred2: ['base64urlDeviceResponse'] } },
    })
  })

  it('uses the explicitly selected later DCQL query ID for dc_api.jwt', () => {
    const payloadInput = {
      responseMode: 'dc_api.jwt' as const,
      authorizationRequest: {
        ...authorizationRequest,
        dcql_query: {
          credentials: [
            { id: 'cred1', format: 'mso_mdoc' },
            { id: 'cred2', format: 'mso_mdoc' },
          ],
        },
      },
      selectedDcqlQueryId: 'cred2',
      deviceResponse: 'base64urlDeviceResponse',
    }
    const payload = buildDcApiPresentationPayload(payloadInput)

    if (payload.responseMode !== 'dc_api.jwt') throw new Error('ExpectedDcApiJwtPayload')
    expect(decryptCompactJweEcdhEsP256ForTest(payload.response, privateKey)).toEqual({
      vp_token: { cred2: ['base64urlDeviceResponse'] },
    })
  })

  test('wraps presentation payload for Credential Manager credentialJson', () => {
    const wrapped = formatDcApiDigitalCredentialResponse(
      {
        responseMode: 'dc_api',
        data: { vp_token: { cred1: ['device-response'] } },
      },
      'openid4vp-v1-unsigned',
    )
    expect(JSON.parse(wrapped)).toEqual({
      protocol: 'openid4vp-v1-unsigned',
      data: { vp_token: { cred1: ['device-response'] } },
    })
  })

  test('wraps encrypted dc_api.jwt payload for Credential Manager credentialJson', () => {
    const wrapped = formatDcApiDigitalCredentialResponse(
      {
        responseMode: 'dc_api.jwt',
        response: 'eyJhbGciOiJFQ0RILUVTK0EyNTZHQ00ifQ..ciphertext..tag',
      },
      'openid4vp-v1-unsigned',
    )
    expect(JSON.parse(wrapped)).toEqual({
      protocol: 'openid4vp-v1-unsigned',
      data: { response: 'eyJhbGciOiJFQ0RILUVTK0EyNTZHQ00ifQ..ciphertext..tag' },
    })
  })
})
