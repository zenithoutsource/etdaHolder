import type { Router } from 'expo-router'

import type { AppDialogOptions } from '../../components/AppDialog'
import { isIssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../../store/deeplinkStore'
import { consumeLastPortalReturn } from './lastPortalReturn'
import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import {
  buildPortalEmptyOfferDialogFromReturn,
  showPortalEmptyOfferDialog,
} from './portalEmptyOfferDialog'
import { WALLET_HOME_COPY } from './walletHomeCopy'

export async function requestCredentialViaPortalFlow(input: {
  credentialType: string | undefined
  router: Pick<Router, 'push'>
  showDialog: (options: AppDialogOptions) => void
}): Promise<void> {
  const { credentialType, router, showDialog } = input

  if (!isIssuerPortalCredentialType(credentialType)) {
    showDialog({
      title: WALLET_HOME_COPY.portalMisconfiguredTitle,
      message: WALLET_HOME_COPY.portalMisconfiguredMessage,
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
    return
  }

  const offerGenerationAtStart = useDeeplinkStore.getState().offerGeneration
  const result = await openCredentialRequestPortal(credentialType)
  if (result.status === 'claimed') {
    router.push('/(tabs)/credential-offer')
    return
  }
  if (result.status === 'presentation_request') {
    router.push('/(tabs)/presentation-request')
    return
  }
  if (result.status === 'misconfigured') {
    showDialog({
      title: WALLET_HOME_COPY.portalMisconfiguredTitle,
      message: WALLET_HOME_COPY.portalMisconfiguredMessage,
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
    return
  }
  if (result.status === 'error') {
    showDialog({
      title: WALLET_HOME_COPY.portalErrorTitle,
      message: WALLET_HOME_COPY.portalErrorMessage,
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
    return
  }
  if (result.status === 'empty_offer') {
    showPortalEmptyOfferDialog(showDialog, {
      reason: result.reason,
      onRetry: () => {
        void requestCredentialViaPortalFlow({ credentialType, router, showDialog })
      },
    })
    return
  }
  const { offerGeneration, pendingUri } = useDeeplinkStore.getState()
  const pendingOffer = offerGeneration > offerGenerationAtStart ? pendingUri : null
  if (pendingOffer && isCredentialOfferDeeplink(pendingOffer)) {
    router.push('/(tabs)/credential-offer')
    return
  }
  const lastReturn = consumeLastPortalReturn()
  if (lastReturn?.outcome === 'empty-callback' || lastReturn?.outcome === 'unrecognized') {
    showDialog(buildPortalEmptyOfferDialogFromReturn({
      record: lastReturn,
      onRetry: () => {
        void requestCredentialViaPortalFlow({
          credentialType: lastReturn.credentialType ?? credentialType,
          router,
          showDialog,
        })
      },
    }))
  }
}
