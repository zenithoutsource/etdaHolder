import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { storeMdocCredential } from '../proximity/mdocStorage'
import {
  acquireCredentialRecord,
  claimCredential,
  type AcquireAccessTokenResult,
  type ClaimCredentialOptions,
  type OfferedCredentialConfiguration,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
  saveCredentialRecord,
  createDefaultClaimCredentialDependencies,
  type ClaimCredentialDependencies,
} from '../vci/exchangeService'
import { base64UrlToBytes } from '@/src/utils/jwtUtils'

import {
  buildLogicalCredential,
  deriveLogicalCredentialId,
  readDocumentIdFromClaims,
  readSubjectIdFromClaims,
} from './logicalCredentialConsistency'
import {
  findDualFormatGroup,
  isDualFormatOffer,
  readIssuerLogicalCredentialId,
  readMdocDocType,
} from './logicalCredentialGrouping'
import { saveLogicalCredential } from './logicalCredentialStorage'
import type { CredentialFormatRecord, LogicalCredential } from './logicalCredentialTypes'

const HOLDER_BINDING_REF = 'etda_wallet_signing_key'

export type DualFormatClaimResult = {
  primaryRecord: VerifiableCredentialRecord
  logicalCredential: LogicalCredential
  partial: boolean
  missingFormat?: 'dc+sd-jwt' | 'mso_mdoc'
}

export type PendingMdocCredential = {
  docType: string
  configurationId: string
  rawBase64: string
}

export type DualFormatPreviewResult = {
  primaryRecord: VerifiableCredentialRecord
  pendingMdoc?: PendingMdocCredential
  missingFormat?: 'dc+sd-jwt' | 'mso_mdoc'
}

export type DualFormatClaimOptions = ClaimCredentialOptions & {
  dependencies?: Partial<DualFormatClaimDependencies>
}

export type DualFormatClaimDependencies = ClaimCredentialDependencies & {
  acquireCredentialRecord?: typeof acquireCredentialRecord
  storeMdoc?: typeof storeMdocCredential
}

export { isDualFormatOffer }

/**
 * Single-format acquire paths (e.g. claim-screen preview) only request
 * `credentialConfigurations[0]`. Dual-format offers list mso_mdoc first when the
 * offer puts the doctype id ahead of the SD-JWT sibling — prefer SD-JWT so the
 * preview path matches claimDualFormatCredential order and claimable UI claims.
 */
export function selectOfferForSingleFormatAcquire(
  offer: ResolvedCredentialOffer,
): ResolvedCredentialOffer {
  const group = findDualFormatGroup(offer.credentialConfigurations)
  if (!group?.sdJwt) {
    return offer
  }

  return sliceOfferForConfiguration(offer, group.sdJwt.configurationId)
}

/**
 * Acquire both formats for claim-screen preview without persisting.
 * Shares one pre-authorized access token across both credential requests.
 */
export async function acquireDualFormatForPreview(
  resolvedOffer: ResolvedCredentialOffer,
  options: DualFormatClaimOptions = {},
): Promise<DualFormatPreviewResult> {
  const group = findDualFormatGroup(resolvedOffer.credentialConfigurations)
  if (!group?.sdJwt || !group.mdoc) {
    throw new Error('DualFormatOfferMissing: offer does not include both dc+sd-jwt and mso_mdoc configurations')
  }

  const dependencies: DualFormatClaimDependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }
  const acquireRecord = dependencies.acquireCredentialRecord ?? acquireCredentialRecord
  const sdJwtOffer = sliceOfferForConfiguration(resolvedOffer, group.sdJwt.configurationId)
  const mdocOffer = sliceOfferForConfiguration(resolvedOffer, group.mdoc.configurationId)

  const sharedToken = await dependencies.acquireAccessToken({
    resolvedOffer,
    tx_code: options.tx_code,
  })

  logWalletStep('oid4vci', 'dual-format-preview-start', {
    issuer: resolvedOffer.issuer,
    sdJwtConfigurationId: group.sdJwt.configurationId,
    mdocConfigurationId: group.mdoc.configurationId,
  })

  let sdJwtRecord: VerifiableCredentialRecord | undefined
  let pendingMdoc: PendingMdocCredential | undefined
  let missingFormat: DualFormatPreviewResult['missingFormat']

  try {
    sdJwtRecord = await acquireRecord(sdJwtOffer, {
      ...options,
      dependencies,
      reuseToken: sharedToken,
    })
  } catch (error) {
    logWalletError('oid4vci', 'dual-format-sd-jwt-failed', error)
    missingFormat = 'dc+sd-jwt'
  }

  try {
    pendingMdoc = await acquirePendingMdoc(
      mdocOffer,
      group.mdoc.configurationId,
      options,
      dependencies,
      acquireRecord,
      sharedToken,
    )
  } catch (error) {
    logWalletError('oid4vci', 'dual-format-mdoc-failed', error)
    if (!missingFormat) {
      missingFormat = 'mso_mdoc'
    }
  }

  if (!sdJwtRecord && !pendingMdoc) {
    throw new Error('DualFormatClaimFailed: neither format could be acquired')
  }

  const primaryRecord = sdJwtRecord ?? createMdocPlaceholderRecord({
    credentialId: deriveFallbackMdocCredentialId(resolvedOffer, group.mdoc.configurationId),
    documentType: readDocumentTypeFromOffer(resolvedOffer),
    docType: pendingMdoc?.docType ?? 'unknown',
  })

  return {
    primaryRecord,
    ...(pendingMdoc ? { pendingMdoc } : {}),
    ...(missingFormat ? { missingFormat } : {}),
  }
}

export async function persistPendingMdocForCredential(
  credentialId: string,
  pendingMdoc: PendingMdocCredential,
  storeMdoc: typeof storeMdocCredential = storeMdocCredential,
): Promise<void> {
  await storeMdoc(
    { credentialId, docType: pendingMdoc.docType },
    base64UrlToBytes(pendingMdoc.rawBase64),
  )
}

export async function claimDualFormatCredential(
  resolvedOffer: ResolvedCredentialOffer,
  options: DualFormatClaimOptions = {},
): Promise<DualFormatClaimResult> {
  const group = findDualFormatGroup(resolvedOffer.credentialConfigurations)
  if (!group?.sdJwt || !group.mdoc) {
    throw new Error('DualFormatOfferMissing: offer does not include both dc+sd-jwt and mso_mdoc configurations')
  }

  const dependencies: DualFormatClaimDependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }
  const acquireRecord = dependencies.acquireCredentialRecord ?? acquireCredentialRecord
  const storeMdoc = dependencies.storeMdoc ?? storeMdocCredential

  const sdJwtOffer = sliceOfferForConfiguration(resolvedOffer, group.sdJwt.configurationId)
  const mdocOffer = sliceOfferForConfiguration(resolvedOffer, group.mdoc.configurationId)

  const sharedToken = options.reuseToken ?? await dependencies.acquireAccessToken({
    resolvedOffer,
    tx_code: options.tx_code,
  })

  logWalletStep('oid4vci', 'dual-format-claim-start', {
    issuer: resolvedOffer.issuer,
    sdJwtConfigurationId: group.sdJwt.configurationId,
    mdocConfigurationId: group.mdoc.configurationId,
  })

  let sdJwtRecord: VerifiableCredentialRecord | undefined
  let mdocBytes: Uint8Array | undefined
  let mdocDocType: string | undefined
  let missingFormat: DualFormatClaimResult['missingFormat']

  try {
    sdJwtRecord = await acquireRecord(sdJwtOffer, {
      ...options,
      dependencies,
      reuseToken: sharedToken,
    })
    saveCredentialRecord(sdJwtRecord, { getCredentialStorage: dependencies.getCredentialStorage })
  } catch (error) {
    logWalletError('oid4vci', 'dual-format-sd-jwt-failed', error)
    missingFormat = 'dc+sd-jwt'
  }

  try {
    const pendingMdoc = await acquirePendingMdoc(
      mdocOffer,
      group.mdoc.configurationId,
      options,
      dependencies,
      acquireRecord,
      sharedToken,
    )
    mdocDocType = pendingMdoc.docType
    mdocBytes = base64UrlToBytes(pendingMdoc.rawBase64)

    const credentialId = sdJwtRecord?.id ?? deriveFallbackMdocCredentialId(resolvedOffer, group.mdoc.configurationId)
    await storeMdoc({ credentialId, docType: mdocDocType }, mdocBytes)
  } catch (error) {
    logWalletError('oid4vci', 'dual-format-mdoc-failed', error)
    if (!missingFormat) {
      missingFormat = 'mso_mdoc'
    }
  }

  if (!sdJwtRecord && !mdocBytes) {
    throw new Error('DualFormatClaimFailed: neither format could be acquired')
  }

  const primaryRecord = sdJwtRecord ?? createMdocPlaceholderRecord({
    credentialId: deriveFallbackMdocCredentialId(resolvedOffer, group.mdoc.configurationId),
    documentType: readDocumentTypeFromOffer(resolvedOffer),
    docType: mdocDocType ?? 'unknown',
  })

  const sdJwtFormat: CredentialFormatRecord | undefined = sdJwtRecord
    ? {
        format: 'dc+sd-jwt',
        credentialConfigurationId: group.sdJwt.configurationId,
        rawCredentialRef: sdJwtRecord.id,
        issuedAt: sdJwtRecord.issuedAt,
        ...(sdJwtRecord.expiresAt ? { expiresAt: sdJwtRecord.expiresAt } : {}),
        holderBindingRef: HOLDER_BINDING_REF,
      }
    : undefined

  const mdocFormat: CredentialFormatRecord | undefined = mdocBytes
    ? {
        format: 'mso_mdoc',
        credentialConfigurationId: group.mdoc.configurationId,
        rawCredentialRef: primaryRecord.id,
        holderBindingRef: HOLDER_BINDING_REF,
      }
    : undefined

  const logicalCredentialId = deriveLogicalCredentialId({
    issuerProvidedId:
      group.logicalCredentialIdHint ??
      readIssuerLogicalCredentialId(resolvedOffer.credentialConfigurations[0]!),
    issuer: resolvedOffer.issuer,
    documentType: primaryRecord.type,
    subjectId: sdJwtRecord ? readSubjectIdFromClaims(sdJwtRecord.claims) : undefined,
    documentId: sdJwtRecord ? readDocumentIdFromClaims(sdJwtRecord.claims) : undefined,
    sdJwtRecordId: primaryRecord.id,
  })

  const logicalCredential = buildLogicalCredential({
    logicalCredentialId,
    issuer: resolvedOffer.issuer,
    documentType: primaryRecord.type,
    subjectId: sdJwtRecord ? readSubjectIdFromClaims(sdJwtRecord.claims) : undefined,
    documentId: sdJwtRecord ? readDocumentIdFromClaims(sdJwtRecord.claims) : undefined,
    formats: {
      ...(sdJwtFormat ? { 'dc+sd-jwt': sdJwtFormat } : {}),
      ...(mdocFormat ? { 'mso_mdoc': mdocFormat } : {}),
    },
  })

  saveLogicalCredential(logicalCredential, dependencies.getCredentialStorage())

  logWalletStep('oid4vci', 'dual-format-claim-complete', {
    logicalCredentialId,
    partial: Boolean(missingFormat),
    consistencyStatus: logicalCredential.consistencyStatus,
  })

  return {
    primaryRecord,
    logicalCredential,
    partial: Boolean(missingFormat),
    ...(missingFormat ? { missingFormat } : {}),
  }
}

export async function claimCredentialWithDualFormatSupport(
  resolvedOffer: ResolvedCredentialOffer,
  options: ClaimCredentialOptions = {},
): Promise<VerifiableCredentialRecord> {
  if (isDualFormatOffer(resolvedOffer.credentialConfigurations)) {
    const result = await claimDualFormatCredential(resolvedOffer, options)
    return result.primaryRecord
  }

  return claimCredential(resolvedOffer, options)
}

function sliceOfferForConfiguration(
  offer: ResolvedCredentialOffer,
  configurationId: string,
): ResolvedCredentialOffer {
  const configuration = offer.credentialConfigurations.find((item) => item.id === configurationId)
  if (!configuration) {
    throw new Error(`CredentialConfigurationNotSupported: ${configurationId}`)
  }

  return {
    ...offer,
    credentialConfigurations: [configuration],
  }
}

async function acquirePendingMdoc(
  mdocOffer: ResolvedCredentialOffer,
  configurationId: string,
  options: DualFormatClaimOptions,
  dependencies: DualFormatClaimDependencies,
  acquireRecord: typeof acquireCredentialRecord,
  sharedToken: AcquireAccessTokenResult,
): Promise<PendingMdocCredential> {
  const mdocConfiguration = mdocOffer.credentialConfigurations[0]
  if (!mdocConfiguration) {
    throw new Error('DualFormatOfferMissing: mso_mdoc configuration is unavailable')
  }

  const docType = readMdocDocType(mdocConfiguration)
  if (!docType) {
    throw new Error('MdocDocTypeMissing: issuer metadata does not declare doctype')
  }

  const mdocRaw = await acquireMdocCredentialBytes(
    mdocOffer,
    { ...options, reuseToken: sharedToken },
    dependencies,
    acquireRecord,
  )

  return {
    docType,
    configurationId,
    rawBase64: mdocRaw,
  }
}

async function acquireMdocCredentialBytes(
  resolvedOffer: ResolvedCredentialOffer,
  options: DualFormatClaimOptions,
  dependencies: DualFormatClaimDependencies,
  acquireRecord: typeof acquireCredentialRecord,
): Promise<string> {
  const record = await acquireRecord(resolvedOffer, { ...options, dependencies })
  if (!record.rawVc.startsWith('mdoc:')) {
    throw new Error('MdocCredentialInvalid: expected mdoc-encoded credential payload')
  }

  return record.rawVc.slice('mdoc:'.length)
}

function deriveFallbackMdocCredentialId(offer: ResolvedCredentialOffer, configurationId: string): string {
  return `${offer.issuer}:${configurationId}`.replace(/[^a-zA-Z0-9:_-]/g, '_')
}

function readDocumentTypeFromOffer(offer: ResolvedCredentialOffer): string {
  const configuration = offer.credentialConfigurations[0]
  const vct = typeof configuration?.rawConfiguration?.vct === 'string'
    ? configuration.rawConfiguration.vct
    : undefined
  if (vct?.toLowerCase().includes('transcript')) return 'ChulalongkornUniversityTranscript'

  const docType = configuration ? readMdocDocTypeFromConfig(configuration) : undefined
  if (docType?.toLowerCase().includes('mdl') || docType?.toLowerCase().includes('driving')) {
    return 'DLTDrivingLicence'
  }
  if (configuration?.id.toLowerCase().includes('mdl') || configuration?.id.toLowerCase().includes('driving')) {
    return 'DLTDrivingLicence'
  }

  return configuration?.display?.name ?? 'VerifiableCredential'
}

function readMdocDocTypeFromConfig(configuration: OfferedCredentialConfiguration): string | undefined {
  const raw = configuration.rawConfiguration as Record<string, unknown>
  return typeof raw.doctype === 'string' ? raw.doctype : typeof raw.docType === 'string' ? raw.docType : undefined
}

function createMdocPlaceholderRecord(input: {
  credentialId: string
  documentType: string
  docType: string
}): VerifiableCredentialRecord {
  return {
    id: input.credentialId,
    type: input.documentType,
    rawVc: '',
    claims: { docType: input.docType },
    issuedAt: new Date().toISOString(),
  }
}
