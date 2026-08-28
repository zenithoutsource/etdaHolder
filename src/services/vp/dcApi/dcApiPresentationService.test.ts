/**
 * Verifies trusted DC API mdoc selection and single-boundary DeviceResponse completion.
 */
import { p256 } from '@noble/curves/nist.js'

import { p256PublicKeyToDidKey, signEs256Prehash } from '@/src/services/crypto/p256Identity'
import { buildDcApiDeviceResponseAsync } from '@/src/services/proximity/dcApiDeviceResponse'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

import {
  completeDcApiPresentation,
  resolveDcApiPresentation,
  type DcApiResolvedPresentation,
} from './dcApiPresentationService'
import type { DcApiIncomingRequest } from './dcApiRequestParser'

jest.mock('@/src/services/proximity/dcApiDeviceResponse', () => ({
  buildDcApiDeviceResponseAsync: jest.fn(),
}))
jest.mock('@/src/services/proximity/mdocCredential', () => ({
  ensureNativeMdocStored: jest.fn(async () => true),
  enumeratePresentableMdocCredentials: jest.requireActual('@/src/services/proximity/mdocCredential')
    .enumeratePresentableMdocCredentials,
  readMdocDocTypeFromRecord: jest.requireActual('@/src/services/proximity/mdocCredential')
    .readMdocDocTypeFromRecord,
}))
jest.mock('@/src/services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function createSignedJar(
  authorizationRequest: Record<string, unknown>,
  secretKey: Uint8Array,
): string {
  const unsigned = `${encodePart({
    alg: 'ES256',
    typ: 'oauth-authz-req+jwt',
    kid: 'dc-api-verifier-key',
  })}.${encodePart(authorizationRequest)}`
  const signature = signEs256Prehash(new TextEncoder().encode(unsigned), secretKey)
  return `${unsigned}.${base64UrlEncodeBytes(signature)}`
}

const mdlCredential: VerifiableCredentialRecord = {
  id: 'mdl-credential-1',
  type: 'DLTDrivingLicence',
  rawVc: 'mdoc:AQIDBA',
  claims: {
    doctype: 'org.iso.18013.5.1.mDL',
    family_name: 'redacted-in-test-output',
  },
  issuedAt: '2026-08-25T00:00:00.000Z',
}

function createUnsignedIncoming(
  responseMode: 'dc_api' | 'dc_api.jwt' = 'dc_api',
): DcApiIncomingRequest {
  return {
    sessionId: 'dc-session-1',
    protocol: 'openid4vp-v1-unsigned',
    origin: 'https://digital-credentials.dev',
    request: {
      response_mode: responseMode,
      nonce: 'nonce-1',
      dcql_query: {
        credentials: [
          {
            id: 'mdl',
            format: 'mso_mdoc',
            meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
            claims: [
              { path: ['org.iso.18013.5.1', 'family_name'] },
              { path: ['org.iso.18013.5.1', 'age_over_21'] },
            ],
          },
        ],
      },
    },
  }
}

describe('resolveDcApiPresentation', () => {
  const originalEnvironment = {
    buildProfile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
    demoInterop: process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
  })

  afterAll(() => {
    if (originalEnvironment.buildProfile === undefined) delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    else process.env.EXPO_PUBLIC_BUILD_PROFILE = originalEnvironment.buildProfile
    if (originalEnvironment.demoInterop === undefined) delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    else process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalEnvironment.demoInterop
  })

  test('rejects unsigned production requests before credential selection or native signing', async () => {
    process.env.EXPO_PUBLIC_BUILD_PROFILE = 'production'

    await expect(resolveDcApiPresentation(
      createUnsignedIncoming(),
      [mdlCredential],
      { trustedVerifiers: [] },
    )).rejects.toThrow(/unsigned dc_api is not supported in production/i)

    expect(buildDcApiDeviceResponseAsync).not.toHaveBeenCalled()
  })

  test('rejects a signed authenticated JAR whose expected_origins does not bind the platform origin', async () => {
    const { secretKey, publicKey } = p256.keygen()
    const clientId = `decentralized_identifier:${p256PublicKeyToDidKey(publicKey)}`
    const verifier = {
      clientId,
      name: 'Signed DC API Verifier',
      allowedOrigins: ['https://verifier.example.com'],
    }
    const jar = createSignedJar({
      client_id: clientId,
      response_uri: 'https://verifier.example.com/oid4vp/response',
      response_mode: 'dc_api',
      nonce: 'signed-nonce-1',
      expected_origins: ['https://different.example.com'],
      dcql_query: createUnsignedIncoming().request.dcql_query,
    }, secretKey)

    await expect(resolveDcApiPresentation({
      sessionId: 'dc-session-signed',
      protocol: 'openid4vp-v1-signed',
      origin: 'https://verifier.example.com',
      request: { request: jar },
    }, [mdlCredential], { trustedVerifiers: [verifier] })).rejects.toThrow(/expected_origins/i)
  })

  test('reports a missing credential when no stored mdoc matches the requested doctype', async () => {
    const mismatchedCredential = {
      ...mdlCredential,
      type: 'ChulalongkornUniversityTranscript',
      claims: { ...mdlCredential.claims, doctype: 'org.example.transcript' },
    }

    await expect(resolveDcApiPresentation(
      createUnsignedIncoming(),
      [mismatchedCredential],
      { trustedVerifiers: [] },
    )).rejects.toThrow(/PresentationCredentialMissing/i)
  })

  test('selects a standalone mso_mdoc by doctype through the existing DCQL path', async () => {
    const resolved = await resolveDcApiPresentation(
      createUnsignedIncoming(),
      [mdlCredential],
      { trustedVerifiers: [] },
    )

    expect(resolved).toMatchObject({
      sessionId: 'dc-session-1',
      responseMode: 'dc_api',
      selectedDcqlQueryId: 'mdl',
      matchedCredential: mdlCredential,
      requestedNamespaceKeys: [
        'org.iso.18013.5.1/family_name',
        'org.iso.18013.5.1/age_over_21',
      ],
    })
  })

  test('selects the Credential Manager preferred credential without re-checking doctype metadata', async () => {
    const dualFormatMdl = {
      ...mdlCredential,
      id: 'dual-mdl-1',
      claims: {},
    }

    const resolved = await resolveDcApiPresentation(
      createUnsignedIncoming(),
      [dualFormatMdl],
      {
        trustedVerifiers: [],
        preferredCredentialId: 'dual-mdl-1',
      },
    )

    expect(resolved.matchedCredential.id).toBe('dual-mdl-1')
  })
})

describe('completeDcApiPresentation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    jest.mocked(buildDcApiDeviceResponseAsync).mockResolvedValue('device-response-base64url')
  })

  test('rejects a caller-forged resolved object before native signing', async () => {
    const forged = {
      sessionId: 'forged',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      authorizationRequest: createUnsignedIncoming().request,
      dcqlQuery: { credentials: [] },
      selectedDcqlQueryId: 'mdl',
      matchedCredential: mdlCredential,
      nonce: 'nonce-forged',
      requestedNamespaceKeys: ['org.iso.18013.5.1/family_name'],
    } as DcApiResolvedPresentation

    await expect(completeDcApiPresentation({
      presentation: forged,
      approvedNamespaceKeys: ['org.iso.18013.5.1/family_name'],
    })).rejects.toThrow(/trusted resolution/i)
    expect(buildDcApiDeviceResponseAsync).not.toHaveBeenCalled()
  })

  test('builds one DeviceResponse with the canonical mdoc audience and Task 5 payload', async () => {
    const resolved = await resolveDcApiPresentation(
      createUnsignedIncoming(),
      [mdlCredential],
      { trustedVerifiers: [] },
    )

    await expect(completeDcApiPresentation({
      presentation: resolved,
      approvedNamespaceKeys: ['org.iso.18013.5.1/family_name'],
    })).resolves.toEqual({
      responseMode: 'dc_api',
      data: { vp_token: { mdl: ['device-response-base64url'] } },
    })

    expect(buildDcApiDeviceResponseAsync).toHaveBeenCalledTimes(1)
    expect(buildDcApiDeviceResponseAsync).toHaveBeenCalledWith({
      credentialId: 'mdl-credential-1',
      approvedNamespaceKeys: ['org.iso.18013.5.1/family_name'],
      origin: 'https://digital-credentials.dev',
      nonce: 'nonce-1',
    })
  })

  test('rejects an approved key outside the verifier request before native signing', async () => {
    const resolved = await resolveDcApiPresentation(
      createUnsignedIncoming(),
      [mdlCredential],
      { trustedVerifiers: [] },
    )

    await expect(completeDcApiPresentation({
      presentation: resolved,
      approvedNamespaceKeys: ['org.iso.18013.5.1/document_number'],
    })).rejects.toThrow(/approved mdoc field was not requested/i)
    expect(buildDcApiDeviceResponseAsync).not.toHaveBeenCalled()
  })
})
