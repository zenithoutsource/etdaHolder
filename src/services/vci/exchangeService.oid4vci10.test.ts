/* eslint-disable import/first */

const mockRetrievePreAuthorizedTokenViaOid4vc = jest.fn()
const mockRetrieveCredentialViaOid4vc = jest.fn()

jest.mock('./oid4vc/retrieveViaOid4vc', () => ({
  ...jest.requireActual('./oid4vc/retrieveViaOid4vc'),
  retrievePreAuthorizedTokenViaOid4vc: (...args: unknown[]) => mockRetrievePreAuthorizedTokenViaOid4vc(...args),
  retrieveAuthorizationCodeTokenViaOid4vc: jest.fn(),
  retrieveCredentialViaOid4vc: (...args: unknown[]) => mockRetrieveCredentialViaOid4vc(...args),
}))

import { acquireCredentialRecord, InvalidProofError, type ResolvedCredentialOffer } from './exchangeService'
import type { Oid4vcVciAdapterContext } from './oid4vc/types'
import { makeTestOid4vcContext } from './testFixtures'

const originalFetch = global.fetch

function unsignedJwt(payload: Record<string, unknown>, alg = 'EdDSA'): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg })}.${encode(payload)}.signature`
}

function makeOid4vcContext(
  configurationIds: string[],
  issuer = 'https://issuer.example.com',
): Oid4vcVciAdapterContext {
  return makeTestOid4vcContext(issuer, configurationIds)
}

describe('OID4VCI 1.0 credential request (oid4vc path)', () => {
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

    mockRetrievePreAuthorizedTokenViaOid4vc.mockResolvedValue({
      access_token: 'access-token',
      c_nonce: 'nonce',
    })
    mockRetrieveCredentialViaOid4vc.mockResolvedValue({
      credentialResponse: {
        credential: unsignedJwt({
          jti: 'idcard-1',
          vct: 'https://issuer.example.com/vct/idcard',
          iat: 1760000000,
          givenName: 'Ada',
        }),
      },
    })
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  test('sends credential_configuration_id for a format-suffixed IdCard offer', async () => {
    const resolvedOffer = makeIdCardResolvedOffer()

    const record = await acquireCredentialRecord(resolvedOffer, {
      dependencies: {
        signProof: async () => 'proof.jwt',
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-token',
        proofJwt: 'proof.jwt',
        credentialConfigurationId: 'idcard',
        oid4vcContext: resolvedOffer.oid4vcContext,
      }),
    )
    expect(record.type).toBe('ThaiNationalID')
  })

  test('uses token-issued credential_identifier when the issuer returns one', async () => {
    mockRetrievePreAuthorizedTokenViaOid4vc.mockResolvedValue({
      access_token: 'access-token',
      c_nonce: 'nonce',
      authorization_details: [
        {
          type: 'openid_credential',
          credential_configuration_id: 'idcard',
          credential_identifiers: ['issuer-credential-id-1'],
        },
      ],
    })
    const resolvedOffer = makeIdCardResolvedOffer()

    await acquireCredentialRecord(resolvedOffer, {
      dependencies: {
        signProof: async () => 'proof.jwt',
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialConfigurationId: 'issuer-credential-id-1',
      }),
    )
  })

  test('extracts credential_identifier from the default token response path', async () => {
    mockRetrievePreAuthorizedTokenViaOid4vc.mockResolvedValue({
      access_token: 'access-token',
      c_nonce: 'nonce',
      authorization_details: [
        {
          type: 'openid_credential',
          credential_configuration_id: 'idcard',
          credential_identifiers: ['issuer-credential-id-1'],
        },
      ],
    })
    const resolvedOffer = makeIdCardResolvedOffer()

    await acquireCredentialRecord(resolvedOffer, {
      dependencies: {
        signProof: async () => 'proof.jwt',
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(mockRetrievePreAuthorizedTokenViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        oid4vcContext: resolvedOffer.oid4vcContext,
      }),
    )
    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialConfigurationId: 'issuer-credential-id-1',
      }),
    )
  })

  test('surfaces issuer credential endpoint error body', async () => {
    mockRetrieveCredentialViaOid4vc.mockRejectedValue(
      new Error('CredentialRequestFailed: invalid_request - proof JWT aud is invalid'),
    )

    await expect(
      acquireCredentialRecord(makeIdCardResolvedOffer(), {
        dependencies: {
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
        },
      }),
    ).rejects.toThrow('CredentialRequestFailed: invalid_request - proof JWT aud is invalid')
  })

  test('retries once when adapter maps invalid_proof to InvalidProofError', async () => {
    let credentialRequestCalls = 0
    const signedNonces: string[] = []

    mockRetrieveCredentialViaOid4vc.mockImplementation(async () => {
      credentialRequestCalls += 1
      if (credentialRequestCalls === 1) {
        throw new InvalidProofError('CredentialRequestFailed: invalid_proof', 'requested-nonce')
      }
      return {
        credentialResponse: {
          credential: unsignedJwt({
            jti: 'idcard-1',
            vct: 'https://issuer.example.com/vct/idcard',
            iat: 1760000000,
            givenName: 'Ada',
          }),
        },
      }
    })

    await acquireCredentialRecord(makeIdCardResolvedOffer(), {
      dependencies: {
        signProof: async (cNonce) => {
          signedNonces.push(cNonce)
          return `proof-${cNonce}.jwt`
        },
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(credentialRequestCalls).toBe(2)
    expect(signedNonces).toEqual(['nonce', 'requested-nonce'])
    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ proofJwt: 'proof-requested-nonce.jwt' }),
    )
  })

  test('sends format+doctype for mso_mdoc and maps org.iso.18013.5.1.mDL to DLTDrivingLicence', async () => {
    mockRetrieveCredentialViaOid4vc.mockResolvedValue({
      credentialResponse: {
        format: 'mso_mdoc',
        credential: 'AQIDBA',
      },
    })

    const signProof = jest.fn(async () => 'proof.jwt')
    const record = await acquireCredentialRecord(makeMdlResolvedOffer(), {
      dependencies: {
        signProof,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(signProof).toHaveBeenCalledWith('nonce', 'https://issuer.example.com', {
      keyBinding: 'jwk',
    })
    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialConfigurationId: 'TestMdocDrivingLicence',
        proofJwt: 'proof.jwt',
        additionalRequestPayload: expect.objectContaining({
          credential_configuration_id: 'TestMdocDrivingLicence',
          doctype: 'org.iso.18013.5.1.mDL',
        }),
      }),
    )
    expect(record.type).toBe('DLTDrivingLicence')
    expect(record.rawVc).toBe('mdoc:AQIDBA')
    expect(record.claims.doctype).toBe('org.iso.18013.5.1.mDL')
  })

  test('sends credential_configuration_id for direct org.iso.18013.5.1.mDL configuration keys', async () => {
    mockRetrieveCredentialViaOid4vc.mockResolvedValue({
      credentialResponse: {
        format: 'mso_mdoc',
        credential: 'AQIDBA',
      },
    })

    const record = await acquireCredentialRecord(makeZenithcompMdlResolvedOffer(), {
      dependencies: {
        signProof: async () => 'proof.jwt',
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialConfigurationId: 'org.iso.18013.5.1.mDL',
        proofJwt: 'proof.jwt',
        additionalRequestPayload: expect.objectContaining({
          credential_configuration_id: 'org.iso.18013.5.1.mDL',
          doctype: 'org.iso.18013.5.1.mDL',
        }),
      }),
    )
    const requestPayload = mockRetrieveCredentialViaOid4vc.mock.calls[0]?.[0]?.additionalRequestPayload as Record<string, unknown>
    expect(requestPayload).not.toHaveProperty('format')
    expect(requestPayload).not.toHaveProperty('proof')
    expect(requestPayload).not.toHaveProperty('proofs')
    expect(record.rawVc).toBe('mdoc:AQIDBA')
  })

  test('accepts OID4VCI 1.0 credentials array mso_mdoc response', async () => {
    mockRetrieveCredentialViaOid4vc.mockResolvedValue({
      credentialResponse: {
        credentials: [{ credential: 'AQIDBAUG' }],
      },
    })

    const record = await acquireCredentialRecord(makeMdlResolvedOffer(), {
      dependencies: {
        signProof: async () => 'proof.jwt',
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(record.type).toBe('DLTDrivingLicence')
    expect(record.rawVc).toBe('mdoc:AQIDBAUG')
  })
})

function makeIdCardResolvedOffer(): ResolvedCredentialOffer {
  const oid4vcContext = makeOid4vcContext(['IdCard_dc+sd-jwt'])
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
    protocolPath: 'oid4vc',
    oid4vcContext,
  }
}

function makeMdlResolvedOffer(): ResolvedCredentialOffer {
  const oid4vcContext = makeOid4vcContext(['org.iso.18013.5.1.mDL'])
  return {
    offerUri: 'openid-credential-offer://mock',
    issuer: 'https://issuer.example.com',
    credentialOffer: {
      credential_offer: {
        credential_issuer: 'https://issuer.example.com',
        credential_configuration_ids: ['org.iso.18013.5.1.mDL'],
      },
      supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      version: 10015,
    } as unknown as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        TestMdocDrivingLicence: {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          display: [{ name: 'Mobile Driving Licence' }],
        },
      },
    },
    credentialConfigurations: [
      {
        id: 'org.iso.18013.5.1.mDL',
        requestId: 'TestMdocDrivingLicence',
        format: 'mso_mdoc',
        display: { name: 'Mobile Driving Licence' },
        rawConfiguration: {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          display: [{ name: 'Mobile Driving Licence' }],
        },
      },
    ],
    preAuthorizedCode: 'preauth-code',
    supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    version: 10015,
    protocolPath: 'oid4vc',
    oid4vcContext,
  }
}

function makeZenithcompMdlResolvedOffer(): ResolvedCredentialOffer {
  const issuer = 'https://issuer.zenithcomp.co.th:455'
  const oid4vcContext = makeOid4vcContext(['org.iso.18013.5.1.mDL'], issuer)
  return {
    offerUri: 'openid-credential-offer://mock',
    issuer,
    credentialOffer: {
      credential_offer: {
        credential_issuer: issuer,
        credential_configuration_ids: ['org.iso.18013.5.1.mDL'],
      },
      supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      version: 10015,
    } as unknown as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {
      credential_issuer: issuer,
      credential_endpoint: `${issuer}/credential`,
      credential_configurations_supported: {
        'org.iso.18013.5.1.mDL': {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          cryptographic_binding_methods_supported: ['cose_key'],
        },
      },
    },
    credentialConfigurations: [
      {
        id: 'org.iso.18013.5.1.mDL',
        requestId: 'org.iso.18013.5.1.mDL',
        format: 'mso_mdoc',
        rawConfiguration: {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          cryptographic_binding_methods_supported: ['cose_key'],
        },
      },
    ],
    preAuthorizedCode: 'preauth-code',
    supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    version: 10015,
    protocolPath: 'oid4vc',
    oid4vcContext,
  }
}
