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

  test('injects an offered configuration id missing from origin metadata before retrieveCredentials', async () => {
    mockRetrieveCredentials.mockResolvedValue({ credential: 'vc.jwt' })
    const offeredId = 'urn:tonyhere:demo:pid-age:1'
    const originConfig = {
      format: 'dc+sd-jwt',
      vct: 'https://issuer.example.com/vct/ThaiNationalID',
    }
    const context = {
      ...oid4vcContext,
      credentialOfferObject: {
        ...oid4vcContext.credentialOfferObject,
        credential_configuration_ids: [offeredId],
      },
      issuerMetadataResult: {
        ...oid4vcContext.issuerMetadataResult,
        credentialIssuer: {
          credential_issuer: 'https://issuer.example.com',
          credential_endpoint: 'https://issuer.example.com/credential',
          credential_configurations_supported: {
            ThaiNationalID: originConfig,
          },
        },
        knownCredentialConfigurations: {
          ThaiNationalID: originConfig,
        },
      },
    } as unknown as Oid4vcVciAdapterContext

    await retrieveCredentialViaOid4vc({
      oid4vcContext: context,
      accessToken: 'access-token',
      proofJwt: 'proof.jwt',
      credentialConfigurationId: offeredId,
    })

    const issuerMetadata = mockRetrieveCredentials.mock.calls[0]?.[0]?.issuerMetadata as {
      credentialIssuer: { credential_configurations_supported: Record<string, unknown> }
      knownCredentialConfigurations: Record<string, unknown>
    }
    expect(issuerMetadata.credentialIssuer.credential_configurations_supported[offeredId]).toEqual(
      expect.objectContaining({ format: 'dc+sd-jwt' }),
    )
    expect(issuerMetadata.knownCredentialConfigurations[offeredId]).toEqual(
      expect.objectContaining({ format: 'dc+sd-jwt' }),
    )
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

  test('sends DPoP on credential_identifier requests instead of Bearer-only', async () => {
    const {
      createDpopIssuanceSession,
      getRequestDpopOptions,
    } = require('@/src/services/oid4vc/dpopIssuanceSession') as typeof import('@/src/services/oid4vc/dpopIssuanceSession')
    const dpopSession = createDpopIssuanceSession()
    const dpop = getRequestDpopOptions(dpopSession)
    const fetchImpl = jest.fn(async () => Response.json({ credential: 'vc.jwt' })) as unknown as typeof fetch
    const context = {
      ...oid4vcContext,
      issuerMetadataResult: {
        ...oid4vcContext.issuerMetadataResult,
        credentialIssuer: {
          ...oid4vcContext.issuerMetadataResult.credentialIssuer,
          credential_issuer: 'https://issuer.example.com',
          credential_endpoint: 'https://issuer.example.com/credential',
        },
      },
    }

    await retrieveCredentialViaOid4vc({
      oid4vcContext: context,
      accessToken: 'access-token',
      proofJwt: 'proof.jwt',
      credentialConfigurationId: 'test-config',
      credentialIdentifier: 'issuer-credential-id-1',
      dpop,
      dpopSession,
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://issuer.example.com/credential',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'DPoP access-token',
          DPoP: expect.any(String),
        }),
      }),
    )
    expect(mockRetrieveCredentials).not.toHaveBeenCalled()
  })

  test('retries credential_identifier request once when the issuer returns a DPoP nonce', async () => {
    const {
      createDpopIssuanceSession,
      getRequestDpopOptions,
    } = require('@/src/services/oid4vc/dpopIssuanceSession') as typeof import('@/src/services/oid4vc/dpopIssuanceSession')
    const dpopSession = createDpopIssuanceSession()
    const dpop = getRequestDpopOptions(dpopSession)
    let calls = 0
    const fetchImpl = jest.fn(async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'use_dpop_nonce' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'DPoP-Nonce': 'as-dpop-nonce',
          },
        })
      }
      return Response.json({ credential: 'vc.jwt' })
    }) as unknown as typeof fetch
    const context = {
      ...oid4vcContext,
      issuerMetadataResult: {
        ...oid4vcContext.issuerMetadataResult,
        credentialIssuer: {
          ...oid4vcContext.issuerMetadataResult.credentialIssuer,
          credential_issuer: 'https://issuer.example.com',
          credential_endpoint: 'https://issuer.example.com/credential',
        },
      },
    }

    await retrieveCredentialViaOid4vc({
      oid4vcContext: context,
      accessToken: 'access-token',
      proofJwt: 'proof.jwt',
      credentialConfigurationId: 'test-config',
      credentialIdentifier: 'issuer-credential-id-1',
      dpop,
      dpopSession,
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const retryHeaders = (fetchImpl as unknown as jest.Mock).mock.calls[1]?.[1]?.headers as Record<string, string>
    const retryPayload = JSON.parse(
      Buffer.from(String(retryHeaders.DPoP).split('.')[1], 'base64url').toString('utf8'),
    ) as { nonce?: string }
    expect(retryPayload.nonce).toBe('as-dpop-nonce')
    expect(dpopSession.nonce).toBe('as-dpop-nonce')
    expect(mockRetrieveCredentials).not.toHaveBeenCalled()
  })
})
