import { createHash } from 'react-native-quick-crypto'

import { signProof, withUnlockedHolderSeedForProximity } from '../crypto/crypto'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { requireNativeProximityModule } from './nativeProximityModule'

export type DeviceAuthInput = {
  sessionTranscript: Uint8Array
  docType: string
  deviceNameSpaces: Record<string, Record<string, unknown>>
}

export async function prepareMdocDeviceAuthForArm(): Promise<void> {
  logWalletStep('proximity-auth', 'preparing mdoc device auth for arm')
  try {
    await withUnlockedHolderSeedForProximity(async (seed, publicKey) => {
      await requireNativeProximityModule().installMdocDeviceKey(seed, publicKey)
    })
  } catch (error) {
    logWalletError('proximity-auth', 'mdoc device auth prepare failed', error)
    throw new Error('ProximityAuthenticationFailed')
  }
}

export async function signDeviceAuthentication(input: DeviceAuthInput): Promise<string> {
  logWalletStep('proximity-auth', 'signing device authentication')
  try {
    const nonce = createHash('sha256').update(input.sessionTranscript).digest('base64url')
    return await signProof(nonce, input.docType)
  } catch (error) {
    logWalletError('proximity-auth', 'signing failed', error)
    throw new Error('ProximityAuthenticationFailed')
  }
}
