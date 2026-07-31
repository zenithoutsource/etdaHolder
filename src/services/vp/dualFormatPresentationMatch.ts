import { isCompactSdJwt } from './credentialFormatUtils'
import { isSdJwtDcqlFormat } from './dualFormatQuery'
import { isCredentialCompatibleWithDcqlMetadata } from './dcqlCredentialMatch'
import type { DcqlQuery } from './presentationService'
import { findLogicalCredentialBySdJwtRecordId } from '../credentials/logicalCredentialStorage'
import { hasStoredMdoc } from '../proximity/mdocStorage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export {
  isDualFormatDcqlRequest,
  isExactDualFormatPair,
  readRequestedDcqlFormats,
} from './dualFormatQuery'

export function isSdJwtSideCompatibleWithDualFormatRequest(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery,
): boolean {
  const sdJwtQueries = dcqlQuery.credentials.filter((credential) => isSdJwtDcqlFormat(credential.format))
  if (sdJwtQueries.length === 0) return false

  return sdJwtQueries.every(
    (credential) =>
      isCompactSdJwt(record.rawVc) &&
      isCredentialCompatibleWithDcqlMetadata(record, credential),
  )
}

export async function assertDualFormatPresentationReady(
  matchedCredential: VerifiableCredentialRecord,
): Promise<void> {
  const logical = findLogicalCredentialBySdJwtRecordId(matchedCredential.id)
  if (!logical?.formats['dc+sd-jwt'] || !logical.formats['mso_mdoc']) {
    throw new Error('PresentationCredentialMissing: dual-format request requires linked dc+sd-jwt and mso_mdoc credentials')
  }

  const hasMdoc = await hasStoredMdoc(matchedCredential.id)
  if (!hasMdoc) {
    throw new Error('PresentationCredentialMissing: mso_mdoc format is unavailable for the matched logical credential')
  }
}
