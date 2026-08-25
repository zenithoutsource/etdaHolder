import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import {
  hasHardwareCredentialKey,
  openHardwareCredentialSigningSession,
} from '@/src/services/crypto/hardwareCredentialSigningKey'

import { buildDcApiDeviceResponseAsync } from './dcApiDeviceResponse'
import { requireNativeProximityModule } from './nativeProximityModule'

jest.mock('@/src/config/hardwareSigningPolicy', () => ({
  isHardwareP256SigningEnabled: jest.fn(),
}))
jest.mock('@/src/services/crypto/hardwareCredentialSigningKey', () => ({
  hasHardwareCredentialKey: jest.fn(),
  openHardwareCredentialSigningSession: jest.fn(),
}))
jest.mock('./nativeProximityModule', () => ({
  requireNativeProximityModule: jest.fn(),
}))
jest.mock('@/src/services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

const params = {
  credentialId: 'credential-mdl-1',
  approvedNamespaceKeys: ['org.iso.18013.5.1/family_name'],
  origin: 'https://example.com',
  nonce: 'nonce-1',
  encryptionJwkJson: '{"kty":"EC"}',
}

describe('buildDcApiDeviceResponseAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(isHardwareP256SigningEnabled).mockReturnValue(true)
    jest.mocked(hasHardwareCredentialKey).mockReturnValue(true)
  })

  test('builds with one opaque mdoc session and closes it after success', async () => {
    const close = jest.fn().mockResolvedValue(undefined)
    jest.mocked(openHardwareCredentialSigningSession).mockResolvedValue({
      opaqueNativeHandle: 'opaque-session-1',
      sign: jest.fn(),
      close,
    })
    const buildDcApiDeviceResponse = jest.fn().mockResolvedValue('device-response-base64url')
    jest.mocked(requireNativeProximityModule).mockReturnValue({ buildDcApiDeviceResponse } as never)

    await expect(buildDcApiDeviceResponseAsync(params)).resolves.toBe('device-response-base64url')

    expect(openHardwareCredentialSigningSession).toHaveBeenCalledWith('credential-mdl-1', 'mdoc', 1)
    expect(buildDcApiDeviceResponse).toHaveBeenCalledWith({
      ...params,
      opaqueNativeHandle: 'opaque-session-1',
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  test('closes the hardware session when native DeviceResponse construction fails', async () => {
    const close = jest.fn().mockResolvedValue(undefined)
    jest.mocked(openHardwareCredentialSigningSession).mockResolvedValue({
      opaqueNativeHandle: 'opaque-session-2',
      sign: jest.fn(),
      close,
    })
    jest.mocked(requireNativeProximityModule).mockReturnValue({
      buildDcApiDeviceResponse: jest.fn().mockRejectedValue(new Error('native-failed')),
    } as never)

    await expect(buildDcApiDeviceResponseAsync(params)).rejects.toThrow('native-failed')
    expect(close).toHaveBeenCalledTimes(1)
  })

  test('fails closed without a hardware credential key', async () => {
    jest.mocked(hasHardwareCredentialKey).mockReturnValue(false)

    await expect(buildDcApiDeviceResponseAsync(params)).rejects.toThrow(
      'DcApiHardwareCredentialKeyRequired',
    )
    expect(openHardwareCredentialSigningSession).not.toHaveBeenCalled()
    expect(requireNativeProximityModule).not.toHaveBeenCalled()
  })
})
