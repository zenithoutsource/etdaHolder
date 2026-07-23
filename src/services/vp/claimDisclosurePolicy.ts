import type { CredentialConfigurationSupportedV1_0_15, IssuerMetadataV1_0_15 } from '@sphereon/oid4vci-common'

import {
  findDisplayFieldForClaimKey,
  getCardSchema,
  resolvePresentationDisclosureLabel,
} from '@/src/config/cardSchemas'
import { decodeJwtPayload, readString } from '@/src/utils/jwtUtils'
import type { FetchIssuerMetadata } from '../vci/exchangeService'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import type { PresentationDisclosure } from './presentationService'

export type ClaimDisclosurePolicyEntry = {
  md: boolean
  mandatory?: boolean
  sd: boolean
}

export type ClaimDisclosurePolicyMap = Record<string, ClaimDisclosurePolicyEntry>

export function normalizeClaimPolicyKey(value: string): string {
  return value.replace(/[\s_.-]/g, '').toLowerCase()
}

export function readPolicyFlags(entry: ClaimDisclosurePolicyEntry): {
  mandatory: boolean
  selective: boolean
} {
  const mandatory = entry.mandatory ?? entry.md === true
  return { mandatory, selective: !mandatory && entry.sd !== false }
}

export function parseClaimDisclosurePolicyFromCredentialMetadata(
  rawConfiguration: CredentialConfigurationSupportedV1_0_15 | undefined,
): ClaimDisclosurePolicyMap | undefined {
  if (!rawConfiguration || typeof rawConfiguration !== 'object') return undefined

  const policy: ClaimDisclosurePolicyMap = {}
  const configuration = rawConfiguration as Record<string, unknown>
  const metadata = configuration.credential_metadata
  if (metadata && typeof metadata === 'object') {
    mergeClaimPolicyEntries(policy, (metadata as { claims?: unknown }).claims)
  }
  mergeClaimPolicyEntries(policy, configuration.claims)

  return Object.keys(policy).length > 0 ? policy : undefined
}

export function readClaimPolicyFromCardSchema(
  documentType: string,
  claimKey: string,
): ClaimDisclosurePolicyEntry | undefined {
  const schema = getCardSchema(documentType)
  const normalizedKey = normalizeClaimPolicyKey(claimKey)
  const field = findDisplayFieldForClaimKey(schema.displayFields, normalizedKey)
  const disclosure = field?.presentationDisclosure
  if (!disclosure) return undefined

  if (disclosure.md === true) {
    return { md: true, sd: false }
  }
  if (disclosure.sd === false) {
    return { md: false, sd: false }
  }
  return { md: false, sd: true }
}

export function resolveClaimDisclosurePolicyEntry(
  record: VerifiableCredentialRecord,
  claimKey: string,
): ClaimDisclosurePolicyEntry {
  for (const lookupKey of collectClaimPolicyLookupKeys(record.type, claimKey)) {
    const stored = record.claimDisclosurePolicy?.[lookupKey]
    if (stored) return stored
  }

  const fromSchema = readClaimPolicyFromCardSchema(record.type, claimKey)
  if (fromSchema) return fromSchema

  return { md: false, sd: true }
}

export function collectClaimPolicyLookupKeys(documentType: string, claimKey: string): string[] {
  const keys = new Set<string>()
  keys.add(normalizeClaimPolicyKey(claimKey))

  const schema = getCardSchema(documentType)
  const normalizedClaimKey = normalizeClaimPolicyKey(claimKey)
  const field = findDisplayFieldForClaimKey(schema.displayFields, normalizedClaimKey)
  if (field) {
    keys.add(normalizeClaimPolicyKey(field.key))
    for (const alias of field.aliases ?? []) {
      keys.add(normalizeClaimPolicyKey(alias))
    }
  }

  return [...keys]
}

export function resolveEffectiveDisclosureKeys(
  disclosures: readonly Pick<PresentationDisclosure, 'key' | 'mandatory' | 'selective'>[],
  holderSelectedKeys: ReadonlySet<string>,
): string[] {
  const keys: string[] = []
  for (const disclosure of disclosures) {
    if (
      disclosure.mandatory === true ||
      disclosure.selective === false ||
      holderSelectedKeys.has(disclosure.key)
    ) {
      keys.push(disclosure.key)
    }
  }
  return keys
}

export function applyDisclosurePolicyFlags(
  record: VerifiableCredentialRecord,
  disclosures: PresentationDisclosure[],
): PresentationDisclosure[] {
  return disclosures.map((disclosure) => {
    const flags = readPolicyFlags(resolveClaimDisclosurePolicyEntry(record, disclosure.key))
    const resolvedLabel = resolvePresentationDisclosureLabel(record.type, disclosure.key)
    const label = resolvedLabel === disclosure.key ? disclosure.label : resolvedLabel
    return {
      ...disclosure,
      label,
      mandatory: flags.mandatory === true,
      selective: flags.mandatory ? false : flags.selective !== false,
    }
  })
}

export async function enrichDisclosuresWithPolicy(
  record: VerifiableCredentialRecord,
  disclosures: PresentationDisclosure[],
  options: {
    fetchIssuerMetadata?: FetchIssuerMetadata
    issuerUrl?: string
    credentialConfigurationId?: string
  } = {},
): Promise<PresentationDisclosure[]> {
  const policyMap = await resolveClaimDisclosurePolicyMap(record, options)
  const enrichedRecord = policyMap ? { ...record, claimDisclosurePolicy: policyMap } : record
  return applyDisclosurePolicyFlags(enrichedRecord, disclosures)
}

export async function resolveClaimDisclosurePolicyMap(
  record: VerifiableCredentialRecord,
  options: {
    fetchIssuerMetadata?: FetchIssuerMetadata
    issuerUrl?: string
    credentialConfigurationId?: string
  } = {},
): Promise<ClaimDisclosurePolicyMap | undefined> {
  const stored = record.claimDisclosurePolicy
  const issuerUrl = options.issuerUrl ?? readCredentialIssuerUrl(record)
  if (!options.fetchIssuerMetadata || !issuerUrl) {
    return stored
  }

  try {
    const metadata = await options.fetchIssuerMetadata(issuerUrl)
    const configurationId =
      options.credentialConfigurationId ?? findCredentialConfigurationId(record, metadata)
    if (!configurationId) {
      if (!stored) logClaimPolicyFallback('configuration-id-unresolved')
      return stored
    }

    const configuration = metadata.credential_configurations_supported?.[configurationId]
    const fetched = parseClaimDisclosurePolicyFromCredentialMetadata(configuration)
    if (!fetched) {
      if (!stored) logClaimPolicyFallback('configuration-claims-missing')
      return stored
    }

    return { ...fetched, ...(stored ?? {}) }
  } catch {
    logClaimPolicyFallback('live-fetch-failed')
    return stored
  }
}

export function readCredentialIssuerUrl(record: VerifiableCredentialRecord): string | undefined {
  const stored = record.issuerUrl?.trim()
  if (stored) return stored

  try {
    const issuerJwt = record.rawVc.split('~')[0] ?? record.rawVc
    return readString(decodeJwtPayload(issuerJwt)?.iss)
  } catch {
    return undefined
  }
}

export function findCredentialConfigurationId(
  record: VerifiableCredentialRecord,
  metadata: IssuerMetadataV1_0_15,
): string | undefined {
  if (record.credentialConfigurationId?.trim()) {
    return record.credentialConfigurationId.trim()
  }

  const vct = readCredentialVct(record)
  if (!vct) return undefined

  for (const [configurationId, configuration] of Object.entries(metadata.credential_configurations_supported ?? {})) {
    if (!configuration || typeof configuration !== 'object') continue
    if (readString((configuration as Record<string, unknown>).vct) === vct) {
      return configurationId
    }
  }

  return undefined
}

function readCredentialVct(record: VerifiableCredentialRecord): string | undefined {
  const claimVct = readString(record.claims.vct)
  if (claimVct) return claimVct

  try {
    const issuerJwt = record.rawVc.split('~')[0] ?? record.rawVc
    return readString(decodeJwtPayload(issuerJwt)?.vct)
  } catch {
    return undefined
  }
}

function readClaimKeyFromMetadataPath(path: unknown): string | undefined {
  if (!Array.isArray(path) || path.length === 0) return undefined
  const leaf = path[path.length - 1]
  return typeof leaf === 'string' ? leaf : undefined
}

function mergeClaimPolicyEntries(policy: ClaimDisclosurePolicyMap, claims: unknown): void {
  if (Array.isArray(claims)) {
    for (const claimEntry of claims) {
      if (!claimEntry || typeof claimEntry !== 'object') continue
      const record = claimEntry as Record<string, unknown>
      const claimKey = readClaimKeyFromMetadataPath(record.path)
      if (!claimKey) continue
      policy[normalizeClaimPolicyKey(claimKey)] = readPolicyFromMetadataClaim(record)
    }
    return
  }

  if (!claims || typeof claims !== 'object') return

  for (const [claimKey, claimEntry] of Object.entries(claims as Record<string, unknown>)) {
    if (!claimEntry || typeof claimEntry !== 'object') continue
    policy[normalizeClaimPolicyKey(claimKey)] = readPolicyFromMetadataClaim(claimEntry as Record<string, unknown>)
  }
}

function readPolicyFromMetadataClaim(claim: Record<string, unknown>): ClaimDisclosurePolicyEntry {
  const mandatory = claim.mandatory === true || claim.md === true
  const explicitlyOptional = claim.mandatory === false || claim.md === false
  const selective = claim.sd !== false

  return {
    md: mandatory,
    ...(claim.mandatory !== undefined || claim.md !== undefined
      ? { mandatory: explicitlyOptional ? false : mandatory }
      : {}),
    sd: selective,
  }
}

function logClaimPolicyFallback(reason: string): void {
  if (__DEV__) {
    console.info('[oid4vp:claim-policy-fallback]', { reason })
  }
}
