import { retrievePreAuthorizedTokenViaOid4vc } from './retrieveViaOid4vc'
import type { Oid4vcVciAdapterContext } from './types'
import { __resetHardwareEcdsaSignerCacheForTests } from '@/src/services/crypto/hardwareEcdsaSigner'

const mockRetrievePreAuthorizedCodeAccessTokenFromOffer = jest.fn()
const mockCreateOid4vcVciClient = jest.fn()

jest.mock('./createOid4vcVciClient', () => ({
  createOid4vcVciClient: (options?: unknown) => mockCreateOid4vcVciClient(options),
}))

jest.mock('@/src/services/crypto/walletCryptoActivation', () => ({
  readCachedWalletAttestations: jest.fn(() => ({})),
}))

function contextWithAuthMethods(methods?: string[]): Oid4vcVciAdapterContext {
  return {
    credentialOfferObject: {
      credential_issuer: 'https://issuer.example.com',
      credential_configuration_ids: ['test-config'],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': 'code',
        },
      },
    },
    issuerMetadataResult: {
      credentialIssuer: { credential_issuer: 'https://issuer.example.com' },
      authorizationServers: [
        {
          issuer: 'https://issuer.example.com',
          token_endpoint: 'https://issuer.example.com/token',
          ...(methods ? { token_endpoint_auth_methods_supported: methods } : {}),
        },
      ],
      knownCredentialConfigurations: {},
      originalDraftVersion: 1,
    },
  } as unknown as Oid4vcVciAdapterContext
}

describe('retrievePreAuthorizedTokenViaOid4vc client authentication', () => {
  beforeEach(() => {
    __resetHardwareEcdsaSignerCacheForTests()
    mockRetrievePreAuthorizedCodeAccessTokenFromOffer.mockReset()
    mockCreateOid4vcVciClient.mockReset()
    mockCreateOid4vcVciClient.mockImplementation(() => ({
      retrievePreAuthorizedCodeAccessTokenFromOffer: (...args: unknown[]) =>
        mockRetrievePreAuthorizedCodeAccessTokenFromOffer(...args),
    }))
    mockRetrievePreAuthorizedCodeAccessTokenFromOffer.mockResolvedValue({
      accessTokenResponse: { access_token: 'access-token', c_nonce: 'nonce' },
    })
  })

  test('keeps anonymous client auth when AS metadata omits attestation', async () => {
    await retrievePreAuthorizedTokenViaOid4vc({
      oid4vcContext: contextWithAuthMethods(['none']),
    })
    expect(mockCreateOid4vcVciClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientAuthentication: expect.any(Function),
      }),
    )
    expect(mockRetrievePreAuthorizedCodeAccessTokenFromOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalRequestPayload: { resource: 'https://issuer.example.com' },
      }),
    )
  })

  test('fails with WalletAttestationRequired when AS requires attestation and k_attest is missing', async () => {
    await expect(
      retrievePreAuthorizedTokenViaOid4vc({
        oid4vcContext: contextWithAuthMethods(['attest_jwt_client_auth']),
      }),
    ).rejects.toThrow('WalletAttestationRequired: this issuer requires wallet attestation')
    expect(mockCreateOid4vcVciClient).not.toHaveBeenCalled()
  })

  test('sends the offer credential_issuer as resource when metadata issuer is the origin', async () => {
    const sessionIssuer =
      'https://issuer.example.com/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant/session'
    const context = {
      credentialOfferObject: {
        credential_issuer: sessionIssuer,
        credential_configuration_ids: ['test-config'],
        grants: {
          'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
            'pre-authorized_code': 'code',
          },
        },
      },
      issuerMetadataResult: {
        credentialIssuer: { credential_issuer: 'https://issuer.example.com' },
        authorizationServers: [
          {
            issuer: 'https://issuer.example.com',
            token_endpoint: 'https://issuer.example.com/token',
            token_endpoint_auth_methods_supported: ['none'],
          },
        ],
        knownCredentialConfigurations: {},
        originalDraftVersion: 1,
      },
    } as unknown as Oid4vcVciAdapterContext

    await retrievePreAuthorizedTokenViaOid4vc({
      oid4vcContext: context,
      txCode: '123456',
    })

    expect(mockRetrievePreAuthorizedCodeAccessTokenFromOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        txCode: '123456',
        additionalRequestPayload: { resource: sessionIssuer },
      }),
    )
  })

  test('requests c_nonce from nonce_endpoint when the token response omits it', async () => {
    mockRetrievePreAuthorizedCodeAccessTokenFromOffer.mockResolvedValue({
      accessTokenResponse: { access_token: 'access-token', token_type: 'Bearer' },
    })
    const mockRequestNonce = jest.fn(async () => ({ c_nonce: 'nonce-from-endpoint' }))
    mockCreateOid4vcVciClient.mockImplementation(() => ({
      retrievePreAuthorizedCodeAccessTokenFromOffer: (...args: unknown[]) =>
        mockRetrievePreAuthorizedCodeAccessTokenFromOffer(...args),
      requestNonce: (...args: unknown[]) => mockRequestNonce(...args),
    }))

    const result = await retrievePreAuthorizedTokenViaOid4vc({
      oid4vcContext: contextWithAuthMethods(['none']),
    })

    expect(result).toEqual(
      expect.objectContaining({
        access_token: 'access-token',
        c_nonce: 'nonce-from-endpoint',
      }),
    )
    expect(mockRequestNonce).toHaveBeenCalledWith({
      issuerMetadata: contextWithAuthMethods(['none']).issuerMetadataResult,
    })
  })

  test('does not call nonce_endpoint when the token response already has c_nonce', async () => {
    const mockRequestNonce = jest.fn()
    mockCreateOid4vcVciClient.mockImplementation(() => ({
      retrievePreAuthorizedCodeAccessTokenFromOffer: (...args: unknown[]) =>
        mockRetrievePreAuthorizedCodeAccessTokenFromOffer(...args),
      requestNonce: (...args: unknown[]) => mockRequestNonce(...args),
    }))

    const result = await retrievePreAuthorizedTokenViaOid4vc({
      oid4vcContext: contextWithAuthMethods(['none']),
    })

    expect(result.c_nonce).toBe('nonce')
    expect(mockRequestNonce).not.toHaveBeenCalled()
  })
})
