import * as Linking from 'expo-linking'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'

import { readWalletReturnUrl } from '@/src/config/sameDeviceIssuance'
import {
  describeIssuanceCallbackForLog,
  describeIssuanceCallbackSearchParamsForLog,
} from '@/src/services/credentials/describeIssuanceCallbackForLog'
import { recordLastPortalReturn } from '@/src/services/credentials/lastPortalReturn'
import { notifyPortalReturnUrl } from '@/src/services/credentials/portalReturnBridge'
import {
  buildIssuanceCallbackUrlFromSearchParams,
  resolveIssuanceCallbackFromSources,
} from '@/src/services/credentials/resolveIssuanceCallbackResult'
import { hasWalletPin } from '@/src/services/auth/walletPin'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { useAuthStore } from '@/src/store/authStore'
import { useDeeplinkStore } from '@/src/store/deeplinkStore'

/**
 * Handles Issuer portal return URLs such as
 * walletapp://callback?credential_offer_uri=https%3A%2F%2F...
 *
 * +native-intent rewrites that deep link to /callback?... so this screen must
 * read Expo Router search params as well as Linking.useURL — Linking alone is
 * often still null/stale on first paint after Custom Tabs return on Android.
 *
 * Also notifies portalReturnBridge so Android openBrowserAsync wait can finish
 * when openAuthSessionAsync would hang.
 */
export default function IssuanceCallbackRoute() {
  const router = useRouter()
  const incomingUrl = Linking.useURL()
  const searchParams = useLocalSearchParams()
  const setIncomingDeeplinkUri = useDeeplinkStore((s) => s.setIncomingDeeplinkUri)
  const setPendingDeeplinkUri = useDeeplinkStore((s) => s.setPendingDeeplinkUri)
  const isPinVerified = useAuthStore((s) => s.isPinVerified)
  const handledRef = useRef(false)
  const notifiedRef = useRef(false)

  useFocusEffect(
    useCallback(() => {
      handledRef.current = false
      notifiedRef.current = false
      return () => {}
    }, []),
  )

  useEffect(() => {
    if (notifiedRef.current) return

    const returnUrl = readWalletReturnUrl()
    const rebuilt = buildIssuanceCallbackUrlFromSearchParams(
      searchParams as Record<string, string | string[] | undefined>,
      returnUrl,
    )
    const candidate = incomingUrl ?? rebuilt
    if (!candidate) return

    notifiedRef.current = true
    notifyPortalReturnUrl(candidate, 'callback-route')
  }, [incomingUrl, searchParams])

  useEffect(() => {
    if (handledRef.current) return

    const parsed = resolveIssuanceCallbackFromSources({
      linkingUrl: incomingUrl,
      searchParams: searchParams as Record<string, string | string[] | undefined>,
    })

    if (parsed.kind === 'unsupported') {
      logWalletStep('deeplink', 'callback-waiting', {
        linking: describeIssuanceCallbackForLog(incomingUrl),
        searchParams: describeIssuanceCallbackSearchParamsForLog(
          searchParams as Record<string, string | string[] | undefined>,
        ),
      })
      return
    }

    handledRef.current = true

    const pinRequired = Platform.OS !== 'web' && hasWalletPin() && !isPinVerified
    if (pinRequired) {
      setPendingDeeplinkUri(parsed.uri)
      logWalletStep('deeplink', 'callback-routed', {
        kind: parsed.kind,
        pinRequired: true,
        linking: describeIssuanceCallbackForLog(incomingUrl),
        searchParams: describeIssuanceCallbackSearchParamsForLog(
          searchParams as Record<string, string | string[] | undefined>,
        ),
      })
      router.replace('/pin-lock')
      return
    }

    setIncomingDeeplinkUri(parsed.uri)
    logWalletStep('deeplink', 'callback-routed', {
      kind: parsed.kind,
      linking: describeIssuanceCallbackForLog(incomingUrl),
      searchParams: describeIssuanceCallbackSearchParamsForLog(
        searchParams as Record<string, string | string[] | undefined>,
      ),
      offer: describeIssuanceCallbackForLog(parsed.uri),
    })
    router.replace(
      parsed.kind === 'credential_offer' ? '/(tabs)/credential-offer' : '/(tabs)/scan',
    )
  }, [
    incomingUrl,
    isPinVerified,
    router,
    searchParams,
    setIncomingDeeplinkUri,
    setPendingDeeplinkUri,
  ])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (handledRef.current) return
      handledRef.current = true
      logWalletStep('deeplink', 'callback-unrecognized', {
        linking: describeIssuanceCallbackForLog(incomingUrl),
        searchParams: describeIssuanceCallbackSearchParamsForLog(
          searchParams as Record<string, string | string[] | undefined>,
        ),
      })
      const summary = describeIssuanceCallbackSearchParamsForLog(
        searchParams as Record<string, string | string[] | undefined>,
      )
      const linkingSummary = describeIssuanceCallbackForLog(incomingUrl)
      const merged = linkingSummary.queryKeys.length > 0 ? linkingSummary : summary
      recordLastPortalReturn({
        at: Date.now(),
        source: 'callback-route',
        summary: merged,
        outcome: merged.hasCredentialOfferUri ? 'unrecognized' : 'empty-callback',
      })
      if (!notifiedRef.current) {
        notifiedRef.current = true
        notifyPortalReturnUrl(incomingUrl ?? readWalletReturnUrl(), 'callback-route-timeout')
      }
      router.replace('/(tabs)/')
    }, 2500)

    return () => clearTimeout(timeout)
  }, [incomingUrl, router, searchParams])

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator />
    </View>
  )
}
