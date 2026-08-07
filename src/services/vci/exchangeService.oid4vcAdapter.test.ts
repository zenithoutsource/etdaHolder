import type { IssuerMetadataV1_0_15 } from './walletVciTypes'

jest.mock('@/src/services/crypto/walletCryptoActivation', () => ({
  isWalletCryptoV2Enabled: jest.fn(() => false),
}))

const preAuthOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22ThaiNationalID%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%2C%22tx_code%22%3A%7B%22input_mode%22%3A%22numeric%22%2C%22length%22%3A6%7D%7D%7D%7D'

const dualFormatOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22org.iso.18013.5.1.mDL%22%2C%22Iso18013DriversLicenseCredential_dc%2Bsd-jwt%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'

function unsignedJwt(payload: Record<string, unknown>, alg = 'EdDSA'): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg })}.${encode(payload)}.signature`
}

function buildIssuerMetadata(issuer: string): IssuerMetadataV1_0_15 {
  const normalized = issuer.replace(/\/$/, '')
  return {
    credential_issuer: normalized,
    credential_endpoint: `${normalized}/credential`,
    token_endpoint: `${normalized}/token`,
    authorization_servers: [normalized],
    credential_configurations_supported: {
      ThaiNationalID: {
        format: 'dc+sd-jwt',
        vct: 'https://issuer.example.com/vct/ThaiNationalID',
        credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        display: [{ name: 'Thai National ID', locale: 'en' }],
      },
    },
    display: [{ name: 'Example Issuer', locale: 'en' }],
  } as IssuerMetadataV1_0_15
}

function installOid4vcFetchMock(options?: { credentialJwt?: string }) {
  const credentialJwt =
    options?.credentialJwt
    ?? unsignedJwt({
      jti: 'oid4vc-vc-1',
      iat: 1760000000,
      exp: 1760003600,
      vc: {
        type: ['VerifiableCredential', 'ThaiNationalID'],
        credentialSubject: { givenName: 'Ada' },
      },
    })

  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = String(input)

      if (href.includes('.well-known/openid-credential-issuer')) {
        return new Response(JSON.stringify(buildIssuerMetadata('https://issuer.example.com')), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (
        href.includes('.well-known/oauth-authorization-server')
        || href.includes('.well-known/openid-configuration')
      ) {
        return new Response(
          JSON.stringify({
            issuer: 'https://issuer.example.com',
            token_endpoint: 'https://issuer.example.com/token',
            grant_types_supported: [
              'authorization_code',
              'urn:ietf:params:oauth:grant-type:pre-authorized_code',
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (href.includes('/token')) {
        return new Response(
          JSON.stringify({ access_token: 'access-token', token_type: 'Bearer', c_nonce: 'nonce-1' }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (href.includes('/credential')) {
        return new Response(JSON.stringify({ credential: credentialJwt }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (init?.method === 'POST' || href.includes('credential_offer_uri')) {
        return new Response(JSON.stringify(buildIssuerMetadata('https://issuer.example.com')), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response('not found', { status: 404 })
    },
  )

  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('exchangeService oid4vc adapter', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
    jest.resetModules()
  })

  test('resolveOffer sets protocolPath oid4vc for pre-auth single-config offer', async () => {
    jest.resetModules()
    installOid4vcFetchMock()

    const { resolveOffer } = require('./exchangeService') as typeof import('./exchangeService')
    const resolved = await resolveOffer(preAuthOfferUri, {
      fetchIssuerMetadata: async (issuer) => buildIssuerMetadata(issuer),
    })

    expect(resolved.protocolPath).toBe('oid4vc')
    expect(resolved.oid4vcContext.credentialOfferObject.credential_configuration_ids).toEqual(['ThaiNationalID'])
    expect(resolved.preAuthorizedCode).toBe('mock-preauth-code')
    expect(resolved.credentialConfigurations[0]?.id).toBe('ThaiNationalID')
    expect(resolved.credentialConfigurations[0]?.format).toBe('dc+sd-jwt')
  })

  test('dual-format offer uses oid4vc path', async () => {
    jest.resetModules()
    installOid4vcFetchMock()

    const { resolveOffer } = require('./exchangeService') as typeof import('./exchangeService')
    const resolved = await resolveOffer(dualFormatOfferUri, {
      fetchIssuerMetadata: async (issuer) => ({
        ...buildIssuerMetadata(issuer),
        credential_configurations_supported: {
          'org.iso.18013.5.1.mDL': {
            format: 'mso_mdoc',
            doctype: 'org.iso.18013.5.1.mDL',
          },
          Iso18013DriversLicenseCredential_dc_sd_jwt: {
            format: 'dc+sd-jwt',
            vct: 'Iso18013DriversLicenseCredential',
          },
        },
      } as IssuerMetadataV1_0_15),
    })

    expect(resolved.protocolPath).toBe('oid4vc')
    expect(resolved.oid4vcContext).toBeDefined()
    expect(resolved.credentialConfigurations).toHaveLength(2)
  })

  test('resolveAuthorizationCodeIssuance sets protocolPath oid4vc', async () => {
    jest.resetModules()
    installOid4vcFetchMock()

    const { resolveAuthorizationCodeIssuance } = require('./exchangeService') as typeof import('./exchangeService')
    const resolved = await resolveAuthorizationCodeIssuance({
      issuer: 'https://issuer.example.com',
      credentialConfigurationIds: ['ThaiNationalID'],
      fetchIssuerMetadata: async (issuer) => buildIssuerMetadata(issuer),
    })

    expect(resolved.protocolPath).toBe('oid4vc')
    expect(resolved.oid4vcContext.credentialOfferObject.grants?.authorization_code).toEqual({})
  })

  test('acquireCredentialRecord uses oid4vc authorization-code token exchange', async () => {
    jest.resetModules()
    const fetchMock = installOid4vcFetchMock()

    const { resolveAuthorizationCodeIssuance, acquireCredentialRecord } = require('./exchangeService') as typeof import('./exchangeService')
    const resolved = await resolveAuthorizationCodeIssuance({
      issuer: 'https://issuer.example.com',
      credentialConfigurationIds: ['ThaiNationalID'],
      fetchIssuerMetadata: async (issuer) => buildIssuerMetadata(issuer),
    })

    const record = await acquireCredentialRecord(resolved, {
      authorizationCodeExchange: {
        authorizationCode: 'auth-code',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        clientId: 'wallet-client',
      },
      dependencies: {
        signProof: async () => 'proof.jwt',
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    })

    expect(record.id).toBe('oid4vc-vc-1')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/token'))).toBe(true)
  })

  test('acquireCredentialRecord uses oid4vc HTTP for token and credential', async () => {
    jest.resetModules()
    const fetchMock = installOid4vcFetchMock()

    const { resolveOffer, acquireCredentialRecord } = require('./exchangeService') as typeof import('./exchangeService')
    const resolved = await resolveOffer(preAuthOfferUri, {
      fetchIssuerMetadata: async (issuer) => buildIssuerMetadata(issuer),
    })
    expect(resolved.protocolPath).toBe('oid4vc')

    const record = await acquireCredentialRecord(resolved, {
      tx_code: '123456',
      dependencies: {
        signProof: async (nonce, audience) => {
          expect(nonce).toBe('nonce-1')
          expect(audience.replace(/\/$/, '')).toBe('https://issuer.example.com')
          return 'proof.jwt'
        },
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    })

    expect(record.id).toBe('oid4vc-vc-1')
    expect(record.type).toBe('ThaiNationalID')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/token'))).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/credential'))).toBe(true)
  })
})
