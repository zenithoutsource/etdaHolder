/* eslint-disable import/first */

const mockRetrievePreAuthorizedTokenViaOid4vc = jest.fn()
const mockRetrieveCredentialViaOid4vc = jest.fn()

jest.mock('./oid4vc/retrieveViaOid4vc', () => ({
  ...jest.requireActual('./oid4vc/retrieveViaOid4vc'),
  retrievePreAuthorizedTokenViaOid4vc: (...args: unknown[]) => mockRetrievePreAuthorizedTokenViaOid4vc(...args),
  retrieveAuthorizationCodeTokenViaOid4vc: jest.fn(),
  retrieveCredentialViaOid4vc: (...args: unknown[]) => mockRetrieveCredentialViaOid4vc(...args),
}))

jest.mock('../crypto/walletCryptoActivation', () => {
  const actual = jest.requireActual('../crypto/walletCryptoActivation') as typeof import('../crypto/walletCryptoActivation')
  return {
    ...actual,
    activateWalletCryptoV2: jest.fn(async () => undefined),
  }
})

import {
  acquireCredentialRecord,
  InvalidProofError,
  readCredentialIdentifierFromTokenResponse,
  readTokenCredentialIdentifier,
  type OfferedCredentialConfiguration,
  type ResolvedCredentialOffer,
} from './exchangeService'
import * as credentialKeyRegistry from '../crypto/credentialKeyRegistry'
import * as storedCredentials from '../credentials/storedCredentials'
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
        credentialIdentifier: 'issuer-credential-id-1',
        credentialConfigurationId: 'idcard',
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
        credentialIdentifier: 'issuer-credential-id-1',
        credentialConfigurationId: 'idcard',
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

  test('rejects mso_mdoc PoP JWT that omits the P-256 jwk header', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    const listLegacyKeys = jest.spyOn(credentialKeyRegistry, 'listCredentialKeyRecords').mockReturnValue([])
    const readCredentials = jest.spyOn(storedCredentials, 'readStoredCredentials').mockReturnValue([])
    try {
      const kidOnlyProof = unsignedJwt(
        { aud: 'https://issuer.example.com', iat: 1, nonce: 'nonce' },
        'ES256',
      )
      const payloadB64 = kidOnlyProof.split('.')[1]
      const signatureB64 = kidOnlyProof.split('.')[2]
      const kidOnlyHeader = btoa(JSON.stringify({
        alg: 'ES256',
        typ: 'openid4vci-proof+jwt',
        kid: 'did:key:zDnaezbiKRbKrJLK4dfi7KVpQCmGhoDdvuKTabAWQ2K7oQAnG#zDnaezbiKRbKrJLK4dfi7KVpQCmGhoDdvuKTabAWQ2K7oQAnG',
      })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const kidOnlyJwt = `${kidOnlyHeader}.${payloadB64}.${signatureB64}`

      await expect(
        acquireCredentialRecord(makeMdlResolvedOffer(), {
          dependencies: {
            signProof: async () => kidOnlyJwt,
            getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
          },
        }),
      ).rejects.toThrow(/jwk header \(P-256 device key\) is required for mso_mdoc/)
      expect(mockRetrieveCredentialViaOid4vc).not.toHaveBeenCalled()
    } finally {
      listLegacyKeys.mockRestore()
      readCredentials.mockRestore()
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    }
  })

  test('accepts mso_mdoc PoP JWT with Ed25519 jwk when hardware P-256 is off', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    mockRetrieveCredentialViaOid4vc.mockResolvedValue({
      credentialResponse: {
        format: 'mso_mdoc',
        credential: 'AQIDBA',
      },
    })
    const unsigned = unsignedJwt(
      { aud: 'https://issuer.example.com', iat: 1, nonce: 'nonce' },
      'EdDSA',
    )
    const payloadB64 = unsigned.split('.')[1]
    const signatureB64 = unsigned.split('.')[2]
    const ed25519Header = btoa(JSON.stringify({
      alg: 'EdDSA',
      typ: 'openid4vci-proof+jwt',
      kid: 'did:key:z6Mkg4tDVifmzHEP77oWM6SMBMDfr4eJiX9KuEqU7UKXpzGk',
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const ed25519Jwt = `${ed25519Header}.${payloadB64}.${signatureB64}`

    await acquireCredentialRecord(makeMdlResolvedOffer(), {
      dependencies: {
        signProof: async () => ed25519Jwt,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })
    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalled()
  })

  test('rejects mso_mdoc PoP JWT that omits kid when jwk is present', async () => {
    const unsigned = unsignedJwt(
      { aud: 'https://issuer.example.com', iat: 1, nonce: 'nonce' },
      'ES256',
    )
    const payloadB64 = unsigned.split('.')[1]
    const signatureB64 = unsigned.split('.')[2]
    const jwkOnlyHeader = btoa(JSON.stringify({
      alg: 'ES256',
      typ: 'openid4vci-proof+jwt',
      jwk: { kty: 'EC', crv: 'P-256', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', y: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const jwkOnlyJwt = `${jwkOnlyHeader}.${payloadB64}.${signatureB64}`

    await expect(
      acquireCredentialRecord(makeMdlResolvedOffer(), {
        dependencies: {
          signProof: async () => jwkOnlyJwt,
          getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
        },
      }),
    ).rejects.toThrow(/kid header is required/)
    expect(mockRetrieveCredentialViaOid4vc).not.toHaveBeenCalled()
  })

  test('sends OID4VCI 1.0 mso_mdoc request without doctype and maps org.iso.18013.5.1.mDL to DLTDrivingLicence', async () => {
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

    expect(signProof).toHaveBeenCalledWith(
      'nonce',
      'https://issuer.example.com',
      expect.objectContaining({ keyBinding: 'jwk' }),
    )
    expect(mockRetrieveCredentialViaOid4vc).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialConfigurationId: 'TestMdocDrivingLicence',
        proofJwt: 'proof.jwt',
        additionalRequestPayload: expect.objectContaining({
          credential_configuration_id: 'TestMdocDrivingLicence',
        }),
      }),
    )
    const requestPayload = mockRetrieveCredentialViaOid4vc.mock.calls[0]?.[0]?.additionalRequestPayload as Record<string, unknown>
    expect(requestPayload).not.toHaveProperty('doctype')
    expect(requestPayload).not.toHaveProperty('format')
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
        }),
      }),
    )
    const requestPayload = mockRetrieveCredentialViaOid4vc.mock.calls[0]?.[0]?.additionalRequestPayload as Record<string, unknown>
    expect(requestPayload).not.toHaveProperty('doctype')
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

  test('uses did-kid PoP when SD-JWT metadata only supports did binding', async () => {
    const signProof = jest.fn(async () => 'proof.jwt')
    const resolved = makeIdCardResolvedOffer()
    resolved.credentialConfigurations[0] = {
      ...resolved.credentialConfigurations[0]!,
      rawConfiguration: {
        ...resolved.credentialConfigurations[0]!.rawConfiguration,
        cryptographic_binding_methods_supported: ['did'],
      },
    }

    await acquireCredentialRecord(resolved, {
      dependencies: {
        signProof,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(signProof).toHaveBeenCalledWith(
      'nonce',
      'https://issuer.example.com',
      expect.objectContaining({ keyBinding: 'did-kid' }),
    )
  })

  test('uses did-kid PoP when SD-JWT metadata lists did:key', async () => {
    const signProof = jest.fn(async () => 'proof.jwt')
    const resolved = makeIdCardResolvedOffer()
    resolved.credentialConfigurations[0] = {
      ...resolved.credentialConfigurations[0]!,
      rawConfiguration: {
        ...resolved.credentialConfigurations[0]!.rawConfiguration,
        cryptographic_binding_methods_supported: ['did:key'],
      },
    }

    await acquireCredentialRecord(resolved, {
      dependencies: {
        signProof,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(signProof).toHaveBeenCalledWith(
      'nonce',
      'https://issuer.example.com',
      expect.objectContaining({ keyBinding: 'did-kid' }),
    )
  })

  test('keeps jwk PoP for SD-JWT when binding methods are unrecognized', async () => {
    const signProof = jest.fn(async () => 'proof.jwt')
    const resolved = makeIdCardResolvedOffer()
    resolved.credentialConfigurations[0] = {
      ...resolved.credentialConfigurations[0]!,
      rawConfiguration: {
        ...resolved.credentialConfigurations[0]!.rawConfiguration,
        cryptographic_binding_methods_supported: ['attestation'],
      },
    }

    await acquireCredentialRecord(resolved, {
      dependencies: {
        signProof,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(signProof).toHaveBeenCalledWith(
      'nonce',
      'https://issuer.example.com',
      expect.objectContaining({ keyBinding: 'jwk' }),
    )
  })

  test('keeps jwk PoP for SD-JWT when binding methods are omitted', async () => {
    const signProof = jest.fn(async () => 'proof.jwt')

    await acquireCredentialRecord(makeIdCardResolvedOffer(), {
      dependencies: {
        signProof,
        getCredentialStorage: () => ({ getString: () => undefined, set: () => undefined }),
      },
    })

    expect(signProof).toHaveBeenCalledWith(
      'nonce',
      'https://issuer.example.com',
      expect.objectContaining({ keyBinding: 'jwk' }),
    )
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

function makeOfferedConfiguration(
  id: string,
  format: string,
): OfferedCredentialConfiguration {
  return {
    id,
    requestId: id,
    format,
    rawConfiguration: { format } as OfferedCredentialConfiguration['rawConfiguration'],
  }
}

describe('credential_identifier selection', () => {
  const sdJwt = makeOfferedConfiguration('TranscriptCredential_dc+sd-jwt', 'dc+sd-jwt')
  const mdoc = makeOfferedConfiguration('TranscriptCredential_mso_mdoc', 'mso_mdoc')
  const tokenResponse = {
    authorization_details: [
      {
        type: 'openid_credential',
        credential_configuration_id: 'TranscriptCredential_dc+sd-jwt',
        credential_identifiers: ['sdjwt-identifier'],
      },
    ],
  }

  test('does not inherit another format credential_identifier when unmatched', () => {
    expect(readCredentialIdentifierFromTokenResponse(tokenResponse, mdoc)).toBeUndefined()
    expect(readCredentialIdentifierFromTokenResponse(tokenResponse, sdJwt)).toBe('sdjwt-identifier')
  })

  test('does not fall back to the shared token identifier for an unmatched configuration', () => {
    expect(
      readTokenCredentialIdentifier(
        {
          credentialIdentifier: 'sdjwt-identifier',
          credentialIdentifiersByConfigurationId: {
            'TranscriptCredential_dc+sd-jwt': 'sdjwt-identifier',
          },
        },
        mdoc,
      ),
    ).toBeUndefined()
  })

  test('keeps the single-format token identifier when the per-config map is empty', () => {
    expect(
      readTokenCredentialIdentifier(
        {
          credentialIdentifier: 'only-identifier',
          credentialIdentifiersByConfigurationId: {},
        },
        mdoc,
      ),
    ).toBe('only-identifier')
  })
})
