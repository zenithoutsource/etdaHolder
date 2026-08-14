import { Platform } from 'react-native'

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'

import { createMockHardwareEcdsaSigner } from './hardwareEcdsaSigner.mock'
import type { HardwareEcdsaSigner } from './hardwareEcdsaTypes'
import { HardwareEcdsaUnavailableError } from './hardwareEcdsaTypes'
import { assertHardwareSigningPlatformAllowed } from './hardwareSigningPlatformGate'

export type HardwareEcdsaBackend = 'animo' | 'custom' | 'mock'

let cachedSigner: HardwareEcdsaSigner | undefined
let cachedBackend: HardwareEcdsaBackend | undefined

/** Test-only override for resolver routing tests. */
export function __resetHardwareEcdsaSignerCacheForTests(): void {
  cachedSigner = undefined
  cachedBackend = undefined
}

export function __setHardwareEcdsaSignerForTests(
  signer: HardwareEcdsaSigner,
  backend: HardwareEcdsaBackend = 'mock',
): void {
  cachedSigner = signer
  cachedBackend = backend
}

export function readHardwareEcdsaBackendPreference(): HardwareEcdsaBackend {
  const raw = process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND
  if (raw === 'animo') return 'animo'
  if (raw === 'mock') return 'mock'
  return 'custom'
}

function resolveBackendForRuntime(): HardwareEcdsaBackend {
  if (process.env.NODE_ENV === 'test') return 'mock'

  if (!isHardwareP256SigningEnabled()) {
    if (__DEV__) return 'mock'
    throw new HardwareEcdsaUnavailableError(
      'HardwareP256SigningDisabled: EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED=false',
    )
  }

  assertHardwareSigningPlatformAllowed()

  if (Platform.OS !== 'android') {
    throw new HardwareEcdsaUnavailableError('HardwareP256SigningRequiresAndroid')
  }

  return readHardwareEcdsaBackendPreference()
}

function loadBackendSigner(backend: HardwareEcdsaBackend): HardwareEcdsaSigner {
  if (backend === 'mock') {
    return createMockHardwareEcdsaSigner()
  }

  if (backend === 'custom') {
    const { createCustomHardwareEcdsaSigner } = require('./hardwareEcdsaSigner.custom') as typeof import('./hardwareEcdsaSigner.custom')
    return createCustomHardwareEcdsaSigner()
  }

  const { createAnimoHardwareEcdsaSigner } = require('./hardwareEcdsaSigner.animo') as typeof import('./hardwareEcdsaSigner.animo')
  return createAnimoHardwareEcdsaSigner()
}

/**
 * Single entry point for protocol holder signing on Android hardware P-256.
 * Slice C callers use this instead of reaching for mock/native adapters directly.
 */
export function getHardwareEcdsaSigner(): HardwareEcdsaSigner {
  const backend = resolveBackendForRuntime()
  if (cachedSigner && cachedBackend === backend) {
    return cachedSigner
  }

  cachedBackend = backend
  cachedSigner = loadBackendSigner(backend)
  return cachedSigner
}

export function getActiveHardwareEcdsaBackend(): HardwareEcdsaBackend {
  return resolveBackendForRuntime()
}
