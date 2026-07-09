import type { DcqlCredentialQuery, DcqlQuery } from './presentationService'
import { findLogicalCredentialBySdJwtRecordId } from '../credentials/logicalCredentialStorage'
import { hasStoredMdoc } from '../proximity/mdocStorage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function readRequestedDcqlFormats(dcqlQuery: DcqlQuery): string[] {
  return [
    ...new Set(
      dcqlQuery.credentials
        .map((credential) => credential.format)
        .filter((format): format is string => typeof format === 'string' && format.length > 0),
    ),
  ]
}

export function isDualFormatDcqlRequest(dcqlQuery: DcqlQuery): boolean {
  const formats = readRequestedDcqlFormats(dcqlQuery)
  return formats.includes('dc+sd-jwt') && formats.includes('mso_mdoc')
}

const SD_JWT_DCQL_FORMATS = new Set(['dc+sd-jwt', 'vc+sd-jwt'])

export function isExactDualFormatPair(dcqlQuery: DcqlQuery): boolean {
  if (dcqlQuery.credentials.length !== 2) return false

  const formats = readRequestedDcqlFormats(dcqlQuery)
  if (formats.length !== 2) return false

  const hasSdJwtFormat = formats.some((format) => SD_JWT_DCQL_FORMATS.has(format))
  const hasMdocFormat = formats.includes('mso_mdoc')
  return hasSdJwtFormat && hasMdocFormat
}

export function readDcqlCredentialQueryByFormat(
  dcqlQuery: DcqlQuery,
  format: string,
): DcqlCredentialQuery | undefined {
  return dcqlQuery.credentials.find((credential) => credential.format === format)
}

export function isSdJwtSideCompatibleWithDualFormatRequest(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery,
): boolean {
  const sdJwtQueries = dcqlQuery.credentials.filter(
    (credential) => credential.format === 'dc+sd-jwt' || credential.format === 'vc+sd-jwt',
  )
  if (sdJwtQueries.length === 0) return false

  return sdJwtQueries.every(
    (credential) =>
      isCompactSdJwtCredential(record.rawVc) &&
      isSdJwtMetadataCompatible(record, credential),
  )
}

function isCompactSdJwtCredential(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
}

function isSdJwtMetadataCompatible(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const requestedVctValues = credential.meta?.vct_values ?? []
  if (requestedVctValues.length === 0) return true

  const credentialVct = readCredentialVct(record)
  return Boolean(credentialVct && requestedVctValues.includes(credentialVct))
}

function readCredentialVct(record: VerifiableCredentialRecord): string | undefined {
  const vct = record.claims.vct
  return typeof vct === 'string' && vct.length > 0 ? vct : undefined
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
