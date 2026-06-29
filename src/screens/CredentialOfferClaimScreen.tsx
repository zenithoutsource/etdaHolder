import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View, type ImageSourcePropType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../components/AppButton'
import { ScanSuccessPanel } from '../components/ScanSuccessPanel'
import { ThaIdVerificationPanel } from '../components/ThaIdVerificationPanel'
import { ThaiIdReceivePanel } from '../components/ThaiIdReceivePanel'
import { ThaiIdSuccessConfirmationPanel } from '../components/ThaiIdSuccessConfirmationPanel'
import { TranscriptPreviewPanel } from '../components/TranscriptPreviewPanel'
import { WalletHeader } from '../components/WalletHeader'


import { useStoredCredentials } from '../hooks/useStoredCredentials'
import { isPidCredentialOffer, readPidGateStatus } from '../services/credentials/credentialGuard'
import { readCredentialRenewalStatuses } from '../services/credentials/credentialKeyRenewal'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import { saveScannedCredential } from '../services/credentials/scannedCredentialSave'
import { readStoredCredentials } from '../services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import {
  describeCredentialForLog,
  describeOfferForLog,
  describeUriForLog,
} from '../services/scan/scanLogDescriptors'
import { toFriendlyError } from '../services/scan/scanFriendlyErrors'
import {
  acquireCredentialRecord,
  resolveOffer,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../services/vci/exchangeService'
import { readCredentialPreviewDisplay } from '../services/vci/qrIssuanceFlow'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../store/deeplinkStore'

type ClaimPhase =
  | { tag: 'initializing' }
  | { tag: 'resolving' }
  | { tag: 'thaIdVerify'; offer: ResolvedCredentialOffer }
  | { tag: 'txCode'; offer: ResolvedCredentialOffer }
  | { tag: 'acquiring' }
  | { tag: 'preview'; record: VerifiableCredentialRecord }
  | { tag: 'receive'; record: VerifiableCredentialRecord }
  | { tag: 'saving' }
  | { tag: 'success'; record: VerifiableCredentialRecord }
  | { tag: 'error'; message: string }

const credentialImages: Record<string, ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/user_profile.png'),
}

const RESOLVE_TIMEOUT_MS = 20_000
const ACQUIRE_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

type Props = {
  initialOfferUri?: string | null
  onClose?: () => void
}

export function CredentialOfferClaimScreen({ initialOfferUri, onClose }: Props = {}) {
  const { refresh: refreshCredentials } = useStoredCredentials()
  const [phase, setPhase] = useState<ClaimPhase>({ tag: 'initializing' })
  const [txCode, setTxCode] = useState('')
  const generationRef = useRef(0)
  const initialUrlCheckedRef = useRef(false)
  const directUrlHandledRef = useRef<string | null>(null)
  const router = useRouter()
  const incomingUrl = Linking.useURL()
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri)
  const setDismissedDeeplinkUri = useDeeplinkStore((s) => s.setDismissedDeeplinkUri)
  const activeOfferUriRef = useRef<string | null>(null)

  const acquireForPreview = useCallback(async (offer: ResolvedCredentialOffer, code?: string) => {
    const gen = generationRef.current
    setPhase({ tag: 'acquiring' })
    logWalletStep('deeplink', 'credential-acquire-start', {
      ...describeOfferForLog(offer),
      txCodeProvided: Boolean(code),
    })
    try {
      const record = await withTimeout(
        acquireCredentialRecord(offer, { tx_code: code }),
        ACQUIRE_TIMEOUT_MS,
        'DeeplinkTimeout: acquiring credential timed out',
      )
      logWalletStep('deeplink', 'credential-acquire-complete', describeCredentialForLog(record))
      if (generationRef.current === gen) setPhase({ tag: 'preview', record })
    } catch (err) {
      logWalletError('deeplink', 'credential-acquire-failed', err, describeOfferForLog(offer))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }, [])

  const handleOfferUri = useCallback(async (uri: string) => {
    if (!isCredentialOfferDeeplink(uri)) {
      logWalletError('deeplink', 'unsupported-deeplink', new Error('Unsupported deeplink'), describeUriForLog(uri))
      setPhase({ tag: 'error', message: 'Not a credential offer link. Please open a valid issuance link.' })
      return
    }

    const gen = generationRef.current
    activeOfferUriRef.current = uri
    setPhase({ tag: 'resolving' })
    logWalletStep('deeplink', 'offer-detected', describeUriForLog(uri))
    try {
      const offer = await withTimeout(resolveOffer(uri), RESOLVE_TIMEOUT_MS, 'DeeplinkTimeout: resolving offer timed out')
      setTxCode('')
      const latestCredentials = readStoredCredentials()
      const renewalStatuses = readCredentialRenewalStatuses(latestCredentials)
      const isPidOffer = isPidCredentialOffer(offer)
      const pidGateStatus = readPidGateStatus(latestCredentials, renewalStatuses)
      logWalletStep('deeplink', 'offer-resolved', {
        ...describeOfferForLog(offer),
        isPidOffer,
        pidGateStatus,
      })
      if (!isPidOffer && pidGateStatus !== 'ready') {
        logWalletError(
          'deeplink',
          'offer-requires-pid',
          new Error('Usable PID credential required before this offer'),
          describeOfferForLog(offer),
        )
        if (generationRef.current === gen) {
          setPhase({
            tag: 'error',
            message:
              pidGateStatus === 'missing'
                ? WALLET_HOME_COPY.pidRequiredMessage
                : WALLET_HOME_COPY.renewThaIdRequiredMessage,
          })
        }
        return
      }
      if (isPidOffer && pidGateStatus === 'ready') {
        if (generationRef.current === gen) {
          setPhase({
            tag: 'error',
            message: WALLET_HOME_COPY.thaIdAlreadyActiveMessage,
          })
        }
        return
      }
      if (isPidOffer && pidGateStatus === 'renewal-required') {
        if (generationRef.current === gen) {
          setPhase({
            tag: 'error',
            message: WALLET_HOME_COPY.renewThaIdRequiredMessage,
          })
        }
        return
      }
      if (isPidOffer) {
        logWalletStep('deeplink', 'offer-pid-flow', describeOfferForLog(offer))
        if (generationRef.current === gen) setPhase({ tag: 'thaIdVerify', offer })
        return
      }
      if (offer.txCode) {
        logWalletStep('deeplink', 'offer-tx-code-required', describeOfferForLog(offer))
        if (generationRef.current === gen) setPhase({ tag: 'txCode', offer })
        return
      }
      await acquireForPreview(offer)
    } catch (err) {
      logWalletError('deeplink', 'offer-resolve-failed', err, describeUriForLog(uri))
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }, [acquireForPreview])

  useEffect(() => {
    const pending = initialOfferUri ?? useDeeplinkStore.getState().consumePendingDeeplinkUri()
    if (pending) {
      initialUrlCheckedRef.current = true
      generationRef.current++
      setTxCode('')
      void handleOfferUri(pending)
      return
    }

    const directOffer = incomingUrl && isCredentialOfferDeeplink(incomingUrl) && incomingUrl !== directUrlHandledRef.current ? incomingUrl : null
    if (directOffer) {
      initialUrlCheckedRef.current = true
      directUrlHandledRef.current = directOffer
      generationRef.current++
      setTxCode('')
      void handleOfferUri(directOffer)
      return
    }

    if (initialUrlCheckedRef.current) return
    initialUrlCheckedRef.current = true

    let isMounted = true
    void Linking.getInitialURL()
      .then((initialUrl) => {
        if (!isMounted) return
        const initialOffer = initialUrl && isCredentialOfferDeeplink(initialUrl) ? initialUrl : null
        if (!initialOffer) {
          setPhase({ tag: 'error', message: 'No credential offer link is pending.' })
          return
        }
        directUrlHandledRef.current = initialOffer
        generationRef.current++
        setTxCode('')
        void handleOfferUri(initialOffer)
      })
      .catch((err) => {
        logWalletError('deeplink', 'initial-url-read-failed', err)
        if (isMounted) {
          setPhase({ tag: 'error', message: 'No credential offer link is pending.' })
        }
      })

    return () => {
      isMounted = false
    }
  }, [handleOfferUri, incomingUrl, initialOfferUri, pendingDeeplinkUri])

  function resetToWalletHome() {
    generationRef.current++
    const uriToDismiss = activeOfferUriRef.current ?? incomingUrl
    if (uriToDismiss) setDismissedDeeplinkUri(uriToDismiss)
    onClose?.()
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/')
    }
  }

  function handleTxCodeSubmit(offer: ResolvedCredentialOffer) {
    logWalletStep('deeplink', 'tx-code-submit', {
      ...describeOfferForLog(offer),
      txCodeProvided: txCode.trim().length > 0,
    })
    void acquireForPreview(offer, txCode.trim() || undefined)
  }

  function handleThaIdVerified(offer: ResolvedCredentialOffer) {
    logWalletStep('deeplink', 'pid-verification-confirmed', describeOfferForLog(offer))
    if (offer.txCode) {
      setPhase({ tag: 'txCode', offer })
      return
    }
    void acquireForPreview(offer)
  }

  function handleSave(record: VerifiableCredentialRecord) {
    setPhase({ tag: 'saving' })
    logWalletStep('deeplink', 'credential-save-start', describeCredentialForLog(record))
    try {
      saveScannedCredential(record, { refreshCredentials })
      logWalletStep('deeplink', 'credential-save-complete', describeCredentialForLog(record))
      setPhase({ tag: 'success', record })
    } catch (err) {
      logWalletError('deeplink', 'credential-save-failed', err, describeCredentialForLog(record))
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (phase.tag === 'preview') {
    if (phase.record.type === 'ThaiNationalID') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
          <WalletHeader onBack={resetToWalletHome} />
          <ThaiIdSuccessConfirmationPanel record={phase.record} onConfirm={() => setPhase({ tag: 'receive', record: phase.record })} />
        </SafeAreaView>
      )
    }

    if (phase.record.type === 'BangkokUniversityTranscript') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
          <WalletHeader onBack={resetToWalletHome} />
          <TranscriptPreviewPanel
            record={phase.record}
            profileImage={credentialImages.transcript}
            onAccept={() => handleSave(phase.record)}
          />
        </SafeAreaView>
      )
    }

    const preview = readCredentialPreviewDisplay(phase.record)

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetToWalletHome} />
        <View className="flex-1 bg-[#eef1f4] px-4 pt-6">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <View
              className="overflow-hidden rounded-lg bg-white"
              style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
              <View className="bg-[#123b8c] px-5 py-3">
                <Text className="text-[13px] font-extrabold text-white">{preview.documentTitle}</Text>
              </View>
              <View className="px-7 pb-6 pt-7">
                <View className="items-center">
                  <Image source={credentialImages[preview.imageKey]} style={{ width: 92, height: 104 }} resizeMode="contain" />
                </View>
                <View className="mt-5">
                  <Text className="text-[16px] font-extrabold leading-[22px] text-[#071f5f]">Information to receive</Text>
                  {preview.rows.map((row) => (
                    <View key={row.key} className="border-b border-[#e5e7eb] py-3">
                      <Text className="text-[12px] leading-4 text-[#9aa1ad]">{row.label}</Text>
                      <Text className="text-[13px] font-bold leading-5 text-[#071f5f]">{row.value}</Text>
                    </View>
                  ))}
                </View>
                <AppButton variant="solid-block" label="ยอมรับ" onPress={() => handleSave(phase.record)} className="mt-4 h-9 w-28 self-start !bg-[#18a05d]" textClassName="text-[14px]" />
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'receive') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetToWalletHome} />
        <ThaiIdReceivePanel record={phase.record} onConfirm={() => handleSave(phase.record)} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'txCode') {
    const canContinue = txCode.trim().length > 0

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetToWalletHome} />
        <View className="flex-1 bg-[#eef1f4] px-4 pt-6">
          <View className="rounded-lg bg-white p-6">
            <Text className="text-[16px] font-extrabold text-[#071f5f]">Transaction code</Text>
            <TextInput
              value={txCode}
              onChangeText={setTxCode}
              keyboardType={phase.offer.txCode?.input_mode === 'numeric' ? 'number-pad' : 'default'}
              placeholder="Enter transaction code"
              placeholderTextColor="#9aa1ad"
              secureTextEntry
              className="mt-3 min-h-[44px] rounded-lg border border-[#d1d5db] px-3 text-[15px] font-semibold text-[#071f5f]"
            />
            <AppButton
              variant="solid-block"
              label="Continue"
              disabled={!canContinue}
              onPress={() => handleTxCodeSubmit(phase.offer)}
              className={`mt-4 h-9 w-28 !bg-[#18a05d] ${!canContinue ? 'opacity-45' : ''}`}
              textClassName="text-[14px]"
            />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'thaIdVerify') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetToWalletHome} />
        <ThaIdVerificationPanel offer={phase.offer} onContinue={() => handleThaIdVerified(phase.offer)} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'success') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetToWalletHome} />
        <ScanSuccessPanel record={phase.record} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f4f6fa] p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <AppButton variant="solid-block" label="Back to Wallet" onPress={resetToWalletHome} className="rounded-xl px-[18px] py-[14px]" textClassName="text-[15px] font-semibold" />
      </SafeAreaView>
    )
  }

  const loadingLabel =
    phase.tag === 'saving'
      ? 'Saving Credential'
      : phase.tag === 'acquiring'
        ? 'Acquiring Credential'
        : phase.tag === 'resolving'
          ? 'Reading Offer'
          : 'Opening Credential Offer'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
      <WalletHeader onBack={resetToWalletHome} />
      <View className="flex-1 items-center justify-center bg-[#f4f6fa] p-6">
        <ActivityIndicator color="#002887" />
        <Text className="mt-3 text-center text-[15px] font-semibold text-[#071f5f]">{loadingLabel}</Text>
        <Text className="mt-2 text-center text-[13px] text-[#6b7280]">Loading...</Text>
      </View>
    </SafeAreaView>
  )
}
