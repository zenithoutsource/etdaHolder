import type { AppDialogAction, AppDialogOptions } from '../../components/AppDialog'

import type { PidGateStatus } from './credentialGuard'
import { WALLET_HOME_COPY } from './walletHomeCopy'

const PID_GATE_DIALOG_COPY: Record<
  Extract<PidGateStatus, 'missing' | 'renewal-required'>,
  Pick<AppDialogOptions, 'title' | 'message'>
> = {
  missing: {
    title: WALLET_HOME_COPY.pidRequiredTitle,
    message: WALLET_HOME_COPY.pidRequiredMessage,
  },
  'renewal-required': {
    title: WALLET_HOME_COPY.renewThaIdRequiredTitle,
    message: WALLET_HOME_COPY.renewThaIdRequiredMessage,
  },
}

const cancelAction = (): AppDialogAction => ({
  label: WALLET_HOME_COPY.cancel,
  variant: 'secondary',
})

const PID_GATE_DIALOG_ACTIONS: Record<
  Extract<PidGateStatus, 'missing' | 'renewal-required'>,
  (onRequestThaId: () => void) => AppDialogAction[]
> = {
  missing: (onRequestThaId) => [
    cancelAction(),
    {
      label: WALLET_HOME_COPY.requestThaId,
      onPress: onRequestThaId,
    },
  ],
  'renewal-required': () => [cancelAction()],
}

export function buildPidGateDialogOptions(
  gateStatus: PidGateStatus,
  onRequestThaId: () => void,
): AppDialogOptions {
  if (gateStatus === 'ready') {
    throw new Error('PidGateDialogNotRequired')
  }

  return {
    ...PID_GATE_DIALOG_COPY[gateStatus],
    actions: PID_GATE_DIALOG_ACTIONS[gateStatus](onRequestThaId),
  }
}

export function showPidGateDialog(
  showDialog: (options: AppDialogOptions) => void,
  gateStatus: PidGateStatus,
  onRequestThaId: () => void,
): void {
  showDialog(buildPidGateDialogOptions(gateStatus, onRequestThaId))
}
