import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function isSdJwtCredential(record: VerifiableCredentialRecord): boolean {
  return record.rawVc.includes('~')
}
