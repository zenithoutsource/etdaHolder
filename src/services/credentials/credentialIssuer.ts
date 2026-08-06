import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { getCardSchema } from '../../config/cardSchemas'
import { readString } from '../../utils/jwtUtils'

export function readCredentialIssuerName(record: VerifiableCredentialRecord): string {
  const schema = getCardSchema(record.type)
  if (schema.type !== '__fallback__') return schema.issuerName

  const storedName = record.issuerName?.trim()
  if (storedName) return storedName

  const issuerClaim = readString(record.claims.iss)?.trim()
  return issuerClaim || schema.issuerName || 'Unknown Issuer'
}
