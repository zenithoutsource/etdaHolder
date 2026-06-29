import {
  acquireCredentialRecord,
  claimCredential,
  DeferredIssuancePending,
  InvalidProofError,
  pollDeferredCredential,
  readCompactCredentialFromResponse,
  readDeferredTransactionId,
  resolveOffer,
  saveCredentialRecord,
  syncCredentialToBackend,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from './exchangeService'

test('exchange service contract module loads', () => {
  expect(typeof resolveOffer).toBe('function')
  expect(typeof acquireCredentialRecord).toBe('function')
  expect(typeof claimCredential).toBe('function')
  expect(typeof saveCredentialRecord).toBe('function')
  expect(typeof syncCredentialToBackend).toBe('function')
})

describe('readCompactCredentialFromResponse', () => {
  test('reads nested OID4VCI 1.0 credentials array entry', () => {
    expect(
      readCompactCredentialFromResponse({
        successBody: {
          credentials: [{ credential: 'issuer.jwt.sd-jwt~disclosure~' }],
        },
      }),
    ).toBe('issuer.jwt.sd-jwt~disclosure~')
  })

  test('reads top-level credential response body', () => {
    expect(
      readCompactCredentialFromResponse({
        successBody: {
          credential: 'issuer.jwt.sd-jwt~disclosure~',
        },
      }),
    ).toBe('issuer.jwt.sd-jwt~disclosure~')
  })

  test('reads direct string credentials array entry', () => {
    expect(
      readCompactCredentialFromResponse({
        successBody: {
          credentials: ['issuer.jwt.sd-jwt~disclosure~'],
        },
      }),
    ).toBe('issuer.jwt.sd-jwt~disclosure~')
  })

  test('reads direct issuer credential response body without successBody wrapper', () => {
    expect(
      readCompactCredentialFromResponse({
        credentials: [{ credential: 'issuer.jwt.sd-jwt~disclosure~' }],
      }),
    ).toBe('issuer.jwt.sd-jwt~disclosure~')
  })

  test('reads nested credential_response wrapper', () => {
    expect(
      readCompactCredentialFromResponse({
        successBody: {
          credential_response: {
            credentials: [{ credential: 'issuer.jwt.sd-jwt~disclosure~' }],
          },
        },
      }),
    ).toBe('issuer.jwt.sd-jwt~disclosure~')
  })
})

const offerUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22ThaiNationalID%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%2C%22tx_code%22%3A%7B%22input_mode%22%3A%22numeric%22%2C%22length%22%3A6%7D%7D%7D%7D'
const missingConfigurationIdsOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'
const transcriptOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22TranscriptCredential_dc%2Bsd-jwt%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'
const idCardSdJwtOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22IdCard_dc%2Bsd-jwt%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'
const uppercaseIdCardSdJwtOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22IDCard_dc%2Bsd-jwt%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'
const remoteOfferUri =
  'openid-credential-offer://?credential_offer_uri=http%3A%2F%2F192.100.10.46%2Fopenid4vc%2Frequest%2Fabc'

const realFetch = globalThis.fetch
const originalEnv = process.env

afterEach(() => {
  globalThis.fetch = realFetch
  process.env = { ...originalEnv }
})

async function expectErrorPrefix(operation: () => Promise<unknown>, prefix: string): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(prefix)) {
      return
    }

    throw error
  }

  throw new Error(`Expected ${prefix}`)
}

function unsignedJwt(payload: Record<string, unknown>, alg = 'EdDSA'): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg })}.${encode(payload)}.signature`
}

function proofJwtWithJwk(jwk: Record<string, unknown>, kid = 'did:key:z6Mkwallet#z6Mkwallet'): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg: 'EdDSA', typ: 'openid4vci-proof+jwt', kid, jwk })}.${encode({ nonce: 'nonce' })}.signature`
}

function disclosure(key: string, value: unknown): string {
  return btoa(JSON.stringify(['salt', key, value])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function contract(): Promise<ResolvedCredentialOffer> {
  return resolveOffer(offerUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiNationalID: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/ThaiNationalID',
          credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
      display: [{ name: 'Example Issuer', locale: 'en' }],
    }),
  })
}

void contract()

async function missingCredentialConfigurationIdsContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      resolveOffer(missingConfigurationIdsOfferUri, {
        fetchIssuerMetadata: async () => ({
          credential_issuer: 'https://issuer.example.com',
          credential_endpoint: 'https://issuer.example.com/credential',
          credential_configurations_supported: {
            ThaiNationalID: {
              format: 'dc+sd-jwt',
              vct: 'https://issuer.example.com/vct/ThaiNationalID',
              credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
            },
          },
        }),
      }),
    'CredentialOfferInvalid',
  )
}

void missingCredentialConfigurationIdsContract()

async function txCodeContract(): Promise<void> {
  const resolved = await contract()

  await expectErrorPrefix(
    () =>
      claimCredential(resolved, {
        dependencies: {
          acquireAccessToken: async () => {
            throw new Error('should not acquire without tx_code')
          },
          requestCredential: async () => 'vc.jwt',
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    'TransactionCodeRequired',
  )
}

void txCodeContract()

test('resolveOffer fetches credential_offer_uri through the development issuer proxy', async () => {
  jest.resetModules()
  process.env = {
    ...process.env,
    EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET: 'http://192.100.10.46',
    EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL: 'http://127.0.0.1:4000/dev-issuer-proxy',
  }
  const { resolveOffer: resolveOfferWithProxy } = require('./exchangeService') as typeof import('./exchangeService')
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new Response(
        JSON.stringify({
          credential_issuer: 'http://192.100.10.46',
          credential_configuration_ids: ['IDCard_dc+sd-jwt'],
          grants: {
            'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
              'pre-authorized_code': 'mock-preauth-code',
            },
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch

  const resolved = await resolveOfferWithProxy(remoteOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'http://192.100.10.46',
      token_endpoint: 'http://192.100.10.46/token',
      credential_endpoint: 'http://192.100.10.46/credential',
      credential_configurations_supported: {
        IDCardCredential_dc_sd_jwt: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/idcard',
          credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        },
      },
    }),
  })

  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4000/dev-issuer-proxy/openid4vc/request/abc', {
    headers: { Accept: 'application/json' },
  })
  expect(resolved.offerUri).toContain('credential_offer=')
  expect(resolved.issuerMetadata.token_endpoint).toBe('http://127.0.0.1:4000/dev-issuer-proxy/token')
  expect(resolved.issuerMetadata.credential_endpoint).toBe('http://127.0.0.1:4000/dev-issuer-proxy/credential')
})

test('default pre-authorized token exchange uses the development issuer proxy', async () => {
  jest.resetModules()
  process.env = {
    ...process.env,
    EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET: 'http://192.100.10.46',
    EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL: 'http://127.0.0.1:4000/dev-issuer-proxy',
  }
  const { acquireCredentialRecord: acquireCredentialRecordWithProxy } = require('./exchangeService') as typeof import('./exchangeService')
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          c_nonce: 'nonce',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch

  await acquireCredentialRecordWithProxy(
    {
      offerUri,
      issuer: 'http://192.100.10.46',
      credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
      issuerMetadata: {
        credential_issuer: 'http://192.100.10.46',
        token_endpoint: 'http://192.100.10.46/token',
        credential_endpoint: 'http://192.100.10.46/credential',
        credential_configurations_supported: {},
      },
      credentialConfigurations: [
        {
          id: 'ThaiNationalID',
          requestId: 'ThaiNationalID',
          format: 'dc+sd-jwt',
          rawConfiguration: { format: 'dc+sd-jwt', vct: 'idcard' } as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
        },
      ],
      preAuthorizedCode: 'mock-preauth-code',
      supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      version: 10015,
    },
    {
      dependencies: {
        signProof: async () => 'proof.jwt',
        requestCredential: async () => unsignedJwt({ vc: { type: ['VerifiableCredential', 'ThaiNationalID'] } }),
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    },
  )

  expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4000/dev-issuer-proxy/token', expect.objectContaining({
    method: 'POST',
  }))
  const requestInit = fetchMock.mock.calls[0][1]
  expect(String(requestInit?.body)).toContain('pre-authorized_code=mock-preauth-code')
})

test('token request sends tx_code only and never user_pin', async () => {
  jest.resetModules()
  process.env = {
    ...process.env,
    EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET: 'http://192.100.10.46',
    EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL: 'http://127.0.0.1:4000/dev-issuer-proxy',
  }
  const { acquireCredentialRecord: acquire } = require('./exchangeService') as typeof import('./exchangeService')
  const txCodeFetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new Response(
        JSON.stringify({ access_token: 'access-token', c_nonce: 'nonce' }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  )
  globalThis.fetch = txCodeFetchMock as unknown as typeof fetch

  await acquire(
    {
      offerUri,
      issuer: 'http://192.100.10.46',
      credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
      issuerMetadata: {
        credential_issuer: 'http://192.100.10.46',
        token_endpoint: 'http://192.100.10.46/token',
        credential_endpoint: 'http://192.100.10.46/credential',
        credential_configurations_supported: {},
      },
      credentialConfigurations: [
        {
          id: 'ThaiNationalID',
          requestId: 'ThaiNationalID',
          format: 'dc+sd-jwt',
          rawConfiguration: { format: 'dc+sd-jwt', vct: 'idcard' } as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
        },
      ],
      preAuthorizedCode: 'mock-preauth-code',
      supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      version: 10015,
    },
    {
      tx_code: '123456',
      dependencies: {
        signProof: async () => 'proof.jwt',
        requestCredential: async () => unsignedJwt({ vc: { type: ['VerifiableCredential', 'ThaiNationalID'] } }),
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    },
  )

  const requestInit = txCodeFetchMock.mock.calls[0][1]
  const requestBody = String(requestInit?.body)
  expect(requestBody).toContain('tx_code=123456')
  expect(requestBody).not.toContain('user_pin=123456')
})

async function acquisitionOrchestrationContract(): Promise<void> {
  const resolved = await contract()

  await claimCredential(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async ({ resolvedOffer, tx_code }) => {
        if (resolvedOffer !== resolved || tx_code !== '123456') {
          throw new Error('access token input mismatch')
        }

        return { accessToken: 'access-token', cNonce: 'nonce' }
      },
      signProof: async (cNonce, issuerUrl) => {
        if (cNonce !== 'nonce' || issuerUrl !== resolved.issuer) {
          throw new Error('proof input mismatch')
        }

        return 'proof.jwt'
      },
      requestCredential: async ({ resolvedOffer, accessToken, proof }) => {
        if (resolvedOffer !== resolved || accessToken !== 'access-token' || proof !== 'proof.jwt') {
          throw new Error('credential request input mismatch')
        }

        return unsignedJwt({
          jti: 'orchestration-vc',
          vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        })
      },
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })
}

void acquisitionOrchestrationContract()

async function claimCredentialContract(): Promise<VerifiableCredentialRecord> {
  const resolved = await contract()
  const writes = new Map<string, string>()
  const vc = unsignedJwt({
    jti: 'vc-123',
    iat: 1760000000,
    exp: 1760003600,
    vc: {
      type: ['VerifiableCredential', 'ThaiNationalID'],
      credentialSubject: { givenName: 'Ada' },
    },
  })

  const record = await claimCredential(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async ({ resolvedOffer, tx_code }) => {
        if (resolvedOffer !== resolved || tx_code !== '123456') {
          throw new Error('access token input mismatch')
        }

        return { accessToken: 'access-token', cNonce: 'nonce-1' }
      },
      signProof: async (nonce, audience) => {
        if (nonce !== 'nonce-1') throw new Error('nonce not passed')
        if (audience !== 'https://issuer.example.com') throw new Error('audience not passed')
        return 'proof.jwt'
      },
      requestCredential: async ({ resolvedOffer, accessToken, proof }) => {
        if (resolvedOffer !== resolved || accessToken !== 'access-token' || proof !== 'proof.jwt') {
          throw new Error('credential request input mismatch')
        }

        return vc
      },
      getCredentialStorage: () => ({
        getString: (key: string) => writes.get(key),
        set: (key: string, value: string) => {
          writes.set(key, value)
        },
      }),
    },
  })

  if (record.id !== 'vc-123') throw new Error('record id mismatch')
  if (record.type !== 'ThaiNationalID') throw new Error('record type mismatch')
  if (record.rawVc !== vc) throw new Error('raw VC mismatch')
  if (record.issuedAt !== '2025-10-09T08:53:20.000Z') throw new Error('issuedAt mismatch')
  if (record.expiresAt !== '2025-10-09T09:53:20.000Z') throw new Error('expiresAt mismatch')
  if (!writes.has('credential:vc-123')) throw new Error('record not stored')
  if (writes.get('credential:index') !== JSON.stringify(['vc-123'])) throw new Error('index not stored')

  return record
}

void claimCredentialContract()

async function acquireCredentialRecordDoesNotStoreContract(): Promise<VerifiableCredentialRecord> {
  const resolved = await contract()
  const writes = new Map<string, string>()
  const vc = unsignedJwt({
    jti: 'preview-vc-1',
    iat: 1760000000,
    vc: {
      type: ['VerifiableCredential', 'ThaiNationalID'],
      credentialSubject: { givenName: 'Grace', nationalId: '1-1009-000XX-XX-XX' },
    },
  })

  const record = await acquireCredentialRecord(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
      signProof: async () => 'proof.jwt',
      requestCredential: async () => vc,
      getCredentialStorage: () => ({
        getString: (key: string) => writes.get(key),
        set: (key: string, value: string) => {
          writes.set(key, value)
        },
      }),
    },
  })

  if (record.id !== 'preview-vc-1') throw new Error('preview record id mismatch')
  if (record.claims.givenName !== 'Grace') throw new Error('preview claims not decoded')
  if (writes.size !== 0) throw new Error('acquire should not write storage before confirmation')

  saveCredentialRecord(record, {
    getCredentialStorage: () => ({
      getString: (key: string) => writes.get(key),
      set: (key: string, value: string) => {
        writes.set(key, value)
      },
    }),
  })

  if (!writes.has('credential:preview-vc-1')) throw new Error('confirmed preview record not stored')

  return record
}

void acquireCredentialRecordDoesNotStoreContract()

test('EdDSA issuance rejects returned SD-JWT credentials without matching holder binding', async () => {
  const holderJwk = { kty: 'OKP', crv: 'Ed25519', x: 'wallet-ed25519-key' }
  const holderKid = 'did:key:z6Mkwallet#z6Mkwallet'
  const resolved = await resolveOffer(transcriptOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        'TranscriptCredential_dc+sd-jwt': {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
          claims: [],
        },
      },
    }),
  })

  await expect(
    acquireCredentialRecord(resolved, {
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
        signProof: async () => proofJwtWithJwk(holderJwk, holderKid),
        requestCredential: async () => `${unsignedJwt({
          jti: 'transcript-1',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
          cnf: { kid: holderKid.split('#')[0] },
        })}~`,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    }),
  ).resolves.toMatchObject({ id: 'transcript-1' })

  await expect(
    acquireCredentialRecord(resolved, {
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
        signProof: async () => proofJwtWithJwk(holderJwk, holderKid),
        requestCredential: async () => `${unsignedJwt({
          jti: 'transcript-1',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
        })}~`,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    }),
  ).rejects.toThrow('CredentialHolderBindingMissing')

  await expect(
    acquireCredentialRecord(resolved, {
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
        signProof: async () => proofJwtWithJwk(holderJwk, holderKid),
        requestCredential: async () => `${unsignedJwt({
          jti: 'transcript-1',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
          cnf: { kid: 'did:key:zDnaeold-p256-holder' },
        })}~`,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    }),
  ).rejects.toThrow('CredentialHolderBindingMismatch')
})

test('EdDSA issuance rejects returned credentials signed with non-EdDSA alg', async () => {
  const resolved = await resolveOffer(transcriptOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        'TranscriptCredential_dc+sd-jwt': {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
          claims: [],
        },
      },
    }),
  })

  await expect(
    acquireCredentialRecord(resolved, {
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
        signProof: async () => proofJwtWithJwk({ kty: 'OKP', crv: 'Ed25519', x: 'wallet-ed25519-key' }),
        requestCredential: async () => `${unsignedJwt({
          jti: 'transcript-1',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
          cnf: { kid: 'did:key:z6Mkwallet' },
        }, 'ES256')}~`,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    }),
  ).rejects.toThrow('CredentialSignatureAlgUnsupported')
})

test('saveCredentialRecord clears a stale local lifecycle status for a reissued credential', () => {
  const writes = new Map<string, string>([
    [
      'credential:lifecycle:transcript-1',
      JSON.stringify({
        credentialId: 'transcript-1',
        action: 'Revoke',
        status: 'revoked',
        occurredAt: '2026-06-08T10:00:00.000Z',
      }),
    ],
  ])
  const storage = {
    getString: jest.fn((key: string) => writes.get(key)),
    set: jest.fn((key: string, value: string) => {
      writes.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      writes.delete(key)
      return true
    }),
  }

  saveCredentialRecord(
    {
      id: 'transcript-1',
      type: 'BangkokUniversityTranscript',
      rawVc: 'new.header.payload',
      claims: {},
      issuedAt: '2026-06-08T11:00:00.000Z',
    },
    {
      getCredentialStorage: () => storage,
    },
  )

  expect(storage.remove).toHaveBeenCalledWith('credential:lifecycle:transcript-1')
  expect(writes.has('credential:lifecycle:transcript-1')).toBe(false)
})

test('saveCredentialRecord clears a stale issuer suspension status for a reissued credential', () => {
  const writes = new Map<string, string>([
    [
      'credential:suspension:transcript-1',
      JSON.stringify({
        credentialId: 'transcript-1',
        suspendedAt: '2026-06-25T10:00:00.000Z',
        updatedAt: '2026-06-25T10:00:00.000Z',
      }),
    ],
  ])
  const storage = {
    getString: jest.fn((key: string) => writes.get(key)),
    set: jest.fn((key: string, value: string) => {
      writes.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      writes.delete(key)
      return true
    }),
  }

  saveCredentialRecord(
    {
      id: 'transcript-1',
      type: 'BangkokUniversityTranscript',
      rawVc: 'new.header.payload',
      claims: {},
      issuedAt: '2026-06-25T11:00:00.000Z',
    },
    {
      getCredentialStorage: () => storage,
    },
  )

  expect(storage.remove).toHaveBeenCalledWith('credential:suspension:transcript-1')
  expect(writes.has('credential:suspension:transcript-1')).toBe(false)
})

test('saveCredentialRecord replaces older local records of the same credential type', () => {
  const oldRecord: VerifiableCredentialRecord = {
    id: 'old-transcript',
    type: 'BangkokUniversityTranscript',
    rawVc: unsignedJwt({
      cnf: {
        kid: 'did:key:zHolder#zHolder',
      },
    }),
    claims: {},
    issuedAt: '2026-06-08T10:00:00.000Z',
  }
  const thaiIdRecord: VerifiableCredentialRecord = {
    id: 'thai-id-1',
    type: 'ThaiNationalID',
    rawVc: 'thai.header.payload',
    claims: {},
    issuedAt: '2026-06-08T09:00:00.000Z',
  }
  const writes = new Map<string, string>([
    ['credential:index', JSON.stringify(['old-transcript', 'thai-id-1'])],
    ['credential:old-transcript', JSON.stringify(oldRecord)],
    ['credential:thai-id-1', JSON.stringify(thaiIdRecord)],
    [
      'credential:lifecycle:old-transcript',
      JSON.stringify({
        credentialId: 'old-transcript',
        action: 'Revoke',
        status: 'revoked',
        occurredAt: '2026-06-08T10:30:00.000Z',
      }),
    ],
  ])
  const storage = {
    getString: jest.fn((key: string) => writes.get(key)),
    set: jest.fn((key: string, value: string) => {
      writes.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      writes.delete(key)
      return true
    }),
  }

  saveCredentialRecord(
    {
      id: 'new-transcript',
      type: 'BangkokUniversityTranscript',
      rawVc: unsignedJwt({
        cnf: {
          kid: 'did:key:zHolder#zHolder',
        },
      }),
      claims: {},
      issuedAt: '2026-06-08T11:00:00.000Z',
    },
    {
      getCredentialStorage: () => storage,
    },
  )

  expect(JSON.parse(writes.get('credential:index') ?? '[]')).toEqual(['thai-id-1', 'new-transcript'])
  expect(writes.has('credential:old-transcript')).toBe(false)
  expect(writes.has('credential:lifecycle:old-transcript')).toBe(false)
  expect(writes.has('credential:thai-id-1')).toBe(true)
  expect(writes.has('credential:new-transcript')).toBe(true)
})

async function transcriptSdJwtContract(): Promise<VerifiableCredentialRecord> {
  const resolved = await resolveOffer(transcriptOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        'TranscriptCredential_dc+sd-jwt': {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/TranscriptCredential',
          claims: [],
          display: [{ name: 'Academic Transcript', locale: 'en' }],
        },
      },
    }),
  })
  const writes = new Map<string, string>()
  const credential = [
    unsignedJwt({
      jti: 'transcript-1',
      vct: 'https://issuer.example.com/vct/TranscriptCredential',
      iat: 1760000000,
      exp: 1760003600,
      _sd_alg: 'sha-256',
    }),
    disclosure('givenName', 'Ada'),
    disclosure('familyName', 'Lovelace'),
    disclosure('studentId', 'BU-123'),
    disclosure('degree', 'Computer Science'),
    disclosure('faculty', 'School of Information Technology'),
    disclosure('gpa', '3.91'),
    '',
  ].join('~')

  const record = await claimCredential(resolved, {
    dependencies: {
      acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
      signProof: async () => 'proof.jwt',
      requestCredential: async () => credential,
      getCredentialStorage: () => ({
        getString: (key: string) => writes.get(key),
        set: (key: string, value: string) => {
          writes.set(key, value)
        },
      }),
    },
  })

  if (record.id !== 'transcript-1') throw new Error('transcript id mismatch')
  if (record.type !== 'BangkokUniversityTranscript') throw new Error('transcript type mismatch')
  if (record.rawVc !== credential) throw new Error('transcript raw credential mismatch')
  if (record.claims.studentId !== 'BU-123') throw new Error('studentId disclosure missing')
  if (record.claims.gpa !== '3.91') throw new Error('gpa disclosure missing')
  if (!writes.has('credential:transcript-1')) throw new Error('transcript record not stored')

  return record
}

void transcriptSdJwtContract()

test('resolveOffer maps format-suffixed IdCard configuration ids to idcard metadata', async () => {
  const resolved = await resolveOffer(idCardSdJwtOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        idcard: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/idcard',
          claims: [],
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
    }),
  })

  expect(resolved.credentialConfigurations[0]).toEqual(
    expect.objectContaining({
      id: 'IdCard_dc+sd-jwt',
      requestId: 'idcard',
      format: 'dc+sd-jwt',
      display: expect.objectContaining({ name: 'Thai National ID' }),
    }),
  )
})

test('resolveOffer maps format-suffixed IdCard offers by metadata vct when configuration keys differ', async () => {
  const resolved = await resolveOffer(idCardSdJwtOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiPidCredential: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/IdCard',
          claims: [],
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
    }),
  })

  expect(resolved.credentialConfigurations[0]).toEqual(
    expect.objectContaining({
      id: 'IdCard_dc+sd-jwt',
      requestId: 'ThaiPidCredential',
      format: 'dc+sd-jwt',
      display: expect.objectContaining({ name: 'Thai National ID' }),
    }),
  )
})

test('resolveOffer maps IDCard offer to IDCardCredential metadata key', async () => {
  const resolved = await resolveOffer(idCardSdJwtOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        'IDCardCredential_dc+sd-jwt': {
          vct: 'http://192.100.10.46/credentials/IDCard',
          format: 'dc+sd-jwt',
          cryptographic_binding_methods_supported: ['did'],
          cryptographic_suites_supported: ['EdDSA', 'ES256', 'ES256K', 'RSA'],
          display: [{ name: 'IDCard', locale: 'en' }],
          claims: {
            id_number: {
              mandatory: true,
              sd: true,
              display: [{ name: 'ID Number' }],
            },
          } as never,
        },
      },
    }),
  })

  expect(resolved.credentialConfigurations[0]).toEqual(
    expect.objectContaining({
      id: 'IdCard_dc+sd-jwt',
      requestId: 'IDCardCredential_dc+sd-jwt',
      format: 'dc+sd-jwt',
      display: expect.objectContaining({ name: 'IDCard' }),
    }),
  )
})

test('resolveOffer maps uppercase IDCard offers to the only matching SD-JWT metadata entry', async () => {
  const resolved = await resolveOffer(uppercaseIdCardSdJwtOfferUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiPidCredential: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/person',
          claims: [],
        },
      },
    }),
  })

  expect(resolved.credentialConfigurations[0]).toEqual(
    expect.objectContaining({
      id: 'IDCard_dc+sd-jwt',
      requestId: 'ThaiPidCredential',
      format: 'dc+sd-jwt',
    }),
  )
})

async function unsupportedFlowContract(): Promise<void> {
  const resolved = await contract()
  const withoutPreAuth = { ...resolved, preAuthorizedCode: undefined }

  await expectErrorPrefix(
    () =>
      claimCredential(withoutPreAuth, {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => {
            throw new Error('should not acquire unsupported flow')
          },
          requestCredential: async () => 'vc.jwt',
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    'CredentialFlowUnsupported',
  )
}

void unsupportedFlowContract()

async function unsupportedFormatContract(): Promise<void> {
  const resolved = await contract()
  const unsupported = {
    ...resolved,
    credentialConfigurations: [
      {
        ...resolved.credentialConfigurations[0],
        format: 'mso_mdoc',
      },
    ],
  }

  await expectErrorPrefix(
    () =>
      claimCredential(unsupported, {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => {
            throw new Error('should not acquire unsupported format')
          },
          requestCredential: async () => 'vc.jwt',
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    'CredentialFormatUnsupported',
  )
}

void unsupportedFormatContract()

const backendRecord: VerifiableCredentialRecord = {
  id: 'vc-123',
  type: 'ThaiNationalID',
  rawVc: 'signed.vc.jwt',
  claims: {},
  issuedAt: '2025-10-09T08:53:20.000Z',
}

async function backendSyncContract(): Promise<void> {
  const result = await syncCredentialToBackend(backendRecord, {
    walletId: 'wallet-1',
    sessionToken: 'session-token',
    dependencies: {
      getHolderDid: () => 'did:key:zHolder',
      importCredential: async (wallet, data, options) => {
        if (wallet !== 'wallet-1') throw new Error('wallet id mismatch')
        if (data.jwt !== 'signed.vc.jwt') throw new Error('jwt mismatch')
        if (data.associated_did !== 'did:key:zHolder') throw new Error('associated DID mismatch')

        const authorization = options?.headers instanceof Headers
          ? options.headers.get('Authorization')
          : (options?.headers as Record<string, string> | undefined)?.Authorization

        if (authorization !== 'Bearer session-token') throw new Error('authorization mismatch')

        return { data: {}, status: 201, headers: new Headers() }
      },
    },
  })

  if (result.status !== 201) throw new Error('sync status mismatch')
}

void backendSyncContract()

async function backendSyncMissingWalletContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      syncCredentialToBackend(backendRecord, {
        walletId: '',
        sessionToken: 'session-token',
      }),
    'BackendSyncWalletMissing',
  )
}

void backendSyncMissingWalletContract()

async function backendSyncMissingSessionContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      syncCredentialToBackend(backendRecord, {
        walletId: 'wallet-1',
        sessionToken: '',
      }),
    'BackendSyncUnauthorized',
  )
}

void backendSyncMissingSessionContract()

async function backendSyncFailureContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      syncCredentialToBackend(backendRecord, {
        walletId: 'wallet-1',
        sessionToken: 'session-token',
        dependencies: {
          getHolderDid: () => 'did:key:zHolder',
          importCredential: async () => ({ data: undefined, status: 400, headers: new Headers() }),
        },
      }),
    'BackendSyncFailed: HTTP 400',
  )
}

void backendSyncFailureContract()

test('pre-authorized token exchange discovers token_endpoint via authorization_servers metadata', async () => {
  const resolved = await resolveOffer(offerUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      authorization_servers: ['https://as.example.com'],
      credential_configurations_supported: {
        ThaiNationalID: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/ThaiNationalID',
          credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        },
      },
    }),
  })

  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async (input) => {
    const url = String(input)

    if (url === 'https://as.example.com/.well-known/oauth-authorization-server') {
      return new Response(JSON.stringify({ token_endpoint: 'https://as.example.com/token' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url === 'https://as.example.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-token', c_nonce: 'nonce' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`unexpected fetch ${url}`)
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch

  await acquireCredentialRecord(resolved, {
    tx_code: '123456',
    dependencies: {
      signProof: async () => 'proof.jwt',
      requestCredential: async () => unsignedJwt({ vc: { type: ['VerifiableCredential', 'ThaiNationalID'] } }),
      getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
    },
  })

  expect(fetchMock).toHaveBeenCalledWith(
    'https://as.example.com/.well-known/oauth-authorization-server',
    expect.objectContaining({ headers: { Accept: 'application/json' } }),
  )
  expect(fetchMock).toHaveBeenCalledWith('https://as.example.com/token', expect.objectContaining({ method: 'POST' }))
})

test('acquireCredentialRecord retries once with a refreshed c_nonce on invalid_proof', async () => {
  const resolved = await contract()

  let requestCredentialCalls = 0
  const signedNonces: string[] = []

  await acquireCredentialRecord(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
      signProof: async (cNonce) => {
        signedNonces.push(cNonce)
        return `proof-${cNonce}.jwt`
      },
      requestCredential: async ({ proof }) => {
        requestCredentialCalls += 1

        if (requestCredentialCalls === 1) {
          throw new InvalidProofError('CredentialRequestFailed: invalid_proof', 'fresh-nonce')
        }

        if (proof !== 'proof-fresh-nonce.jwt') {
          throw new Error('expected retry proof signed with the refreshed c_nonce')
        }

        return unsignedJwt({ vc: { type: ['VerifiableCredential', 'ThaiNationalID'] } })
      },
      getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
    },
  })

  expect(requestCredentialCalls).toBe(2)
  expect(signedNonces).toEqual(['nonce', 'fresh-nonce'])
})

describe('readDeferredTransactionId', () => {
  test('returns transaction_id when present without credential', () => {
    expect(
      readDeferredTransactionId({
        successBody: { transaction_id: 'txn-abc' },
      }),
    ).toBe('txn-abc')
  })

  test('returns transaction_id from direct response body', () => {
    expect(
      readDeferredTransactionId({ transaction_id: 'txn-direct' }),
    ).toBe('txn-direct')
  })

  test('returns undefined when credential is present alongside transaction_id', () => {
    expect(
      readDeferredTransactionId({
        successBody: {
          transaction_id: 'txn-abc',
          credential: 'issuer.jwt.sd-jwt~disclosure~',
        },
      }),
    ).toBeUndefined()
  })

  test('returns undefined when no transaction_id', () => {
    expect(
      readDeferredTransactionId({
        successBody: { credential: 'issuer.jwt.sd-jwt~disclosure~' },
      }),
    ).toBeUndefined()
  })

  test('returns undefined for empty response', () => {
    expect(readDeferredTransactionId({})).toBeUndefined()
    expect(readDeferredTransactionId(undefined)).toBeUndefined()
  })
})

describe('acquireCredentialRecord deferred issuance', () => {
  test('throws DeferredIssuancePending when requestCredential throws it', async () => {
    const resolved = await contract()

    try {
      await acquireCredentialRecord(resolved, {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
          signProof: async () => 'proof.jwt',
          requestCredential: async ({ accessToken, proof, resolvedOffer: offer }) => {
            throw new DeferredIssuancePending(
              'txn-123',
              accessToken,
              'https://issuer.example.com/deferred',
              proof,
              offer,
              5,
            )
          },
          getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
        },
      })
      throw new Error('should have thrown DeferredIssuancePending')
    } catch (error) {
      expect(error).toBeInstanceOf(DeferredIssuancePending)
      const deferred = error as DeferredIssuancePending
      expect(deferred.transactionId).toBe('txn-123')
      expect(deferred.accessToken).toBe('access-token')
      expect(deferred.deferredEndpoint).toBe('https://issuer.example.com/deferred')
      expect(deferred.proof).toBe('proof.jwt')
      expect(deferred.interval).toBe(5)
      expect(deferred.resolvedOffer).toBe(resolved)
    }
  })
})

describe('pollDeferredCredential', () => {
  test('returns credential record when issuer responds with credential', async () => {
    const resolved = await contract()
    const vc = unsignedJwt({
      jti: 'deferred-vc-1',
      vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
      iat: 1760000000,
    })

    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(JSON.stringify({ credential: vc }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const record = await pollDeferredCredential({
      transactionId: 'txn-ready',
      accessToken: 'access-token',
      deferredEndpoint: 'https://issuer.example.com/deferred',
      proof: 'proof.jwt',
      resolvedOffer: resolved,
    })

    expect(record.id).toBe('deferred-vc-1')
    expect(record.type).toBe('ThaiNationalID')

    expect(fetchMock).toHaveBeenCalledWith('https://issuer.example.com/deferred', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction_id: 'txn-ready' }),
    })
  })

  test('throws DeferredIssuancePending on issuance_pending error with interval', async () => {
    const resolved = await contract()

    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({ error: 'issuance_pending', interval: 10 }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      await pollDeferredCredential({
        transactionId: 'txn-pending',
        accessToken: 'access-token',
        deferredEndpoint: 'https://issuer.example.com/deferred',
        proof: 'proof.jwt',
        resolvedOffer: resolved,
      })
      throw new Error('should have thrown DeferredIssuancePending')
    } catch (error) {
      expect(error).toBeInstanceOf(DeferredIssuancePending)
      const deferred = error as DeferredIssuancePending
      expect(deferred.transactionId).toBe('txn-pending')
      expect(deferred.interval).toBe(10)
      expect(deferred.proof).toBe('proof.jwt')
    }
  })

  test('throws DeferredIssuancePending when success response has new transaction_id', async () => {
    const resolved = await contract()

    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({ transaction_id: 'txn-renewed' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      await pollDeferredCredential({
        transactionId: 'txn-pending',
        accessToken: 'access-token',
        deferredEndpoint: 'https://issuer.example.com/deferred',
        proof: 'proof.jwt',
        resolvedOffer: resolved,
      })
      throw new Error('should have thrown DeferredIssuancePending')
    } catch (error) {
      expect(error).toBeInstanceOf(DeferredIssuancePending)
      const deferred = error as DeferredIssuancePending
      expect(deferred.transactionId).toBe('txn-renewed')
    }
  })

  test('throws hard error on invalid_transaction_id', async () => {
    const resolved = await contract()

    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({ error: 'invalid_transaction_id', error_description: 'Transaction not found' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(
      pollDeferredCredential({
        transactionId: 'txn-invalid',
        accessToken: 'access-token',
        deferredEndpoint: 'https://issuer.example.com/deferred',
        proof: 'proof.jwt',
        resolvedOffer: resolved,
      }),
    ).rejects.toThrow('DeferredCredentialFailed: HTTP 400: invalid_transaction_id - Transaction not found')
  })

  test('throws hard error on network failure', async () => {
    const resolved = await contract()

    globalThis.fetch = (() => {
      throw new Error('Network unreachable')
    }) as unknown as typeof fetch

    await expect(
      pollDeferredCredential({
        transactionId: 'txn-net-fail',
        accessToken: 'access-token',
        deferredEndpoint: 'https://issuer.example.com/deferred',
        proof: 'proof.jwt',
        resolvedOffer: resolved,
      }),
    ).rejects.toThrow('DeferredCredentialFetchFailed')
  })
})
