import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '@/src/components/AppButton'
import { PreTapConsentPanel } from '@/src/components/proximity/PreTapConsentPanel'
import { PresentationResultPanel } from '@/src/components/proximity/PresentationResultPanel'
import { WaitingForTapPanel } from '@/src/components/proximity/WaitingForTapPanel'
import { WalletHeader } from '@/src/components/WalletHeader'
import {
  getReaderProfileForDocumentType,
  listMdocFieldKeysFromProfile,
} from '@/src/config/readerProfiles'
import { useAndroidBackNavigation } from '@/src/hooks/useAndroidBackNavigation'
import { useReturnToWallet } from '@/src/hooks/useReturnToWallet'
import { useStoredCredentials } from '@/src/hooks/useStoredCredentials'
import { isCredentialDocumentExpired } from '@/src/services/credentials/credentialDocumentExpiry'
import { isCredentialPresentable } from '@/src/services/credentials/credentialLifecycle'
import { WALLET_HOME_COPY } from '@/src/services/credentials/walletHomeCopy'
import { credentialRequiresHardwareReissue } from '@/src/services/crypto/hardwareCredentialSigningKey'
import { toFriendlyError } from '@/src/services/scan/scanFriendlyErrors'
import { ensureNativeMdocStored } from '@/src/services/proximity/mdocCredential'
import { hasStoredMdoc } from '@/src/services/proximity/mdocStorage'
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
  const isPresentationBlocked =
    isDocumentExpired ||
    requiresHardwareReissue ||
    (credential ? !isCredentialPresentable(credential) : false)
  const status = useProximityStore((state) => state.status)
  const sharingMode = useProximityStore((state) => state.sharingMode)
  const sharedFields = useProximityStore((state) => state.sharedFields)
  const deviceEngagementUri = useProximityStore((state) => state.deviceEngagementUri)
  const error = useProximityStore((state) => state.error)
  const openPresentation = useProximityStore((state) => state.openPresentation)
  const approvePresentation = useProximityStore((state) => state.approvePresentation)
  const denyPresentation = useProximityStore((state) => state.denyPresentation)
  const reset = useProximityStore((state) => state.reset)

  const readerProfile = useMemo(() => {
    if (!credential) return undefined
    return getReaderProfileForDocumentType(credential.type, sharingMode)
  }, [credential, sharingMode])

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

  const handleDone = useCallback(() => {
    reset()
    returnToWallet()
  }, [reset, returnToWallet])

  const exitFlow = useAndroidBackNavigation(handleDone)

  const approvedFieldKeys = readerProfile ? listMdocFieldKeysFromProfile(readerProfile) : []

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="NFC" onBack={exitFlow} />
      <ScrollView className="flex-1 bg-surface" contentContainerClassName="px-4 py-6">
        {credential ? (
          <Text className="mb-4 text-center text-sm font-medium text-ink">
            {credential.type}
          </Text>
        ) : null}

        {credential && isPresentationBlocked ? (
          <View className="rounded-[12px] bg-white px-5 py-6">
            <Text className="text-center text-base font-semibold text-ink">
              {requiresHardwareReissue
                ? WALLET_HOME_COPY.hardwareReissueRequiredMessage
                : isDocumentExpired
                  ? WALLET_HOME_COPY.documentExpiredMessage
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
              No mDOC credential available for proximity presentation
            </Text>
            <View className="mt-4 items-center">
              <AppButton variant="solid-block" label="Back" onPress={exitFlow} className="rounded-xl bg-ink px-8 py-3" textClassName="text-sm font-semibold text-white" />
            </View>
          </View>
        ) : null}

        {status === 'awaiting-consent' && readerProfile ? (
          <PreTapConsentPanel
            profile={readerProfile}
            onAllow={() => void approvePresentation(approvedFieldKeys)}
            onDeny={denyPresentation}
          />
        ) : null}

        {status === 'awaiting-consent' && !readerProfile && mdocAvailable ? (
          <View className="rounded-[12px] bg-white px-5 py-6">
            <Text className="text-center text-base font-semibold text-ink">
              No reader profile is configured for this document type.
            </Text>
          </View>
        ) : null}

        {status === 'approved' ? (
          <WaitingForTapPanel preparing onCancel={exitFlow} />
        ) : null}

        {status === 'hce-armed' || status === 'engaged' ? (
          <WaitingForTapPanel deviceEngagementUri={deviceEngagementUri} onCancel={exitFlow} />
        ) : null}

        {status === 'complete' && sharedFields ? (
          <PresentationResultPanel sharedFields={sharedFields} onDone={exitFlow} />
        ) : null}

        {status === 'error' ? (
          <View className="rounded-[12px] bg-white px-5 py-6">
            <Text className="text-center text-base font-semibold text-danger">
              {toFriendlyError(error ?? 'Connection lost. Try again.')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
