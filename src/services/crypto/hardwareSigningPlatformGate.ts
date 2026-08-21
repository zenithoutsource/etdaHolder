import { Platform } from 'react-native'

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'

export class HardwareSigningPlatformBlockedError extends Error {
  constructor(message = 'HardwareSigningPlatformBlocked') {
    super(message)
    this.name = 'HardwareSigningPlatformBlockedError'
  }
}

/**
 * Fail closed on iOS when hardware P-256 signing is enabled.
 * Production iOS holder signing stays blocked until Secure Enclave lands.
 */
export function assertHardwareSigningPlatformAllowed(): void {
  if (!isHardwareP256SigningEnabled()) return
  if (Platform.OS === 'ios') {
    throw new HardwareSigningPlatformBlockedError(
      'iOS production holder signing is blocked until Secure Enclave support ships',
    )
  }
}

export function isHardwareSigningPlatformBlocked(): boolean {
  return isHardwareP256SigningEnabled() && Platform.OS === 'ios'
}
