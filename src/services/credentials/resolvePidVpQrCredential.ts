import { readCredentialRenewalStatuses } from './credentialKeyRenewal'
import { isCredentialPresentable } from './credentialLifecycle'
import { pickPreferredHomeCredential } from './credentialGuard'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isSdJwtCredential } from '../vp/walletInitiatedPresentation'

const PID_CREDENTIAL_TYPE = 'ThaiNationalID'

export function resolvePidVpQrCredential(
  credentials: VerifiableCredentialRecord[],
): VerifiableCredentialRecord | undefined {
  const renewalStatuses = readCredentialRenewalStatuses(credentials)
  const pidCredentials = credentials.filter((record) => record.type === PID_CREDENTIAL_TYPE)
  const preferred = pickPreferredHomeCredential(pidCredentials, renewalStatuses)
  if (!preferred) return undefined
  if (!isSdJwtCredential(preferred)) return undefined
  if (!isCredentialPresentable(preferred)) return undefined
  return preferred
}
