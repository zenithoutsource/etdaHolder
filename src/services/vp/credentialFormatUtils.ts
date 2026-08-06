import { decodeJwtPayload, isRecord, readString } from '@/src/utils/jwtUtils'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function readCredentialVct(record: VerifiableCredentialRecord): string | undefined {
  const claimVct = readString(record.claims.vct)
  if (claimVct) return claimVct

  try {
    const issuerJwt = record.rawVc.split('~')[0] ?? record.rawVc
    return readString(decodeJwtPayload(issuerJwt)?.vct)
  } catch {
    return undefined
  }
}

export function isCompactSdJwt(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
}

export function isCompactJwtVc(rawVc: string): boolean {
  if (isCompactSdJwt(rawVc)) return false
  const payload = decodeJwtPayload(rawVc)
  return isRecord(payload?.vc)
}
