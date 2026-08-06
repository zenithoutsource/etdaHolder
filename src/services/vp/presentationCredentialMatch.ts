import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  canWalletSatisfyDcqlCredentialQuery,
  isCredentialCompatibleWithDcqlFormat,
  isCredentialCompatibleWithDcqlMetadata,
  readCredentialTypeFromDcqlTypeValue,
} from './dcqlCredentialMatch'
import { isDualFormatDcqlRequest, isSdJwtSideCompatibleWithDualFormatRequest } from './dualFormatPresentationMatch'
import type { DcqlQuery } from './presentationService'

export function matchesPresentationDefinitionCredential(
  record: VerifiableCredentialRecord,
  requestedTypes: readonly string[],
  hasRequiredClaims: (record: VerifiableCredentialRecord) => boolean,
): boolean {
  return requestedTypes.includes(record.type) && hasRequiredClaims(record)
}

export function satisfiesFullDcqlRequest(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery,
): boolean {
  return matchDcqlRequest(record, dcqlQuery, (candidate, query) =>
    query.credentials.every((credential) => canWalletSatisfyDcqlCredentialQuery(candidate, credential)),
  )
}

export function satisfiesDcqlCandidateTypes(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery,
): boolean {
  return matchDcqlRequest(record, dcqlQuery, (candidate, query) => {
    const mappedTypes = readMappedCredentialTypesFromDcqlQuery(query)
    return mappedTypes.length === 0 || mappedTypes.includes(candidate.type)
  })
}

export function satisfiesDcqlFormats(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery,
): boolean {
  return matchDcqlRequest(record, dcqlQuery, (candidate, query) =>
    query.credentials.every((credential) => isCredentialCompatibleWithDcqlFormat(candidate, credential.format)),
  )
}

export function satisfiesDcqlMetadata(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery | undefined,
): boolean {
  if (!dcqlQuery || isDualFormatDcqlRequest(dcqlQuery)) return true

  return dcqlQuery.credentials.every((credential) => isCredentialCompatibleWithDcqlMetadata(record, credential))
}

function matchDcqlRequest(
  record: VerifiableCredentialRecord,
  dcqlQuery: DcqlQuery,
  onStandardDcql: (record: VerifiableCredentialRecord, query: DcqlQuery) => boolean,
): boolean {
  if (isDualFormatDcqlRequest(dcqlQuery)) {
    return isSdJwtSideCompatibleWithDualFormatRequest(record, dcqlQuery)
  }

  return onStandardDcql(record, dcqlQuery)
}

function readMappedCredentialTypesFromDcqlQuery(dcqlQuery: DcqlQuery): string[] {
  return dcqlQuery.credentials
    .flatMap((credential) => credential.meta?.type_values ?? [])
    .map(readCredentialTypeFromDcqlTypeValue)
    .filter((type): type is string => Boolean(type))
}
