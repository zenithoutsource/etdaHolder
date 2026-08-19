/**
 * Maps P3 submitRenewalRequest failures to Holder dialog copy and portal fallback.
 * Journey: P3 Home expand ขอเอกสาร.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

import type { AppDialogAction, AppDialogOptions } from '../../components/AppDialog'
import { WALLET_HOME_COPY } from './walletHomeCopy'

export type RenewalRequestFailureKind =
  | 'previous-key-unavailable'
  | 'issuer-offer-failed'
  | 'generic'

export type RenewalRequestFailureUi = {
  kind: RenewalRequestFailureKind
  title: string
  message: string
  offerPortalFallback: boolean
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function readRenewalRequestHttpStatus(message: string): number | undefined {
  const match = message.match(/CredentialRenewalRequestFailed:\s*HTTP\s+(\d{3})/i)
  if (!match) return undefined
  return Number(match[1])
}

export function resolveRenewalRequestFailureUi(error: unknown): RenewalRequestFailureUi {
  const raw = readErrorMessage(error)
  if (raw.includes('CredentialRenewalPreviousKeyUnavailable')) {
    return {
      kind: 'previous-key-unavailable',
      title: WALLET_HOME_COPY.renewalKeyUnavailableTitle,
      message: WALLET_HOME_COPY.renewalKeyUnavailableMessage,
      offerPortalFallback: false,
    }
  }

  const status = readRenewalRequestHttpStatus(raw)
  if (status === 502 || status === 503) {
    return {
      kind: 'issuer-offer-failed',
      title: WALLET_HOME_COPY.renewalIssuerOfferFailedTitle,
      message: WALLET_HOME_COPY.renewalIssuerOfferFailedMessage,
      offerPortalFallback: true,
    }
  }

  return {
    kind: 'generic',
    title: WALLET_HOME_COPY.renewalRequestFailedTitle,
    message: WALLET_HOME_COPY.renewalRequestFailedMessage,
    offerPortalFallback: false,
  }
}

export function buildRenewalRequestFailureDialog(
  error: unknown,
  options?: {
    onRequestNewCredential?: () => void
  },
): AppDialogOptions {
  const ui = resolveRenewalRequestFailureUi(error)
  const actions: AppDialogAction[] = [
    { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
  ]
  if (ui.offerPortalFallback && options?.onRequestNewCredential) {
    actions.push({
      label: WALLET_HOME_COPY.requestNewCredential,
      onPress: options.onRequestNewCredential,
    })
  }

  return {
    title: ui.title,
    message: ui.message,
    icon: 'danger',
    actions,
  }
}
