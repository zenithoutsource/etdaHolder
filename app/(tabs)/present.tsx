/**
 * Hidden NFC presentment — ISO 18013-5 static handover + HCE for one credential.
 * Journey: P4 proximity (tap-only; no holder QR on waiting).
 * Copy: readerProfiles + cardSchemas labels; waiting Thai is inline in WaitingForTapPanel.
 * Layout: PreTapConsentPanel, WaitingForTapPanel, proximity PresentationResultPanel.
 * Next: Wallet via useReturnToWallet.
 * Map: docs/CODEMAPS/frontend.md#present-and-nfc
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '@/src/components/AppButton'
import { PreTapConsentPanel } from '@/src/components/proximity/PreTapConsentPanel'
import { PresentationResultPanel } from '@/src/components/proximity/PresentationResultPanel'
import { WaitingForTapPanel } from '@/src/components/proximity/WaitingForTapPanel'
import { WalletHeader } from '@/src/components/WalletHeader'
import { getCardSchema } from '@/src/config/cardSchemas'
import { HCE_ARM_WINDOW_MS } from '@/src/config/dualFormatPolicy'
import { getReaderProfileForDocumentType } from '@/src/config/readerProfiles'
import { useAndroidBackNavigation } from '@/src/hooks/useAndroidBackNavigation'
import { useReturnToWallet } from '@/src/hooks/useReturnToWallet'
import { useStoredCredentials } from '@/src/hooks/useStoredCredentials'
import { isCredentialDocumentExpired } from '@/src/services/credentials/credentialDocumentExpiry'
import { canPresentCredentialType, readPidGateStatus } from '@/src/services/credentials/credentialGuard'
import { isCredentialPresentable } from '@/src/services/credentials/credentialLifecycle'
import { readPidGateUserCopy } from '@/src/services/credentials/pidGateDialog'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { credentialRequiresHardwareReissue } from '@/src/services/crypto/hardwareCredentialSigningKey'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { ensureNativeMdocStored } from '@/src/services/proximity/mdocCredential'
import { hasStoredMdoc } from '@/src/services/proximity/mdocStorage'
import { getNativeProximityModule } from '@/src/services/proximity/nativeProximityModule'
import { toFriendlyError } from '@/src/services/scan/scanFriendlyErrors'
import { useProximityStore } from '@/src/store/proximityStore'

export default function PresentScreen() {
  const router = useRouter()
  const returnToWallet = useReturnToWallet(router)
  const { credentialId } = useLocalSearchParams<{ credentialId?: string }>()
  const { credentials } = useStoredCredentials()
  const credential = credentials.find((record) => record.id === credentialId)
  const isDocumentExpired = credential
    ? isCredentialDocumentExpired(credential)
    : false
  const requiresHardwareReissue = credential
    ? credentialRequiresHardwareReissue(credential.id)
    : false
  const isPidPresentationBlocked = credential
    ? !canPresentCredentialType(credential.type, credentials)
    : false
  const pidGateStatus = readPidGateStatus(credentials)
  const isPresentationBlocked =
    isDocumentExpired ||
    requiresHardwareReissue ||
    isPidPresentationBlocked ||
    (credential ? !isCredentialPresentable(credential) : false)
  const status = useProximityStore((state) => state.status)
  const sharingMode = useProximityStore((state) => state.sharingMode)
  const error = useProximityStore((state) => state.error)
  const openPresentation = useProximityStore((state) => state.openPresentation)
  const approvePresentation = useProximityStore((state) => state.approvePresentation)
  const denyPresentation = useProximityStore((state) => state.denyPresentation)
  const reset = useProximityStore((state) => state.reset)

  const [mdocAvailable, setMdocAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    if (!credentialId || isPresentationBlocked) return
    if (!credential) return

    let cancelled = false
    void (async () => {
      const stored = await hasStoredMdoc(credentialId)
      if (cancelled) return
      let hasMdoc = stored === true
      if (!hasMdoc) {
        hasMdoc = await ensureNativeMdocStored(credential)
      }
      if (cancelled) return
      setMdocAvailable(hasMdoc)
      if (!hasMdoc) return
      if (status === 'idle') {
        openPresentation(credentialId, 'mdoc-only')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [credential, credentialId, isPresentationBlocked, openPresentation, status])

  useEffect(() => () => reset(), [reset])

  useEffect(() => {
    if (status !== 'hce-armed' && status !== 'engaged') return
    const native = getNativeProximityModule()
    const extendArm = native?.extendProximityArm
    if (!extendArm) return

    const refresh = () => {
      try {
        extendArm(HCE_ARM_WINDOW_MS)
      } catch (error) {
        logWalletError('present', 'extend-hce-arm-failed', error)
      }
    }
    refresh()
    const intervalMs = Math.max(15_000, Math.floor(HCE_ARM_WINDOW_MS / 3))
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [status])

  const handleDone = useCallback(() => {
    reset()
    returnToWallet()
  }, [reset, returnToWallet])

  const exitFlow = useAndroidBackNavigation(handleDone)

  const handleAccept = useCallback((selectedKeys: string[]) => {
    if (selectedKeys.length === 0) return
    void approvePresentation(selectedKeys)
  }, [approvePresentation])

  const handleDecline = useCallback(() => {
    denyPresentation()
    exitFlow()
  }, [denyPresentation, exitFlow])

  const readerProfile = credential
    ? getReaderProfileForDocumentType(credential.type, sharingMode)
    : undefined

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="NFC" onBack={exitFlow} />
      {status === 'complete' ? (
        <PresentationResultPanel onDone={exitFlow} />
      ) : (
        <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-4 py-6">
          {credential && status !== 'awaiting-consent' ? (
            <Text className="text-2xl mb-4 text-center font-bold text-ink">
              {getCardSchema(credential.type).title}
            </Text>
          ) : null}

          {credential && isPresentationBlocked ? (
            <View className="rounded-[12px] bg-white px-5 py-6">
              <Text className="text-center text-base font-semibold text-ink">
                {requiresHardwareReissue
                  ? WALLET_HOME_COPY.hardwareReissueRequiredMessage
                  : isDocumentExpired
                    ? WALLET_HOME_COPY.documentExpiredMessage
                    : isPidPresentationBlocked
                      ? pidGateStatus === 'ready'
                        ? WALLET_HOME_COPY.pidRequiredToPresentMessage
                        : readPidGateUserCopy(pidGateStatus, 'present').message
                      : WALLET_HOME_COPY.myQrNoEligibleDocumentMessage}
              </Text>
              <View className="mt-4 items-center">
                <AppButton variant="solid-block" label="Back" onPress={exitFlow} className="rounded-xl bg-ink px-8 py-3" textClassName="text-sm font-semibold text-white" />
              </View>
            </View>
          ) : null}

          {mdocAvailable === false && !isPresentationBlocked ? (
            <View className="rounded-[12px] bg-white px-5 py-6">
              <Text className="text-center text-base font-semibold text-ink">
                This document cannot be presented over NFC.
              </Text>
              <View className="mt-4 items-center">
                <AppButton variant="solid-block" label="Back" onPress={exitFlow} className="rounded-xl bg-ink px-8 py-3" textClassName="text-sm font-semibold text-white" />
              </View>
            </View>
          ) : null}

          {status === 'awaiting-consent' && readerProfile ? (
            <PreTapConsentPanel
              profile={readerProfile}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />
          ) : null}

          {status === 'approved' ? (
            <WaitingForTapPanel preparing onCancel={exitFlow} />
          ) : null}

          {status === 'hce-armed' || status === 'engaged' ? (
            <WaitingForTapPanel onCancel={exitFlow} />
          ) : null}

          {status === 'error' ? (
            <View className="rounded-[12px] bg-white px-5 py-6">
              <Text className="text-center text-base font-semibold text-danger">
                {toFriendlyError(error ?? 'Connection lost. Try again.')}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
