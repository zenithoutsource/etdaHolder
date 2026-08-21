import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'

import {
  decryptCompactJweEcdhEsP256ForTest,
  encryptCompactJweEcdhEsP256,
  type Oid4vpEncryptionRecipientJwk,
} from './jweEcdhEs'

function buildRecipientFixture(): {
  privateKey: Uint8Array
  jwk: Oid4vpEncryptionRecipientJwk
} {
  const privateKey = p256.keygen().secretKey
  const publicJwk = p256PublicKeyToJwk(p256.getPublicKey(privateKey, false))
  return {
    privateKey,
    jwk: {
      ...publicJwk,
      alg: 'ECDH-ES',
      kid: 'enc-1',
      use: 'enc',
    },
  }
}

describe('jweEcdhEs', () => {
  it('round-trips A128GCM payload', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const payload = {
      vp_token: { my_credential: ['eyJhbGciOiJFUzI1NiJ9.test'] },
      state: 'session-42',
    }

    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A128GCM',
      payload,
    })

    expect(jwe.split('.').length).toBe(5)
    expect(jwe.split('.')[1]).toBe('')

    const decrypted = decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)
    expect(decrypted).toEqual(payload)
  })

  it('round-trips A256GCM payload', () => {
    const { privateKey, jwk } = buildRecipientFixture()
    const payload = { vp_token: 'raw-token' }

    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A256GCM',
      payload,
    })

    const decrypted = decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)
    expect(decrypted).toEqual(payload)
  })

  it('includes kid in protected header when present on recipient JWK', () => {
    const { jwk } = buildRecipientFixture()
    const jwe = encryptCompactJweEcdhEsP256({
      recipientJwk: jwk,
      enc: 'A128GCM',
      payload: { vp_token: 't' },
    })

    const headerSegment = jwe.split('.')[0]!
    const headerJson = Buffer.from(
      headerSegment.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    const header = JSON.parse(headerJson) as Record<string, unknown>
    expect(header.kid).toBe('enc-1')
    expect(header.alg).toBe('ECDH-ES')
    expect(header.enc).toBe('A128GCM')
    expect(header.epk).toBeDefined()
  })
})
