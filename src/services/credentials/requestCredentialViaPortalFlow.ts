/**
 * Opens the Issuer portal for a credential type and routes the Holder to claim or VP.
 * Journey: P1 Home ขอเอกสาร / P3 Inactive ขอเอกสาร intake / expired ขอเอกสารใหม่.
 * PIN lock: do not open, navigate, or retry while the idle-grace PIN screen is showing.
 */
import type { Router } from 'expo-router'

import type { AppDialogOptions } from '../../components/AppDialog'
import { resolveIssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import { isCredentialOfferDeeplink, useDeeplinkStore } from '../../store/deeplinkStore'
import { readWalletPinLockRequired } from '../auth/walletPinNavigation'
import { logWalletError } from '../debug/walletLogger'
import { readPidGateStatus, type PidGateStatus } from './credentialGuard'
import { readCredentialRenewalStatuses } from './credentialKeyRenewal'
import { consumeLastPortalReturn } from './lastPortalReturn'
import { openCredentialRequestPortal } from './openCredentialRequestPortal'
import { shouldShowHomePidGateDialog, showPidGateDialog } from './pidGateDialog'
import {
  buildPortalEmptyOfferDialogFromReturn,
  showPortalEmptyOfferDialog,
} from './portalEmptyOfferDialog'
import { readStoredCredentials } from './storedCredentials'
import { WALLET_HOME_COPY } from './walletHomeCopy'

function readPortalPidGateStatus(): PidGateStatus {
  try {
    const credentials = readStoredCredentials()
    return readPidGateStatus(credentials, readCredentialRenewalStatuses(credentials))
  } catch (error) {
    logWalletError('portal', 'pid-gate-lookup-failed', error)
    return 'missing'
  }
}

export type PortalFlowOutcome =
  | 'opened-claim'
  | 'opened-presentation'
  | 'abandoned'
  | 'blocked'

export async function requestCredentialViaPortalFlow(input: {
  credentialType: string | undefined
  router: Pick<Router, 'push'>
  showDialog: (options: AppDialogOptions) => void
}): Promise<PortalFlowOutcome> {
  const { credentialType, router, showDialog } = input

  if (readWalletPinLockRequired()) {
    return 'abandoned'
  }

  const portalCredentialType = resolveIssuerPortalCredentialType(credentialType)
  if (!portalCredentialType) {
    showDialog({
      title: WALLET_HOME_COPY.portalMisconfiguredTitle,
      message: WALLET_HOME_COPY.portalMisconfiguredMessage,
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
    return 'abandoned'
  }

  const pidGateStatus = readPortalPidGateStatus()
  if (shouldShowHomePidGateDialog(portalCredentialType, pidGateStatus)) {
    showPidGateDialog(
      showDialog,
      pidGateStatus,
      () => {
        void requestCredentialViaPortalFlow({
          credentialType: 'ThaiNationalID',
          router,
          showDialog,
        })
      },
      'request',
    )
    return 'blocked'
  }

  const offerGenerationAtStart = useDeeplinkStore.getState().offerGeneration
  const result = await openCredentialRequestPortal(portalCredentialType)
  const pinLocked = readWalletPinLockRequired()
  if (result.status === 'claimed' || result.status === 'auth_code_claim_ready') {
    if (!pinLocked) router.push('/(tabs)/credential-offer')
    return 'opened-claim'
  }
  if (result.status === 'auth_code_awaiting_pid_vp') {
    if (!pinLocked) router.push('/(tabs)/presentation-request')
    return 'opened-presentation'
  }
  if (result.status === 'presentation_request') {
    if (!pinLocked) router.push('/(tabs)/presentation-request')
    return 'opened-presentation'
  }
  if (result.status === 'misconfigured') {
    showDialog({
      title: WALLET_HOME_COPY.portalMisconfiguredTitle,
      message: WALLET_HOME_COPY.portalMisconfiguredMessage,
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
    return 'abandoned'
  }
  if (result.status === 'error') {
    showDialog({
      title: WALLET_HOME_COPY.portalErrorTitle,
      message: WALLET_HOME_COPY.portalErrorMessage,
      icon: 'danger',
      actions: [{ label: WALLET_HOME_COPY.cancel, variant: 'secondary' }],
    })
    return 'abandoned'
  }
  if (result.status === 'empty_offer') {
    showPortalEmptyOfferDialog(showDialog, {
      reason: result.reason,
      onRetry: () => {
        void requestCredentialViaPortalFlow({ credentialType, router, showDialog })
      },
    })
    return 'abandoned'
  }
  // A newer "ขอเอกสาร" replaced this wait — silent exit so a stale empty dialog
  // cannot appear after the retry already succeeded.
  if (result.status === 'superseded') {
    return 'abandoned'
  }
  const { offerGeneration, pendingUri } = useDeeplinkStore.getState()
  const pendingOffer = offerGeneration > offerGenerationAtStart ? pendingUri : null
  if (pendingOffer && isCredentialOfferDeeplink(pendingOffer)) {
    if (!readWalletPinLockRequired()) router.push('/(tabs)/credential-offer')
    return 'opened-claim'
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
  return 'abandoned'
}
