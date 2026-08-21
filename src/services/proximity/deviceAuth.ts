import { createHash } from 'react-native-quick-crypto'

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { signProof, withUnlockedHolderSeedForProximity } from '../crypto/crypto'
import {
  hasHardwareCredentialKey,
  openHardwareCredentialSigningSession,
} from '../crypto/hardwareCredentialSigningKey'
import type { HardwareSigningSession } from '../crypto/hardwareEcdsaTypes'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { requireNativeProximityModule } from './nativeProximityModule'

export type DeviceAuthInput = {
  sessionTranscript: Uint8Array
  docType: string
  deviceNameSpaces: Record<string, Record<string, unknown>>
  credentialId: string
}

let activeMdocHardwareSession: HardwareSigningSession | undefined

async function releaseActiveMdocHardwareSession(): Promise<void> {
  const session = activeMdocHardwareSession
  activeMdocHardwareSession = undefined
  if (!session) return
  try {
    await session.close()
  } catch (error) {
    logWalletError('proximity-auth', 'mdoc hardware session close failed', error)
  }
}

export async function prepareMdocDeviceAuthForArm(credentialId: string): Promise<void> {
  logWalletStep('proximity-auth', 'preparing mdoc device auth for arm')
  await releaseActiveMdocHardwareSession()

  if (isHardwareP256SigningEnabled()) {
    if (!credentialId || !hasHardwareCredentialKey(credentialId)) {
      const error = new Error('ProximityHardwareDeviceAuthUnavailable')
      logWalletError('proximity-auth', 'hardware mdoc device auth unavailable', error, {
        credentialIdPresent: Boolean(credentialId),
      })
      throw error
    }

    try {
      const session = await openHardwareCredentialSigningSession(credentialId, 'mdoc')
      activeMdocHardwareSession = session
      await requireNativeProximityModule().installMdocSigningHandle(session.opaqueNativeHandle)
      logWalletStep('proximity-auth', 'hardware mdoc signing handle installed')
      return
    } catch (error) {
      await releaseActiveMdocHardwareSession()
      logWalletError('proximity-auth', 'hardware mdoc device auth prepare failed', error)
      throw new Error('ProximityAuthenticationFailed')
    }
  }

  try {
    await withUnlockedHolderSeedForProximity(async (seed, publicKey) => {
      await requireNativeProximityModule().installMdocDeviceKey(seed, publicKey)
    })
  } catch (error) {
    logWalletError('proximity-auth', 'mdoc device auth prepare failed', error)
    throw new Error('ProximityAuthenticationFailed')
  }
}

export async function releaseMdocDeviceAuthSession(): Promise<void> {
  await releaseActiveMdocHardwareSession()
}

export async function signDeviceAuthentication(input: DeviceAuthInput): Promise<string> {
  logWalletStep('proximity-auth', 'signing device authentication')
  try {
    const nonce = createHash('sha256').update(input.sessionTranscript).digest('base64url')
    return await signProof(nonce, input.docType, { credentialKeyId: input.credentialId })
  } catch (error) {
    logWalletError('proximity-auth', 'signing failed', error)
    throw new Error('ProximityAuthenticationFailed')
  }
}
