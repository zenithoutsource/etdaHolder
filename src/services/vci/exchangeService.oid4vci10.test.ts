/* eslint-disable import/first */

const createCredentialRequestMock = jest.fn()
const acquireCredentialsUsingRequestMock = jest.fn()
const acquireAccessTokenMock = jest.fn()
const mockWithCredentialEndpoint = jest.fn()
const mockWithToken = jest.fn()
const mockBuild = jest.fn()

jest.mock('@sphereon/oid4vci-client', () => ({
  CredentialOfferClient: {
    fromURI: jest.fn(),
  },
  CredentialRequestClientBuilder: {
    fromCredentialIssuer: jest.fn(() => ({
      withCredentialEndpoint: mockWithCredentialEndpoint,
    })),
  },
  OpenID4VCIClient: {
    fromURI: jest.fn(),
  },
}))

import { acquireCredentialRecord, type ResolvedCredentialOffer } from './exchangeService'

const { CredentialRequestClientBuilder } = jest.requireMock('@sphereon/oid4vci-client') as {
  CredentialRequestClientBuilder: {
    fromCredentialIssuer: jest.Mock
  }
}

const originalFetch = global.fetch

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`
}

describe('OID4VCI 1.0 credential request', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-token',
            c_nonce: 'nonce',
            authorization_details: [
              {
                type: 'openid_credential',
                credential_configuration_id: 'idcard',
                credential_identifiers: ['issuer-credential-id-1'],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    ) as typeof fetch

    createCredentialRequestMock.mockResolvedValue({
      credential_configuration_id: 'idcard',
      proof: { proof_type: 'jwt', jwt: 'proof.jwt' },
    })
    acquireCredentialsUsingRequestMock.mockResolvedValue({
      successBody: {
        credential: unsignedJwt({
          jti: 'idcard-1',
          vct: 'https://issuer.example.com/vct/idcard',
          iat: 1760000000,
          givenName: 'Ada',
        }),
      },
    })
    mockBuild.mockReturnValue({
      createCredentialRequest: createCredentialRequestMock,
      acquireCredentialsUsingRequest: acquireCredentialsUsingRequestMock,
    })
    mockWithToken.mockReturnValue({ build: mockBuild })
    mockWithCredentialEndpoint.mockReturnValue({ withToken: mockWithToken })
    acquireAccessTokenMock.mockResolvedValue({})
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  test('sends credential_configuration_id for a format-suffixed IdCard offer', async () => {
    const resolvedOffer = makeIdCardResolvedOffer()

    const record = await acquireCredentialRecord(resolvedOffer, {
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
        signProof: async () => 'proof.jwt',
      },
    })

    expect(CredentialRequestClientBuilder.fromCredentialIssuer).toHaveBeenCalledWith({
      credentialIssuer: resolvedOffer.issuer,
      version: 10015,
      credentialConfigurationId: 'idcard',
    })
    expect(createCredentialRequestMock).toHaveBeenCalledWith({
      proofInput: { proof_type: 'jwt', jwt: 'proof.jwt' },
      format: 'dc+sd-jwt',
      credentialConfigurationId: 'idcard',
      version: 10015,
    })
    expect(acquireCredentialsUsingRequestMock).toHaveBeenCalledWith(
      {
        credential_configuration_id: 'idcard',
        proof: { proof_type: 'jwt', jwt: 'proof.jwt' },
      },
      'dc+sd-jwt',
    )
    expect(record.type).toBe('ThaiNationalID')
  })

  test('uses token-issued credential_identifier when the issuer returns one', async () => {
    createCredentialRequestMock.mockResolvedValue({
      credential_identifier: 'issuer-credential-id-1',
      proof: { proof_type: 'jwt', jwt: 'proof.jwt' },
    })
    const resolvedOffer = makeIdCardResolvedOffer()

    await acquireCredentialRecord(resolvedOffer, {
      dependencies: {
        acquireAccessToken: async () => ({
          accessToken: 'access-token',
          cNonce: 'nonce',
          credentialIdentifier: 'issuer-credential-id-1',
        }),
        signProof: async () => 'proof.jwt',
      },
    })

    expect(CredentialRequestClientBuilder.fromCredentialIssuer).toHaveBeenCalledWith({
      credentialIssuer: resolvedOffer.issuer,
      version: 10015,
      credentialIdentifier: 'issuer-credential-id-1',
    })
    expect(createCredentialRequestMock).toHaveBeenCalledWith({
      proofInput: { proof_type: 'jwt', jwt: 'proof.jwt' },
      format: 'dc+sd-jwt',
      credentialIdentifier: 'issuer-credential-id-1',
      version: 10015,
    })
    expect(acquireCredentialsUsingRequestMock).toHaveBeenCalledWith(
      {
        credential_identifier: 'issuer-credential-id-1',
        proof: { proof_type: 'jwt', jwt: 'proof.jwt' },
      },
      'dc+sd-jwt',
    )
  })

  test('extracts credential_identifier from the default token response path', async () => {
    createCredentialRequestMock.mockResolvedValue({
      credential_identifier: 'issuer-credential-id-1',
      proof: { proof_type: 'jwt', jwt: 'proof.jwt' },
    })
    const resolvedOffer = makeIdCardResolvedOffer()

    await acquireCredentialRecord(resolvedOffer, {
      dependencies: {
        signProof: async () => 'proof.jwt',
      },
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://issuer.example.com/token',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(createCredentialRequestMock).toHaveBeenCalledWith({
      proofInput: { proof_type: 'jwt', jwt: 'proof.jwt' },
      format: 'dc+sd-jwt',
      credentialIdentifier: 'issuer-credential-id-1',
      version: 10015,
    })
  })

  test('surfaces issuer credential endpoint error body', async () => {
    acquireCredentialsUsingRequestMock.mockResolvedValue({
      errorBody: {
        error: 'invalid_proof',
        error_description: 'proof JWT aud is invalid',
      },
    })

    await expect(
      acquireCredentialRecord(makeIdCardResolvedOffer(), {
        dependencies: {
          acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
          signProof: async () => 'proof.jwt',
        },
      }),
    ).rejects.toThrow('CredentialRequestFailed: invalid_proof - proof JWT aud is invalid')
  })

  test('surfaces non-standard issuer credential endpoint error body', async () => {
    acquireCredentialsUsingRequestMock.mockResolvedValue({
      errorBody: {
        message: 'credential_definition not found',
      },
      origResponse: {
        status: 400,
      },
    })

    await expect(
      acquireCredentialRecord(makeIdCardResolvedOffer(), {
        dependencies: {
          acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce' }),
          signProof: async () => 'proof.jwt',
        },
      }),
    ).rejects.toThrow('CredentialRequestFailed: HTTP 400: unknown_error {"message":"credential_definition not found"}')
  })
})

function makeIdCardResolvedOffer(): ResolvedCredentialOffer {
  return {
    offerUri: 'openid-credential-offer://mock',
    issuer: 'https://issuer.example.com',
    credentialOffer: {
      credential_offer: {
        credential_issuer: 'https://issuer.example.com',
        credential_configuration_ids: ['IdCard_dc+sd-jwt'],
      },
      supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      version: 10015,
    } as unknown as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        idcard: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/idcard',
          claims: [],
        },
      },
    },
    credentialConfigurations: [
      {
        id: 'IdCard_dc+sd-jwt',
        requestId: 'idcard',
        format: 'dc+sd-jwt',
        rawConfiguration: {
          format: 'dc+sd-jwt',
          vct: 'https://issuer.example.com/vct/idcard',
          claims: [],
        },
      },
    ],
    preAuthorizedCode: 'preauth-code',
    supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    version: 10015,
  }
}
