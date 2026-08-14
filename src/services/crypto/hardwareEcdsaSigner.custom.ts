import { readHardwareSigningSessionTtlMsForPurpose } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import type {
  CreateKeyOptions,
  CreateKeyResult,
  HardwareEcdsaSigner,
  OpenSigningSessionOptions,
} from './hardwareEcdsaTypes'
import {
  HardwareEcdsaUnavailableError,
  HardwareKeyNotFoundError,
  HardwareSigningSessionError,
  assertHardwareSecurityLevel,
} from './hardwareEcdsaTypes'
import { assertEs256SignatureBytes, p256JwkToPublicKey, verifyEs256Prehash } from './p256Identity'
import {
  base64ToBytes,
  bytesToBase64,
  getWalletHardwareEcdsaNativeModule,
  isWalletHardwareEcdsaNativeAvailable,
  mapNativeError,
  parseSignWithSessionResult,
  readAuthValiditySeconds,
} from './walletHardwareEcdsaNative'

/**
 * Custom AndroidKeyStore backend for production hardware P-256 / ES256 holder signing.
 */
export function createCustomHardwareEcdsaSigner(): HardwareEcdsaSigner {
  if (!isWalletHardwareEcdsaNativeAvailable()) {
    throw new HardwareEcdsaUnavailableError('CustomHardwareEcdsaNativeModuleMissing')
  }

  const native = getWalletHardwareEcdsaNativeModule()

  return {
    async createKey(alias: string, options: CreateKeyOptions = {}): Promise<CreateKeyResult> {
      logWalletStep('hardware-ecdsa', 'custom-create-key-start', {
        alias,
        attested: Boolean(options.attestationChallenge?.length),
      })

      try {
        const result = await native.createKey({
          alias,
          authValiditySeconds: readAuthValiditySeconds(),
          attestationChallengeBase64:
            options.attestationChallenge && options.attestationChallenge.length > 0
              ? bytesToBase64(options.attestationChallenge)
              : undefined,
        })

        logWalletStep('hardware-ecdsa', 'custom-create-key-complete', {
          alias,
          securityLevel: result.securityLevel,
          attested: Boolean(options.attestationChallenge?.length),
          diagnostics: result.diagnostics,
        })

        const createResult: CreateKeyResult = {
          publicJwk: result.publicJwk,
          securityLevel: result.securityLevel,
        }

        try {
          assertHardwareSecurityLevel(createResult.securityLevel, alias)
        } catch (error) {
          try {
            await native.deleteKey(alias)
          } catch (cleanupError) {
            logWalletError('hardware-ecdsa', 'custom-create-key-software-cleanup-failed', cleanupError, { alias })
          }
          throw error
        }

        if (result.certificateChainDerBase64.length > 0) {
          createResult.certificateChainDer = result.certificateChainDerBase64.map(base64ToBytes)
        }

        return createResult
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-create-key-failed', error, { alias })
        throw mapNativeError(error)
      }
    },

    async getPublicJwk(alias: string) {
      try {
        return await native.getPublicJwk(alias)
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-get-public-jwk-failed', error, { alias })
        throw mapNativeError(error)
      }
    },

    async getSecurityLevel(alias: string) {
      try {
        const level = await native.getSecurityLevel(alias)
        assertHardwareSecurityLevel(level, alias)
        return level
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-get-security-level-failed', error, { alias })
        throw mapNativeError(error)
      }
    },

    async hasKey(alias: string) {
      try {
        return await native.hasKey(alias)
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-has-key-failed', error, { alias })
        throw mapNativeError(error)
      }
    },

    async openSigningSession(alias: string, options: OpenSigningSessionOptions) {
      if (!(await this.hasKey(alias))) {
        throw new HardwareKeyNotFoundError(alias)
      }

      let publicKey: Uint8Array
      try {
        publicKey = p256JwkToPublicKey(await native.getPublicJwk(alias))
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-open-session-public-jwk-failed', error, { alias })
        throw mapNativeError(error)
      }

      let sessionHandle: string
      try {
        const opened = await native.openSigningSession({
          alias,
          purpose: options.purpose,
          maxSignatures: options.maxSignatures,
          expiresAtMs: Date.now() + readHardwareSigningSessionTtlMsForPurpose(options.purpose),
        })
        sessionHandle = opened.opaqueNativeHandle
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-open-session-failed', error, { alias, purpose: options.purpose })
        throw mapNativeError(error)
      }

      logWalletStep('hardware-ecdsa', 'custom-open-session-complete', {
        alias,
        purpose: options.purpose,
        maxSignatures: options.maxSignatures,
        sessionHandleSuffix: sessionHandle.split('-').pop(),
      })

      return {
        opaqueNativeHandle: sessionHandle,
        async sign(data: Uint8Array) {
          logWalletStep('hardware-ecdsa', 'custom-sign-start', {
            alias,
            purpose: options.purpose,
            dataBytes: data.length,
            sessionHandleSuffix: sessionHandle.split('-').pop(),
          })

          try {
            const signResult = parseSignWithSessionResult(
              await native.signWithSession({
                opaqueNativeHandle: sessionHandle,
                data: bytesToBase64(data),
              }),
            )
            const signature = base64ToBytes(signResult.signatureBase64)
            assertEs256SignatureBytes(signature)

            if (__DEV__ && !verifyEs256Prehash(data, signature, publicKey)) {
              logWalletError('hardware-ecdsa', 'custom-sign-verify-failed', new Error('CustomSignatureVerifyFailed'), {
                alias,
                purpose: options.purpose,
                diagnostics: signResult.diagnostics,
              })
              throw new HardwareSigningSessionError('CustomSignatureVerifyFailed')
            }

            logWalletStep('hardware-ecdsa', 'custom-sign-complete', {
              alias,
              purpose: options.purpose,
              signatureBytes: signature.length,
              diagnostics: signResult.diagnostics,
            })

            return signature
          } catch (error) {
            logWalletError('hardware-ecdsa', 'custom-sign-failed', error, {
              alias,
              purpose: options.purpose,
              dataBytes: data.length,
            })
            throw mapNativeError(error)
          }
        },
        async close() {
          try {
            await native.closeSigningSession(sessionHandle)
          } catch (error) {
            logWalletError('hardware-ecdsa', 'custom-close-session-failed', error, { alias })
            throw mapNativeError(error)
          }
        },
      }
    },

    async deleteKey(alias: string) {
      try {
        await native.deleteKey(alias)
      } catch (error) {
        logWalletError('hardware-ecdsa', 'custom-delete-key-failed', error, { alias })
        throw mapNativeError(error)
      }
    },
  }
}

/** Convenience guard for tests and diagnostics. */
export function assertCustomHardwareEcdsaAvailable(): void {
  if (!isWalletHardwareEcdsaNativeAvailable()) {
    throw new HardwareKeyNotFoundError('custom-native-module')
  }
}
