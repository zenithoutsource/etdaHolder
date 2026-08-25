import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import {
  hasHardwareCredentialKey,
  openHardwareCredentialSigningSession,
} from '@/src/services/crypto/hardwareCredentialSigningKey'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import {
  requireNativeProximityModule,
  type BuildDcApiDeviceResponseParams,
} from './nativeProximityModule'

export type { BuildDcApiDeviceResponseParams } from './nativeProximityModule'

export async function buildDcApiDeviceResponseAsync(
  params: BuildDcApiDeviceResponseParams,
): Promise<string> {
  if (!isHardwareP256SigningEnabled() || !hasHardwareCredentialKey(params.credentialId)) {
    const error = new Error('DcApiHardwareCredentialKeyRequired')
    logWalletError('dc-api-mdoc', 'hardware credential key unavailable', error)
    throw error
  }

  const session = await openHardwareCredentialSigningSession(params.credentialId, 'mdoc', 1)
  try {
    logWalletStep('dc-api-mdoc', 'building DeviceResponse', {
      approvedFieldCount: params.approvedNamespaceKeys.length,
      encryptedResponse: Boolean(params.encryptionJwkJson),
    })
    return await requireNativeProximityModule().buildDcApiDeviceResponse({
      ...params,
      opaqueNativeHandle: session.opaqueNativeHandle,
    })
  } catch (error) {
    logWalletError('dc-api-mdoc', 'DeviceResponse build failed', error, {
      approvedFieldCount: params.approvedNamespaceKeys.length,
      encryptedResponse: Boolean(params.encryptionJwkJson),
    })
    throw error
  } finally {
    try {
      await session.close()
    } catch (error) {
      logWalletError('dc-api-mdoc', 'hardware signing session close failed', error)
    }
  }
}
