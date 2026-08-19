/**
 * Modal wallet-initiated VP QR from credential detail; routes to My QR when request-ready.
 * Journey: P4 (Wallet detail My QR action).
 * Copy: WALLET_HOME_COPY via WalletInitiatedVpQrPanel.
 * Layout: WalletInitiatedVpQrPanel; useWalletInitiatedVpQrSession.
 * Map: docs/CODEMAPS/frontend.md#my-qr
 */

import { useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'

import { AppButton } from './AppButton'
import { WalletInitiatedVpQrPanel } from './WalletInitiatedVpQrPanel'
import { useWalletInitiatedVpQrSession } from '../hooks/useWalletInitiatedVpQrSession'
import { isCredentialDocumentExpired } from '../services/credentials/credentialDocumentExpiry'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type Props = {
  visible: boolean
  credential: VerifiableCredentialRecord
  onClose: () => void
}

export function VpQrModal({ visible, credential, onClose }: Props) {
  const router = useRouter()
  const documentExpired = isCredentialDocumentExpired(credential)
  const { phase, qrUrl, minutes, seconds, sessionId, authorizationRequestUri, startSession } =
    useWalletInitiatedVpQrSession({
      credential,
      active: visible && !documentExpired,
    })

  const handleRetry = useCallback(() => {
    void startSession()
  }, [startSession])

  useEffect(() => {
    if (!visible || documentExpired || phase !== 'request_ready' || !authorizationRequestUri || !sessionId) return

    onClose()
    router.push({
      pathname: '/(tabs)/qr',
      params: {
        brokerSessionId: sessionId,
      },
    })
  }, [authorizationRequestUri, documentExpired, onClose, phase, router, sessionId, visible])

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
          {documentExpired ? null : (
            <WalletInitiatedVpQrPanel
              phase={phase}
              qrUrl={qrUrl}
              minutes={minutes}
              seconds={seconds}
              onRetry={handleRetry}
              variant="modal"
            />
          )}

          <View className={documentExpired ? undefined : 'mt-6'}>
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
