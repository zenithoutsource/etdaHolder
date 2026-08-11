import { logWalletError, logWalletStep } from '../debug/walletLogger'
import {
  deleteStoredMdoc,
  hasStoredMdoc,
  readStoredMdocBytes,
  storeMdocCredential,
} from '../proximity/mdocStorage'
import { markCredentialAsNew as defaultMarkCredentialAsNew } from './credentialBadges'
import { removeStoredCredential } from './storedCredentials'
import {
  acquireCredentialRecord,
  appendCredentialReceivedHistory,
  claimCredential,
  type CredentialStorage,
  type AcquireAccessTokenResult,
  type ClaimCredentialOptions,
  type OfferedCredentialConfiguration,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
  saveCredentialRecord,
  createDefaultClaimCredentialDependencies,
  awaitCredentialAcquisition,
  type ClaimCredentialDependencies,
} from '../vci/exchangeService'
import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'
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
  isDrivingLicenceDualFormatOffer,
  readIssuerLogicalCredentialId,
  readMdocDocType,
} from './logicalCredentialGrouping'
import { saveLogicalCredential } from './logicalCredentialStorage'
import type { CredentialFormatRecord, LogicalCredential } from './logicalCredentialTypes'
import {
  bindPendingKeyToCredential,
  createPendingCredentialKey,
  discardPendingCredentialKey,
  destroyCredentialKey,
} from '../crypto/credentialSigningKey'
import {
  bindPendingHardwareKeyToCredential,
  createPendingHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  destroyHardwareCredentialKey,
} from '../crypto/hardwareCredentialSigningKey'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { usesPerCredentialSigning } from '../crypto/perCredentialSigning'
import type { CredentialKeyRecord } from '../crypto/credentialKeyRegistry'
import type { EncryptedCredentialKeyRecord } from '../crypto/encryptedCredentialKeyRegistry'
import { withIssuanceKeySession } from '../crypto/issuanceKeySession'
import { isWalletCryptoV2Enabled } from '../crypto/walletCryptoActivation'

const HOLDER_BINDING_REF = 'etda_wallet_signing_key'

async function createPendingCredentialKeyForIssuance(): Promise<string> {
  if (isHardwareP256SigningEnabled()) {
    return createPendingHardwareCredentialKey()
  }
  return createPendingCredentialKey()
}

async function bindPendingCredentialKeyForIssuance(
  pendingCredentialKeyId: string,
  credentialId: string,
  credentialType: string,
): Promise<CredentialKeyRecord | EncryptedCredentialKeyRecord> {
  if (isHardwareP256SigningEnabled()) {
    return bindPendingHardwareKeyToCredential(pendingCredentialKeyId, credentialId, credentialType)
  }
  return bindPendingKeyToCredential(pendingCredentialKeyId, credentialId, credentialType)
}

async function discardPendingCredentialKeyForIssuance(pendingCredentialKeyId: string): Promise<void> {
  if (isHardwareP256SigningEnabled()) {
    await discardPendingHardwareCredentialKey(pendingCredentialKeyId)
    return
  }
  await discardPendingCredentialKey(pendingCredentialKeyId)
}

async function destroyCredentialKeyForIssuance(credentialId: string): Promise<void> {
  if (isHardwareP256SigningEnabled()) {
    await destroyHardwareCredentialKey(credentialId)
    return
  }
  await destroyCredentialKey(credentialId)
}

export type DualFormatClaimResult = {
  primaryRecord: VerifiableCredentialRecord
  logicalCredential: LogicalCredential
  partial: boolean
  missingFormat?: 'dc+sd-jwt' | 'mso_mdoc'
}

export type PendingMdocCredential = {
  docType: string
  configurationId: string
  sdJwtConfigurationId?: string
  logicalCredentialId?: string
  issuer?: string
  rawBase64: string
  pendingCredentialKeyId?: string
}

export type DualFormatPreviewResult = {
  primaryRecord: VerifiableCredentialRecord
  pendingMdoc?: PendingMdocCredential
  missingFormat?: 'dc+sd-jwt' | 'mso_mdoc'
}

export type DualFormatClaimOptions = ClaimCredentialOptions & {
  pendingCredentialKeyId?: string
  deferCredentialKeyBinding?: boolean
  dependencies?: Partial<DualFormatClaimDependencies>
}

export type DualFormatClaimDependencies = ClaimCredentialDependencies & {
  acquireCredentialRecord?: typeof acquireCredentialRecord
  storeMdoc?: typeof storeMdocCredential
  deleteMdoc?: typeof deleteStoredMdoc
  createPendingCredentialKey?: typeof createPendingCredentialKey
  bindPendingCredentialKey?: typeof bindPendingKeyToCredential
  discardPendingCredentialKey?: typeof discardPendingCredentialKey
  destroyCredentialKey?: typeof destroyCredentialKey
}

export type DualFormatFinalizeDependencies = {
  getCredentialStorage?: () => CredentialStorage
  saveCredentialRecord?: (record: VerifiableCredentialRecord) => void
  bindPendingCredentialKey?: typeof bindPendingKeyToCredential
  discardPendingCredentialKey?: typeof discardPendingCredentialKey
  destroyCredentialKey?: typeof destroyCredentialKey
  storeMdoc?: typeof storeMdocCredential
  deleteMdoc?: typeof deleteStoredMdoc
  hasMdoc?: typeof hasStoredMdoc
  readMdoc?: typeof readStoredMdocBytes
  saveLogicalCredential?: (
    credential: LogicalCredential,
    storage: CredentialStorage,
  ) => void
  markCredentialAsNew?: (credentialId: string) => void
  refreshCredentials?: () => void
}

export { isDualFormatOffer, isDrivingLicenceDualFormatOffer }

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
 * DEBUG_SLICE_MDOC_ONLY — temporary driving-licence issuance path that acquires
 * mso_mdoc only via the existing VCI exchange path. Remove when dual-format
 * issuance is validated on device.
 */
export async function acquireDrivingLicenceMdocOnlyForPreview(
  resolvedOffer: ResolvedCredentialOffer,
  options: DualFormatClaimOptions = {},
): Promise<DualFormatPreviewResult> {
  if (shouldOpenIssuanceKeySession(options)) {
    return withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
      const result = await acquireDrivingLicenceMdocOnlyForPreview(resolvedOffer, {
        ...options,
        pendingCredentialKeyId: session.pendingCredentialKeyId,
        proofSession: session.proofSession,
      })
      return bindPreviewResultBeforeSessionClose(result, session)
    })
  }

  const group = findDualFormatGroup(resolvedOffer.credentialConfigurations)
  if (!group?.sdJwt || !group?.mdoc) {
    throw new Error('DualFormatOfferMissing: offer does not include both dc+sd-jwt and mso_mdoc configurations')
  }
  if (!isDrivingLicenceDualFormatOffer(resolvedOffer.credentialConfigurations)) {
    throw new Error('DrivingLicenceDualFormatRequired: offer is not a driving licence dual-format group')
  }

  const dependencies: DualFormatClaimDependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }
  const acquireRecord = dependencies.acquireCredentialRecord ?? acquireCredentialRecord
  const mdocOffer = sliceOfferForConfiguration(resolvedOffer, group.mdoc.configurationId)
  const discardPendingKey = dependencies.discardPendingCredentialKey ?? discardPendingCredentialKeyForIssuance

  logWalletStep('oid4vci', 'driving-licence-mdoc-only-preview-start', {
    issuer: resolvedOffer.issuer,
    mdocConfigurationId: group.mdoc.configurationId,
  })

  const sharedToken = await awaitCredentialAcquisition(
    Promise.resolve().then(() => dependencies.acquireAccessToken({
      resolvedOffer,
      tx_code: options.tx_code,
      signal: options.signal,
    })),
    options.signal,
  )
  throwIfDualFormatAcquisitionAborted(options.signal)
  if (!sharedToken) {
    throw new Error('CredentialTokenExchangeFailed: token response was empty')
  }

  let credentialKeyId = options.pendingCredentialKeyId ?? options.proofSession?.credentialKeyId
  if (
    !credentialKeyId
    && usesPerCredentialSigning()
    && !options.proofSession
    && (dependencies.createProofSigningSession || acquireRecord === acquireCredentialRecord)
  ) {
    const createPendingKey = dependencies.createPendingCredentialKey ?? createPendingCredentialKeyForIssuance
    credentialKeyId = await createPendingKey()
  }

  try {
    throwIfDualFormatAcquisitionAborted(options.signal)
    const pendingMdoc = await acquirePendingMdoc(
      mdocOffer,
      group.mdoc.configurationId,
      {
        ...options,
        ...(credentialKeyId ? { pendingCredentialKeyId: credentialKeyId } : {}),
        ...(credentialKeyId ? { deferCredentialKeyBinding: true } : {}),
      },
      dependencies,
      acquireRecord,
      sharedToken,
      {
        issuer: resolvedOffer.issuer,
        logicalCredentialId: group.logicalCredentialIdHint,
        sdJwtConfigurationId: group.sdJwt.configurationId,
      },
    )
    throwIfDualFormatAcquisitionAborted(options.signal)

    const primaryRecord = createMdocPlaceholderRecord({
      credentialId: deriveFallbackMdocCredentialId(resolvedOffer, group.mdoc.configurationId),
      documentType: 'DLTDrivingLicence',
      docType: pendingMdoc.docType,
    })

    if (credentialKeyId) {
      pendingMdoc.pendingCredentialKeyId = credentialKeyId
    }

    logWalletStep('oid4vci', 'driving-licence-mdoc-only-preview-complete', {
      credentialId: primaryRecord.id,
      docType: pendingMdoc.docType,
    })

    return {
      primaryRecord,
      pendingMdoc,
    }
  } catch (error) {
    logWalletError('oid4vci', 'driving-licence-mdoc-failed', error)
    if (credentialKeyId && !options.pendingCredentialKeyId) {
      await discardPendingKey(credentialKeyId)
    }
    throw error
  }
}

/**
 * Acquire both formats for claim-screen preview without persisting.
 * Shares one pre-authorized access token across both credential requests.
 */
export async function acquireDualFormatForPreview(
  resolvedOffer: ResolvedCredentialOffer,
  options: DualFormatClaimOptions = {},
): Promise<DualFormatPreviewResult> {
  if (shouldOpenIssuanceKeySession(options)) {
    return withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
      const result = await acquireDualFormatForPreview(resolvedOffer, {
        ...options,
        pendingCredentialKeyId: session.pendingCredentialKeyId,
        proofSession: session.proofSession,
      })
      return bindPreviewResultBeforeSessionClose(result, session)
    })
  }

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

  const sharedToken = await awaitCredentialAcquisition(
    Promise.resolve().then(() => dependencies.acquireAccessToken({
      resolvedOffer,
      tx_code: options.tx_code,
      signal: options.signal,
    })),
    options.signal,
  )
  throwIfDualFormatAcquisitionAborted(options.signal)
  if (!sharedToken) {
    throw new Error('CredentialTokenExchangeFailed: token response was empty')
  }
  let currentNonce = sharedToken.cNonce
  const onCNonceUpdated = (cNonce: string) => {
    currentNonce = cNonce
    options.onCNonceUpdated?.(cNonce)
  }

  logWalletStep('oid4vci', 'dual-format-preview-start', {
    issuer: resolvedOffer.issuer,
    sdJwtConfigurationId: group.sdJwt.configurationId,
    mdocConfigurationId: group.mdoc.configurationId,
  })

  const sharedCredentialKeyId = await createSharedCredentialKeyId(
    acquireRecord,
    options,
    dependencies,
  )
  const discardPendingKey = dependencies.discardPendingCredentialKey ?? discardPendingCredentialKeyForIssuance
  let ownedProofSession: NonNullable<ClaimCredentialOptions['proofSession']> | undefined
  try {
    throwIfDualFormatAcquisitionAborted(options.signal)
    ownedProofSession = await createSharedProofSession(
      acquireRecord,
      options,
      dependencies,
      sharedCredentialKeyId,
    )
  } catch (error) {
    if (sharedCredentialKeyId) {
      await discardPendingKey(sharedCredentialKeyId)
    }
    throw error
  }
  const proofSession = options.proofSession ?? ownedProofSession
  const credentialKeyId = sharedCredentialKeyId ?? proofSession?.credentialKeyId
  const acquireDependencies = proofSession
    ? { ...dependencies, signProof: proofSession.signProof }
    : dependencies
  let retainPendingKey = false

  try {
    throwIfDualFormatAcquisitionAborted(options.signal)
    let sdJwtRecord: VerifiableCredentialRecord | undefined
    let pendingMdoc: PendingMdocCredential | undefined
    let missingFormat: DualFormatPreviewResult['missingFormat']
    let sdJwtError: unknown
    let mdocError: unknown

    try {
      sdJwtRecord = await acquireRecord(sdJwtOffer, {
        ...options,
        ...(proofSession ? { proofSession } : {}),
        ...(credentialKeyId ? { pendingCredentialKeyId: credentialKeyId } : {}),
        ...(credentialKeyId ? { deferCredentialKeyBinding: true } : {}),
        onCNonceUpdated,
        dependencies: acquireDependencies,
        reuseToken: { ...sharedToken, cNonce: currentNonce },
      })
      throwIfDualFormatAcquisitionAborted(options.signal)
    } catch (error) {
      if (options.signal?.aborted) throw error
      sdJwtError = error
      logWalletError('oid4vci', 'dual-format-sd-jwt-failed', error)
      missingFormat = 'dc+sd-jwt'
    }

    throwIfDualFormatAcquisitionAborted(options.signal)
    try {
      pendingMdoc = await acquirePendingMdoc(
        mdocOffer,
        group.mdoc.configurationId,
        {
          ...options,
          ...(proofSession ? { proofSession } : {}),
          ...(credentialKeyId ? { pendingCredentialKeyId: credentialKeyId } : {}),
          ...(credentialKeyId ? { deferCredentialKeyBinding: true } : {}),
          onCNonceUpdated,
        },
        acquireDependencies,
        acquireRecord,
        { ...sharedToken, cNonce: currentNonce },
        {
          issuer: resolvedOffer.issuer,
          logicalCredentialId: group.logicalCredentialIdHint,
          sdJwtConfigurationId: group.sdJwt.configurationId,
        },
      )
      throwIfDualFormatAcquisitionAborted(options.signal)
    } catch (error) {
      if (options.signal?.aborted) throw error
      mdocError = error
      logWalletError('oid4vci', 'dual-format-mdoc-failed', error)
      if (!missingFormat) {
        missingFormat = 'mso_mdoc'
      }
    }

    throwIfDualFormatAcquisitionAborted(options.signal)
    if (!sdJwtRecord && !pendingMdoc) {
      throwDualFormatTotalFailure(sdJwtError, mdocError)
    }

    const primaryRecord = sdJwtRecord ?? createMdocPlaceholderRecord({
      credentialId: deriveFallbackMdocCredentialId(resolvedOffer, group.mdoc.configurationId),
      documentType: readDocumentTypeFromOffer(resolvedOffer),
      docType: pendingMdoc?.docType ?? 'unknown',
    })
    retainPendingKey = Boolean(credentialKeyId && sdJwtRecord && pendingMdoc && !missingFormat)

    return {
      primaryRecord,
      ...(pendingMdoc ? { pendingMdoc } : {}),
      ...(missingFormat ? { missingFormat } : {}),
    }
  } finally {
    ownedProofSession?.close()
    if (credentialKeyId && !retainPendingKey) {
      await discardPendingKey(credentialKeyId)
    }
  }
}

function throwIfDualFormatAcquisitionAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }
}

function readDualFormatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function throwDualFormatTotalFailure(
  sdJwtError: unknown | undefined,
  mdocError: unknown | undefined,
): never {
  const parts: string[] = []
  if (sdJwtError) parts.push(`dc+sd-jwt: ${readDualFormatErrorMessage(sdJwtError)}`)
  if (mdocError) parts.push(`mso_mdoc: ${readDualFormatErrorMessage(mdocError)}`)
  const detail = parts.length > 0 ? ` (${parts.join('; ')})` : ''
  throw new Error(`DualFormatClaimFailed: neither format could be acquired${detail}`)
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

/**
 * Finalizes the claim-screen dual-format save as one user-visible operation.
 *
 * The native mDOC is staged first, then the SD-JWT and logical link are
 * written, and only after all three succeed is the new-credential badge
 * created. MMKV keys are snapshotted so a later write failure can restore the
 * previous credential/index/link state; a newly staged native mDOC is deleted
 * during the same rollback.
 */
export async function finalizeDualFormatCredential(
  record: VerifiableCredentialRecord,
  pendingMdoc: PendingMdocCredential,
  options: DualFormatFinalizeDependencies = {},
): Promise<LogicalCredential> {
  if (isMdocOnlyPlaceholderRecord(record)) {
    return finalizeMdocOnlyCredential(record, pendingMdoc, options)
  }

  const getCredentialStorage = options.getCredentialStorage ?? getDefaultCredentialStorage
  const storage = getCredentialStorage()
  const logicalCredential = buildLogicalCredentialForPendingMdoc(record, pendingMdoc)
  const snapshot = snapshotDualFormatStorage(storage, record.id, logicalCredential.logicalCredentialId)
  const storeMdoc = options.storeMdoc ?? storeMdocCredential
  const deleteMdoc = options.deleteMdoc ?? deleteStoredMdoc
  const hasMdoc = options.hasMdoc ?? hasStoredMdoc
  const readMdoc = options.readMdoc ?? readStoredMdocBytes
  const saveRecord = options.saveCredentialRecord
    ?? ((savedRecord: VerifiableCredentialRecord) =>
      saveCredentialRecord(savedRecord, { getCredentialStorage, appendHistory: false }))
  const bindPendingCredentialKey = options.bindPendingCredentialKey ?? bindPendingCredentialKeyForIssuance
  const discardPendingKey = options.discardPendingCredentialKey ?? discardPendingCredentialKeyForIssuance
  const destroyCredentialKeyForRecord = options.destroyCredentialKey ?? destroyCredentialKeyForIssuance
  const saveLogical = options.saveLogicalCredential ?? saveLogicalCredential
  const markCredentialAsNew = options.markCredentialAsNew ?? defaultMarkCredentialAsNew
  let mdocWriteAttempted = false
  let mdocWriteCompleted = false
  let mdocPresence: boolean | undefined
  let previousMdocBytes: Uint8Array | undefined
  let credentialKeyBound = false

  try {
    mdocPresence = await hasMdoc(record.id)
    if (mdocPresence === undefined) {
      throw new Error('MdocPresenceUnknown: native mDOC presence could not be established')
    }
    if (mdocPresence) {
      previousMdocBytes = await readMdoc(record.id)
    }

    mdocWriteAttempted = true
    await storeMdoc(
      { credentialId: record.id, docType: pendingMdoc.docType },
      base64UrlToBytes(pendingMdoc.rawBase64),
    )
    mdocWriteCompleted = true
    saveRecord(record)
    if (pendingMdoc.pendingCredentialKeyId) {
      await bindPendingCredentialKey(pendingMdoc.pendingCredentialKeyId, record.id, record.type)
      credentialKeyBound = true
    }
    saveLogical(logicalCredential, storage)
    markCredentialAsNew(record.id)
    appendCredentialReceivedHistory(record)
    options.refreshCredentials?.()

    logWalletStep('oid4vci', 'dual-format-finalization-complete', {
      credentialId: record.id,
      logicalCredentialId: logicalCredential.logicalCredentialId,
      consistencyStatus: logicalCredential.consistencyStatus,
    })
    previousMdocBytes?.fill(0)
    return logicalCredential
  } catch (error) {
    logWalletError('oid4vci', 'dual-format-finalization-failed', error, {
      credentialId: record.id,
      logicalCredentialId: logicalCredential.logicalCredentialId,
      mdocWriteAttempted,
    })

    const mayOwnWrittenMdoc =
      mdocWriteCompleted || (mdocWriteAttempted && mdocPresence === false)
    if (mayOwnWrittenMdoc) {
      try {
        await deleteMdoc(record.id)
      } catch (rollbackError) {
        logWalletError('oid4vci', 'dual-format-mdoc-rollback-failed', rollbackError, {
          credentialId: record.id,
        })
      }
      if (previousMdocBytes && mdocWriteCompleted) {
        try {
          await storeMdoc(
            { credentialId: record.id, docType: pendingMdoc.docType },
            previousMdocBytes,
          )
        } catch (rollbackError) {
          logWalletError('oid4vci', 'dual-format-mdoc-restore-failed', rollbackError, {
            credentialId: record.id,
          })
        }
      }
    }

    restoreDualFormatStorage(storage, snapshot)
    if (credentialKeyBound) {
      try {
        await destroyCredentialKeyForRecord(record.id)
      } catch (rollbackError) {
        logWalletError('oid4vci', 'dual-format-credential-key-rollback-failed', rollbackError, {
          credentialId: record.id,
        })
      }
    } else if (pendingMdoc.pendingCredentialKeyId) {
      await discardPendingKey(pendingMdoc.pendingCredentialKeyId)
    }
    previousMdocBytes?.fill(0)
    throw error
  }
}

function isMdocOnlyPlaceholderRecord(record: VerifiableCredentialRecord): boolean {
  return record.rawVc.length === 0
}

async function finalizeMdocOnlyCredential(
  record: VerifiableCredentialRecord,
  pendingMdoc: PendingMdocCredential,
  options: DualFormatFinalizeDependencies = {},
): Promise<LogicalCredential> {
  const getCredentialStorage = options.getCredentialStorage ?? getDefaultCredentialStorage
  const storage = getCredentialStorage()
  const logicalCredential = buildMdocOnlyLogicalCredential(record, pendingMdoc)
  const snapshot = snapshotDualFormatStorage(storage, record.id, logicalCredential.logicalCredentialId)
  const storeMdoc = options.storeMdoc ?? storeMdocCredential
  const deleteMdoc = options.deleteMdoc ?? deleteStoredMdoc
  const hasMdoc = options.hasMdoc ?? hasStoredMdoc
  const readMdoc = options.readMdoc ?? readStoredMdocBytes
  const saveRecord = options.saveCredentialRecord
    ?? ((savedRecord: VerifiableCredentialRecord) =>
      saveCredentialRecord(savedRecord, { getCredentialStorage, appendHistory: false }))
  const bindPendingCredentialKey = options.bindPendingCredentialKey ?? bindPendingCredentialKeyForIssuance
  const discardPendingKey = options.discardPendingCredentialKey ?? discardPendingCredentialKeyForIssuance
  const destroyCredentialKeyForRecord = options.destroyCredentialKey ?? destroyCredentialKeyForIssuance
  const saveLogical = options.saveLogicalCredential ?? saveLogicalCredential
  const markCredentialAsNew = options.markCredentialAsNew ?? defaultMarkCredentialAsNew
  let mdocWriteAttempted = false
  let mdocWriteCompleted = false
  let mdocPresence: boolean | undefined
  let previousMdocBytes: Uint8Array | undefined
  let credentialKeyBound = false

  try {
    mdocPresence = await hasMdoc(record.id)
    if (mdocPresence === undefined) {
      throw new Error('MdocPresenceUnknown: native mDOC presence could not be established')
    }
    if (mdocPresence) {
      previousMdocBytes = await readMdoc(record.id)
    }

    mdocWriteAttempted = true
    await storeMdoc(
      { credentialId: record.id, docType: pendingMdoc.docType },
      base64UrlToBytes(pendingMdoc.rawBase64),
    )
    mdocWriteCompleted = true
    saveRecord(record)
    if (pendingMdoc.pendingCredentialKeyId) {
      await bindPendingCredentialKey(pendingMdoc.pendingCredentialKeyId, record.id, record.type)
      credentialKeyBound = true
    }
    saveLogical(logicalCredential, storage)
    markCredentialAsNew(record.id)
    appendCredentialReceivedHistory(record)
    options.refreshCredentials?.()

    logWalletStep('oid4vci', 'mdoc-only-finalization-complete', {
      credentialId: record.id,
      logicalCredentialId: logicalCredential.logicalCredentialId,
      consistencyStatus: logicalCredential.consistencyStatus,
    })
    previousMdocBytes?.fill(0)
    return logicalCredential
  } catch (error) {
    logWalletError('oid4vci', 'mdoc-only-finalization-failed', error, {
      credentialId: record.id,
      logicalCredentialId: logicalCredential.logicalCredentialId,
      mdocWriteAttempted,
    })

    const mayOwnWrittenMdoc =
      mdocWriteCompleted || (mdocWriteAttempted && mdocPresence === false)
    if (mayOwnWrittenMdoc) {
      try {
        await deleteMdoc(record.id)
      } catch (rollbackError) {
        logWalletError('oid4vci', 'mdoc-only-mdoc-rollback-failed', rollbackError, {
          credentialId: record.id,
        })
      }
      if (previousMdocBytes && mdocWriteCompleted) {
        try {
          await storeMdoc(
            { credentialId: record.id, docType: pendingMdoc.docType },
            previousMdocBytes,
          )
        } catch (rollbackError) {
          logWalletError('oid4vci', 'mdoc-only-mdoc-restore-failed', rollbackError, {
            credentialId: record.id,
          })
        }
      }
    }

    restoreDualFormatStorage(storage, snapshot)
    if (credentialKeyBound) {
      try {
        await destroyCredentialKeyForRecord(record.id)
      } catch (rollbackError) {
        logWalletError('oid4vci', 'mdoc-only-credential-key-rollback-failed', rollbackError, {
          credentialId: record.id,
        })
      }
    } else if (pendingMdoc.pendingCredentialKeyId) {
      await discardPendingKey(pendingMdoc.pendingCredentialKeyId)
    }
    previousMdocBytes?.fill(0)
    throw error
  }
}

function buildMdocOnlyLogicalCredential(
  record: VerifiableCredentialRecord,
  pendingMdoc: PendingMdocCredential,
): LogicalCredential {
  const issuer = pendingMdoc.issuer ?? record.issuerUrl
  if (!issuer) {
    throw new Error('LogicalCredentialIssuerUnavailable: issuer is required for mDOC linkage')
  }

  const logicalCredentialId = deriveLogicalCredentialId({
    issuerProvidedId: pendingMdoc.logicalCredentialId,
    issuer,
    documentType: record.type,
    sdJwtRecordId: record.id,
  })

  const logicalCredential = buildLogicalCredential({
    logicalCredentialId,
    issuer,
    documentType: record.type,
    formats: {
      mso_mdoc: {
        format: 'mso_mdoc',
        credentialConfigurationId: pendingMdoc.configurationId,
        rawCredentialRef: record.id,
        issuedAt: record.issuedAt,
        holderBindingRef: HOLDER_BINDING_REF,
      },
    },
  })

  return {
    ...logicalCredential,
    consistencyStatus: 'warning',
    warnings: [
      ...logicalCredential.warnings,
      'dc+sd-jwt not acquired (mDOC-only debug slice)',
    ],
  }
}

function buildLogicalCredentialForPendingMdoc(
  record: VerifiableCredentialRecord,
  pendingMdoc: PendingMdocCredential,
): LogicalCredential {
  if (!record.rawVc || record.rawVc.startsWith('mdoc:')) {
    throw new Error('DualFormatFinalizationIncomplete: SD-JWT credential is required')
  }

  const issuer = record.issuerUrl ?? pendingMdoc.issuer
  if (!issuer) {
    throw new Error('LogicalCredentialIssuerUnavailable: issuer is required for dual-format linkage')
  }

  const sdJwtConfigurationId = record.credentialConfigurationId ?? pendingMdoc.sdJwtConfigurationId
  if (!sdJwtConfigurationId) {
    throw new Error('LogicalCredentialConfigurationUnavailable: SD-JWT configuration is required for dual-format linkage')
  }

  const logicalCredentialId = deriveLogicalCredentialId({
    issuerProvidedId: pendingMdoc.logicalCredentialId,
    issuer,
    documentType: record.type,
    subjectId: readSubjectIdFromClaims(record.claims),
    documentId: readDocumentIdFromClaims(record.claims),
    sdJwtRecordId: record.id,
  })

  return buildLogicalCredential({
    logicalCredentialId,
    issuer,
    documentType: record.type,
    subjectId: readSubjectIdFromClaims(record.claims),
    documentId: readDocumentIdFromClaims(record.claims),
    formats: {
      'dc+sd-jwt': {
        format: 'dc+sd-jwt',
        credentialConfigurationId: sdJwtConfigurationId,
        rawCredentialRef: record.id,
        issuedAt: record.issuedAt,
        ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
        holderBindingRef: HOLDER_BINDING_REF,
      },
      mso_mdoc: {
        format: 'mso_mdoc',
        credentialConfigurationId: pendingMdoc.configurationId,
        rawCredentialRef: record.id,
        issuedAt: record.issuedAt,
        holderBindingRef: HOLDER_BINDING_REF,
      },
    },
  })
}

type DualFormatStorageSnapshot = Map<string, string | undefined>

function snapshotDualFormatStorage(
  storage: CredentialStorage,
  recordId: string,
  logicalCredentialId: string,
): DualFormatStorageSnapshot {
  const keys = new Set([
    'credential:index',
    `credential:${recordId}`,
    'logicalCredential:index',
    `logicalCredential:${logicalCredentialId}`,
    'credential:new:index',
  ])

  for (const credentialId of readStoredStringArray(storage, 'credential:index')) {
    keys.add(`credential:${credentialId}`)
    keys.add(`credential:lifecycle:${credentialId}`)
    keys.add(`credential:suspension:${credentialId}`)
    keys.add(`credential:renewal:${credentialId}`)
  }

  for (const id of readStoredStringArray(storage, 'logicalCredential:index')) {
    keys.add(`logicalCredential:${id}`)
  }

  return new Map([...keys].map((key) => [key, storage.getString(key)]))
}

function restoreDualFormatStorage(
  storage: CredentialStorage,
  snapshot: DualFormatStorageSnapshot,
): void {
  for (const [key, value] of snapshot) {
    try {
      if (value === undefined) {
        storage.remove?.(key)
      } else {
        storage.set(key, value)
      }
    } catch (error) {
      logWalletError('oid4vci', 'dual-format-storage-rollback-failed', error, { key })
    }
  }
}

function readStoredStringArray(storage: CredentialStorage, key: string): string[] {
  const raw = storage.getString(key)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch (error) {
    logWalletError('oid4vci', 'dual-format-storage-index-invalid', error, { key })
    return []
  }
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
  const deleteMdoc = dependencies.deleteMdoc ?? deleteStoredMdoc

  const sdJwtOffer = sliceOfferForConfiguration(resolvedOffer, group.sdJwt.configurationId)
  const mdocOffer = sliceOfferForConfiguration(resolvedOffer, group.mdoc.configurationId)

  const sharedToken = options.reuseToken ?? await awaitCredentialAcquisition(
    Promise.resolve().then(() => dependencies.acquireAccessToken({
      resolvedOffer,
      tx_code: options.tx_code,
      signal: options.signal,
    })),
    options.signal,
  )
  throwIfDualFormatAcquisitionAborted(options.signal)
  if (!sharedToken) {
    throw new Error('CredentialTokenExchangeFailed: token response was empty')
  }
  let currentNonce = sharedToken.cNonce
  const onCNonceUpdated = (cNonce: string) => {
    currentNonce = cNonce
    options.onCNonceUpdated?.(cNonce)
  }

  logWalletStep('oid4vci', 'dual-format-claim-start', {
    issuer: resolvedOffer.issuer,
    sdJwtConfigurationId: group.sdJwt.configurationId,
    mdocConfigurationId: group.mdoc.configurationId,
  })

  const sharedCredentialKeyId = await createSharedCredentialKeyId(
    acquireRecord,
    options,
    dependencies,
  )
  const discardPendingKey = dependencies.discardPendingCredentialKey ?? discardPendingCredentialKeyForIssuance
  let ownedProofSession: NonNullable<ClaimCredentialOptions['proofSession']> | undefined
  try {
    throwIfDualFormatAcquisitionAborted(options.signal)
    ownedProofSession = await createSharedProofSession(
      acquireRecord,
      options,
      dependencies,
      sharedCredentialKeyId,
    )
  } catch (error) {
    if (sharedCredentialKeyId) {
      await discardPendingKey(sharedCredentialKeyId)
    }
    throw error
  }
  const proofSession = options.proofSession ?? ownedProofSession
  const credentialKeyId = sharedCredentialKeyId ?? proofSession?.credentialKeyId
  const acquireDependencies = proofSession
    ? { ...dependencies, signProof: proofSession.signProof }
    : dependencies
  const bindPendingKey = dependencies.bindPendingCredentialKey ?? bindPendingCredentialKeyForIssuance
  let credentialKeyBound = false
  let savedSdJwtCredentialId: string | undefined
  let mdocBindFailed = false

  try {
    throwIfDualFormatAcquisitionAborted(options.signal)
    let sdJwtRecord: VerifiableCredentialRecord | undefined
    let mdocBytes: Uint8Array | undefined
    let mdocDocType: string | undefined
    let mdocStored = false
    let missingFormat: DualFormatClaimResult['missingFormat']
    let sdJwtError: unknown
    let mdocError: unknown

    try {
      sdJwtRecord = await acquireRecord(sdJwtOffer, {
        ...options,
        ...(proofSession ? { proofSession } : {}),
        ...(credentialKeyId ? { pendingCredentialKeyId: credentialKeyId } : {}),
        ...(credentialKeyId ? { deferCredentialKeyBinding: true } : {}),
        onCNonceUpdated,
        dependencies: acquireDependencies,
        reuseToken: { ...sharedToken, cNonce: currentNonce },
      })
      throwIfDualFormatAcquisitionAborted(options.signal)
      saveCredentialRecord(sdJwtRecord, { getCredentialStorage: dependencies.getCredentialStorage })
      savedSdJwtCredentialId = sdJwtRecord.id
      // Bind immediately after SD-JWT persist so a later mdoc failure cannot leave a
      // stored VC without a lasting biometric-bound credential key.
      if (credentialKeyId && !credentialKeyBound) {
        try {
          await bindSharedCredentialKey(credentialKeyId, sdJwtRecord, proofSession, bindPendingKey)
          credentialKeyBound = true
        } catch (bindError) {
          removeStoredCredential(sdJwtRecord.id, dependencies.getCredentialStorage)
          savedSdJwtCredentialId = undefined
          throw bindError
        }
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
      // Bind/post-save failure: MMKV already rolled back when needed — fail closed.
      if (credentialKeyId && sdJwtRecord && !credentialKeyBound) {
        throw error
      }
      sdJwtError = error
      logWalletError('oid4vci', 'dual-format-sd-jwt-failed', error)
      missingFormat = 'dc+sd-jwt'
      sdJwtRecord = undefined
      savedSdJwtCredentialId = undefined
    }

    throwIfDualFormatAcquisitionAborted(options.signal)
    try {
      const pendingMdoc = await acquirePendingMdoc(
        mdocOffer,
        group.mdoc.configurationId,
        {
          ...options,
          ...(proofSession ? { proofSession } : {}),
          ...(credentialKeyId ? { pendingCredentialKeyId: credentialKeyId } : {}),
          ...(credentialKeyId ? { deferCredentialKeyBinding: true } : {}),
          onCNonceUpdated,
        },
        acquireDependencies,
        acquireRecord,
        { ...sharedToken, cNonce: currentNonce },
        {
          issuer: resolvedOffer.issuer,
          logicalCredentialId: group.logicalCredentialIdHint,
          sdJwtConfigurationId: group.sdJwt.configurationId,
        },
      )
      throwIfDualFormatAcquisitionAborted(options.signal)
      mdocDocType = pendingMdoc.docType
      const acquiredMdocBytes = base64UrlToBytes(pendingMdoc.rawBase64)

      const credentialId = sdJwtRecord?.id ?? deriveFallbackMdocCredentialId(resolvedOffer, group.mdoc.configurationId)
      await storeMdoc({ credentialId, docType: mdocDocType }, acquiredMdocBytes)
      mdocBytes = acquiredMdocBytes
      mdocStored = true
      // Bind after native store (mdoc-only / SD-JWT soft-fail). Roll back mDOC on bind
      // failure so cancel cannot leave a proximity credential without a lasting key.
      if (credentialKeyId && !credentialKeyBound) {
        try {
          await bindSharedCredentialKey(
            credentialKeyId,
            sdJwtRecord ?? {
              id: credentialId,
              type: readDocumentTypeFromOffer(resolvedOffer),
              rawVc: '',
              claims: {},
              issuedAt: new Date().toISOString(),
            },
            proofSession,
            bindPendingKey,
          )
          credentialKeyBound = true
        } catch (bindError) {
          try {
            await deleteMdoc(credentialId)
          } catch (deleteError) {
            logWalletError('oid4vci', 'dual-format-mdoc-rollback-failed', deleteError, {
              credentialId,
            })
          }
          mdocBytes = undefined
          mdocStored = false
          mdocBindFailed = true
          throw bindError
        }
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
      // Bind failure after mdoc store: native store already rolled back — fail closed.
      if (mdocBindFailed) {
        throw error
      }
      mdocError = error
      logWalletError('oid4vci', 'dual-format-mdoc-failed', error)
      mdocBytes = undefined
      mdocStored = false
      if (!missingFormat) {
        missingFormat = 'mso_mdoc'
      }
    }

    throwIfDualFormatAcquisitionAborted(options.signal)
    if (!sdJwtRecord && !mdocBytes) {
      throwDualFormatTotalFailure(sdJwtError, mdocError)
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

    const mdocFormat: CredentialFormatRecord | undefined = mdocStored && mdocBytes
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
  } finally {
    ownedProofSession?.close()
    if (credentialKeyId && !credentialKeyBound) {
      if (savedSdJwtCredentialId) {
        removeStoredCredential(savedSdJwtCredentialId, dependencies.getCredentialStorage)
        savedSdJwtCredentialId = undefined
      }
      await discardPendingKey(credentialKeyId)
    }
  }
}

function shouldOpenIssuanceKeySession(options: ClaimCredentialOptions): boolean {
  if (options.proofSession || options.pendingCredentialKeyId) return false
  if (Object.prototype.hasOwnProperty.call(options.dependencies ?? {}, 'signProof')) return false
  if (Object.prototype.hasOwnProperty.call(options.dependencies ?? {}, 'createProofSigningSession')) {
    return false
  }
  return true
}

/**
 * Preview acquire closes the issuance session before finalize. Bind the memory
 * pending seed now so finalize does not try to Keychain-read a memory-only pending key.
 */
async function bindPreviewResultBeforeSessionClose(
  result: DualFormatPreviewResult,
  session: {
    pendingCredentialKeyId: string
    proofSession: NonNullable<ClaimCredentialOptions['proofSession']>
  },
): Promise<DualFormatPreviewResult> {
  if (result.missingFormat || !result.primaryRecord) {
    await discardPendingCredentialKeyForIssuance(session.pendingCredentialKeyId)
    if (!result.pendingMdoc?.pendingCredentialKeyId) return result
    const { pendingCredentialKeyId: _removed, ...pendingMdoc } = result.pendingMdoc
    return { ...result, pendingMdoc }
  }

  if (session.proofSession.bindCredentialKey) {
    await session.proofSession.bindCredentialKey(
      result.primaryRecord.id,
      result.primaryRecord.type,
    )
  } else if (result.pendingMdoc?.pendingCredentialKeyId) {
    await bindPendingCredentialKeyForIssuance(
      result.pendingMdoc.pendingCredentialKeyId,
      result.primaryRecord.id,
      result.primaryRecord.type,
    )
  }

  if (!result.pendingMdoc?.pendingCredentialKeyId) return result
  const { pendingCredentialKeyId: _removed, ...pendingMdoc } = result.pendingMdoc
  return { ...result, pendingMdoc }
}

export async function claimCredentialWithDualFormatSupport(
  resolvedOffer: ResolvedCredentialOffer,
  options: ClaimCredentialOptions = {},
): Promise<VerifiableCredentialRecord> {
  if (isDualFormatOffer(resolvedOffer.credentialConfigurations)) {
    if (shouldOpenIssuanceKeySession(options)) {
      return withIssuanceKeySession(async (session) => {
        await session.activateV2IfNeeded()
        const result = await claimDualFormatCredential(resolvedOffer, {
          ...options,
          pendingCredentialKeyId: session.pendingCredentialKeyId,
          proofSession: session.proofSession,
        })
        return result.primaryRecord
      })
    }
    const result = await claimDualFormatCredential(resolvedOffer, options)
    return result.primaryRecord
  }

  return claimCredential(resolvedOffer, options)
}

async function createSharedProofSession(
  acquireRecord: typeof acquireCredentialRecord,
  options: DualFormatClaimOptions,
  dependencies: DualFormatClaimDependencies,
  credentialKeyId?: string,
): Promise<NonNullable<ClaimCredentialOptions['proofSession']> | undefined> {
  if (options.proofSession) return undefined
  const explicitlyRequested = Object.prototype.hasOwnProperty.call(
    options.dependencies ?? {},
    'createProofSigningSession',
  )
  if (explicitlyRequested) {
    return dependencies.createProofSigningSession?.(credentialKeyId)
  }
  if (Object.prototype.hasOwnProperty.call(options.dependencies ?? {}, 'signProof')) {
    return undefined
  }
  if (acquireRecord !== acquireCredentialRecord && !explicitlyRequested) {
    return undefined
  }

  return dependencies.createProofSigningSession?.(credentialKeyId)
}

async function createSharedCredentialKeyId(
  acquireRecord: typeof acquireCredentialRecord,
  options: DualFormatClaimOptions,
  dependencies: DualFormatClaimDependencies,
): Promise<string | undefined> {
  if (!usesPerCredentialSigning()) return options.pendingCredentialKeyId
  if (options.pendingCredentialKeyId) return options.pendingCredentialKeyId
  if (options.proofSession?.credentialKeyId) return options.proofSession.credentialKeyId
  if (options.proofSession) return undefined

  const explicitlyRequested = Object.prototype.hasOwnProperty.call(
    options.dependencies ?? {},
    'createProofSigningSession',
  )
  if (acquireRecord !== acquireCredentialRecord && !explicitlyRequested) return undefined
  if (!dependencies.createProofSigningSession) return undefined

  const createPendingKey = dependencies.createPendingCredentialKey ?? createPendingCredentialKeyForIssuance
  return createPendingKey()
}

async function bindSharedCredentialKey(
  pendingCredentialKeyId: string,
  record: VerifiableCredentialRecord,
  proofSession: ClaimCredentialOptions['proofSession'],
  bindPendingKey: (
    pendingId: string,
    credentialId: string,
    credentialType: string,
  ) => Promise<CredentialKeyRecord | EncryptedCredentialKeyRecord>,
): Promise<void> {
  if (
    proofSession?.credentialKeyId === pendingCredentialKeyId
    && proofSession.bindCredentialKey
  ) {
    await proofSession.bindCredentialKey(record.id, record.type)
    return
  }

  await bindPendingKey(pendingCredentialKeyId, record.id, record.type)
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
  metadata: {
    issuer: string
    logicalCredentialId?: string
    sdJwtConfigurationId: string
  },
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
    sdJwtConfigurationId: metadata.sdJwtConfigurationId,
    ...(metadata.logicalCredentialId ? { logicalCredentialId: metadata.logicalCredentialId } : {}),
    issuer: metadata.issuer,
    rawBase64: mdocRaw,
    ...(options.pendingCredentialKeyId
      ? { pendingCredentialKeyId: options.pendingCredentialKeyId }
      : {}),
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
