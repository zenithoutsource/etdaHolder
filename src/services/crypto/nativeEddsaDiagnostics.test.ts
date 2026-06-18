import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { getNativeEd25519Diagnostics } from './nativeEddsaSigner'
import { runNativeEd25519Diagnostics } from './nativeEddsaDiagnostics'

jest.mock('../debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('./nativeEddsaSigner', () => ({
  getNativeEd25519Diagnostics: jest.fn(),
}))

describe('native Ed25519 diagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('logs structured native Ed25519 diagnostics in development', () => {
    const diagnostics = {
      sdkInt: 36,
      deviceModel: 'SM-S928B',
      hasHardwareKeystore: true,
      hasCurve25519HardwareKeystore: true,
      hasStrongBoxKeystore: true,
      recipes: [
        {
          label: 'R1-Ed25519-sign',
          requestedAlgorithm: 'Ed25519',
          requestedPurposes: 4,
          privateKeyAlgorithm: '1.3.101.112',
          publicKeyAlgorithm: 'EdDSA',
          publicKeyLooksEd25519: true,
          signVerifyOk: true,
          securityLevel: 1,
          securityLevelLabel: 'TRUSTED_ENVIRONMENT',
          hardwareBacked: true,
        },
      ],
      supported: true,
    }
    jest.mocked(getNativeEd25519Diagnostics).mockReturnValue(diagnostics)

    runNativeEd25519Diagnostics(true)

    expect(getNativeEd25519Diagnostics).toHaveBeenCalledTimes(1)
    expect(logWalletStep).toHaveBeenCalledWith('native-eddsa', 'diagnostics', diagnostics)
    expect(logWalletError).not.toHaveBeenCalled()
  })

  test('does not call native diagnostics outside development', () => {
    runNativeEd25519Diagnostics(false)

    expect(getNativeEd25519Diagnostics).not.toHaveBeenCalled()
    expect(logWalletStep).not.toHaveBeenCalled()
  })

  test('logs diagnostic failures without blocking startup', () => {
    const error = new Error('native module missing')
    jest.mocked(getNativeEd25519Diagnostics).mockImplementation(() => {
      throw error
    })

    runNativeEd25519Diagnostics(true)

    expect(logWalletError).toHaveBeenCalledWith('native-eddsa', 'diagnostics-failed', error)
  })
})
