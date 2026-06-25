import { createHash } from 'react-native-quick-crypto'

import { signProof } from '../crypto/crypto'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type DeviceAuthInput = {
  sessionTranscript: Uint8Array
  docType: string
  deviceNameSpaces: Record<string, Record<string, unknown>>
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
