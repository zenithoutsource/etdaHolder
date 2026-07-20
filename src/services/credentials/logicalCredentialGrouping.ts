import type { OfferedCredentialConfiguration } from '../vci/exchangeService'
import { readRecord, readString } from '@/src/utils/jwtUtils'

import type { DualFormatConfigurationGroup } from './logicalCredentialTypes'

const SD_JWT_FORMATS = new Set(['dc+sd-jwt', 'vc+sd-jwt'])

export function normalizeConfigurationId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function stripFormatSuffix(normalizedId: string): string {
  return normalizedId
    .replace(/dcsdjwt$/, '')
    .replace(/vcsdjwt$/, '')
    .replace(/msomdoc$/, '')
    .replace(/jwtvcjson$/, '')
    .replace(/jwtvc$/, '')
}

export function readConfigurationFormatSuffix(normalizedId: string): string | undefined {
  if (normalizedId.endsWith('dcsdjwt')) return 'dc+sd-jwt'
  if (normalizedId.endsWith('vcsdjwt')) return 'vc+sd-jwt'
  if (normalizedId.endsWith('msomdoc')) return 'mso_mdoc'
  if (normalizedId.endsWith('jwtvcjson')) return 'jwt_vc_json'
  if (normalizedId.endsWith('jwtvc')) return 'jwt_vc'
  return undefined
}

export function isSdJwtConfiguration(configuration: OfferedCredentialConfiguration): boolean {
  return SD_JWT_FORMATS.has(configuration.format)
}

export function isMdocConfiguration(configuration: OfferedCredentialConfiguration): boolean {
  return configuration.format === 'mso_mdoc'
}

export function readIssuerLogicalCredentialId(
  configuration: OfferedCredentialConfiguration,
): string | undefined {
  const raw = configuration.rawConfiguration as Record<string, unknown>
  return (
    readString(raw.logical_credential_id) ??
    readString(raw.credential_id) ??
    readString(raw.document_id)
  )
}

/** Canonical family for ISO mDL doctype ids + Iso18013DriversLicenseCredential_* siblings. */
const ISO_18013_DRIVING_LICENCE_FAMILY_KEY = 'iso18013driverslicensecredential'

function readConfigurationTypeHints(configuration: OfferedCredentialConfiguration): string[] {
  const raw = readRecord(configuration.rawConfiguration)
  const credentialDefinition = readRecord(raw?.credential_definition)
  const values = [
    ...(Array.isArray(raw?.types) ? raw.types : []),
    ...(Array.isArray(credentialDefinition?.type) ? credentialDefinition.type : []),
    credentialDefinition?.type,
  ]
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function isIsoMdlDoctypeFamilyId(value: string): boolean {
  const normalized = normalizeConfigurationId(value)
  return (
    normalized === 'orgiso1801351mdl' ||
    normalized.endsWith('1801351mdl') ||
    (normalized.startsWith('orgiso') && normalized.endsWith('mdl'))
  )
}

export function readConfigurationFamilyKey(configuration: OfferedCredentialConfiguration): string {
  const explicit = readIssuerLogicalCredentialId(configuration)
  if (explicit) return explicit

  // Prefer metadata requestId so offer doctypes (e.g. org.iso.18013.5.1.mDL) group with
  // Iso18013DriversLicenseCredential_dc+sd-jwt / _mso_mdoc siblings.
  const idForFamily = configuration.requestId || configuration.id
  const normalized = normalizeConfigurationId(idForFamily)
  const suffix = readConfigurationFormatSuffix(normalized)
  if (suffix) {
    const family = stripFormatSuffix(normalized)
    if (family.includes('iso18013driverslicense')) {
      return ISO_18013_DRIVING_LICENCE_FAMILY_KEY
    }
    return family
  }

  // Direct metadata keys use the doctype itself (org.iso.18013.5.1.mDL) without a format suffix.
  const doctype = readMdocDocType(configuration)
  if (isIsoMdlDoctypeFamilyId(idForFamily) || (doctype ? isIsoMdlDoctypeFamilyId(doctype) : false)) {
    return ISO_18013_DRIVING_LICENCE_FAMILY_KEY
  }

  for (const typeHint of readConfigurationTypeHints(configuration)) {
    const normalizedType = stripFormatSuffix(normalizeConfigurationId(typeHint))
    if (normalizedType.includes('iso18013driverslicense')) {
      return ISO_18013_DRIVING_LICENCE_FAMILY_KEY
    }
  }

  return normalized
}

export function groupDualFormatConfigurations(
  configurations: OfferedCredentialConfiguration[],
): DualFormatConfigurationGroup[] {
  const groups = new Map<string, DualFormatConfigurationGroup>()

  for (const configuration of configurations) {
    const familyKey = readConfigurationFamilyKey(configuration)
    const existing = groups.get(familyKey) ?? { familyKey }
    const logicalHint =
      readIssuerLogicalCredentialId(configuration) ?? existing.logicalCredentialIdHint

    if (isSdJwtConfiguration(configuration)) {
      existing.sdJwt = {
        configurationId: configuration.id,
        requestId: configuration.requestId,
        rawConfiguration: configuration.rawConfiguration as Record<string, unknown>,
      }
    }

    if (isMdocConfiguration(configuration)) {
      existing.mdoc = {
        configurationId: configuration.id,
        requestId: configuration.requestId,
        rawConfiguration: configuration.rawConfiguration as Record<string, unknown>,
      }
    }

    if (logicalHint) {
      existing.logicalCredentialIdHint = logicalHint
    }

    groups.set(familyKey, existing)
  }

  return [...groups.values()]
}

export function findDualFormatGroup(
  configurations: OfferedCredentialConfiguration[],
): DualFormatConfigurationGroup | undefined {
  return groupDualFormatConfigurations(configurations).find(
    (group) => group.sdJwt && group.mdoc,
  )
}

export function isDualFormatOffer(configurations: OfferedCredentialConfiguration[]): boolean {
  return Boolean(findDualFormatGroup(configurations))
}

export function readMdocDocType(configuration: OfferedCredentialConfiguration): string | undefined {
  const raw = readRecord(configuration.rawConfiguration)
  return readString(raw?.doctype) ?? readString(raw?.docType)
}
