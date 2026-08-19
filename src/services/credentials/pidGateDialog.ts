import type { AppDialogAction, AppDialogOptions } from '../../components/AppDialog'

import type { PidGateStatus } from './credentialGuard'
import { WALLET_HOME_COPY } from './walletHomeCopy'

export type PidGateDialogPurpose = 'request' | 'present'

export type BlockingPidGateStatus = Extract<
  PidGateStatus,
  'missing' | 'renewal-required' | 'suspended' | 'document-expired'
>

const PID_GATE_DIALOG_COPY: Record<
  BlockingPidGateStatus,
  Record<PidGateDialogPurpose, { title: string; message: string }>
> = {
  missing: {
    request: {
      title: WALLET_HOME_COPY.pidRequiredTitle,
      message: WALLET_HOME_COPY.pidRequiredMessage,
    },
    present: {
      title: WALLET_HOME_COPY.pidRequiredTitle,
      message: WALLET_HOME_COPY.pidRequiredToPresentMessage,
    },
  },
  'renewal-required': {
    request: {
      title: WALLET_HOME_COPY.renewThaIdRequiredTitle,
      message: WALLET_HOME_COPY.renewThaIdRequiredMessage,
    },
    present: {
      title: WALLET_HOME_COPY.renewThaIdRequiredTitle,
      message: WALLET_HOME_COPY.renewThaIdRequiredMessage,
    },
  },
  suspended: {
    request: {
      title: WALLET_HOME_COPY.pidSuspendedTitle,
      message: WALLET_HOME_COPY.pidSuspendedMessage,
    },
    present: {
      title: WALLET_HOME_COPY.pidSuspendedTitle,
      message: WALLET_HOME_COPY.pidSuspendedToPresentMessage,
    },
  },
  'document-expired': {
    request: {
      title: WALLET_HOME_COPY.pidExpiredTitle,
      message: WALLET_HOME_COPY.pidExpiredMessage,
    },
    present: {
      title: WALLET_HOME_COPY.pidExpiredTitle,
      message: WALLET_HOME_COPY.pidExpiredToPresentMessage,
    },
  },
}

const cancelAction = (): AppDialogAction => ({
  label: WALLET_HOME_COPY.cancel,
  variant: 'secondary',
})

const requestThaIdActions = (onRequestThaId: () => void): AppDialogAction[] => [
  cancelAction(),
  {
    label: WALLET_HOME_COPY.requestThaId,
    onPress: onRequestThaId,
  },
]

const PID_GATE_DIALOG_ACTIONS: Record<
  BlockingPidGateStatus,
  (onRequestThaId: () => void) => AppDialogAction[]
> = {
  missing: requestThaIdActions,
  'renewal-required': () => [cancelAction()],
  suspended: requestThaIdActions,
  'document-expired': requestThaIdActions,
}

/**
 * Portal issuance and leftover-Ed25519 Fresh reissue stay PID-first.
 * Hardware P3 ขอเอกสาร of another card is gated by canSubmitCredentialRenewal
 * instead — PID renewal-required must not block that path.
 */
export function shouldShowHomePidGateDialog(
  credentialType: string | undefined,
  gateStatus: PidGateStatus,
): boolean {
  if (!credentialType || credentialType === 'ThaiNationalID') return false
  return gateStatus !== 'ready'
}

export function readPidGateUserCopy(
  gateStatus: BlockingPidGateStatus,
  purpose: PidGateDialogPurpose = 'request',
): { title: string; message: string } {
  return PID_GATE_DIALOG_COPY[gateStatus][purpose]
}

export function buildPidGateDialogOptions(
  gateStatus: PidGateStatus,
  onRequestThaId: () => void,
  purpose: PidGateDialogPurpose = 'request',
): AppDialogOptions {
  if (gateStatus === 'ready') {
    throw new Error('PidGateDialogNotRequired')
  }

  return {
    ...PID_GATE_DIALOG_COPY[gateStatus][purpose],
    actions: PID_GATE_DIALOG_ACTIONS[gateStatus](onRequestThaId),
  }
}

export function showPidGateDialog(
  showDialog: (options: AppDialogOptions) => void,
  gateStatus: PidGateStatus,
  onRequestThaId: () => void,
  purpose: PidGateDialogPurpose = 'request',
): void {
  if (gateStatus === 'ready') return
  showDialog(buildPidGateDialogOptions(gateStatus, onRequestThaId, purpose))
}
