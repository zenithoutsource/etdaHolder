import {
  getCredentialConfigurationsMatchingRequestFormat,
  type CredentialConfigurationSupportedWithFormats,
  type CredentialConfigurationsSupportedWithFormats,
  type CredentialRequestFormatSpecific,
  type IssuerMetadataResult,
} from '@openid4vc/openid4vci'

import type { CredentialConfigurationSupportedV1_0_15 } from '../walletVciTypes'

export type MatchedCredentialConfiguration = {
  id: string
  rawConfiguration: CredentialConfigurationSupportedV1_0_15
}

function normalizeCredentialConfigurationId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function stripCredentialConfigurationFormatSuffix(normalizedId: string): string {
  return normalizedId
    .replace(/dcsdjwt$/, '')
    .replace(/vcsdjwt$/, '')
    .replace(/msomdoc$/, '')
    .replace(/jwtvcjson$/, '')
    .replace(/jwtvc$/, '')
}

function readCredentialConfigurationFormatSuffix(normalizedId: string): string | undefined {
  if (normalizedId.endsWith('dcsdjwt')) return 'dc+sd-jwt'
  if (normalizedId.endsWith('vcsdjwt')) return 'vc+sd-jwt'
  if (normalizedId.endsWith('msomdoc')) return 'mso_mdoc'
  if (normalizedId.endsWith('jwtvcjson')) return 'jwt_vc_json'
  if (normalizedId.endsWith('jwtvc')) return 'jwt_vc'
  return undefined
}

function isIsoMdocDoctypeOfferId(id: string): boolean {
  const normalized = id.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.startsWith('org.iso.')) return true
  return normalized.endsWith('.mdl') || normalized.endsWith('mdl')
}

function isSdJwtVcFormat(format: string): boolean {
  return format === 'dc+sd-jwt' || format === 'vc+sd-jwt'
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readTypeStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  const single = readString(value)
  return single ? [single] : []
}

function readDisplayNames(displays: unknown): string[] {
  if (!Array.isArray(displays)) return []
  return displays
    .map((display) => readRecord(display)?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

function isCompatibleCredentialConfigurationFormat(
  offeredFormat: string | undefined,
  configuration: CredentialConfigurationSupportedV1_0_15,
): boolean {
  if (!offeredFormat) return true
  if (configuration.format === offeredFormat) return true
  if (isSdJwtVcFormat(offeredFormat) && isSdJwtVcFormat(configuration.format)) return true
  return false
}

function isSemanticCredentialConfigurationMatch(
  offeredId: string,
  offeredFormat: string | undefined,
  configurationId: string,
  configuration: CredentialConfigurationSupportedV1_0_15,
): boolean {
  if (!isCompatibleCredentialConfigurationFormat(offeredFormat, configuration)) return false

  const offeredBaseId = stripCredentialConfigurationFormatSuffix(normalizeCredentialConfigurationId(offeredId))
  const searchableValues = [
    stripCredentialConfigurationFormatSuffix(normalizeCredentialConfigurationId(configurationId)),
    readString(configuration.vct),
    readString(readRecord(configuration)?.doctype),
    readString(readRecord(configuration)?.docType),
    ...readTypeStrings(readRecord(configuration)?.types),
    ...readTypeStrings(readRecord(configuration.credential_definition)?.type),
    ...readDisplayNames(configuration.display),
  ]
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeCredentialConfigurationId)

  return searchableValues.some((value) => value.includes(offeredBaseId) || offeredBaseId.includes(value))
}

function buildRequestFormatFromKnownConfiguration(
  configuration: CredentialConfigurationSupportedWithFormats,
): CredentialRequestFormatSpecific | undefined {
  if (configuration.format === 'mso_mdoc') {
    const doctype = readString((configuration as { doctype?: string }).doctype)
    if (!doctype) return undefined
    return { format: 'mso_mdoc', doctype }
  }

  if (configuration.format === 'dc+sd-jwt' || configuration.format === 'vc+sd-jwt') {
    const vct = readString((configuration as { vct?: string }).vct)
    const credentialDefinition = readRecord((configuration as { credential_definition?: unknown }).credential_definition)
    const type = readTypeStrings(credentialDefinition?.type)
    if (vct) {
      return { format: configuration.format, vct } as CredentialRequestFormatSpecific
    }
    if (type.length > 0) {
      return {
        format: configuration.format,
        credential_definition: { type: type as [string, ...string[]] },
      } as CredentialRequestFormatSpecific
    }
    return { format: configuration.format } as CredentialRequestFormatSpecific
  }

  if (configuration.format === 'jwt_vc_json') {
    const credentialDefinition = readRecord((configuration as { credential_definition?: unknown }).credential_definition)
    const type = readTypeStrings(credentialDefinition?.type)
    if (type.length === 0) return undefined
    return {
      format: 'jwt_vc_json',
      credential_definition: { type: type as [string, ...string[]] },
    }
  }

  return undefined
}

function readSupportedConfiguration(
  configurationId: string,
  walletSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
  issuerMetadataResult: IssuerMetadataResult,
  fallback?: CredentialConfigurationSupportedV1_0_15,
): CredentialConfigurationSupportedV1_0_15 {
  if (walletSupported[configurationId]) return walletSupported[configurationId]
  const fromIssuer = issuerMetadataResult.credentialIssuer.credential_configurations_supported[configurationId]
  if (fromIssuer) return fromIssuer as CredentialConfigurationSupportedV1_0_15
  if (fallback) return fallback
  return {} as CredentialConfigurationSupportedV1_0_15
}
function pickSingleLibMatch(
  matches: CredentialConfigurationsSupportedWithFormats,
  walletSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
  issuerMetadataResult: IssuerMetadataResult,
): MatchedCredentialConfiguration | undefined {
  const keys = Object.keys(matches)
  if (keys.length !== 1) return undefined
  const id = keys[0]
  return {
    id,
    rawConfiguration: readSupportedConfiguration(
      id,
      walletSupported,
      issuerMetadataResult,
      matches[id] as CredentialConfigurationSupportedV1_0_15,
    ),
  }
}

function findDirectKnownConfigurationMatch(
  offeredId: string,
  issuerMetadataResult: IssuerMetadataResult,
  walletSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
): MatchedCredentialConfiguration | undefined {
  const known = issuerMetadataResult.knownCredentialConfigurations
  if (!known) return undefined

  if (known[offeredId]) {
    return {
      id: offeredId,
      rawConfiguration: readSupportedConfiguration(offeredId, walletSupported, issuerMetadataResult),
    }
  }

  const normalizedOffered = normalizeCredentialConfigurationId(offeredId)
  const normalizedKey = Object.keys(known).find(
    (key) => normalizeCredentialConfigurationId(key) === normalizedOffered,
  )
  if (!normalizedKey) return undefined

  return {
    id: normalizedKey,
    rawConfiguration: readSupportedConfiguration(normalizedKey, walletSupported, issuerMetadataResult),
  }
}

function findMsoMdocDoctypeMatchViaLib(
  offeredId: string,
  issuerMetadataResult: IssuerMetadataResult,
  walletSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
): MatchedCredentialConfiguration | undefined {
  if (!isIsoMdocDoctypeOfferId(offeredId)) return undefined

  const matches = getCredentialConfigurationsMatchingRequestFormat({
    requestFormat: { format: 'mso_mdoc', doctype: offeredId },
    issuerMetadata: issuerMetadataResult,
  })
  return pickSingleLibMatch(matches, walletSupported, issuerMetadataResult)
}

function findSdJwtSemanticMatchViaLib(
  offeredId: string,
  issuerMetadataResult: IssuerMetadataResult,
  walletSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
): MatchedCredentialConfiguration | undefined {
  const normalizedOffered = normalizeCredentialConfigurationId(offeredId)
  const offeredFormat = readCredentialConfigurationFormatSuffix(normalizedOffered)
  if (!offeredFormat || !isSdJwtVcFormat(offeredFormat)) return undefined

  const known = issuerMetadataResult.knownCredentialConfigurations
  if (!known) return undefined

  for (const [configurationId, knownConfiguration] of Object.entries(known)) {
    const requestFormat = buildRequestFormatFromKnownConfiguration(knownConfiguration)
    if (!requestFormat) continue

    const walletConfiguration = readSupportedConfiguration(configurationId, walletSupported, issuerMetadataResult)
    if (
      !isSemanticCredentialConfigurationMatch(
        offeredId,
        offeredFormat,
        configurationId,
        walletConfiguration,
      )
    ) {
      continue
    }

    const matches = getCredentialConfigurationsMatchingRequestFormat({
      requestFormat,
      issuerMetadata: issuerMetadataResult,
    })
    if (!matches[configurationId]) continue

    return {
      id: configurationId,
      rawConfiguration: walletConfiguration,
    }
  }

  return undefined
}

/**
 * Resolve an offered credential_configuration_id to issuer metadata using @openid4vc helpers.
 * Wallet-owned alias fallbacks in exchangeService still run when this returns undefined.
 */
export function findCredentialConfigurationViaOid4vc(input: {
  offeredId: string
  issuerMetadataResult: IssuerMetadataResult
  walletSupported: Record<string, CredentialConfigurationSupportedV1_0_15>
}): MatchedCredentialConfiguration | undefined {
  if (!input.issuerMetadataResult.knownCredentialConfigurations) {
    return undefined
  }

  return (
    findDirectKnownConfigurationMatch(input.offeredId, input.issuerMetadataResult, input.walletSupported)
    ?? findMsoMdocDoctypeMatchViaLib(input.offeredId, input.issuerMetadataResult, input.walletSupported)
    ?? findSdJwtSemanticMatchViaLib(input.offeredId, input.issuerMetadataResult, input.walletSupported)
  )
}
