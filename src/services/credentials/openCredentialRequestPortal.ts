import * as Linking from 'expo-linking'
import { Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

import {
  resolveIssuerPortalUrl,
  type IssuerPortalCredentialType,
} from '../../config/issuerPortalUrls'
import {
  isCredentialOfferDeeplink,
  isSupportedWalletDeeplink,
  useDeeplinkStore,
} from '../../store/deeplinkStore'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type OpenCredentialRequestPortalResult =
  | { status: 'claimed'; deeplink: string }
  | { status: 'dismissed' }
  | { status: 'misconfigured' }
  | { status: 'error' }

export async function openCredentialRequestPortal(
  credentialType: IssuerPortalCredentialType,
): Promise<OpenCredentialRequestPortalResult> {
  const portalUrl = resolveIssuerPortalUrl(credentialType)
  if (!portalUrl) {
    logWalletStep('wallet-home', 'issuer-portal-misconfigured', { credentialType })
    return { status: 'misconfigured' }
  }

  if (Platform.OS === 'web') {
    // No auth session on web; open the portal and let the Holder come back manually.
    void Linking.openURL(portalUrl)
    return { status: 'dismissed' }
  }

  try {
    const returnUrl = Linking.createURL('/')
    logWalletStep('wallet-home', 'issuer-portal-open', { credentialType })
    const result = await WebBrowser.openAuthSessionAsync(portalUrl, returnUrl)

    if (
      result.type === 'success' &&
      isSupportedWalletDeeplink(result.url) &&
      isCredentialOfferDeeplink(result.url)
    ) {
      logWalletStep('wallet-home', 'issuer-portal-return-offer', { credentialType })
      useDeeplinkStore.getState().setIncomingDeeplinkUri(result.url)
      return { status: 'claimed', deeplink: result.url }
    }

    logWalletStep('wallet-home', 'issuer-portal-dismissed', {
      credentialType,
      resultType: result.type,
    })
    return { status: 'dismissed' }
  } catch (error) {
    logWalletError('wallet-home', 'issuer-portal-open-failed', error, {
      credentialType,
    })
    return { status: 'error' }
  }
}
