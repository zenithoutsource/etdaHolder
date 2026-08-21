import type { ClientAuthenticationCallbackOptions } from '@openid4vc/oauth2'
import { Headers } from '@openid4vc/utils'
import type { IssuerMetadataResult } from '@openid4vc/openid4vci'

import { decodeJwtHeader } from '@/src/utils/jwtUtils'
import {
  __resetHardwareEcdsaSignerCacheForTests,
  __setHardwareEcdsaSignerForTests,
} from '@/src/services/crypto/hardwareEcdsaSigner'
import { createMockHardwareEcdsaSigner } from '@/src/services/crypto/hardwareEcdsaSigner.mock'
import { WALLET_P256_ATTEST_ALIAS } from '@/src/services/crypto/hardwareEcdsaTypes'
import { readCachedWalletAttestations } from '@/src/services/crypto/walletCryptoActivation'
import {
  authorizationServerRequiresClientAttestation,
  isOauthClientAttestationJwt,
  resolveTokenClientAuthentication,
} from './tokenClientAuthentication'

jest.mock('@/src/services/crypto/walletCryptoActivation', () => ({
  readCachedWalletAttestations: jest.fn(() => ({})),
}))

const readCachedWalletAttestationsMock = readCachedWalletAttestations as jest.MockedFunction<
  typeof readCachedWalletAttestations
>

function metadata(methods?: string[]): Pick<IssuerMetadataResult, 'authorizationServers' | 'credentialIssuer'> {
  return {
    credentialIssuer: {
      credential_issuer: 'https://issuer.example',
      credential_endpoint: 'https://issuer.example/credential',
    },
    authorizationServers: [
      {
        issuer: 'https://issuer.example',
        token_endpoint: 'https://issuer.example/token',
        ...(methods ? { token_endpoint_auth_methods_supported: methods } : {}),
      },
    ],
  } as Pick<IssuerMetadataResult, 'authorizationServers' | 'credentialIssuer'>
}

function compactJwt(header: Record<string, unknown>, payload: Record<string, unknown>, sig = 'sig'): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode(header)}.${encode(payload)}.${sig}`
}

function oauthClientAttestationJwt(): string {
  return compactJwt(
    { alg: 'ES256', typ: 'oauth-client-attestation+jwt' },
    {
      sub: 'wallet-holder',
      exp: 4_102_444_800,
      cnf: {
        jwk: { kty: 'EC', crv: 'P-256', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
      },
    },
  )
}

function tokenCallbackOptions(body: Record<string, unknown>, headers = new Headers()) {
  return {
    authorizationServerMetadata: { issuer: 'https://issuer.example' },
    url: 'https://issuer.example/token',
    method: 'POST' as const,
    headers,
    body,
  } as ClientAuthenticationCallbackOptions
}

function mockWalletAttestationJwt(): string {
  return compactJwt(
    { alg: 'none', typ: 'wallet-attestation+jwt' },
    {
      sub: 'did:key:test',
      exp: 4_102_444_800,
      cnf: {
        jwk: { kty: 'EC', crv: 'P-256', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
      },
    },
  )
}

describe('tokenClientAuthentication', () => {
  beforeEach(() => {
    readCachedWalletAttestationsMock.mockReset()
    readCachedWalletAttestationsMock.mockReturnValue({})
    __resetHardwareEcdsaSignerCacheForTests()
  })

  afterEach(() => {
    __resetHardwareEcdsaSignerCacheForTests()
  })

  test('does not require attestation when AS metadata omits attest_jwt_client_auth', async () => {
    expect(authorizationServerRequiresClientAttestation(metadata(['none']))).toBe(false)
    expect(authorizationServerRequiresClientAttestation(metadata())).toBe(false)
    await expect(resolveTokenClientAuthentication(metadata())).resolves.toEqual(expect.any(Function))
    expect(readCachedWalletAttestationsMock).not.toHaveBeenCalled()
  })

  test('strips legacy user_pin, client_id, and resource on anonymous token auth', async () => {
    const callback = await resolveTokenClientAuthentication(metadata(['none']))
    const body: Record<string, unknown> = {
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': 'code',
      tx_code: '123456',
      user_pin: '123456',
      resource: 'https://issuer.example/session',
      client_id: 'wallet-holder',
    }
    await callback(tokenCallbackOptions(body))
    expect(body.user_pin).toBeUndefined()
    expect(body.client_id).toBeUndefined()
    expect(body.resource).toBeUndefined()
    expect(body.tx_code).toBe('123456')
    expect(body['pre-authorized_code']).toBe('code')
  })

  test('selects attestation when AS metadata advertises attest_jwt_client_auth', () => {
    expect(
      authorizationServerRequiresClientAttestation(metadata(['attest_jwt_client_auth'])),
    ).toBe(true)
  })

  test('rejects mock wallet-attestation JWTs as OAuth client attestation material', () => {
    expect(isOauthClientAttestationJwt(mockWalletAttestationJwt())).toBe(false)
    expect(isOauthClientAttestationJwt('wua.jwt.')).toBe(false)
    expect(isOauthClientAttestationJwt(oauthClientAttestationJwt())).toBe(true)
  })

  test('fails closed when attestation is required and k_attest is missing', async () => {
    await expect(resolveTokenClientAuthentication(metadata(['attest_jwt_client_auth']))).rejects.toThrow(
      'WalletAttestationRequired: this issuer requires wallet attestation',
    )
  })

  test('returns an attestation callback when a fresh OAuth client attestation WUA is cached', async () => {
    readCachedWalletAttestationsMock.mockReturnValue({
      wua: { value: oauthClientAttestationJwt(), expiresAt: '2099-01-01T00:00:00.000Z' },
    })
    const callback = await resolveTokenClientAuthentication(metadata(['attest_jwt_client_auth']))
    expect(typeof callback).toBe('function')
  })

  test('mints oauth-client-attestation+jwt when cached WUA is the unsigned wallet-attestation mock', async () => {
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey(WALLET_P256_ATTEST_ALIAS)
    __setHardwareEcdsaSignerForTests(signer, 'mock')
    readCachedWalletAttestationsMock.mockReturnValue({
      wua: { value: mockWalletAttestationJwt(), expiresAt: '2099-01-01T00:00:00.000Z' },
    })

    const callback = await resolveTokenClientAuthentication(metadata(['attest_jwt_client_auth']))
    const headers = new Headers()
    const body: Record<string, unknown> = {
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      tx_code: '123456',
      user_pin: '123456',
    }
    await callback(tokenCallbackOptions(body, headers))

    const attestation = headers.get('OAuth-Client-Attestation')
    expect(attestation).toEqual(expect.any(String))
    expect(decodeJwtHeader(attestation ?? '')).toEqual(
      expect.objectContaining({
        alg: 'ES256',
        typ: 'oauth-client-attestation+jwt',
      }),
    )
    expect(headers.get('OAuth-Client-Attestation-PoP')).toEqual(expect.any(String))
    expect(decodeJwtHeader(headers.get('OAuth-Client-Attestation-PoP') ?? '')).toEqual(
      expect.objectContaining({
        alg: 'ES256',
        typ: 'oauth-client-attestation-pop+jwt',
      }),
    )
    expect(body.user_pin).toBeUndefined()
    expect(body.tx_code).toBe('123456')
    expect(body.client_id).toBe('wallet-holder')
  })
})
