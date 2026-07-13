import { getCardSchema } from '../../config/cardSchemas'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import {
  readCredentialLifecycleStatus,
  recordCredentialLifecycleAction,
} from './credentialLifecycle'

export type SingleUseConsumptionResult = {
  consumed: boolean
}

export function maybeConsumeSingleUseCredential(input: {
  credentialId: string
  credentialType: string
}): SingleUseConsumptionResult {
  const schema = getCardSchema(input.credentialType)
  if (!schema.singleUse) {
    return { consumed: false }
  }

  const existing = readCredentialLifecycleStatus(input.credentialId)
  if (existing) {
    return { consumed: false }
  }

  try {
    recordCredentialLifecycleAction(input.credentialId, 'Used', 'system')
    logWalletStep('single-use-consume', 'credential-marked-used', {
      credentialId: input.credentialId,
      credentialType: input.credentialType,
    })
    return { consumed: true }
  } catch (error) {
    logWalletError('single-use-consume', 'lifecycle-write-failed', error, {
      credentialId: input.credentialId,
      credentialType: input.credentialType,
    })
    return { consumed: false }
  }
}
