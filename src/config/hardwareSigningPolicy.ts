/** Action-scoped signing session TTL (ms). Align with Android auth validity window. */
export function readHardwareSigningSessionTtlMs(): number {
  return Number(process.env.EXPO_PUBLIC_HARDWARE_SIGNING_SESSION_TTL_MS) || 30_000
}

/**
 * mdoc sessions must last at least as long as the HCE arm window so a tap
 * inside that window is not rejected as SigningSessionExpired.
 */
export function readHardwareSigningSessionTtlMsForPurpose(
  purpose: 'oid4vci' | 'oid4vp' | 'mdoc' | 'attest',
): number {
  const sessionTtlMs = readHardwareSigningSessionTtlMs()
  if (purpose !== 'mdoc') return sessionTtlMs
  const armWindowMs = Number(process.env.EXPO_PUBLIC_HCE_ARM_WINDOW_MS) || 60_000
  return Math.max(sessionTtlMs, armWindowMs)
}

/** Default max signatures per purpose when caller does not override. */
export function readDefaultMaxSignatures(purpose: 'oid4vci' | 'oid4vp' | 'mdoc' | 'attest'): number {
  const envKey =
    purpose === 'oid4vci'
      ? process.env.EXPO_PUBLIC_HARDWARE_SIGNING_MAX_SIGS_OID4VCI
      : purpose === 'oid4vp'
        ? process.env.EXPO_PUBLIC_HARDWARE_SIGNING_MAX_SIGS_OID4VP
        : purpose === 'mdoc'
          ? process.env.EXPO_PUBLIC_HARDWARE_SIGNING_MAX_SIGS_MDOC
          : process.env.EXPO_PUBLIC_HARDWARE_SIGNING_MAX_SIGS_ATTEST
  const fallback =
    purpose === 'oid4vci' ? 8 : purpose === 'mdoc' ? 16 : purpose === 'oid4vp' ? 4 : 2
  return Number(envKey) || fallback
}

/** When true, production Android uses hardware P-256 signer instead of Keychain Ed25519. Default on; set `false` to use the Ed25519 path. */
export function isHardwareP256SigningEnabled(): boolean {
  return process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED !== 'false'
}
