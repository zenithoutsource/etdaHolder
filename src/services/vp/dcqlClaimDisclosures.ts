/**
 * Builds holder consent disclosures from a DCQL query and stored credential claims.
 */
import {
  collectDisplayFieldMatchKeys,
  findDisplayFieldForClaimKey,
  resolveCardSchema,
  resolvePresentationDisclosureLabel,
} from '@/src/config/cardSchemas'
import { isFirstPartyDrivingLicence } from '@/src/config/firstPartyCredential'
import { formatDrivingLicenceVehicleTypeDisplay } from '@/src/config/drivingLicenceVehicleCategories'
import { hasAnyClaimValue, readClaimText } from '@/src/services/credentials/claimFormatting'
import { readPresentationFieldValue } from '@/src/services/credentials/credentialDisplay'
import { isMdocPresentableRecord } from '@/src/services/proximity/mdocCredential'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'
import { readCredentialClaimMap } from '@/src/services/vci/exchangeService'
import { normalizeClaimKey } from '@/src/utils/claimKeyNormalization'

import { isMsoMdocDcqlFormat } from './dualFormatQuery'
import type { DcqlQuery, PresentationDisclosure } from './presentationService'

export function buildDcqlClaimDisclosures(
  record: VerifiableCredentialRecord,
  query: DcqlQuery,
): PresentationDisclosure[] | undefined {
  const hasClaimQueries = query.credentials.some((credential) => (credential.claims ?? []).length > 0)
  if (!hasClaimQueries) return undefined

  const schema = resolveCardSchema(record)
  const claims = readCredentialClaimMap(record)
  const normalizedClaimKeys = new Map(Object.keys(claims).map((key) => [normalizeClaimKey(key), key]))
  const nativeMdocPresentable = isMdocPresentableRecord(record)

  const disclosures: PresentationDisclosure[] = []
  for (const credential of query.credentials) {
    for (const claimQuery of credential.claims ?? []) {
      if (isMsoMdocDcqlFormat(credential.format)) {
        const namespace = claimQuery.path[0]
        const identifier = claimQuery.path[1]
        if (!namespace || !identifier) continue

        const disclosureKey = `${namespace}/${identifier}`
        const lookupKey = normalizedClaimKeys.get(normalizeClaimKey(identifier)) ?? identifier
        const field = findDisplayFieldForClaimKey(schema.displayFields, lookupKey)
        const lookupKeys = field ? collectDisplayFieldMatchKeys(field) : [lookupKey]
        const rawValue = field
          ? readPresentationFieldValue(claims, field)
          : readClaimText(claims, lookupKeys)
        const value =
          isFirstPartyDrivingLicence(record) && field?.key === 'licenceClass'
            ? formatDrivingLicenceVehicleTypeDisplay(rawValue) ?? rawValue
            : rawValue
        const present = value !== undefined || hasAnyClaimValue(claims, lookupKeys) || nativeMdocPresentable
        if (!present) continue

        disclosures.push({
          key: disclosureKey,
          label: resolvePresentationDisclosureLabel(record.type, lookupKey),
          value: value ?? '',
        })
        continue
      }

      const requestedKey = claimQuery.path[0]
      if (!requestedKey) continue

      const normalizedRequestedKey = normalizeClaimKey(requestedKey)
      const field = findDisplayFieldForClaimKey(schema.displayFields, requestedKey)

      const lookupKeys = field
        ? collectDisplayFieldMatchKeys(field)
        : [normalizedClaimKeys.get(normalizedRequestedKey) ?? requestedKey]

      const rawValue = field
        ? readPresentationFieldValue(claims, field)
        : readClaimText(claims, lookupKeys)
      const value =
        isFirstPartyDrivingLicence(record) && field?.key === 'licenceClass'
          ? formatDrivingLicenceVehicleTypeDisplay(rawValue) ?? rawValue
          : rawValue
      const present = value !== undefined || hasAnyClaimValue(claims, lookupKeys)
      if (!present) continue

      disclosures.push({
        key: requestedKey,
        label: resolvePresentationDisclosureLabel(record.type, requestedKey),
        value: value ?? '',
      })
    }
  }

  return disclosures.length > 0 ? disclosures : undefined
}
