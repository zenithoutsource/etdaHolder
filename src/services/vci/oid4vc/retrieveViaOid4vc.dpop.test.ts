import { retrievePreAuthorizedTokenViaOid4vc } from './retrieveViaOid4vc'
import type { Oid4vcVciAdapterContext } from './types'
import {
  createDpopIssuanceSession,
  getRequestDpopOptions,
} from '@/src/services/oid4vc/dpopIssuanceSession'

const mockRetrievePreAuthorizedCodeAccessTokenFromOffer = jest.fn()

jest.mock('./createOid4vcVciClient', () => ({
  createOid4vcVciClient: (options?: { signJwtImpl?: unknown }) => ({
    retrievePreAuthorizedCodeAccessTokenFromOffer: (...args: unknown[]) => {
      if (options?.signJwtImpl) {
        ;(mockRetrievePreAuthorizedCodeAccessTokenFromOffer as jest.Mock & {
          signJwtImpl?: unknown
        }).signJwtImpl = options.signJwtImpl
      }
      return mockRetrievePreAuthorizedCodeAccessTokenFromOffer(...args)
    },
  }),
}))

const oid4vcContext = {
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
    authorizationServers: [],
    knownCredentialConfigurations: {},
    originalDraftVersion: 1,
  },
} as unknown as Oid4vcVciAdapterContext

describe('retrieveViaOid4vc DPoP wiring', () => {
  beforeEach(() => {
    mockRetrievePreAuthorizedCodeAccessTokenFromOffer.mockReset()
  })

  test('passes dpop options and signJwtImpl to the VCI client', async () => {
    const dpopSession = createDpopIssuanceSession()
    const dpop = getRequestDpopOptions(dpopSession)

    mockRetrievePreAuthorizedCodeAccessTokenFromOffer.mockResolvedValue({
      accessTokenResponse: {
        access_token: 'access-token',
        c_nonce: 'nonce',
      },
      dpop: {
        signer: dpopSession.signer,
        nonce: 'updated-nonce',
      },
    })

    const response = await retrievePreAuthorizedTokenViaOid4vc({
      oid4vcContext,
      dpop,
      dpopSession,
    })

    expect(mockRetrievePreAuthorizedCodeAccessTokenFromOffer).toHaveBeenCalledWith(
      expect.objectContaining({ dpop }),
    )
    expect(
      (mockRetrievePreAuthorizedCodeAccessTokenFromOffer as jest.Mock & {
        signJwtImpl?: unknown
      }).signJwtImpl,
    ).toBeDefined()
    expect(response.dpop).toEqual({
      signer: dpopSession.signer,
      nonce: 'updated-nonce',
    })
  })
})
