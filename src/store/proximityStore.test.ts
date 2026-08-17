const mockArmProximityPresentation = jest.fn(async () => undefined)
const mockDisarmProximityPresentation = jest.fn(async () => undefined)
const mockDenyProximityPresentation = jest.fn(async () => undefined)
const mockSubscribeToProximityEvents = jest.fn(() => () => undefined)
const mockGetDeviceEngagementUri = jest.fn(() => null)

jest.mock('@/src/services/proximity/proximityArmSession', () => ({
  armProximityPresentation: (...args: unknown[]) => mockArmProximityPresentation(...args),
  disarmProximityPresentation: (...args: unknown[]) => mockDisarmProximityPresentation(...args),
}))

jest.mock('@/src/services/proximity/proximityPresentation', () => ({
  denyProximityPresentation: (...args: unknown[]) => mockDenyProximityPresentation(...args),
  ProximityPresentationError: class ProximityPresentationError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

jest.mock('@/src/services/proximity/nativeProximityModule', () => ({
  subscribeToProximityEvents: (...args: unknown[]) => mockSubscribeToProximityEvents(...args),
  requireNativeProximityModule: () => ({ getDeviceEngagementUri: mockGetDeviceEngagementUri }),
}))

jest.mock('@/src/services/credentials/storedCredentials', () => ({
  readStoredCredentialById: () => ({ id: 'cred-1', type: 'DLTDrivingLicence' }),
}))

jest.mock('@/src/services/history/walletHistoryRecording', () => ({
  recordNfcPresentationDeclined: jest.fn(),
  recordNfcPresentationFailure: jest.fn(),
  recordNfcPresentationSuccess: jest.fn(),
}))

import { useProximityStore } from './proximityStore'

describe('proximityStore tap-first', () => {
  beforeEach(() => {
    mockArmProximityPresentation.mockClear()
    useProximityStore.getState().reset()
  })

  test('openPresentation arms mdoc-only with profile ceiling fields', async () => {
    useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockArmProximityPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        sharingMode: 'mdoc-only',
        approvedMdocFields: [
          'org.iso.18013.5.1.family_name',
          'org.iso.18013.5.1.given_name',
          'org.iso.18013.5.1.birth_date',
        ],
      }),
    )
    expect(useProximityStore.getState().status).not.toBe('awaiting-consent')
  })
})
