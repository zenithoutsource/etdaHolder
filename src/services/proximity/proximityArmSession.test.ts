/* eslint-disable import/first */

const mockPrepareMdocDeviceAuthForArm = jest.fn(async () => {
  throw new Error('ProximityHardwareDeviceAuthUnavailable')
})
const mockReleaseMdocDeviceAuthSession = jest.fn(async () => undefined)
const mockArmProximitySession = jest.fn(async () => undefined)
const mockReadStoredCredentialById = jest.fn()
const mockReadStoredCredentials = jest.fn(() => [])

jest.mock('./deviceAuth', () => ({
  prepareMdocDeviceAuthForArm: (...args: unknown[]) => mockPrepareMdocDeviceAuthForArm(...args),
  releaseMdocDeviceAuthSession: (...args: unknown[]) => mockReleaseMdocDeviceAuthSession(...args),
}))

jest.mock('./proximityPresentation', () => ({
  ProximityPresentationError: class ProximityPresentationError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
      this.name = 'ProximityPresentationError'
    }
  },
  startProximityPresentation: jest.fn(async () => undefined),
  approveProximityPresentation: jest.fn(async () => undefined),
  stopProximityPresentation: jest.fn(async () => undefined),
}))

jest.mock('./nativeProximityModule', () => ({
  requireNativeProximityModule: () => ({
    armProximitySession: (...args: unknown[]) => mockArmProximitySession(...args),
  }),
}))

jest.mock('@/src/services/credentials/storedCredentials', () => ({
  readStoredCredentialById: (...args: unknown[]) => mockReadStoredCredentialById(...args),
  readStoredCredentials: (...args: unknown[]) => mockReadStoredCredentials(...args),
}))

import { startProximityPresentation } from './proximityPresentation'
import { armProximityPresentation } from './proximityArmSession'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

describe('armProximityPresentation', () => {
  const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
    jest.clearAllMocks()
    mockPrepareMdocDeviceAuthForArm.mockRejectedValue(new Error('ProximityHardwareDeviceAuthUnavailable'))
    mockReadStoredCredentialById.mockReset()
    mockReadStoredCredentials.mockReturnValue([])
  })

  test('fail-closes dual-format arm when hardware mdoc device auth is unavailable', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'

    await expect(
      armProximityPresentation({
        credentialId: 'cred-dual',
        approvedMdocFields: ['org.iso.18013.5.1:family_name'],
        sharingMode: 'dual-format',
        mdocPayloadBytes: 10,
        companionPayloadBytes: 10,
      }),
    ).rejects.toThrow('ProximityHardwareDeviceAuthUnavailable')

    expect(mockPrepareMdocDeviceAuthForArm).toHaveBeenCalledTimes(1)
    expect(mockPrepareMdocDeviceAuthForArm).toHaveBeenCalledWith('cred-dual')
    expect(startProximityPresentation).not.toHaveBeenCalled()
  })

  test('does not pass a name overlay when the licence already has given and family names', async () => {
    mockPrepareMdocDeviceAuthForArm.mockResolvedValue(undefined)
    const pid: VerifiableCredentialRecord = {
      id: 'pid-1',
      type: 'ThaiNationalID',
      rawVc: 'pid',
      claims: { thaiFullName: 'นางสาว พิชญา รุ่งเรืองกิจ' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    const licence: VerifiableCredentialRecord = {
      id: 'licence-1',
      type: 'DLTDrivingLicence',
      rawVc: 'dl',
      claims: { givenName: 'สมชาย', familyName: 'ใจดี' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    mockReadStoredCredentialById.mockReturnValue(licence)
    mockReadStoredCredentials.mockReturnValue([pid, licence])

    await armProximityPresentation({
      credentialId: 'licence-1',
      approvedMdocFields: ['org.iso.18013.5.1.given_name'],
      sharingMode: 'mdoc-only',
      mdocPayloadBytes: 10,
    })

    expect(mockArmProximitySession).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'licence-1',
        approvedMdocFields: ['org.iso.18013.5.1.given_name'],
        profileCeiling: ['org.iso.18013.5.1.given_name'],
      }),
    )
    expect(mockArmProximitySession.mock.calls[0]?.[0]).not.toHaveProperty('displayNameOverlay')
  })

  test('passes PID name overlay only when the licence is missing given or family names', async () => {
    mockPrepareMdocDeviceAuthForArm.mockResolvedValue(undefined)
    const pid: VerifiableCredentialRecord = {
      id: 'pid-1',
      type: 'ThaiNationalID',
      rawVc: 'pid',
      claims: { thaiFullName: 'นางสาว พิชญา รุ่งเรืองกิจ' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    const licence: VerifiableCredentialRecord = {
      id: 'licence-1',
      type: 'DLTDrivingLicence',
      rawVc: 'dl',
      claims: { licenceNumber: '54002891' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    mockReadStoredCredentialById.mockReturnValue(licence)
    mockReadStoredCredentials.mockReturnValue([pid, licence])

    await armProximityPresentation({
      credentialId: 'licence-1',
      approvedMdocFields: ['org.iso.18013.5.1.given_name'],
      sharingMode: 'mdoc-only',
      mdocPayloadBytes: 10,
    })

    expect(mockArmProximitySession).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'licence-1',
        displayNameOverlay: {
          given_name: 'นางสาว พิชญา',
          family_name: 'รุ่งเรืองกิจ',
        },
      }),
    )
  })

  test('passes profileCeiling from the reader profile and selected approvedMdocFields', async () => {
    mockPrepareMdocDeviceAuthForArm.mockResolvedValue(undefined)
    mockReadStoredCredentialById.mockReturnValue({
      id: 'licence-1',
      type: 'DLTDrivingLicence',
      rawVc: 'dl',
      claims: { givenName: 'สมชาย', familyName: 'ใจดี' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    })

    await armProximityPresentation({
      credentialId: 'licence-1',
      approvedMdocFields: ['org.iso.18013.5.1.given_name'],
      profileCeiling: [
        'org.iso.18013.5.1.family_name',
        'org.iso.18013.5.1.given_name',
      ],
      sharingMode: 'mdoc-only',
      mdocPayloadBytes: 10,
    })

    expect(mockArmProximitySession).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedMdocFields: ['org.iso.18013.5.1.given_name'],
        profileCeiling: [
          'org.iso.18013.5.1.family_name',
          'org.iso.18013.5.1.given_name',
        ],
      }),
    )
  })
})
