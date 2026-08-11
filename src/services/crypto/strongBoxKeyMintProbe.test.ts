import {
  formatStrongBoxKeyMintReport,
  interpretKnoxVaultStrongBoxProbe,
} from './strongBoxKeyMintProbe'

describe('formatStrongBoxKeyMintReport', () => {
  test('formats a StrongBox pass result', () => {
    const report = formatStrongBoxKeyMintReport({
      featureStrongBoxKeystore: true,
      strongBoxRequested: true,
      strongBoxFallback: false,
      keyCreatePath: 'strongbox',
      securityLevel: 'STRONGBOX',
      signVerifyOk: true,
      knoxVaultStrongBoxPathAvailable: true,
      knoxVaultWalletKeyPathAvailable: true,
      walletSpecSecurityLevel: 'STRONGBOX',
      overallPass: true,
    })

    expect(report).toContain('FEATURE_STRONGBOX_KEYSTORE: yes')
    expect(report).toContain('basic keyCreatePath: strongbox')
    expect(report).toContain('basic securityLevel: STRONGBOX')
    expect(report).toContain('knoxVaultWalletKeyPathAvailable: yes')
    expect(report).toContain('overallPass: PASS')
  })

  test('formats a TEE fallback result with StrongBoxUnavailableException on top', () => {
    const report = formatStrongBoxKeyMintReport({
      featureStrongBoxKeystore: false,
      strongBoxRequested: true,
      strongBoxFallback: true,
      strongBoxUnavailableExceptionClass: 'android.security.keystore.StrongBoxUnavailableException',
      strongBoxUnavailableExceptionMessage: 'Unsupported StrongBox EC: secp256r1',
      keyCreatePath: 'tee-after-strongbox-unavailable',
      securityLevel: 'TEE',
      signVerifyOk: true,
      walletSpecStrongBoxFallback: true,
      walletSpecSecurityLevel: 'TEE',
      knoxVaultStrongBoxPathAvailable: false,
      knoxVaultWalletKeyPathAvailable: false,
      overallPass: true,
    })

    expect(report).toContain(
      'android.security.keystore.StrongBoxUnavailableException: Unsupported StrongBox EC: secp256r1',
    )
    expect(report).toContain('basic strongBoxFallback: yes')
    expect(report).toContain('basic securityLevel: TEE')
    expect(report).toContain('knoxVaultWalletKeyPathAvailable: no')
  })
})

describe('interpretKnoxVaultStrongBoxProbe', () => {
  test('detects wallet holder key on StrongBox path', () => {
    const interpretation = interpretKnoxVaultStrongBoxProbe({
      featureStrongBoxKeystore: true,
      strongBoxRequested: true,
      strongBoxFallback: false,
      knoxVaultWalletKeyPathAvailable: true,
      walletSpecSecurityLevel: 'STRONGBOX',
      overallPass: true,
    })

    expect(interpretation.walletHolderKeyUsesStrongBox).toBe(true)
    expect(interpretation.summary).toContain('wallet holder key policy')
  })
})
