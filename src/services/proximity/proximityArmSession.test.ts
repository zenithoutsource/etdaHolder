/* eslint-disable import/first */

jest.mock('./deviceAuth', () => ({
  prepareMdocDeviceAuthForArm: jest.fn(async () => {
    throw new Error('ProximityHardwareDeviceAuthUnavailable')
  }),
  releaseMdocDeviceAuthSession: jest.fn(async () => undefined),
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
  requireNativeProximityModule: jest.fn(() => ({
    armProximitySession: jest.fn(async () => undefined),
  })),
}))

import { prepareMdocDeviceAuthForArm } from './deviceAuth'
import { startProximityPresentation } from './proximityPresentation'
import { armProximityPresentation } from './proximityArmSession'

describe('armProximityPresentation', () => {
  const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
    jest.clearAllMocks()
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

    expect(prepareMdocDeviceAuthForArm).toHaveBeenCalledTimes(1)
    expect(prepareMdocDeviceAuthForArm).toHaveBeenCalledWith('cred-dual')
    expect(startProximityPresentation).not.toHaveBeenCalled()
  })
})
