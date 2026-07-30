import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isMyQrDualFormatReady } from './isMyQrDualFormatReady'
import { resolvePidVpQrCredential } from './resolvePidVpQrCredential'

const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'

export async function resolveMyQrPresentationCredential(
  credentials: VerifiableCredentialRecord[],
): Promise<VerifiableCredentialRecord | undefined> {
  const drivingLicenceCandidates = credentials.filter((record) => record.type === DRIVING_LICENCE_TYPE)

  for (const candidate of drivingLicenceCandidates) {
    if (await isMyQrDualFormatReady(candidate)) {
      return candidate
    }
  }

  return resolvePidVpQrCredential(credentials)
}
