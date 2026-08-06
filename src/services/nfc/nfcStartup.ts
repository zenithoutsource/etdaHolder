import type { PlatformOSType } from 'react-native'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { initNfc } from './nfcTagService'

export async function prewarmNfc(platform: PlatformOSType): Promise<void> {
  if (platform === 'web') {
    return
  }

  logWalletStep('startup', 'nfc-prewarm-start', { platform })

  try {
    await initNfc()
    logWalletStep('startup', 'nfc-prewarm-complete', { platform })
  } catch (error) {
    logWalletError('startup', 'nfc-prewarm-failed', error, { platform })
  }
}
