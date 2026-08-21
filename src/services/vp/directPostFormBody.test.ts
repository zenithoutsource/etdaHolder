import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'
import { decryptCompactJweEcdhEsP256ForTest } from '@/src/services/crypto/jweEcdhEs'

import { buildDirectPostFormBody } from './directPostFormBody'

describe('directPostFormBody', () => {
  const privateKey = p256.keygen().secretKey
  const publicJwk = {
    ...p256PublicKeyToJwk(p256.getPublicKey(privateKey, false)),
    alg: 'ECDH-ES' as const,
    kid: 'enc-1',
    use: 'enc',
  }

  it('builds plaintext direct_post body', () => {
    const body = buildDirectPostFormBody({
      request: { responseMode: 'direct_post', state: 's1' },
      formattedVpToken: 'vp.jwt',
    })

    expect(body.get('vp_token')).toBe('vp.jwt')
    expect(body.get('state')).toBe('s1')
    expect(body.get('response')).toBeNull()
  })

  it('builds encrypted direct_post.jwt body with object vp_token', () => {
    const vpEnvelope = JSON.stringify({ idcard_credential: ['vp.jwt'] })
    const body = buildDirectPostFormBody({
      request: {
        responseMode: 'direct_post.jwt',
        responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
        state: 's1',
        dcqlQuery: { credentials: [{ id: 'idcard_credential' }] },
      },
      formattedVpToken: vpEnvelope,
      presentationSubmission: { id: 'sub', definition_id: 'def', descriptor_map: [] },
    })

    expect(body.get('vp_token')).toBeNull()
    expect(body.get('response')).toBeTruthy()

    const decrypted = decryptCompactJweEcdhEsP256ForTest(body.get('response')!, privateKey)
    expect(decrypted.vp_token).toEqual({ idcard_credential: ['vp.jwt'] })
    expect(decrypted.state).toBe('s1')
    expect(decrypted.presentation_submission).toEqual({
      id: 'sub',
      definition_id: 'def',
      descriptor_map: [],
    })
  })
})
