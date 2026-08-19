import { isIssuerOid4VpClientId, isIssuerOid4VpResponseUri } from '../../config/trustedVerifiers'
import { isAwaitingSameDevicePidVp } from '../../store/sameDeviceIssuanceStore'
import type { ResolvedPresentationRequest } from './presentationService'

const PID_CREDENTIAL_TYPE = 'ThaiNationalID'

export function isIssuerPidPresentation(
  request: Pick<ResolvedPresentationRequest, 'clientId' | 'responseUri' | 'matchedCredential'>,
): boolean {
  if (request.matchedCredential.type !== PID_CREDENTIAL_TYPE) return false
  if (isAwaitingSameDevicePidVp()) return true
  if (request.clientId && isIssuerOid4VpClientId(request.clientId)) return true
  if (request.responseUri && isIssuerOid4VpResponseUri(request.responseUri)) return true
  return false
}
