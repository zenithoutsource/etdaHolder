import { Openid4vciRetrieveCredentialsError } from '@openid4vc/openid4vci'

import { InvalidProofError } from '../invalidProofError'
import { retrieveCredentialViaOid4vc } from './retrieveViaOid4vc'
import type { Oid4vcVciAdapterContext } from './types'

const mockRetrieveCredentials = jest.fn()
const mockRequestNonce = jest.fn()

jest.mock('./createOid4vcVciClient', () => ({
  createOid4vcVciClient: () => ({
    retrieveCredentials: (...args: unknown[]) => mockRetrieveCredentials(...args),
    requestNonce: (...args: unknown[]) => mockRequestNonce(...args),
  }),
}))

const oid4vcContext = {
  credentialOfferObject: {
    credential_issuer: 'https://issuer.example.com',
    credential_configuration_ids: ['test-config'],
    grants: {
      authorization_code: {},
    },
  },
  issuerMetadataResult: {
    credentialIssuer: { credential_issuer: 'https://issuer.example.com' },
    authorizationServers: [],
    knownCredentialConfigurations: {},
    originalDraftVersion: 1,
  },
} as unknown as Oid4vcVciAdapterContext

describe('retrieveCredentialViaOid4vc', () => {
  beforeEach(() => {
    mockRetrieveCredentials.mockReset()
    mockRequestNonce.mockReset()
  })

  test('passes OID4VCI 1.0 proofs.jwt instead of legacy proof object', async () => {
    mockRetrieveCredentials.mockResolvedValue({ credential: 'vc.jwt' })

    await retrieveCredentialViaOid4vc({
      oid4vcContext,
      accessToken: 'access-token',
      proofJwt: 'proof.jwt',
      credentialConfigurationId: 'test-config',
    })

    expect(mockRetrieveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        proofs: { jwt: ['proof.jwt'] },
      }),
    )
    expect(mockRetrieveCredentials.mock.calls[0]?.[0]).not.toHaveProperty('proof')
  })

  test('maps invalid_proof credential errors to InvalidProofError with c_nonce', async () => {
    mockRetrieveCredentials.mockRejectedValue(
      new Openid4vciRetrieveCredentialsError('invalid proof', {
        credentialErrorResponseResult: {
          success: true,
          data: {
            error: 'invalid_proof',
            error_description: 'proof JWT is invalid',
            c_nonce: 'fresh-nonce',
          },
        },
      } as never, 'invalid proof'),
    )

    await expect(
      retrieveCredentialViaOid4vc({
        oid4vcContext,
        accessToken: 'access-token',
        proofJwt: 'proof.jwt',
        credentialConfigurationId: 'test-config',
      }),
    ).rejects.toMatchObject({
      name: 'InvalidProofError',
      cNonce: 'fresh-nonce',
      message: 'CredentialRequestFailed: invalid_proof - proof JWT is invalid',
    })
  })

  test('requests a fresh nonce when invalid_proof omits c_nonce', async () => {
    mockRetrieveCredentials.mockRejectedValue(
      new Openid4vciRetrieveCredentialsError('invalid proof', {
        credentialErrorResponseResult: {
          success: true,
          data: {
            error: 'invalid_proof',
            error_description: 'proof JWT is invalid',
          },
        },
      } as never, 'invalid proof'),
    )
    mockRequestNonce.mockResolvedValue({ c_nonce: 'requested-nonce', c_nonce_expires_in: 300 })

    await expect(
      retrieveCredentialViaOid4vc({
        oid4vcContext,
        accessToken: 'access-token',
        proofJwt: 'proof.jwt',
        credentialConfigurationId: 'test-config',
      }),
    ).rejects.toMatchObject({
      name: 'InvalidProofError',
      cNonce: 'requested-nonce',
      message: 'CredentialRequestFailed: invalid_proof - proof JWT is invalid',
    })

    expect(mockRequestNonce).toHaveBeenCalledWith({
      issuerMetadata: oid4vcContext.issuerMetadataResult,
    })
  })

  test('keeps generic credential endpoint failures as CredentialRequestFailed', async () => {
    mockRetrieveCredentials.mockRejectedValue(
      new Openid4vciRetrieveCredentialsError('server error', {
        credentialErrorResponseResult: {
          success: true,
          data: {
            error: 'invalid_request',
            error_description: 'bad request',
          },
        },
      } as never, 'server error'),
    )

    await expect(
      retrieveCredentialViaOid4vc({
        oid4vcContext,
        accessToken: 'access-token',
        proofJwt: 'proof.jwt',
        credentialConfigurationId: 'test-config',
      }),
    ).rejects.toThrow('CredentialRequestFailed: invalid_request - bad request')
  })
})
