import { useState } from 'react'
import { Platform } from 'react-native'

import { AppButton } from '@/src/components/AppButton'
import { useAppDialog } from '@/src/components/AppDialog'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { injectTestMdlCredential, isTestMdlInjectAllowed } from '@/src/services/proximity/injectTestMdl'

export function InjectTestMdlButton() {
  const { showDialog } = useAppDialog()
  const [loading, setLoading] = useState(false)

  if (!isTestMdlInjectAllowed() || Platform.OS !== 'android') return null

  async function handlePress() {
    if (loading) return
    setLoading(true)
    try {
      await injectTestMdlCredential()
      showDialog({
        title: 'Test mDL added',
        message:
          'Open Driving Licence, tap NFC, approve consent, then paste the Waiting for tap QR into http://127.0.0.1:8787. This card is not a production issuance.',
        icon: 'success',
        actions: [{ label: 'OK', variant: 'secondary' }],
      })
    } catch (error) {
      logWalletError('proximity-test-mdl', 'inject button failed', error)
      showDialog({
        title: 'Could not add test mDL',
        message:
          'Use a debug Android build. Hardware key creation may require device authentication. Release builds cannot inject test mdocs.',
        icon: 'danger',
        actions: [{ label: 'OK', variant: 'secondary' }],
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppButton
      variant="outline-block"
      label="Add test mDL"
      loading={loading}
      disabled={loading}
      fullWidth
      onPress={() => {
        void handlePress()
      }}
      className="border-wallet-navy py-3"
      textClassName="text-center text-sm font-bold"
      accessibilityLabel="Add test mDL"
    />
  )
}
