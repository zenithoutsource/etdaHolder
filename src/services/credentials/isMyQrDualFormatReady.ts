import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { hasStoredMdoc } from '../proximity/mdocStorage'
import { isCredentialPresentable } from './credentialLifecycle'
import { findLogicalCredentialBySdJwtRecordId } from './logicalCredentialStorage'

export async function isMyQrDualFormatReady(record: VerifiableCredentialRecord): Promise<boolean> {
  if (!isCredentialPresentable(record)) return false

  const logical = findLogicalCredentialBySdJwtRecordId(record.id)
  if (!logical?.formats['dc+sd-jwt'] || !logical.formats['mso_mdoc']) return false

  return hasStoredMdoc(record.id)
}
