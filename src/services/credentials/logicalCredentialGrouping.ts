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

export function readConfigurationFamilyKey(configuration: OfferedCredentialConfiguration): string {
  const explicit = readIssuerLogicalCredentialId(configuration)
  if (explicit) return explicit

  const normalized = normalizeConfigurationId(configuration.id)
  const suffix = readConfigurationFormatSuffix(normalized)
  if (suffix) {
    return stripFormatSuffix(normalized)
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
