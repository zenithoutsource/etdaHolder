import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import {
  hasHardwareCredentialKey,
  openHardwareCredentialSigningSession,
} from '@/src/services/crypto/hardwareCredentialSigningKey'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { isNativeProximityModuleAvailable, requireNativeProximityModule } from '@/src/services/proximity/nativeProximityModule'

import { readApprovedMdocNamespaceKeysForPresentation } from './mdocNamespaceKeys'
import { readMdocVpTokenEntry } from './mdocVpTokenEntry'
import type { ResolvedPresentationRequest } from './presentationService'

export type BuildOid4vpMdocVpTokenInput = {
  request: ResolvedPresentationRequest
  selectedClaimKeys?: readonly string[]
}

/** True when online OID4VP mDoc will use a hardware-signed DeviceResponse (sign-time biometric). */
export function canBuildOid4vpMdocDeviceResponse(credentialId: string): boolean {
  return isNativeProximityModuleAvailable()
    && isHardwareP256SigningEnabled()
    && hasHardwareCredentialKey(credentialId)
}

/**
 * Build an OID4VP online mDoc vp_token entry as base64url DeviceResponse CBOR.
 * Falls back to interim raw issuer bytes only when native DeviceResponse is unavailable.
 */
export async function buildOid4vpMdocVpTokenEntry(input: BuildOid4vpMdocVpTokenInput): Promise<string> {
  const { request } = input
  const credential = request.matchedCredential
  const approvedNamespaceKeys = readApprovedMdocNamespaceKeysForPresentation(request, input.selectedClaimKeys)

  const canBuildDeviceResponse = canBuildOid4vpMdocDeviceResponse(credential.id)

  if (!canBuildDeviceResponse) {
    logWalletStep('oid4vp', 'mdoc-vp-token-fallback-raw-issuer', {
      credentialId: credential.id,
      nativeModule: isNativeProximityModuleAvailable(),
      hardwareSigning: isHardwareP256SigningEnabled(),
      hardwareCredentialKey: hasHardwareCredentialKey(credential.id),
    })
    return readMdocVpTokenEntry(credential.id, credential.rawVc)
  }

  const encryptionJwkJson = request.responseMode === 'direct_post.jwt'
    ? (() => {
      if (!request.responseEncryption) {
        throw new Error('PresentationSubmissionFailed: direct_post.jwt response encryption parameters are missing')
      }
      return JSON.stringify(request.responseEncryption.jwk)
    })()
    : undefined

  try {
    const deviceResponse = await buildOid4vpDeviceResponseAsync({
      credentialId: credential.id,
      approvedNamespaceKeys,
      clientId: request.clientId,
      nonce: request.nonce,
      responseUri: request.responseUri,
      ...(encryptionJwkJson ? { encryptionJwkJson } : {}),
    })
    logWalletStep('oid4vp', 'mdoc-vp-token-device-response-built', {
      credentialId: credential.id,
      approvedFieldCount: approvedNamespaceKeys.length,
      encodedBytes: deviceResponse.length,
      encryptedResponse: Boolean(encryptionJwkJson),
    })
    return deviceResponse
  } catch (error) {
    logWalletError('oid4vp', 'mdoc-vp-token-device-response-failed', error, {
      credentialId: credential.id,
      approvedFieldCount: approvedNamespaceKeys.length,
    })
    throw error
  }
}

async function buildOid4vpDeviceResponseAsync(input: {
  credentialId: string
  approvedNamespaceKeys: string[]
  clientId: string
  nonce: string
  responseUri: string
  encryptionJwkJson?: string
}): Promise<string> {
  if (!isHardwareP256SigningEnabled() || !hasHardwareCredentialKey(input.credentialId)) {
    throw new Error('Oid4vpMdocHardwareCredentialKeyRequired')
  }

  const session = await openHardwareCredentialSigningSession(input.credentialId, 'mdoc', 1)
  try {
    return await requireNativeProximityModule().buildOid4vpDeviceResponse({
      ...input,
      opaqueNativeHandle: session.opaqueNativeHandle,
    })
  } finally {
    await session.close()
  }
}
