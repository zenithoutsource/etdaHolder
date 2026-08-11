import {
  deleteKey as animoDeleteKey,
  generateKeypair,
  getPublicBytesForKeyId,
  isLocalSecureEnvironmentSupported,
  sign as animoSign,
} from '@animo-id/expo-secure-environment'

import { readHardwareSigningSessionTtlMs } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import type {
  CreateKeyOptions,
  CreateKeyResult,
  HardwareEcdsaSigner,
  HardwareSigningSession,
  OpenSigningSessionOptions,
} from './hardwareEcdsaTypes'
import {
  HardwareEcdsaUnavailableError,
  HardwareKeyNotFoundError,
  HardwareSigningSessionError,
} from './hardwareEcdsaTypes'
import { assertEs256SignatureBytes, p256PublicKeyToJwk, verifyEs256Prehash } from './p256Identity'
import { readAndroidKeySecurityLevel } from './walletHardwareEcdsaNative'

type AnimoSessionState = {
  alias: string
  purpose: OpenSigningSessionOptions['purpose']
  expiresAtMs: number
  maxSignatures: number
  signaturesUsed: number
  biometricUnlocked: boolean
  closed: boolean
}

let sessionCounter = 0
const activeSessions = new Map<string, AnimoSessionState>()

function assertAnimoSupported(): void {
  if (!isLocalSecureEnvironmentSupported()) {
    throw new HardwareEcdsaUnavailableError('AnimoSecureEnvironmentUnsupported')
  }
}

async function readPublicJwkForAlias(alias: string) {
  const compressedPublicKey = await getPublicBytesForKeyId(alias)
  return {
    publicJwk: p256PublicKeyToJwk(compressedPublicKey),
    compressedPublicKey,
  }
}

export function createAnimoHardwareEcdsaSigner(): HardwareEcdsaSigner {
  return {
    async createKey(alias: string, options: CreateKeyOptions = {}): Promise<CreateKeyResult> {
      assertAnimoSupported()

      if (options.attestationChallenge && options.attestationChallenge.length > 0) {
        throw new HardwareEcdsaUnavailableError(
          'AnimoAttestationAtCreateUnsupported: use custom AndroidKeyStore module for challenged k_attest create',
        )
      }

      try {
        await generateKeypair(alias, true)
      } catch (error) {
        logWalletError('hardware-ecdsa', 'animo-create-key-failed', error, { alias })
        throw new HardwareEcdsaUnavailableError('AnimoCreateKeyFailed')
      }

      const { publicJwk } = await readPublicJwkForAlias(alias)
      const securityLevel = await readAndroidKeySecurityLevel(alias)

      logWalletStep('hardware-ecdsa', 'animo-create-key-complete', { alias, securityLevel })
      return { publicJwk, securityLevel }
    },

    async getPublicJwk(alias: string) {
      try {
        return (await readPublicJwkForAlias(alias)).publicJwk
      } catch (error) {
        logWalletError('hardware-ecdsa', 'animo-get-public-jwk-failed', error, { alias })
        throw new HardwareKeyNotFoundError(alias)
      }
    },

    async getSecurityLevel(alias: string) {
      try {
        return await readAndroidKeySecurityLevel(alias)
      } catch (error) {
        logWalletError('hardware-ecdsa', 'animo-get-security-level-failed', error, { alias })
        throw new HardwareKeyNotFoundError(alias)
      }
    },

    async hasKey(alias: string) {
      try {
        await getPublicBytesForKeyId(alias)
        return true
      } catch {
        return false
      }
    },

    async openSigningSession(alias: string, options: OpenSigningSessionOptions): Promise<HardwareSigningSession> {
      if (!(await this.hasKey(alias))) {
        throw new HardwareKeyNotFoundError(alias)
      }

      const handle = `animo-session-${++sessionCounter}`
      const session: AnimoSessionState = {
        alias,
        purpose: options.purpose,
        expiresAtMs: Date.now() + readHardwareSigningSessionTtlMs(),
        maxSignatures: options.maxSignatures,
        signaturesUsed: 0,
        biometricUnlocked: false,
        closed: false,
      }
      activeSessions.set(handle, session)

      const { compressedPublicKey } = await readPublicJwkForAlias(alias)

      return {
        opaqueNativeHandle: handle,
        async sign(data: Uint8Array): Promise<Uint8Array> {
          const active = activeSessions.get(handle)
          if (!active || active.closed) {
            throw new HardwareSigningSessionError('AnimoSigningSessionClosed')
          }
          if (Date.now() > active.expiresAtMs) {
            throw new HardwareSigningSessionError('AnimoSigningSessionExpired')
          }
          if (active.purpose !== options.purpose) {
            throw new HardwareSigningSessionError('AnimoSigningSessionPurposeMismatch')
          }
          if (active.signaturesUsed >= active.maxSignatures) {
            throw new HardwareSigningSessionError('AnimoSigningSessionMaxSignaturesExceeded')
          }

          const useBiometric = !active.biometricUnlocked
          let joseSignature: Uint8Array
          try {
            joseSignature = await animoSign(alias, data, useBiometric)
          } catch (error) {
            logWalletError('hardware-ecdsa', 'animo-sign-failed', error, { alias, purpose: options.purpose })
            throw new HardwareSigningSessionError('AnimoSigningFailed')
          }

          if (useBiometric) active.biometricUnlocked = true
          active.signaturesUsed += 1

          assertEs256SignatureBytes(joseSignature)

          if (__DEV__ && !verifyEs256Prehash(data, joseSignature, compressedPublicKey)) {
            throw new HardwareSigningSessionError('AnimoSignatureVerifyFailed')
          }

          return joseSignature
        },
        async close(): Promise<void> {
          const active = activeSessions.get(handle)
          if (active) active.closed = true
          activeSessions.delete(handle)
        },
      }
    },

    async deleteKey(alias: string): Promise<void> {
      try {
        await animoDeleteKey(alias)
      } catch (error) {
        logWalletError('hardware-ecdsa', 'animo-delete-key-failed', error, { alias })
        throw new HardwareKeyNotFoundError(alias)
      }

      for (const [handle, session] of activeSessions.entries()) {
        if (session.alias !== alias) continue
        session.closed = true
        activeSessions.delete(handle)
      }
    },
  }
}

export function __resetAnimoHardwareEcdsaSessionsForTests(): void {
  sessionCounter = 0
  activeSessions.clear()
}
