/**
 * Integration guard for the DC API platform event → resolve → Credential Manager response path.
 */
import crossDeviceFixture from './__fixtures__/cross-device-unsigned-request.json'
import {
  completeDcApiPresentation,
  resolveDcApiPresentation,
} from './dcApiPresentationService'
import { normalizePlatformDcApiEvent, type DcApiPlatformPresentationEvent } from './dcApiCrossDevice'
import { formatDcApiDigitalCredentialResponse } from './dcApiResponseBuilder'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

jest.mock('@/src/services/proximity/dcApiDeviceResponse', () => ({
  buildDcApiDeviceResponseAsync: jest.fn(async () => 'device-response-base64url'),
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

describe('dcApiPresentationService integration', () => {
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

  test('normalizes a cross-device platform event through resolve and Credential Manager JSON', async () => {
    const normalized = normalizePlatformDcApiEvent(crossDeviceFixture as DcApiPlatformPresentationEvent)
    expect(normalized.transport).toBe('cross_device')

    const resolved = await resolveDcApiPresentation(normalized, [mdlCredential], {
      trustedVerifiers: [],
      preferredCredentialId: normalized.selectedCredentialId,
    })

    const payload = await completeDcApiPresentation({
      presentation: resolved,
      approvedNamespaceKeys: ['org.iso.18013.5.1/family_name'],
    })

    const credentialJson = formatDcApiDigitalCredentialResponse(payload, resolved.protocol)
    const parsed = JSON.parse(credentialJson) as {
      protocol: string
      data: { vp_token: Record<string, string[]> }
    }

    expect(parsed).toEqual({
      protocol: 'openid4vp-v1-unsigned',
      data: {
        vp_token: {
          mdl: ['device-response-base64url'],
        },
      },
    })
  })
})
