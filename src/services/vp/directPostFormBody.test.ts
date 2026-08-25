import { p256 } from '@noble/curves/nist.js'
import { Buffer } from '@craftzdog/react-native-buffer'

import { p256PublicKeyToJwk } from '@/src/services/crypto/p256Identity'
import { decryptCompactJweEcdhEsP256ForTest } from '@/src/services/crypto/jweEcdhEs'

import { buildDirectPostFormBody } from './directPostFormBody'

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

describe('directPostFormBody', () => {
  const originalOid4vpJweApv = process.env.EXPO_PUBLIC_OID4VP_JWE_APV
  const originalWalletDemoInterop = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
  const privateKey = p256.keygen().secretKey
  const publicJwk = {
    ...p256PublicKeyToJwk(p256.getPublicKey(privateKey, false)),
    alg: 'ECDH-ES' as const,
    kid: 'enc-1',
    use: 'enc',
  }

  afterEach(() => {
    restoreEnvironmentVariable('EXPO_PUBLIC_OID4VP_JWE_APV', originalOid4vpJweApv)
    restoreEnvironmentVariable('EXPO_PUBLIC_WALLET_DEMO_INTEROP', originalWalletDemoInterop)
  })

  it('builds plaintext direct_post body', () => {
    const body = buildDirectPostFormBody({
      request: { responseMode: 'direct_post', state: 's1' },
      formattedVpToken: 'vp.jwt',
    })

    expect(body.get('vp_token')).toBe('vp.jwt')
    expect(body.get('state')).toBe('s1')
    expect(body.get('response')).toBeNull()
  })

  it('omits presentation_submission from encrypted DCQL direct_post.jwt payloads', () => {
    delete process.env.EXPO_PUBLIC_OID4VP_JWE_APV
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

    const headerSegment = body.get('response')!.split('.')[0]!
    const header = JSON.parse(
      Buffer.from(headerSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as Record<string, unknown>
    expect(header.apu).toBeUndefined()
    expect(header.apv).toBeUndefined()

    const decrypted = decryptCompactJweEcdhEsP256ForTest(body.get('response')!, privateKey)
    expect(decrypted.vp_token).toEqual({ idcard_credential: ['vp.jwt'] })
    expect(decrypted.state).toBe('s1')
    expect(decrypted.presentation_submission).toBeUndefined()
  })

  it('retains presentation_submission in encrypted non-DCQL direct_post.jwt payloads', () => {
    const presentationSubmission = { id: 'sub', definition_id: 'def', descriptor_map: [] }
    const body = buildDirectPostFormBody({
      request: {
        responseMode: 'direct_post.jwt',
        responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
        state: 's1',
      },
      formattedVpToken: 'vp.jwt',
      presentationSubmission,
    })

    const decrypted = decryptCompactJweEcdhEsP256ForTest(body.get('response')!, privateKey)
    expect(decrypted.presentation_submission).toEqual(presentationSubmission)
    expect(decrypted.state).toBe('s1')
  })

  it('includes nonce-derived JWE apv for the explicit development override', () => {
    process.env.EXPO_PUBLIC_OID4VP_JWE_APV = 'true'
    const body = buildDirectPostFormBody({
      request: {
        responseMode: 'direct_post.jwt',
        responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
        nonce: 'request-nonce-42',
      },
      formattedVpToken: 'vp.jwt',
    })

    const headerSegment = body.get('response')!.split('.')[0]!
    const header = JSON.parse(
      Buffer.from(headerSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as Record<string, unknown>
    expect(header.apu).toBeUndefined()
    expect(header.apv).toBe('cmVxdWVzdC1ub25jZS00Mg')
  })

  test('demo interop ignores EXPO_PUBLIC_OID4VP_JWE_APV even when set', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    process.env.EXPO_PUBLIC_OID4VP_JWE_APV = 'true'

    const vpEnvelope = JSON.stringify({ q1: ['vp.jwt'] })
    const body = buildDirectPostFormBody({
      request: {
        responseMode: 'direct_post.jwt',
        responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
        state: 's1',
        nonce: 'nonce-1',
        dcqlQuery: { credentials: [{ id: 'q1' }] },
      },
      formattedVpToken: vpEnvelope,
    })

    const header = JSON.parse(
      Buffer.from(body.get('response')!.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    )
    expect(header.apv).toBeUndefined()
    expect(header.apu).toBeUndefined()
  })

  test('encrypted DCQL payload stores vp_token as object without presentation_submission', () => {
    delete process.env.EXPO_PUBLIC_OID4VP_JWE_APV
    const vpEnvelope = JSON.stringify({ q1: ['vp.jwt'] })
    const body = buildDirectPostFormBody({
      request: {
        responseMode: 'direct_post.jwt',
        responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
        state: 's1',
        dcqlQuery: { credentials: [{ id: 'q1' }] },
      },
      formattedVpToken: vpEnvelope,
    })

    const decrypted = decryptCompactJweEcdhEsP256ForTest(body.get('response')!, privateKey)
    expect(decrypted.vp_token).toEqual({ q1: ['vp.jwt'] })
    expect(decrypted.presentation_submission).toBeUndefined()
    expect(decrypted.state).toBe('s1')
  })

  test('restores absent environment variables by deleting them', () => {
    const variableName = 'WALLET_TEST_UNSET_ENVIRONMENT'
    process.env[variableName] = 'changed'

    restoreEnvironmentVariable(variableName, undefined)

    expect(process.env[variableName]).toBeUndefined()
  })
})
