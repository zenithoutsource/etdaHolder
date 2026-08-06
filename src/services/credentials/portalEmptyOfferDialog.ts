import type { AppDialogOptions } from '../../components/AppDialog'

import type { LastPortalReturnRecord } from './lastPortalReturn'
import { WALLET_HOME_COPY } from './walletHomeCopy'

export type PortalEmptyOfferReason =
  | 'no_offer_in_callback'
  | 'no_callback'
  | 'unrecognized'

const PORTAL_EMPTY_OFFER_COPY: Record<
  PortalEmptyOfferReason,
  Pick<AppDialogOptions, 'title' | 'message'>
> = {
  no_offer_in_callback: {
    title: WALLET_HOME_COPY.portalEmptyOfferTitle,
    message: WALLET_HOME_COPY.portalEmptyOfferMessage,
  },
  no_callback: {
    title: WALLET_HOME_COPY.portalNoCallbackTitle,
    message: WALLET_HOME_COPY.portalNoCallbackMessage,
  },
  unrecognized: {
    title: WALLET_HOME_COPY.portalEmptyOfferTitle,
    message: WALLET_HOME_COPY.portalUnrecognizedReturnMessage,
  },
}

function readReasonFromPortalReturn(
  record: LastPortalReturnRecord,
): PortalEmptyOfferReason {
  if (record.outcome === 'cancelled') return 'no_callback'
  if (record.outcome === 'unrecognized') return 'unrecognized'
  return 'no_offer_in_callback'
}

export function buildPortalEmptyOfferDialogOptions(input: {
  reason: PortalEmptyOfferReason
  onRetry?: () => void
}): AppDialogOptions {
  const copy = PORTAL_EMPTY_OFFER_COPY[input.reason]
  const actions = input.onRetry
    ? [
        {
          label: WALLET_HOME_COPY.cancel,
          variant: 'secondary' as const,
        },
        {
          label: WALLET_HOME_COPY.portalEmptyOfferRetry,
          onPress: input.onRetry,
        },
      ]
    : [
        {
          label: WALLET_HOME_COPY.acknowledge,
          variant: 'primary' as const,
        },
      ]

  return {
    title: copy.title,
    message: copy.message,
    icon: 'warning',
    actions,
  }
}

export function buildPortalEmptyOfferDialogFromReturn(input: {
  record: LastPortalReturnRecord
  onRetry?: () => void
}): AppDialogOptions {
  return buildPortalEmptyOfferDialogOptions({
    reason: readReasonFromPortalReturn(input.record),
    onRetry: input.onRetry,
  })
}

export function showPortalEmptyOfferDialog(
  showDialog: (options: AppDialogOptions) => void,
  input: {
    reason: PortalEmptyOfferReason
    onRetry?: () => void
  },
): void {
  showDialog(buildPortalEmptyOfferDialogOptions(input))
}
