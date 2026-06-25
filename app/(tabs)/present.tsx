import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ConsentPanel } from '@/src/components/proximity/ConsentPanel'
import { PresentationResultPanel } from '@/src/components/proximity/PresentationResultPanel'
import { WaitingForTapPanel } from '@/src/components/proximity/WaitingForTapPanel'
import { WalletHeader } from '@/src/components/WalletHeader'
import { useStoredCredentials } from '@/src/hooks/useStoredCredentials'
import { listMdocFieldKeys } from '@/src/services/proximity/mdocParser'
import { hasStoredMdoc } from '@/src/services/proximity/mdocStorage'
import { useProximityStore } from '@/src/store/proximityStore'

export default function PresentScreen() {
  const router = useRouter()
  const { credentialId } = useLocalSearchParams<{ credentialId?: string }>()
  const { credentials } = useStoredCredentials()
  const credential = credentials.find((record) => record.id === credentialId)
  const status = useProximityStore((state) => state.status)
  const requestedFields = useProximityStore((state) => state.requestedFields)
  const sharedFields = useProximityStore((state) => state.sharedFields)
  const error = useProximityStore((state) => state.error)
  const startPresentation = useProximityStore((state) => state.startPresentation)
  const approvePresentation = useProximityStore((state) => state.approvePresentation)
  const denyPresentation = useProximityStore((state) => state.denyPresentation)
  const reset = useProximityStore((state) => state.reset)

  const availableFields = useMemo(() => {
    if (!credential) return []
    const claims = Object.fromEntries(
      Object.entries(credential.claims).filter((entry): entry is [string, string | number | boolean] => {
        const value = entry[1]
        return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      }),
    )
    return listMdocFieldKeys({
      'org.iso.18013.5.1': claims,
    })
  }, [credential])

  useEffect(() => {
    if (!credentialId) return

    let cancelled = false
    void (async () => {
      const stored = await hasStoredMdoc(credentialId)
      if (cancelled || !stored) return
      if (status === 'idle') {
        await startPresentation(credentialId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [credentialId, startPresentation, status])

  useEffect(() => () => reset(), [reset])

  function handleDone() {
    reset()
    router.back()
  }

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="Present via NFC" onBack={handleDone} />
      <ScrollView className="flex-1 bg-[#eef1f4]" contentContainerClassName="px-4 py-6">
        {credential ? (
          <Text className="mb-4 text-center text-sm font-medium text-[#1a2a42]">
            {credential.type}
          </Text>
        ) : null}

        {status === 'waiting' || status === 'engaged' ? (
          <WaitingForTapPanel onCancel={handleDone} />
        ) : null}

        {status === 'requested' || status === 'approved' ? (
          requestedFields ? (
          <ConsentPanel
            requestedFields={requestedFields}
            availableFields={availableFields}
            onAllow={() => void approvePresentation()}
            onDeny={denyPresentation}
            isSubmitting={status === 'approved'}
          />
          ) : null
        ) : null}

        {status === 'complete' && sharedFields ? (
          <PresentationResultPanel sharedFields={sharedFields} onDone={handleDone} />
        ) : null}

        {status === 'error' ? (
          <View className="rounded-[12px] bg-white px-5 py-6">
            <Text className="text-center text-base font-semibold text-[#c00000]">
              {error ?? 'Connection lost. Try again.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
