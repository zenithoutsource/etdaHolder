type NativeEd25519SignerSupport = {
  isNativeEd25519SignerAvailable: () => boolean
}

export function assertNativeEd25519SignerSupported(
  signer: NativeEd25519SignerSupport,
): void {
  if (!signer.isNativeEd25519SignerAvailable()) {
    throw new Error('NativeEd25519SignerRequired: Android hardware-backed Ed25519 signer is unavailable')
  }
}
