import { useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'

import { AppButton } from './AppButton'
import { WalletInitiatedVpQrPanel } from './WalletInitiatedVpQrPanel'
import { useWalletInitiatedVpQrSession } from '../hooks/useWalletInitiatedVpQrSession'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = {
  visible: boolean
  credential: VerifiableCredentialRecord
  onClose: () => void
}

export function VpQrModal({ visible, credential, onClose }: Props) {
  const router = useRouter()
  const { phase, qrUrl, minutes, seconds, sessionId, authorizationRequestUri, startSession } =
    useWalletInitiatedVpQrSession({
      credential,
      active: visible,
    })

  const handleRetry = useCallback(() => {
    void startSession()
  }, [startSession])

  useEffect(() => {
    if (!visible || phase !== 'request_ready' || !authorizationRequestUri || !sessionId) return

    onClose()
    router.push({
      pathname: '/(tabs)/qr',
      params: {
        brokerSessionId: sessionId,
        credentialId: credential.id,
      },
    })
  }, [authorizationRequestUri, credential.id, onClose, phase, router, sessionId, visible])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/45 px-6"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close VP QR dialog"
      >
        <Pressable
          className="w-full max-w-[340px] rounded-2xl bg-white px-6 py-7"
          onPress={(event) => event.stopPropagation()}
        >
          <WalletInitiatedVpQrPanel
            phase={phase}
            qrUrl={qrUrl}
            minutes={minutes}
            seconds={seconds}
            onRetry={handleRetry}
            variant="modal"
          />

          <View className="mt-6">
            <AppButton
              variant="outline-block"
              label="ยกเลิก"
              onPress={onClose}
              className="w-full rounded-xl py-3"
              textClassName="text-center text-sm font-bold"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
