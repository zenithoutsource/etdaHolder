import { signProof } from '../crypto/crypto'
import { prepareMdocDeviceAuthForArm, signDeviceAuthentication } from './deviceAuth'

jest.mock('../crypto/crypto', () => ({
  signProof: jest.fn(),
  withUnlockedHolderSeedForProximity: jest.fn(async (operation: (seed: Uint8Array, publicKey: Uint8Array) => Promise<void>) => {
    await operation(new Uint8Array(32), new Uint8Array(32))
  }),
}))

jest.mock('./nativeProximityModule', () => ({
  requireNativeProximityModule: () => ({
    installMdocDeviceKey: jest.fn(),
    installMdocSigningHandle: jest.fn(),
  }),
}))

const signProofMock = signProof as jest.MockedFunction<typeof signProof>

describe('deviceAuth', () => {
  const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
    jest.clearAllMocks()
  })

  test('signDeviceAuthentication passes credentialKeyId to signProof', async () => {
    signProofMock.mockResolvedValue('proof.jwt')

    await signDeviceAuthentication({
      sessionTranscript: new Uint8Array([1, 2, 3]),
      docType: 'org.iso.18013.5.1.mDL',
      deviceNameSpaces: {},
      credentialId: 'cred-mdoc-1',
    })

    expect(signProofMock).toHaveBeenCalledWith(
      expect.any(String),
      'org.iso.18013.5.1.mDL',
      { credentialKeyId: 'cred-mdoc-1' },
    )
  })

  test('prepareMdocDeviceAuthForArm fails closed when hardware P-256 is on', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    const { withUnlockedHolderSeedForProximity } = jest.requireMock('../crypto/crypto') as {
      withUnlockedHolderSeedForProximity: jest.Mock
    }

    await expect(prepareMdocDeviceAuthForArm('cred-mdoc-1')).rejects.toThrow(
      'ProximityHardwareDeviceAuthUnavailable',
    )
    expect(withUnlockedHolderSeedForProximity).not.toHaveBeenCalled()
  })
})
