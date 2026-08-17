import * as Linking from 'expo-linking'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, Platform, View } from 'react-native'

import { readWalletReturnUrl } from '@/src/config/sameDeviceIssuance'
import { continueSameDeviceIssuanceAfterPortal } from '@/src/services/credentials/sameDeviceIssuance'
import {
  describeIssuanceCallbackForLog,
  describeIssuanceCallbackSearchParamsForLog,
} from '@/src/services/credentials/describeIssuanceCallbackForLog'
import { recordLastPortalReturn } from '@/src/services/credentials/lastPortalReturn'
import { notifyPortalReturnUrl } from '@/src/services/credentials/portalReturnBridge'
import {
  buildIssuanceCallbackUrlFromSearchParams,
  resolveIssuanceCallbackFromSources,
  storePendingFromIssuanceCallbackUrl,
} from '@/src/services/credentials/resolveIssuanceCallbackResult'
import { hasWalletPin } from '@/src/services/auth/walletPin'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { useAuthStore } from '@/src/store/authStore'
import { useDeeplinkStore, tryQueueDeeplinkUri } from '@/src/store/deeplinkStore'
import { isPortalReturnUrlIgnoredDuringCapture } from '@/src/services/credentials/portalReturnBridge'
import { isPresentationRequestConsumed } from '@/src/services/vp/presentationRequestReplay'
import { notifyPresentationIntakeRejectionForUri } from '@/src/services/vp/presentationIntakeRejection'

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
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri)
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
    const linkingParsed = incomingUrl
      ? resolveIssuanceCallbackFromSources({
          linkingUrl: incomingUrl,
          returnUrl,
        })
      : { kind: 'unsupported' as const }
    const candidate = linkingParsed.kind !== 'unsupported'
      ? incomingUrl
      : rebuilt
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

    if (parsed.kind === 'authorization_code' || parsed.kind === 'authorization_error') {
      const returnUrl = readWalletReturnUrl()
      const callbackUrl = buildIssuanceCallbackUrlFromSearchParams(
        searchParams as Record<string, string | string[] | undefined>,
        returnUrl,
      ) ?? incomingUrl
      if (callbackUrl && parsed.kind === 'authorization_code') {
        storePendingFromIssuanceCallbackUrl(callbackUrl, returnUrl)
      }
      logWalletStep('deeplink', 'callback-routed', {
        kind: parsed.kind,
        linking: describeIssuanceCallbackForLog(incomingUrl),
        searchParams: describeIssuanceCallbackSearchParamsForLog(
          searchParams as Record<string, string | string[] | undefined>,
        ),
      })
      if (parsed.kind === 'authorization_code') {
        void (async () => {
          try {
            const continuation = await continueSameDeviceIssuanceAfterPortal()
            if (continuation.status === 'claim_ready') {
              router.replace('/(tabs)/credential-offer')
              return
            }
            if (continuation.status === 'awaiting_pid_vp') {
              router.replace('/(tabs)/presentation-request')
              return
            }
          } catch (error) {
            logWalletError('deeplink', 'same-device-issuance-continuation-failed', error)
          }
          router.replace('/(tabs)')
        })()
        return
      }
      router.replace('/(tabs)')
      return
    }

    if (isPortalReturnUrlIgnoredDuringCapture(parsed.uri)) {
      logWalletStep('deeplink', 'portal-stale-callback-ignored')
      router.replace('/(tabs)')
      return
    }

    if (
      parsed.uri === dismissedDeeplinkUri
      || (
        parsed.kind === 'presentation_request'
        && isPresentationRequestConsumed(parsed.uri)
      )
    ) {
      const consumed = parsed.kind === 'presentation_request'
        && isPresentationRequestConsumed(parsed.uri)
      logWalletStep(
        'deeplink',
        consumed
          ? 'presentation-replay-ignored'
          : parsed.kind === 'presentation_request'
            ? 'presentation-dismissed-ignored'
            : 'credential-offer-dismissed-ignored',
      )
      if (consumed) {
        notifyPresentationIntakeRejectionForUri(parsed.uri)
      }
      // Land on Wallet home — avoid back() onto a blank presentation-request screen.
      router.replace('/(tabs)')
      return
    }

    const queuePendingUri = (uri: string) => {
      if (!tryQueueDeeplinkUri(uri, { origin: 'same-device' })) {
        logWalletStep('deeplink', 'presentation-dismissed-ignored')
      }
    }

    const pinRequired = Platform.OS !== 'web' && hasWalletPin() && !isPinVerified
    if (pinRequired) {
      queuePendingUri(parsed.uri)
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

    if (!tryQueueDeeplinkUri(parsed.uri, { origin: 'same-device' })) {
      logWalletStep('deeplink', 'presentation-dismissed-ignored')
      router.replace('/(tabs)')
      return
    }
    logWalletStep('deeplink', 'callback-routed', {
      kind: parsed.kind,
      linking: describeIssuanceCallbackForLog(incomingUrl),
      searchParams: describeIssuanceCallbackSearchParamsForLog(
        searchParams as Record<string, string | string[] | undefined>,
      ),
      offer: describeIssuanceCallbackForLog(parsed.uri),
    })
    router.replace(
      parsed.kind === 'credential_offer'
        ? '/(tabs)/credential-offer'
        : '/(tabs)/presentation-request',
    )
  }, [
    incomingUrl,
    dismissedDeeplinkUri,
    isPinVerified,
    router,
    searchParams,
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
      router.replace('/(tabs)')
    }, 2500)

    return () => clearTimeout(timeout)
  }, [incomingUrl, router, searchParams])

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator />
    </View>
  )
}
