import { p256 } from '@noble/curves/nist.js'

import { readHardwareSigningSessionTtlMsForPurpose } from '@/src/config/hardwareSigningPolicy'

import { p256PublicKeyToJwk, signEs256Prehash } from './p256Identity'
import type {
  CreateKeyOptions,
  CreateKeyResult,
  HardwareEcdsaSigner,
  HardwareSecurityLevel,
  HardwareSigningSession,
  OpenSigningSessionOptions,
} from './hardwareEcdsaTypes'
import {
  HardwareEcdsaUnavailableError,
  HardwareKeyNotFoundError,
  HardwareSigningSessionError,
} from './hardwareEcdsaTypes'

export class StrongBoxUnavailableError extends Error {
  constructor(message = 'StrongBoxUnavailable') {
    super(message)
    this.name = 'StrongBoxUnavailableError'
  }
}

type StoredMockKey = {
  privateKey: Uint8Array
  publicKey: Uint8Array
  securityLevel: HardwareSecurityLevel
  attestationChallenge?: Uint8Array
}

type ActiveSession = {
  alias: string
  purpose: OpenSigningSessionOptions['purpose']
  expiresAtMs: number
  maxSignatures: number
  signaturesUsed: number
  closed: boolean
}

let sessionCounter = 0

function createMockAttestationChain(challenge: Uint8Array): Uint8Array[] {
  const leaf = new Uint8Array([0x30, challenge.length, ...challenge])
  const root = new Uint8Array([0x30, 0x02, 0x01, 0x00])
  return [leaf, root]
}

function requireKey(store: Map<string, StoredMockKey>, alias: string): StoredMockKey {
  const key = store.get(alias)
  if (!key) throw new HardwareKeyNotFoundError(alias)
  return key
}

/** In-memory HardwareEcdsaSigner for CI and unit tests. */
export function createMockHardwareEcdsaSigner(store = new Map<string, StoredMockKey>()): HardwareEcdsaSigner {
  const sessions = new Map<string, ActiveSession>()

  return {
    async createKey(alias: string, options: CreateKeyOptions = {}): Promise<CreateKeyResult> {
      if (options.simulateGenericKeygenFailure) {
        throw new HardwareEcdsaUnavailableError('MockGenericKeygenFailure')
      }

      let securityLevel: HardwareSecurityLevel = 'STRONGBOX'
      if (options.simulateStrongBoxUnavailable) {
        securityLevel = 'TEE'
      }

      const { secretKey, publicKey } = p256.keygen()

      store.set(alias, {
        privateKey: secretKey,
        publicKey,
        securityLevel,
        attestationChallenge: options.attestationChallenge,
      })

      const result: CreateKeyResult = {
        publicJwk: p256PublicKeyToJwk(publicKey),
        securityLevel,
      }

      if (options.attestationChallenge) {
        result.certificateChainDer = createMockAttestationChain(options.attestationChallenge)
      }

      return result
    },

    async getPublicJwk(alias: string) {
      const key = requireKey(store, alias)
      return p256PublicKeyToJwk(key.publicKey)
    },

    async getSecurityLevel(alias: string) {
      return requireKey(store, alias).securityLevel
    },

    async hasKey(alias: string) {
      return store.has(alias)
    },

    async openSigningSession(alias: string, options: OpenSigningSessionOptions): Promise<HardwareSigningSession> {
      const key = requireKey(store, alias)
      const handle = `mock-session-${++sessionCounter}`
      const session: ActiveSession = {
        alias,
        purpose: options.purpose,
        expiresAtMs: Date.now() + readHardwareSigningSessionTtlMsForPurpose(options.purpose),
        maxSignatures: options.maxSignatures,
        signaturesUsed: 0,
        closed: false,
      }
      sessions.set(handle, session)

      return {
        opaqueNativeHandle: handle,
        async sign(data: Uint8Array): Promise<Uint8Array> {
          const active = sessions.get(handle)
          if (!active || active.closed) {
            throw new HardwareSigningSessionError('MockSigningSessionClosed')
          }
          if (Date.now() > active.expiresAtMs) {
            throw new HardwareSigningSessionError('MockSigningSessionExpired')
          }
          if (active.purpose !== options.purpose) {
            throw new HardwareSigningSessionError('MockSigningSessionPurposeMismatch')
          }
          if (active.signaturesUsed >= active.maxSignatures) {
            throw new HardwareSigningSessionError('MockSigningSessionMaxSignaturesExceeded')
          }
          active.signaturesUsed += 1
          return signEs256Prehash(data, key.privateKey)
        },
        async close(): Promise<void> {
          const active = sessions.get(handle)
          if (active) active.closed = true
        },
      }
    },

    async deleteKey(alias: string): Promise<void> {
      store.delete(alias)
      for (const [handle, session] of sessions.entries()) {
        if (session.alias === alias) {
          session.closed = true
          sessions.delete(handle)
        }
      }
    },
  }
}

/** StrongBox-first mock that retries TEE only on explicit StrongBoxUnavailableError. */
export function createStrongBoxFirstMockHardwareEcdsaSigner(
  store = new Map<string, StoredMockKey>(),
): HardwareEcdsaSigner {
  const inner = createMockHardwareEcdsaSigner(store)

  return {
    async createKey(alias: string, options: CreateKeyOptions = {}): Promise<CreateKeyResult> {
      if (options.simulateStrongBoxUnavailable) {
        return inner.createKey(alias, { ...options, simulateStrongBoxUnavailable: true })
      }
      if (options.simulateGenericKeygenFailure) {
        throw new HardwareEcdsaUnavailableError('MockGenericKeygenFailure')
      }

      try {
        return await inner.createKey(alias, options)
      } catch (error) {
        if (error instanceof StrongBoxUnavailableError) {
          return inner.createKey(alias, { ...options, simulateStrongBoxUnavailable: true })
        }
        throw error
      }
    },
    getPublicJwk: (alias) => inner.getPublicJwk(alias),
    getSecurityLevel: (alias) => inner.getSecurityLevel(alias),
    hasKey: (alias) => inner.hasKey(alias),
    openSigningSession: (alias, options) => inner.openSigningSession(alias, options),
    deleteKey: (alias) => inner.deleteKey(alias),
  }
}

/** Test helper: createKey that throws StrongBoxUnavailable on first attempt unless simulateStrongBoxUnavailable is set. */
export function createStrongBoxFallbackProbeSigner(store = new Map<string, StoredMockKey>()): HardwareEcdsaSigner {
  const inner = createMockHardwareEcdsaSigner(store)

  return {
    async createKey(alias: string, options: CreateKeyOptions = {}): Promise<CreateKeyResult> {
      if (options.simulateGenericKeygenFailure) {
        throw new HardwareEcdsaUnavailableError('MockGenericKeygenFailure')
      }
      if (options.simulateStrongBoxUnavailable) {
        return inner.createKey(alias, { ...options, simulateStrongBoxUnavailable: true })
      }

      try {
        throw new StrongBoxUnavailableError()
      } catch (error) {
        if (error instanceof StrongBoxUnavailableError) {
          return inner.createKey(alias, { ...options, simulateStrongBoxUnavailable: true })
        }
        throw error
      }
    },
    getPublicJwk: (alias) => inner.getPublicJwk(alias),
    getSecurityLevel: (alias) => inner.getSecurityLevel(alias),
    hasKey: (alias) => inner.hasKey(alias),
    openSigningSession: (alias, options) => inner.openSigningSession(alias, options),
    deleteKey: (alias) => inner.deleteKey(alias),
  }
}

export function resetMockHardwareEcdsaStores(): void {
  sessionCounter = 0
}
