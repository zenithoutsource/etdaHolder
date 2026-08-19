const mockArmProximityPresentation = jest.fn(async (_request?: unknown) => undefined)
const mockDisarmProximityPresentation = jest.fn(async () => undefined)
const mockDenyProximityPresentation = jest.fn(async () => undefined)

type ProximityEventHandlers = {
  onPresentationComplete?: (event: { sharedFields: string[] }) => void
}

let capturedHandlers: ProximityEventHandlers | null = null
const mockSubscribeToProximityEvents = jest.fn((handlers: ProximityEventHandlers) => {
  capturedHandlers = handlers
  return () => undefined
})
const mockGetDeviceEngagementUri = jest.fn(() => null)

jest.mock('@/src/services/proximity/proximityArmSession', () => ({
  armProximityPresentation: (request: unknown) => mockArmProximityPresentation(request),
  disarmProximityPresentation: () => mockDisarmProximityPresentation(),
}))

jest.mock('@/src/services/proximity/proximityPresentation', () => ({
  denyProximityPresentation: () => mockDenyProximityPresentation(),
  ProximityPresentationError: class ProximityPresentationError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

jest.mock('@/src/services/proximity/nativeProximityModule', () => ({
  subscribeToProximityEvents: (handlers: ProximityEventHandlers) =>
    mockSubscribeToProximityEvents(handlers),
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

import { getReaderProfileForDocumentType, listMdocFieldKeysFromProfile } from '@/src/config/readerProfiles'
import { recordNfcPresentationSuccess } from '@/src/services/history/walletHistoryRecording'
import { useProximityStore } from './proximityStore'

describe('proximityStore NFC Presentment Consent', () => {
  const mdlCeiling = listMdocFieldKeysFromProfile(
    getReaderProfileForDocumentType('DLTDrivingLicence', 'mdoc-only')!,
  )

  beforeEach(() => {
    capturedHandlers = null
    mockArmProximityPresentation.mockClear()
    mockDisarmProximityPresentation.mockClear()
    mockSubscribeToProximityEvents.mockClear()
    jest.mocked(recordNfcPresentationSuccess).mockClear()
    useProximityStore.getState().reset()
    mockDisarmProximityPresentation.mockClear()
  })

  test('openPresentation waits for consent and does not arm HCE', () => {
    useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')

    expect(useProximityStore.getState().status).toBe('awaiting-consent')
    expect(useProximityStore.getState().approvedMdocFields).toEqual(mdlCeiling)
    expect(mockArmProximityPresentation).not.toHaveBeenCalled()
  })

  test('approvePresentation arms mdoc-only with profile ceiling fields', async () => {
    useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
    await useProximityStore.getState().approvePresentation(mdlCeiling)

    expect(mockArmProximityPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        sharingMode: 'mdoc-only',
        approvedMdocFields: mdlCeiling,
      }),
    )
  })

  test('presentation complete shows success without immediately disarming HCE', async () => {
    useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
    await useProximityStore.getState().approvePresentation(mdlCeiling)
    mockDisarmProximityPresentation.mockClear()

    capturedHandlers?.onPresentationComplete?.({ sharedFields: ['family_name'] })

    expect(useProximityStore.getState().status).toBe('complete')
    expect(useProximityStore.getState().sharedFields).toEqual(['family_name'])
    expect(mockDisarmProximityPresentation).not.toHaveBeenCalled()
    expect(recordNfcPresentationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cred-1', type: 'DLTDrivingLicence' }),
      ['นามสกุล'],
    )
  })

  test('presentation complete records Thai labels for namespaced mDL fields', async () => {
    useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
    await useProximityStore.getState().approvePresentation(mdlCeiling)

    capturedHandlers?.onPresentationComplete?.({
      sharedFields: [
        'org.iso.18013.5.1.given_name',
        'org.iso.18013.5.1.family_name',
        'org.iso.18013.5.1.birth_date',
        'org.iso.18013.5.1.driving_privileges',
        'org.iso.18013.5.1.issue_date',
        'org.iso.18013.5.1.expiry_date',
      ],
    })

    expect(recordNfcPresentationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DLTDrivingLicence' }),
      ['ชื่อ', 'นามสกุล', 'วันเดือนปีเกิด', 'ประเภทใบอนุญาต', 'วันที่ออกใบอนุญาต', 'วันหมดอายุ'],
    )
    expect(useProximityStore.getState().sharedFields).toEqual([
      'org.iso.18013.5.1.given_name',
      'org.iso.18013.5.1.family_name',
      'org.iso.18013.5.1.birth_date',
      'org.iso.18013.5.1.driving_privileges',
      'org.iso.18013.5.1.issue_date',
      'org.iso.18013.5.1.expiry_date',
    ])
  })
})
