import { createHash } from 'react-native-quick-crypto'

import {
    base64UrlDecodeToString,
    base64UrlToBytes,
    decodeJwtPayloadStrict as decodeJwtPayload,
    isRecord,
    isSameJwk,
    isSameKid,
    formatWalletHolderBindingHint,
    formatCredentialCnfHint,
    readRecord,
    readString,
    toErrorMessage,
} from '@/src/utils/jwtUtils'
import { getCardSchema } from '../../config/cardSchemas'
import {
  readHistoryDocumentLabel,
  readHistoryIssuerPartyName,
} from '../../config/historyDisplayNames'
import {
    importCredential as defaultImportCredential,
} from '../../sdk/walletApi'
import { stringifyClaim } from '../credentials/claimFormatting'
import { extractMdocWalletClaims } from '../credentials/mdocWalletClaims'
import { readNormalizedDocumentExpiry } from '../credentials/credentialDocumentExpiresAt'
import { readCredentialHolderDid } from '../credentials/credentialHolderBinding'
import { readCredentialIssuerName } from '../credentials/credentialIssuer'
import { notifyCredentialsChanged } from '../credentials/storedCredentials'
import {
    bindPendingKeyToCredential,
    createPendingCredentialKey,
    destroyCredentialKey,
    discardPendingCredentialKey,
    getCredentialHolderDid as getPerCredentialHolderDid,
} from '../crypto/credentialSigningKey'
import {
    bindPendingHardwareKeyToCredential,
    createPendingHardwareCredentialKey,
    discardPendingHardwareCredentialKey,
} from '../crypto/hardwareCredentialSigningKey'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { usesPerCredentialSigning } from '../crypto/perCredentialSigning'
import {
    createProofSigningSession as defaultCreateProofSigningSession,
    signProof as defaultSignProof,
    getHolderDid,
    hasWalletKey,
    type ProofSigningSession,
    type SignProofOptions,
} from '../crypto/crypto'
import { withIssuanceKeySession } from '../crypto/issuanceKeySession'
import {
    isWalletCryptoV2Enabled,
    readCachedWalletAttestations,
} from '../crypto/walletCryptoActivation'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { appendWalletHistoryEvent } from '../history/walletEventLog'
import { readActiveOfferDeliveryPath } from '../history/historyDeliveryPath'
import {
    recordBackendSyncHistory,
    recordCredentialVerifyFailed,
} from '../history/walletHistoryRecording'
import { storeMdocCredential } from '../proximity/mdocStorage'
import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'
import { parseClaimDisclosurePolicyFromCredentialMetadata } from '../vp/claimDisclosurePolicy'
import type { RequestDpopOptions } from '@openid4vc/oauth2'

import {
  applyLibDpopState,
  clearDpopIssuanceSession,
  clearDpopSessionForDeferred,
  createDpopIssuanceSession,
  getRequestDpopOptions,
  isDpopIssuanceEnabled,
  registerDpopSessionForDeferred,
  takeDpopSessionForDeferred,
  type DpopIssuanceSession,
} from '../oid4vc/dpopIssuanceSession'
import { InvalidProofError } from './invalidProofError'
import { assertIssuerDidWebCredentialSignature } from './issuerDidWebVerify'
import { readAccessTokenDiagnostics, readAccessTokenSafeDiagnostics, readProofBindingDiagnostics } from './accessTokenDiagnostics'
import { mapCredentialOfferObjectToWalletOffer } from './oid4vc/mapOid4vcOfferToWalletShape'
import {
  parseCredentialOfferViaOid4vc,
  resolveIssuerMetadataViaOid4vc,
} from './oid4vc/parseCredentialOfferViaOid4vc'
import {
  clearLastCredentialRequestWireFailure,
  readHttpStatusFromError,
  readLastCredentialRequestWireFailure,
  readOauthErrorFields,
  retrieveAuthorizationCodeTokenViaOid4vc,
  retrieveCredentialViaOid4vc,
  retrieveDeferredCredentialsViaOid4vc,
  retrievePreAuthorizedTokenViaOid4vc,
} from './oid4vc/retrieveViaOid4vc'
import { findCredentialConfigurationViaOid4vc } from './oid4vc/matchCredentialConfigurationViaOid4vc'
import {
  buildAuthorizationCodeCredentialOfferObject,
  shouldUseOid4vcVciAdapter,
} from './oid4vc/shouldUseOid4vcVciAdapter'
import type { Oid4vcVciAdapterContext, ProtocolPath } from './oid4vc/types'
import type {
  CredentialConfigurationSupportedV1_0_15,
  CredentialOfferRequestWithBaseUrl,
  CredentialsSupportedDisplay,
  IssuerMetadataV1_0_15,
  MetadataDisplay,
  TxCode,
} from './walletVciTypes'

export type {
  CredentialConfigurationSupported,
  CredentialConfigurationSupportedV1_0_15,
  CredentialOfferRequestWithBaseUrl,
  IssuerMetadataV1_0_15,
  TxCode,
} from './walletVciTypes'

const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'
const CREDENTIAL_LIFECYCLE_KEY_PREFIX = 'credential:lifecycle:'
const CREDENTIAL_SUSPENSION_KEY_PREFIX = 'credential:suspension:'
const CREDENTIAL_RENEWAL_KEY_PREFIX = 'credential:renewal:'

export type FetchIssuerMetadata = (issuer: string) => Promise<IssuerMetadataV1_0_15>

export type CredentialDisplay = {
  name?: string
  locale?: string
  description?: string
  logoUri?: string
  logoAltText?: string
  backgroundColor?: string
  textColor?: string
}

export type OfferedCredentialConfiguration = {
  id: string
  requestId: string
  format: string
  display?: CredentialDisplay
  rawConfiguration: CredentialConfigurationSupportedV1_0_15
}

export type ResolvedCredentialOffer = {
  offerUri: string
  issuer: string
  credentialOffer: CredentialOfferRequestWithBaseUrl
  issuerMetadata: IssuerMetadataV1_0_15
  issuerDisplay?: CredentialDisplay
  credentialConfigurations: OfferedCredentialConfiguration[]
  preAuthorizedCode?: string
  txCode?: TxCode
  supportedFlows: string[]
  version: number
  protocolPath: ProtocolPath
  oid4vcContext: Oid4vcVciAdapterContext
}

export type ResolveOfferOptions = {
  fetchIssuerMetadata?: FetchIssuerMetadata
}

export type ClaimDisclosurePolicyEntry = {
  md: boolean
  sd: boolean
}

export type VerifiableCredentialRecord = {
  id: string
  type: string
  rawVc: string
  claims: Record<string, unknown>
  issuedAt: string
  expiresAt?: string
  issuerName?: string
  claimDisclosurePolicy?: Record<string, ClaimDisclosurePolicyEntry>
  issuerUrl?: string
  credentialConfigurationId?: string
}

export type CredentialStorage = {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
  remove?: (key: string) => boolean
}

export type SignProof = (
  cNonce: string,
  issuerUrl: string,
  options?: SignProofOptions,
) => Promise<string>

export type AcquireAccessTokenInput = {
  resolvedOffer: ResolvedCredentialOffer
  tx_code?: string
  authorizationCodeExchange?: AuthorizationCodeExchangeInput
  signal?: AbortSignal
  dpopSession?: DpopIssuanceSession
}

export type AcquireAccessTokenResult = {
  accessToken: string
  cNonce: string
  credentialIdentifier?: string
  tokenType?: string
  dpop?: RequestDpopOptions
}

export type RequestCredentialInput = {
  resolvedOffer: ResolvedCredentialOffer
  accessToken: string
  proof: string
  credentialIdentifier?: string
  walletAttestations?: { wua: string; wia: string }
  signal?: AbortSignal
  dpop?: RequestDpopOptions
  dpopSession?: DpopIssuanceSession
}

export type ClaimCredentialDependencies = {
  acquireAccessToken: (input: AcquireAccessTokenInput) => Promise<AcquireAccessTokenResult>
  requestCredential: (input: RequestCredentialInput) => Promise<string>
  signProof: SignProof
  createProofSigningSession?: (credentialKeyId?: string) => Promise<ProofSigningSession>
  getCredentialStorage: () => CredentialStorage
  /** Optional fetch for Issuer did:web resolve on credential receive (P2 steps 29–31). */
  fetchImpl?: typeof fetch
}

export type ClaimCredentialOptions = {
  tx_code?: string
  dependencies?: Partial<ClaimCredentialDependencies>
  /** Reuse one authenticated proof-signing session across related requests. */
  proofSession?: ProofSigningSession
  /** Pending credential key id from an outer issuance key session. */
  pendingCredentialKeyId?: string
  /** Reports a fresh c_nonce received while retrying an invalid proof. */
  onCNonceUpdated?: (cNonce: string) => void
  /** Reuse a pre-authorized access token (dual-format second credential request). */
  reuseToken?: AcquireAccessTokenResult
  /** Authorization Code grant exchange (same-device issuance). */
  authorizationCodeExchange?: AuthorizationCodeExchangeInput
  /** Cancels an in-flight acquisition without retaining its pending key. */
  signal?: AbortSignal
}

export type AuthorizationCodeExchangeInput = {
  authorizationCode: string
  codeVerifier: string
  redirectUri: string
  clientId: string
  tokenEndpoint?: string
}

export type AcquireCredentialRecordOptions = ClaimCredentialOptions & {
  /** Pending credential key id created by claimCredential when v2 crypto is enabled. */
  pendingCredentialKeyId?: string
  /** Keep a shared dual-format pending key available for the next format request. */
  deferCredentialKeyBinding?: boolean
}

export type BackendSyncResult = {
  status: 201
}

export type ImportCredentialToBackend = (
  wallet: string,
  data: { jwt: string; associated_did: string },
  options?: RequestInit,
) => Promise<{ status: number }>

export type SyncCredentialToBackendDependencies = {
  importCredential: ImportCredentialToBackend
  getHolderDid: () => string
  getCredentialHolderDid?: (credentialId: string) => string
}

export type SyncCredentialToBackendOptions = {
  walletId: string
  sessionToken: string
  dependencies?: Partial<SyncCredentialToBackendDependencies>
}

export async function resolveOffer(offerUri: string, options: ResolveOfferOptions = {}): Promise<ResolvedCredentialOffer> {
  logWalletStep('oid4vci', 'resolve-offer-start', describeUriForLog(offerUri))
  try {
    const resolvedOfferUri = await resolveCredentialOfferUriForTransport(offerUri)
    const parsedViaOid4vc = await parseCredentialOfferViaOid4vc(resolvedOfferUri)
    if (
      !shouldUseOid4vcVciAdapter({
        offerUri: resolvedOfferUri,
        credentialOfferObject: parsedViaOid4vc.credentialOfferObject,
      })
    ) {
      throw new Error('CredentialOfferInvalid: credential offer is missing supported grants or configuration ids')
    }

    const issuer = normalizeIssuerUrl(String(parsedViaOid4vc.credentialOfferObject.credential_issuer))
    const { issuerMetadataResult } = await resolveIssuerMetadataViaOid4vc(issuer)
    const issuerMetadata = await (options.fetchIssuerMetadata ?? fetchIssuerMetadata)(issuer)

    assertIssuerMetadata(issuer, issuerMetadata)
    const credentialOffer = mapCredentialOfferObjectToWalletOffer(
      resolvedOfferUri,
      parsedViaOid4vc.credentialOfferObject,
    )
    const oid4vcContext: Oid4vcVciAdapterContext = {
      credentialOfferObject: parsedViaOid4vc.credentialOfferObject,
      issuerMetadataResult,
    }
    const resolved: ResolvedCredentialOffer = {
      offerUri: resolvedOfferUri,
      issuer,
      credentialOffer,
      issuerMetadata,
      issuerDisplay: toCredentialDisplay(issuerMetadata.display),
      credentialConfigurations: resolveCredentialConfigurations(credentialOffer, issuerMetadata, issuerMetadataResult),
      preAuthorizedCode: credentialOffer.preAuthorizedCode,
      txCode: credentialOffer.txCode,
      supportedFlows: credentialOffer.supportedFlows.map(String),
      version: credentialOffer.version,
      protocolPath: 'oid4vc',
      oid4vcContext,
    }
    logWalletStep('oid4vci', 'resolve-offer-complete', {
      issuer,
      configurationIds: resolved.credentialConfigurations.map((configuration) => configuration.id),
      formats: resolved.credentialConfigurations.map((configuration) => configuration.format),
      supportedFlows: resolved.supportedFlows,
      txCodeRequired: Boolean(resolved.txCode),
      protocolPath: resolved.protocolPath,
    })
    return resolved
  } catch (error) {
    logWalletError('oid4vci', 'resolve-offer-failed', error, describeUriForLog(offerUri))
    throw error
  }
}

export async function resolveAuthorizationCodeIssuance(input: {
  issuer: string
  credentialConfigurationIds: readonly string[]
  fetchIssuerMetadata?: FetchIssuerMetadata
}): Promise<ResolvedCredentialOffer> {
  logWalletStep('oid4vci', 'resolve-auth-code-issuance-start', {
    issuer: input.issuer,
    configurationIds: [...input.credentialConfigurationIds],
  })

  const issuerMetadata = await (input.fetchIssuerMetadata ?? fetchIssuerMetadata)(input.issuer)
  assertIssuerMetadata(input.issuer, issuerMetadata)
  const { issuerMetadataResult } = await resolveIssuerMetadataViaOid4vc(input.issuer)
  const credentialConfigurations = resolveCredentialConfigurationsByIds(
    [...input.credentialConfigurationIds],
    issuerMetadata,
    issuerMetadataResult,
  )

  const credentialOfferObject = buildAuthorizationCodeCredentialOfferObject({
    issuer: input.issuer,
    credentialConfigurationIds: input.credentialConfigurationIds,
  })
  if (
    !shouldUseOid4vcVciAdapter({
      credentialOfferObject,
    })
  ) {
    throw new Error('CredentialOfferInvalid: authorization-code issuance requires credential configuration ids')
  }

  const oid4vcContext: Oid4vcVciAdapterContext = {
    credentialOfferObject,
    issuerMetadataResult,
  }
  const protocolPath: ProtocolPath = 'oid4vc'

  const resolved: ResolvedCredentialOffer = {
    offerUri: 'same-device-authorization-code://local',
    issuer: input.issuer,
    credentialOffer: {
      credential_offer: {
        credential_issuer: input.issuer,
        credential_configuration_ids: [...input.credentialConfigurationIds],
        grants: {
          authorization_code: {},
        },
      },
      supportedFlows: ['authorization_code'],
      version: 1,
    } as unknown as CredentialOfferRequestWithBaseUrl,
    issuerMetadata,
    issuerDisplay: toCredentialDisplay(issuerMetadata.display),
    credentialConfigurations,
    supportedFlows: ['authorization_code'],
    version: 1,
    protocolPath,
    oid4vcContext,
  }

  logWalletStep('oid4vci', 'resolve-auth-code-issuance-complete', {
    issuer: input.issuer,
    configurationIds: credentialConfigurations.map((configuration) => configuration.id),
    formats: credentialConfigurations.map((configuration) => configuration.format),
    protocolPath,
  })

  return resolved
}

export async function claimCredentialWithAuthorizationCode(
  resolvedOffer: ResolvedCredentialOffer,
  authorizationCodeExchange: AuthorizationCodeExchangeInput,
  options: ClaimCredentialOptions = {},
): Promise<VerifiableCredentialRecord> {
  return claimCredential(resolvedOffer, {
    ...options,
    authorizationCodeExchange,
  })
}

export async function fetchIssuerMetadata(issuer: string): Promise<IssuerMetadataV1_0_15> {
  const metadataUrl = getIssuerMetadataUrl(issuer)
  logWalletStep('oid4vci', 'issuer-metadata-fetch-start', { issuer, metadataUrl })

  let response: Response
  try {
    response = await fetch(metadataUrl, {
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (error) {
    logWalletError('oid4vci', 'issuer-metadata-fetch-error', error, { issuer, metadataUrl })
    throw new Error(`IssuerMetadataFetchFailed: ${toErrorMessage(error)}`)
  }

  logWalletStep('oid4vci', 'issuer-metadata-fetch-response', { issuer, metadataUrl, status: response.status, ok: response.ok })
  if (!response.ok) {
    throw new Error(`IssuerMetadataFetchFailed: HTTP ${response.status}`)
  }

  try {
    return (await response.json()) as IssuerMetadataV1_0_15
  } catch (error) {
    logWalletError('oid4vci', 'issuer-metadata-parse-error', error, { issuer, metadataUrl, status: response.status })
    throw new Error(`IssuerMetadataParseFailed: ${toErrorMessage(error)}`)
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

export async function claimCredential(
  resolvedOffer: ResolvedCredentialOffer,
  options: ClaimCredentialOptions = {},
): Promise<VerifiableCredentialRecord> {
  if (shouldOpenIssuanceKeySession(options)) {
    return withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
      return claimCredential(resolvedOffer, {
        ...options,
        pendingCredentialKeyId: session.pendingCredentialKeyId,
        proofSession: session.proofSession,
      })
    })
  }

  const dependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }

  const record = await acquireCredentialRecord(resolvedOffer, {
    ...options,
    dependencies,
  })

  try {
    await persistClaimedCredentialFormats(record, resolvedOffer, dependencies)
    logWalletStep('oid4vci', 'credential-save-start', { id: record.id, type: record.type, issuer: resolvedOffer.issuer })
    saveCredentialRecord(record, { getCredentialStorage: dependencies.getCredentialStorage })
    logWalletStep('oid4vci', 'credential-save-complete', { id: record.id, type: record.type, issuer: resolvedOffer.issuer })
    return record
  } catch (error) {
    // Bind runs inside acquire before MMKV persist — tear down the lasting key if save fails.
    logWalletError('oid4vci', 'credential-save-failed', error, {
      id: record.id,
      type: record.type,
      issuer: resolvedOffer.issuer,
    })
    try {
      await destroyCredentialKey(record.id)
    } catch (destroyError) {
      logWalletError('oid4vci', 'credential-key-destroy-after-save-failed', destroyError, {
        id: record.id,
      })
    }
    throw error
  }
}

export async function acquireCredentialRecord(
  resolvedOffer: ResolvedCredentialOffer,
  options: AcquireCredentialRecordOptions = {},
): Promise<VerifiableCredentialRecord> {
  // Claim-screen preview calls acquire (not claimCredential). Open the issuance
  // session here so fresh installs without a wallet seed can still PoP/bind.
  if (shouldOpenIssuanceKeySession(options)) {
    return withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
      return acquireCredentialRecord(resolvedOffer, {
        ...options,
        pendingCredentialKeyId: session.pendingCredentialKeyId,
        proofSession: session.proofSession,
      })
    })
  }

  if (resolvedOffer.txCode && !options.tx_code) {
    throw new Error('TransactionCodeRequired: tx_code is required')
  }

  if (!resolvedOffer.preAuthorizedCode && !options.authorizationCodeExchange) {
    throw new Error('CredentialFlowUnsupported: Pre-Authorized Code or Authorization Code exchange is required')
  }

  assertSupportedCredentialFormat(resolvedOffer)

  const dependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }

  logWalletStep('oid4vci', 'claim-start', {
    issuer: resolvedOffer.issuer,
    configurationIds: resolvedOffer.credentialConfigurations.map((configuration) => configuration.id),
    formats: resolvedOffer.credentialConfigurations.map((configuration) => configuration.format),
    txCodeProvided: Boolean(options.tx_code),
    reuseToken: Boolean(options.reuseToken),
  })
  const dpopSession = isDpopIssuanceEnabled() ? createDpopIssuanceSession() : undefined
  const token = options.reuseToken
    ?? await awaitCredentialAcquisition(
      Promise.resolve().then(() => dependencies.acquireAccessToken({
        resolvedOffer,
        tx_code: options.tx_code,
        authorizationCodeExchange: options.authorizationCodeExchange,
        signal: options.signal,
        ...(dpopSession ? { dpopSession } : {}),
      })),
      options.signal,
    )
  if (!token) {
    const error = new Error('CredentialTokenExchangeFailed: token response was empty')
    logWalletError('oid4vci', 'access-token-empty', error, { issuer: resolvedOffer.issuer })
    throw error
  }
  logWalletStep('oid4vci', 'access-token-acquired', {
    issuer: resolvedOffer.issuer,
    cNoncePresent: Boolean(token.cNonce),
    credentialIdentifierPresent: Boolean(token.credentialIdentifier),
    reused: Boolean(options.reuseToken),
    accessTokenLength: token.accessToken.length,
    dpopEnabled: isDpopIssuanceEnabled(),
    dpopBoundOnToken: isDpopIssuanceEnabled() && Boolean(token.dpop),
    credentialAttestationsEnabled: isCredentialWalletAttestationEnabled(),
    tokenType: token.tokenType ?? 'unknown',
    ...readAccessTokenDiagnostics(token.accessToken),
    ...readAccessTokenSafeDiagnostics(
      token.accessToken,
      resolvedOffer.issuer,
      resolvedOffer.issuerMetadata.credential_endpoint,
    ),
  })
  throwIfCredentialAcquisitionAborted(options.signal)
  const proofKeyBinding = readProofKeyBinding(resolvedOffer.credentialConfigurations[0])
  let pendingCredentialKeyId =
    options.pendingCredentialKeyId ??
    (usesPerCredentialSigning() ? options.proofSession?.credentialKeyId : undefined)
  let ownsPendingCredentialKey = false
  if (!pendingCredentialKeyId && usesPerCredentialSigning()) {
    pendingCredentialKeyId = isHardwareP256SigningEnabled()
      ? await createPendingHardwareCredentialKey()
      : await createPendingCredentialKey()
    ownsPendingCredentialKey = true
  }
  const walletAttestations = readWalletAttestationsForCredentialRequest()
  const hasCustomSignProof = Object.prototype.hasOwnProperty.call(options.dependencies ?? {}, 'signProof')
  let ownedProofSession: ProofSigningSession | undefined
  try {
    throwIfCredentialAcquisitionAborted(options.signal)
    ownedProofSession =
      options.proofSession || hasCustomSignProof
        ? undefined
        : await dependencies.createProofSigningSession?.(
            pendingCredentialKeyId && usesPerCredentialSigning()
              ? pendingCredentialKeyId
              : undefined,
          )
  } catch (error) {
    if (pendingCredentialKeyId && ownsPendingCredentialKey) {
      await discardOwnedPendingCredentialKey(pendingCredentialKeyId)
    }
    throw error
  }
  const proofSession = options.proofSession ?? ownedProofSession

  try {
    throwIfCredentialAcquisitionAborted(options.signal)
    const signProofForClaim = async (
      nonce: string,
      audience: string,
      signOptions: SignProofOptions = {},
    ) =>
      (proofSession?.signProof ?? dependencies.signProof)(nonce, audience, {
        ...signOptions,
        ...(pendingCredentialKeyId && usesPerCredentialSigning()
          ? { credentialKeyId: pendingCredentialKeyId }
          : {}),
      })

    let proof = await signProofForClaim(token.cNonce, resolvedOffer.issuer, {
      keyBinding: proofKeyBinding,
    })
    logWalletStep('oid4vci', 'proof-signed', {
      issuer: resolvedOffer.issuer,
      popBytes: proof.length,
      keyBinding: proofKeyBinding,
      ...readProofBindingDiagnostics(proof, hasWalletKey() ? getHolderDid() : undefined),
    })

    let rawVc: string | undefined
    let credentialRequestError: unknown
    const submitCredentialRequest = (activeToken: AcquireAccessTokenResult, activeProof: string) =>
      awaitCredentialAcquisition(
        Promise.resolve().then(() => dependencies.requestCredential({
          resolvedOffer,
          accessToken: activeToken.accessToken,
          proof: activeProof,
          credentialIdentifier: activeToken.credentialIdentifier,
          ...(walletAttestations ? { walletAttestations } : {}),
          ...(isDpopIssuanceEnabled() && activeToken.dpop ? { dpop: activeToken.dpop } : {}),
          ...(isDpopIssuanceEnabled() && dpopSession ? { dpopSession } : {}),
          signal: options.signal,
        })),
        options.signal,
      )

    try {
      const requestConfiguration = resolvedOffer.credentialConfigurations[0]
      const walletAttestationsForRequest = readWalletAttestationsForCredentialRequest()
      const additionalRequestPayloadPreview = applyWalletAttestationFields(
        applyMsoMdocCredentialRequestFields({}, requestConfiguration),
        walletAttestationsForRequest,
      )
      logWalletStep('oid4vci', 'credential-request-start', {
        issuer: resolvedOffer.issuer,
        credentialEndpoint: resolvedOffer.issuerMetadata.credential_endpoint,
        configurationId: requestConfiguration?.id,
        requestId: requestConfiguration?.requestId,
        format: requestConfiguration?.format,
        credentialIdentifierPresent: Boolean(token.credentialIdentifier),
        credentialIdentifier: token.credentialIdentifier,
        popBytes: proof.length,
        keyBinding: proofKeyBinding,
        tokenReused: Boolean(options.reuseToken),
        dpopEnabled: isDpopIssuanceEnabled(),
        walletV2Enabled: isWalletCryptoV2Enabled(),
        credentialAttestationsEnabled: isCredentialWalletAttestationEnabled(),
        walletAttestationsAttached: Boolean(walletAttestationsForRequest),
        additionalRequestKeys: Object.keys(additionalRequestPayloadPreview),
      })
      clearLastCredentialRequestWireFailure()
      rawVc = await submitCredentialRequest(token, proof)
    } catch (error) {
      credentialRequestError = error
    }

    if (!rawVc && credentialRequestError instanceof DeferredIssuancePending) {
      if (dpopSession) {
        registerDpopSessionForDeferred(credentialRequestError.transactionId, dpopSession)
      }
      logWalletStep('oid4vci', 'credential-deferred', {
        issuer: resolvedOffer.issuer,
        transactionId: credentialRequestError.transactionId,
        deferredEndpoint: credentialRequestError.deferredEndpoint,
      })
      throw credentialRequestError
    }

    if (!rawVc && !(credentialRequestError instanceof InvalidProofError)) {
      const failedConfiguration = resolvedOffer.credentialConfigurations[0]
      const oauthError = readOauthErrorFields(credentialRequestError)
      const wireFailure = readLastCredentialRequestWireFailure()
      logWalletError('oid4vci', 'credential-request-failed', credentialRequestError, {
        issuer: resolvedOffer.issuer,
        credentialEndpoint: resolvedOffer.issuerMetadata.credential_endpoint,
        configurationId: failedConfiguration?.id,
        requestId: failedConfiguration?.requestId,
        format: failedConfiguration?.format,
        keyBinding: proofKeyBinding,
        tokenType: token.tokenType ?? 'unknown',
        credentialIdentifierPresent: Boolean(token.credentialIdentifier),
        credentialIdentifier: token.credentialIdentifier,
        walletAttestationsAttached: Boolean(walletAttestations),
        httpStatus: readHttpStatusFromError(credentialRequestError) ?? wireFailure?.httpStatus,
        oauthError: oauthError.error ?? wireFailure?.oauthError,
        oauthDescription: oauthError.error_description ?? wireFailure?.oauthDescription,
        wwwAuthenticatePresent: wireFailure?.wwwAuthenticatePresent,
        wwwAuthenticateScheme: wireFailure?.wwwAuthenticateScheme,
        wwwAuthenticateMentionsDpop: wireFailure?.wwwAuthenticateMentionsDpop,
        authScheme: wireFailure?.authScheme,
        credentialConfigurationIdOnWire: wireFailure?.credentialConfigurationId,
        credentialIdentifierOnWire: wireFailure?.credentialIdentifier,
        proofsJwtCountOnWire: wireFailure?.proofsJwtCount,
        hasLegacyProofOnWire: wireFailure?.hasProof,
        hasWalletAttestationFieldsOnWire: wireFailure?.hasWalletAttestationFields,
        bodyKeysOnWire: wireFailure?.bodyKeys,
        ...readAccessTokenDiagnostics(token.accessToken),
        ...readAccessTokenSafeDiagnostics(
          token.accessToken,
          resolvedOffer.issuer,
          resolvedOffer.issuerMetadata.credential_endpoint,
        ),
        ...readProofBindingDiagnostics(proof, hasWalletKey() ? getHolderDid() : undefined),
      })
      throw credentialRequestError
    }

    if (!rawVc && credentialRequestError instanceof InvalidProofError) {
      logWalletError('oid4vci', 'credential-request-invalid-proof', credentialRequestError, {
        issuer: resolvedOffer.issuer,
        retry: true,
      })
      options.onCNonceUpdated?.(credentialRequestError.cNonce)
      proof = await signProofForClaim(credentialRequestError.cNonce, resolvedOffer.issuer, {
        keyBinding: proofKeyBinding,
      })
      logWalletStep('oid4vci', 'proof-resigned', {
        issuer: resolvedOffer.issuer,
        popBytes: proof.length,
        keyBinding: proofKeyBinding,
      })
      rawVc = await submitCredentialRequest(token, proof)
    }

    if (!rawVc) {
      throw new Error('CredentialRequestFailed: credential response was empty')
    }

    logWalletStep('oid4vci', 'credential-response-received', { issuer: resolvedOffer.issuer, credentialBytes: rawVc.length })

    const configuration = resolvedOffer.credentialConfigurations[0]
    const record =
      configuration && isMsoMdocFormat(configuration.format)
        ? await finalizeMdocCredentialRecord(rawVc, resolvedOffer, configuration)
        : await finalizeCredentialRecord(rawVc, proof, resolvedOffer, {
            fetchImpl: dependencies.fetchImpl,
          })

    throwIfCredentialAcquisitionAborted(options.signal)
    if (options.deferCredentialKeyBinding) return record

    const boundRecord = await bindV2CredentialKeyIfNeeded(pendingCredentialKeyId, record, proofSession)
    ownsPendingCredentialKey = false
    return boundRecord
  } finally {
    ownedProofSession?.close()
    if (dpopSession) {
      clearDpopIssuanceSession(dpopSession)
    }
    if (pendingCredentialKeyId && ownsPendingCredentialKey) {
      await discardOwnedPendingCredentialKey(pendingCredentialKeyId)
    }
  }
}

async function discardOwnedPendingCredentialKey(pendingCredentialKeyId: string): Promise<void> {
  if (isHardwareP256SigningEnabled()) {
    await discardPendingHardwareCredentialKey(pendingCredentialKeyId)
    return
  }
  await discardPendingCredentialKey(pendingCredentialKeyId)
}

function throwIfCredentialAcquisitionAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }
}

export function awaitCredentialAcquisition<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    void promise.catch(() => undefined)
    return Promise.reject(new Error('CredentialAcquisitionAborted'))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('CredentialAcquisitionAborted'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

async function bindV2CredentialKeyIfNeeded(
  pendingCredentialKeyId: string | undefined,
  record: VerifiableCredentialRecord,
  proofSession?: ProofSigningSession,
): Promise<VerifiableCredentialRecord> {
  if (pendingCredentialKeyId && usesPerCredentialSigning()) {
    if (
      proofSession?.credentialKeyId === pendingCredentialKeyId
      && proofSession.bindCredentialKey
    ) {
      await proofSession.bindCredentialKey(record.id, record.type)
    } else if (isHardwareP256SigningEnabled()) {
      await bindPendingHardwareKeyToCredential(pendingCredentialKeyId, record.id, record.type)
    } else {
      await bindPendingKeyToCredential(pendingCredentialKeyId, record.id, record.type)
    }
  }
  return record
}

async function finalizeCredentialRecord(
  rawVc: string,
  proof: string,
  resolvedOffer: ResolvedCredentialOffer,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<VerifiableCredentialRecord> {
  try {
    assertCredentialIssuerSignatureAlg(rawVc)
    await assertIssuerDidWebCredentialSignature(rawVc, {
      fetchImpl: options.fetchImpl,
      issuerBaseUrl: resolvedOffer.issuer,
      issuerMetadata: resolvedOffer.issuerMetadata as Record<string, unknown>,
    })
    assertDevelopmentEddsaHolderBinding(rawVc, proof)
    logWalletStep('oid4vci', 'holder-binding-validated', { issuer: resolvedOffer.issuer })
    const record = normalizeCredentialRecord(rawVc, resolvedOffer)
    logWalletStep('oid4vci', 'credential-normalized', { id: record.id, type: record.type, issuer: resolvedOffer.issuer })
    return record
  } catch (error) {
    logWalletError('oid4vci', 'credential-verify-failed', error, { issuer: resolvedOffer.issuer })
    recordCredentialVerifyFailed({ resolvedOffer, error })
    throw error
  }
}

export type SaveCredentialRecordDependencies = Pick<ClaimCredentialDependencies, 'getCredentialStorage'> & {
  appendHistory?: boolean
}

export function saveCredentialRecord(
  record: VerifiableCredentialRecord,
  dependencies: SaveCredentialRecordDependencies = {
    getCredentialStorage: getDefaultCredentialStorage,
  },
): void {
  storeCredentialRecord(dependencies.getCredentialStorage(), record)
  if (dependencies.appendHistory === false) return
  appendCredentialReceivedHistory(record)
}

export function appendCredentialReceivedHistory(record: VerifiableCredentialRecord): void {
  const deliveryPath = readActiveOfferDeliveryPath()
  appendWalletHistoryEvent({
    kind: 'credential-received',
    credentialId: record.id,
    documentType: readHistoryDocumentLabel({ credentialType: record.type }),
    partyName: readHistoryIssuerPartyName({
      credentialType: record.type,
      protocolIssuerName: readCredentialIssuerName(record),
    }),
    channel: 'oid4vci',
    credentialType: record.type,
    ...(deliveryPath ? { deliveryPath } : {}),
    occurredAt: record.issuedAt,
  })
}

/**
 * OID4VCI §8.4 — Polls the Deferred Credential Endpoint for a previously
 * deferred credential issuance. Returns a `VerifiableCredentialRecord` when
 * the credential is ready, or throws `DeferredIssuancePending` again when
 * still pending (with an updated `interval` if provided by the Issuer).
 *
 * The caller is responsible for scheduling retries and for saving the
 * returned record (this function does not write to storage).
 */
export async function pollDeferredCredential(params: {
  transactionId: string
  accessToken: string
  deferredEndpoint: string
  proof: string
  resolvedOffer: ResolvedCredentialOffer
}): Promise<VerifiableCredentialRecord> {
  const { transactionId, accessToken, deferredEndpoint, proof, resolvedOffer } = params

  if (!resolvedOffer.oid4vcContext) {
    throw new Error('CredentialFlowUnsupported: resolved offer is missing oid4vc adapter context')
  }

  logWalletStep('oid4vci', 'deferred-poll-start', {
    issuer: resolvedOffer.issuer,
    deferredEndpoint,
  })

  let response: Record<string, unknown>
  const deferredDpopSession = takeDpopSessionForDeferred(transactionId)
  const deferredDpop = deferredDpopSession ? getRequestDpopOptions(deferredDpopSession) : undefined
  try {
    response = await retrieveDeferredCredentialsViaOid4vc({
      oid4vcContext: resolvedOffer.oid4vcContext,
      accessToken,
      transactionId,
      deferredEndpoint,
      ...(deferredDpop ? { dpop: deferredDpop, dpopSession: deferredDpopSession } : {}),
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DeferredCredentialFailed:')) {
      const oauthError = readOauthErrorFields(error)
      let errorCode = oauthError.error
      let interval = oauthError.interval

      if (!errorCode) {
        const detail = error.message.replace(/^DeferredCredentialFailed:\s*/, '')
        const withoutHttp = detail.replace(/^HTTP \d+:\s*/, '')
        const split = withoutHttp.split(' - ')
        errorCode = split[0]
      }

      if (errorCode === 'issuance_pending') {
        logWalletStep('oid4vci', 'deferred-poll-pending', {
          issuer: resolvedOffer.issuer,
          interval,
        })
        throw new DeferredIssuancePending(
          transactionId,
          accessToken,
          deferredEndpoint,
          proof,
          resolvedOffer,
          interval,
        )
      }

      logWalletError('oid4vci', 'deferred-poll-failed', error, {
        issuer: resolvedOffer.issuer,
        deferredEndpoint,
      })
      throw error
    }

    logWalletError('oid4vci', 'deferred-poll-fetch-error', error, {
      issuer: resolvedOffer.issuer,
      deferredEndpoint,
    })
    throw error instanceof Error
      ? error
      : new Error(`DeferredCredentialFetchFailed: ${toErrorMessage(error)}`)
  }

  const deferredTransactionId = readDeferredTransactionId(response)
  if (deferredTransactionId) {
    const interval = readNumber(readCredentialResponseBody(response)?.interval)
    logWalletStep('oid4vci', 'deferred-poll-pending', {
      issuer: resolvedOffer.issuer,
      newTransactionId: deferredTransactionId,
      interval,
    })
    throw new DeferredIssuancePending(
      deferredTransactionId,
      accessToken,
      deferredEndpoint,
      proof,
      resolvedOffer,
      interval,
    )
  }

  const credentialConfiguration = resolvedOffer.credentialConfigurations[0]
  let credential: string
  try {
    credential =
      credentialConfiguration && isMsoMdocFormat(credentialConfiguration.format)
        ? readMdocCredentialFromResponse(response)
        : readCompactCredentialFromResponse(response)
  } catch (error) {
    throw new Error(`DeferredCredentialFailed: response contains neither credential nor transaction_id`)
  }

  logWalletStep('oid4vci', 'deferred-poll-credential-received', {
    issuer: resolvedOffer.issuer,
    credentialBytes: credential.length,
  })

  clearDpopSessionForDeferred(transactionId)
  if (deferredDpopSession) {
    clearDpopIssuanceSession(deferredDpopSession)
  }

  return await finalizeCredentialRecord(credential, proof, resolvedOffer)
}

export async function syncCredentialToBackend(
  record: VerifiableCredentialRecord,
  options: SyncCredentialToBackendOptions,
): Promise<BackendSyncResult> {
  if (!options.walletId) {
    throw new Error('BackendSyncWalletMissing: walletId is required')
  }

  if (!options.sessionToken) {
    throw new Error('BackendSyncUnauthorized: sessionToken is required')
  }

  const dependencies = {
    importCredential: defaultImportCredential,
    getHolderDid,
    ...options.dependencies,
  }

  const associatedDid = isWalletCryptoV2Enabled()
    ? (dependencies.getCredentialHolderDid?.(record.id) ?? getPerCredentialHolderDid(record.id))
    : dependencies.getHolderDid()

  let response: Awaited<ReturnType<ImportCredentialToBackend>>
  try {
    response = await dependencies.importCredential(
      options.walletId,
      {
        jwt: record.rawVc,
        associated_did: associatedDid,
      },
      {
        headers: {
          Authorization: `Bearer ${options.sessionToken}`,
        },
      },
    )
  } catch (error) {
    try {
      recordBackendSyncHistory(record, 'failure', error)
    } catch {
      // best-effort history
    }
    throw new Error(`BackendSyncFailed: ${toErrorMessage(error)}`)
  }

  if (response.status !== 201) {
    try {
      recordBackendSyncHistory(record, 'failure', new Error(`BackendSyncFailed: HTTP ${response.status}`))
    } catch {
      // best-effort history
    }
    throw new Error(`BackendSyncFailed: HTTP ${response.status}`)
  }

  try {
    recordBackendSyncHistory(record, 'success')
  } catch {
    // best-effort history
  }

  return { status: 201 }
}

export function getIssuerMetadataUrl(issuer: string): string {
  let issuerUrl: URL

  try {
    issuerUrl = new URL(issuer)
  } catch (error) {
    throw new Error(`InvalidCredentialIssuerUrl: ${toErrorMessage(error)}`)
  }

  const issuerPath = issuerUrl.pathname.replace(/^\/+|\/+$/g, '')
  issuerUrl.pathname = issuerPath ? `/.well-known/openid-credential-issuer/${issuerPath}` : '/.well-known/openid-credential-issuer'
  issuerUrl.search = ''
  issuerUrl.hash = ''

  return issuerUrl.toString()
}

async function resolveCredentialOfferUriForTransport(offerUri: string): Promise<string> {
  const credentialOfferUri = readCredentialOfferUriParameter(offerUri)
  if (!credentialOfferUri) return offerUri

  let response: Response
  try {
    response = await fetch(credentialOfferUri, {
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (error) {
    throw new Error(`CredentialOfferParseFailed: ${toErrorMessage(error)}`)
  }

  if (!response.ok) {
    throw new Error(`CredentialOfferParseFailed: HTTP ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new Error(`CredentialOfferParseFailed: ${toErrorMessage(error)}`)
  }

  const credentialOffer = readRecord(payload)?.credential_offer ?? payload
  if (!readRecord(credentialOffer)) {
    throw new Error('CredentialOfferParseFailed: credential_offer_uri response must be a JSON object')
  }

  return buildInlineCredentialOfferUri(offerUri, credentialOffer)
}

function readCredentialOfferUriParameter(offerUri: string): string | undefined {
  try {
    const parsed = new URL(offerUri)
    const value = parsed.searchParams.get('credential_offer_uri')
    return value && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function buildInlineCredentialOfferUri(originalOfferUri: string, credentialOffer: unknown): string {
  const baseUrl = originalOfferUri.split('?')[0] ?? 'openid-credential-offer://'
  const params = new URLSearchParams()
  params.set('credential_offer', JSON.stringify(credentialOffer))
  return `${baseUrl}?${params.toString()}`
}

function normalizeIssuerUrl(issuer: string): string {
  return issuer.replace(/\/$/, '')
}

function assertIssuerMetadata(issuer: string, metadata: IssuerMetadataV1_0_15): void {
  if (normalizeIssuerUrl(metadata.credential_issuer) !== normalizeIssuerUrl(issuer)) {
    throw new Error('IssuerMetadataMismatch: credential_issuer does not match the credential offer issuer')
  }

  if (typeof metadata.credential_endpoint !== 'string' || metadata.credential_endpoint.length === 0) {
    throw new Error('IssuerMetadataInvalid: credential_endpoint is required')
  }

  if (!metadata.credential_configurations_supported || typeof metadata.credential_configurations_supported !== 'object') {
    throw new Error('IssuerMetadataInvalid: credential_configurations_supported is required')
  }
}

function resolveCredentialConfigurationsByIds(
  offeredIds: string[],
  issuerMetadata: IssuerMetadataV1_0_15,
  issuerMetadataResult?: Oid4vcVciAdapterContext['issuerMetadataResult'],
): OfferedCredentialConfiguration[] {
  if (!offeredIds.length) {
    throw new Error('CredentialOfferInvalid: credential_configuration_ids is required')
  }

  return offeredIds.map((id) => {
    const matchedConfiguration = findCredentialConfiguration(
      id,
      issuerMetadata.credential_configurations_supported,
      issuerMetadataResult,
    )

    if (!matchedConfiguration) {
      throw new Error(`CredentialConfigurationNotSupported: ${id}`)
    }

    const rawConfiguration = enrichMsoMdocDoctype(matchedConfiguration.rawConfiguration, id)

    return {
      id,
      requestId: matchedConfiguration.id,
      format: rawConfiguration.format,
      display: toCredentialDisplay(rawConfiguration.display),
      rawConfiguration,
    }
  })
}

function resolveCredentialConfigurations(
  credentialOffer: CredentialOfferRequestWithBaseUrl,
  issuerMetadata: IssuerMetadataV1_0_15,
  issuerMetadataResult?: Oid4vcVciAdapterContext['issuerMetadataResult'],
): OfferedCredentialConfiguration[] {
  const offeredIds = credentialOffer.credential_offer?.credential_configuration_ids

  if (!offeredIds?.length) {
    throw new Error('CredentialOfferInvalid: credential_configuration_ids is required')
  }

  return resolveCredentialConfigurationsByIds(offeredIds, issuerMetadata, issuerMetadataResult)
}

type MatchedCredentialConfiguration = {
  id: string
  rawConfiguration: CredentialConfigurationSupportedV1_0_15
}

function findCredentialConfiguration(
  id: string,
  supported: Record<string, CredentialConfigurationSupportedV1_0_15>,
  issuerMetadataResult?: Oid4vcVciAdapterContext['issuerMetadataResult'],
): MatchedCredentialConfiguration | undefined {
  if (issuerMetadataResult) {
    const libMatch = findCredentialConfigurationViaOid4vc({
      offeredId: id,
      issuerMetadataResult,
      walletSupported: supported,
    })
    if (libMatch) return libMatch
  }

  const direct = supported[id]
  if (direct) return { id, rawConfiguration: direct }

  const normalizedId = normalizeCredentialConfigurationId(id)
  const matchedKey = Object.keys(supported).find((key) => normalizeCredentialConfigurationId(key) === normalizedId)
  if (matchedKey) return { id: matchedKey, rawConfiguration: supported[matchedKey] }

  const offeredFormat = readCredentialConfigurationFormatSuffix(normalizedId)
  const baseId = stripCredentialConfigurationFormatSuffix(normalizedId)

  const baseMatchedKey = Object.keys(supported).find((key) => normalizeCredentialConfigurationId(key) === baseId)
  if (baseMatchedKey && isCompatibleCredentialConfigurationFormat(offeredFormat, supported[baseMatchedKey])) {
    return { id: baseMatchedKey, rawConfiguration: supported[baseMatchedKey] }
  }

  const familyMatchedKeys = Object.keys(supported).filter((key) => {
    const supportedBaseId = stripCredentialConfigurationFormatSuffix(normalizeCredentialConfigurationId(key))
    return supportedBaseId === baseId || supportedBaseId.includes(baseId) || baseId.includes(supportedBaseId)
  })
  const formatPreferredFamilyKey = familyMatchedKeys.find((key) =>
    isCompatibleCredentialConfigurationFormat(offeredFormat, supported[key]),
  )
  if (formatPreferredFamilyKey) {
    return { id: formatPreferredFamilyKey, rawConfiguration: supported[formatPreferredFamilyKey] }
  }
  if (!offeredFormat && familyMatchedKeys.length === 1) {
    return { id: familyMatchedKeys[0], rawConfiguration: supported[familyMatchedKeys[0]] }
  }

  const semanticMatchedKey = Object.keys(supported).find((key) =>
    isSemanticCredentialConfigurationMatch(id, offeredFormat, key, supported[key]),
  )
  if (semanticMatchedKey) return { id: semanticMatchedKey, rawConfiguration: supported[semanticMatchedKey] }

  const compatibleFormatKeys = Object.keys(supported).filter((key) =>
    isCompatibleCredentialConfigurationFormat(offeredFormat, supported[key]),
  )
  if (isPidCredentialConfigurationId(id) && compatibleFormatKeys.length === 1) {
    const fallbackKey = compatibleFormatKeys[0]
    return { id: fallbackKey, rawConfiguration: supported[fallbackKey] }
  }

  const doctypeMatched = findMsoMdocConfigurationForDoctypeOffer(id, supported)
  if (doctypeMatched) return doctypeMatched

  return undefined
}

/** ISO mDOC offers often put the doctype in credential_configuration_ids while issuer metadata omits `doctype`. */
function isIsoMdocDoctypeOfferId(id: string): boolean {
  const normalized = id.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.startsWith('org.iso.')) return true
  return normalized.endsWith('.mdl') || normalized.endsWith('mdl')
}

function findMsoMdocConfigurationForDoctypeOffer(
  offeredId: string,
  supported: Record<string, CredentialConfigurationSupportedV1_0_15>,
): MatchedCredentialConfiguration | undefined {
  if (!isIsoMdocDoctypeOfferId(offeredId)) return undefined

  const normalizedDoctype = normalizeCredentialConfigurationId(offeredId)
  const msoMdocEntries = Object.entries(supported).filter(([, configuration]) => configuration.format === 'mso_mdoc')
  if (msoMdocEntries.length === 0) return undefined

  const byDoctypeField = msoMdocEntries.find(([, configuration]) => {
    const raw = readRecord(configuration)
    const docType = readString(raw?.doctype) ?? readString(raw?.docType)
    return docType ? normalizeCredentialConfigurationId(docType) === normalizedDoctype : false
  })
  if (byDoctypeField) {
    return { id: byDoctypeField[0], rawConfiguration: byDoctypeField[1] }
  }

  if (!isIsoMdlDoctype(normalizedDoctype)) return undefined

  const drivingLicenceMatches = msoMdocEntries.filter(([key, configuration]) =>
    isIso18013DrivingLicenceMdocConfiguration(key, configuration),
  )

  if (drivingLicenceMatches.length === 1) {
    return { id: drivingLicenceMatches[0][0], rawConfiguration: drivingLicenceMatches[0][1] }
  }

  const preferred = drivingLicenceMatches.find(([key]) =>
    normalizeCredentialConfigurationId(key).includes('iso18013driverslicensecredential'),
  )
  if (preferred) {
    return { id: preferred[0], rawConfiguration: preferred[1] }
  }

  return drivingLicenceMatches[0]
    ? { id: drivingLicenceMatches[0][0], rawConfiguration: drivingLicenceMatches[0][1] }
    : undefined
}

function isIsoMdlDoctype(normalizedDoctype: string): boolean {
  return (
    normalizedDoctype === 'orgiso1801351mdl' ||
    normalizedDoctype.endsWith('1801351mdl') ||
    normalizedDoctype.endsWith('mdl')
  )
}

function isIso18013DrivingLicenceMdocConfiguration(
  configurationId: string,
  configuration: CredentialConfigurationSupportedV1_0_15,
): boolean {
  const searchable = [
    configurationId,
    ...readTypeStrings(readRecord(configuration)?.types),
    ...readTypeStrings(readRecord(configuration.credential_definition)?.type),
    ...readDisplayNames(configuration.display),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normalizeCredentialConfigurationId)

  return searchable.some((value) => {
    const looksIso18013 = value.includes('iso18013') || value.includes('18013')
    const looksDriving =
      value.includes('driving') ||
      value.includes('licence') ||
      value.includes('license') ||
      value.includes('mdl')
    return looksIso18013 && looksDriving
  })
}

function enrichMsoMdocDoctype(
  configuration: CredentialConfigurationSupportedV1_0_15,
  offeredConfigurationId: string,
): CredentialConfigurationSupportedV1_0_15 {
  if (configuration.format !== 'mso_mdoc') return configuration

  const raw = readRecord(configuration)
  const existingDoctype = readString(raw?.doctype) ?? readString(raw?.docType)
  if (existingDoctype) return configuration
  if (!isIsoMdocDoctypeOfferId(offeredConfigurationId)) return configuration

  return {
    ...configuration,
    doctype: offeredConfigurationId,
  } as CredentialConfigurationSupportedV1_0_15
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

function isCompatibleCredentialConfigurationFormat(
  offeredFormat: string | undefined,
  configuration: CredentialConfigurationSupportedV1_0_15,
): boolean {
  if (!offeredFormat) return true
  if (configuration.format === offeredFormat) return true
  // Customer issuers often advertise vc+sd-jwt while offers still use the dc+sd-jwt suffix.
  if (isSdJwtVcFormat(offeredFormat) && isSdJwtVcFormat(configuration.format)) return true
  return false
}

function isPidCredentialConfigurationId(id: string): boolean {
  const normalized = normalizeCredentialConfigurationId(id)
  const baseId = stripCredentialConfigurationFormatSuffix(normalized)
  return baseId === 'idcard' || baseId === 'thainationalid' || baseId.includes('idcard')
}

function readTypeStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  const single = readString(value)
  return single ? [single] : []
}

function readDisplayNames(displays: MetadataDisplay[] | CredentialsSupportedDisplay[] | undefined): string[] {
  return displays
    ?.map((display) => display.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0) ?? []
}

export function readCredentialIdentifierFromTokenResponse(
  response: unknown,
  configuration: OfferedCredentialConfiguration | undefined,
): string | undefined {
  const authorizationDetails = readRecord(response)?.authorization_details
  if (!Array.isArray(authorizationDetails)) return undefined

  const openIdCredentialDetails = authorizationDetails
    .map(readRecord)
    .filter((detail): detail is Record<string, unknown> => detail?.type === 'openid_credential')

  const matchedDetail =
    openIdCredentialDetails.find((detail) =>
      [configuration?.requestId, configuration?.id]
        .filter((id): id is string => typeof id === 'string')
        .some((id) => detail.credential_configuration_id === id),
    ) ?? openIdCredentialDetails[0]

  const credentialIdentifier = readString(matchedDetail?.credential_identifier)
  if (credentialIdentifier) return credentialIdentifier

  const credentialIdentifiers = matchedDetail?.credential_identifiers
  if (!Array.isArray(credentialIdentifiers)) return undefined

  return credentialIdentifiers.find((item): item is string => typeof item === 'string' && item.length > 0)
}

function toCredentialDisplay(
  displays: MetadataDisplay[] | CredentialsSupportedDisplay[] | undefined,
): CredentialDisplay | undefined {
  const display = displays?.[0]

  if (!display) {
    return undefined
  }

  return {
    name: display.name,
    locale: display.locale,
    description: display.description,
    logoUri: display.logo?.uri,
    logoAltText: display.logo?.alt_text,
    backgroundColor: display.background_color,
    textColor: display.text_color,
  }
}

function normalizeCredentialRecord(
  rawVc: string,
  resolvedOffer?: Pick<ResolvedCredentialOffer, 'credentialConfigurations' | 'issuer' | 'issuerDisplay'>,
): VerifiableCredentialRecord {
  const claims = decodeCredentialClaims(rawVc)
  const vc = readRecord(claims.vc)
  const id = readString(claims.jti) ?? readString(vc?.id) ?? readString(claims.id) ?? hashCredential(rawVc)
  const issuedAt = normalizeDate(readString(vc?.issuanceDate) ?? readNumber(claims.iat) ?? readNumber(claims.nbf) ?? Date.now() / 1000)
  const type = readCredentialType(claims, vc, resolvedOffer)
  const issuerName =
    resolvedOffer?.issuerDisplay?.name?.trim() ||
    (type === 'ChulalongkornUniversityTranscript'
      ? getCardSchema(type).issuerName
      : resolvedOffer?.issuer)
  const expiresAt = readNormalizedDocumentExpiry({
    claims,
    type,
    ...(readString(vc?.expirationDate) ? { vcExpirationDate: readString(vc?.expirationDate) } : {}),
    ...(readNumber(claims.exp) !== undefined ? { jwtExp: readNumber(claims.exp) } : {}),
  })

  const configuration = resolvedOffer?.credentialConfigurations[0]
  const claimDisclosurePolicy = parseClaimDisclosurePolicyFromCredentialMetadata(configuration?.rawConfiguration)

  return {
    id,
    type,
    rawVc,
    claims,
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
    ...(issuerName ? { issuerName } : {}),
    ...(claimDisclosurePolicy ? { claimDisclosurePolicy } : {}),
    ...(resolvedOffer?.issuer ? { issuerUrl: resolvedOffer.issuer } : {}),
    ...(configuration?.id ? { credentialConfigurationId: configuration.id } : {}),
  }
}

export function createDefaultClaimCredentialDependencies(): ClaimCredentialDependencies {
  return {
    acquireAccessToken: async ({ resolvedOffer, tx_code, authorizationCodeExchange, signal, dpopSession }) => {
      const activeDpopSession = dpopSession ?? (isDpopIssuanceEnabled() ? createDpopIssuanceSession() : undefined)
      const dpop = activeDpopSession ? getRequestDpopOptions(activeDpopSession) : undefined

      try {
        const response = authorizationCodeExchange
          ? await retrieveAuthorizationCodeTokenViaOid4vc({
              oid4vcContext: resolvedOffer.oid4vcContext,
              authorizationCodeExchange,
              signal,
              ...(dpop ? { dpop, dpopSession: activeDpopSession } : {}),
            })
          : await retrievePreAuthorizedTokenViaOid4vc({
              oid4vcContext: resolvedOffer.oid4vcContext,
              txCode: tx_code,
              signal,
              ...(dpop ? { dpop, dpopSession: activeDpopSession } : {}),
            })

        if (activeDpopSession && response.dpop) {
          applyLibDpopState(activeDpopSession, response.dpop)
        }

        const accessToken = readString(response.access_token)
        const cNonce = readString(response.c_nonce)
        const tokenType = readString(readRecord(response)?.token_type)
        if (!accessToken || !cNonce) {
          throw new Error('access_token and c_nonce are required')
        }

        return {
          accessToken,
          cNonce,
          ...(tokenType ? { tokenType } : {}),
          credentialIdentifier: readCredentialIdentifierFromTokenResponse(response, resolvedOffer.credentialConfigurations[0]),
          ...(activeDpopSession && isDpopIssuanceEnabled()
            ? { dpop: getRequestDpopOptions(activeDpopSession) }
            : {}),
        }
      } catch (error) {
        throw new Error(`CredentialTokenExchangeFailed: ${toErrorMessage(error)}`)
      }
    },
    requestCredential: async ({
      resolvedOffer,
      accessToken,
      proof,
      credentialIdentifier,
      walletAttestations,
      signal,
      dpop,
      dpopSession,
    }) => {
      try {
        throwIfCredentialAcquisitionAborted(signal)
        const credentialConfiguration = resolvedOffer.credentialConfigurations[0]

        if (!credentialConfiguration || !isSupportedCredentialFormat(credentialConfiguration.format)) {
          throw new Error('CredentialFormatUnsupported: JWT VC, SD-JWT VC, or mso_mdoc response is required')
        }

        const additionalRequestPayload = sanitizeCredentialAdditionalRequestPayload(
          resolvedOffer.issuer,
          applyWalletAttestationFields(
            applyMsoMdocCredentialRequestFields({}, credentialConfiguration),
            walletAttestations,
          ),
        )
        const additionalKeys = Object.keys(additionalRequestPayload)
        if (additionalKeys.length > 0) {
          logWalletStep('oid4vci', 'debug-credential-request-additional-payload', { additionalKeys })
        }

        const response = await retrieveCredentialViaOid4vc({
          oid4vcContext: resolvedOffer.oid4vcContext,
          accessToken,
          proofJwt: proof,
          credentialConfigurationId: credentialConfiguration.requestId,
          ...(credentialIdentifier ? { credentialIdentifier } : {}),
          additionalRequestPayload,
          signal,
          ...(isDpopIssuanceEnabled() && dpop ? { dpop } : {}),
          ...(isDpopIssuanceEnabled() && dpopSession ? { dpopSession } : {}),
        })
        throwIfCredentialAcquisitionAborted(signal)

        const deferredTransactionId = readDeferredTransactionId(response)
        if (deferredTransactionId) {
          const deferredEndpoint = readString(readRecord(resolvedOffer.issuerMetadata)?.deferred_credential_endpoint)
          if (!deferredEndpoint) {
            throw new Error('CredentialRequestFailed: issuer returned transaction_id but no deferred_credential_endpoint in metadata')
          }
          throw new DeferredIssuancePending(
            deferredTransactionId,
            accessToken,
            deferredEndpoint,
            proof,
            resolvedOffer,
          )
        }

        if (isMsoMdocFormat(credentialConfiguration.format)) {
          return readMdocCredentialFromResponse(response)
        }

        return readCompactCredentialFromResponse(response)
      } catch (error) {
        if (signal?.aborted) {
          throw new Error('CredentialAcquisitionAborted')
        }
        if (error instanceof DeferredIssuancePending) {
          throw error
        }

        if (error instanceof InvalidProofError) {
          throw error
        }

        if (
          error instanceof Error &&
          (error.message.startsWith('CredentialFormatUnsupported') ||
            error.message.startsWith('CredentialResponseUnsupported') ||
            error.message.startsWith('CredentialResponseDeferred') ||
            error.message.startsWith('CredentialRequestFailed') ||
            error.message.startsWith('CredentialFlowUnsupported'))
        ) {
          throw error
        }

        throw new Error(`CredentialRequestFailed: ${toErrorMessage(error)}`)
      }
    },
    signProof: defaultSignProof,
    createProofSigningSession: defaultCreateProofSigningSession,
    getCredentialStorage: getDefaultCredentialStorage,
  }
}

async function readJsonResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown
    return readRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

export { InvalidProofError } from './invalidProofError'

/**
 * OID4VCI §8.4 — Thrown when the Issuer returns `transaction_id` instead of
 * an immediate credential. The caller (UI/scan flow) catches this, stores the
 * transaction context, and polls `pollDeferredCredential()` later.
 */
export class DeferredIssuancePending extends Error {
  constructor(
    public readonly transactionId: string,
    public readonly accessToken: string,
    public readonly deferredEndpoint: string,
    public readonly proof: string,
    public readonly resolvedOffer: ResolvedCredentialOffer,
    public readonly interval?: number,
  ) {
    super(`DeferredIssuancePending: transaction_id=${transactionId}`)
    this.name = 'DeferredIssuancePending'
  }
}

const ERROR_BODY_PREVIEW_MAX_CHARS = 280

/**
 * Truncated, token-redacted preview of issuer error text for thrown diagnostics.
 * Never includes full credential/JWT material — only a short safe snippet.
 */
function safeErrorBodyPreview(value: unknown, maxChars = ERROR_BODY_PREVIEW_MAX_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const redacted = redactSensitiveTokenSubstrings(trimmed)
  if (redacted.length <= maxChars) return redacted
  return `${redacted.slice(0, maxChars)}...`
}

function redactSensitiveTokenSubstrings(text: string): string {
  // Compact JWT / SD-JWT-like segments (header.payload.signature[~...])
  return text.replace(
    /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:~[A-Za-z0-9_-]+)*/g,
    '[redacted]',
  )
}

function readCredentialResponseHttpStatus(responseRecord: Record<string, unknown>): number | undefined {
  return (
    readNumber(readRecord(responseRecord.origResponse)?.status) ??
    readNumber(responseRecord.status) ??
    readNumber(responseRecord.httpStatus)
  )
}

/**
 * Reads an mso_mdoc credential payload from an OID4VCI credential
 * response. Accepts legacy `{ format, credential }`, OID4VCI 1.0
 * `{ credentials: [{ credential }] }`, and plain `{ credential }` when format
 * is missing or `mso_mdoc`. mDOC values are base64url CBOR — not JWTs.
 */
export function readMdocCredentialFromResponse(response: unknown): string {
  const body = readCredentialResponseBody(response)
  const credential = readMdocCredentialValue(body)

  if (credential) return credential

  const deferredId =
    readString(body?.transaction_id) ??
    readString(body?.acceptance_token)
  if (deferredId) {
    throw new Error(
      `CredentialResponseDeferred: issuer returned deferred response without mso_mdoc credential (${describeCredentialResponseShape(response)})`,
    )
  }

  throw new Error(
    `CredentialResponseUnsupported: mso_mdoc credential response is required (${describeCredentialResponseShape(response)})`,
  )
}

export function readCompactCredentialFromResponse(response: unknown): string {
  const body = readCredentialResponseBody(response)
  const credential = readCompactCredentialValue(body)

  if (credential) return credential

  throw new Error(
    `CredentialResponseUnsupported: compact credential response is required (${describeCredentialResponseShape(response)})`,
  )
}

/**
 * OID4VCI §8.4 — Reads `transaction_id` from a credential response that
 * indicates deferred issuance. Returns the transaction ID string when the
 * response contains `transaction_id` but no credential, or `undefined` when
 * the response carries a credential (normal flow).
 */
export function readDeferredTransactionId(response: unknown): string | undefined {
  const body = readCredentialResponseBody(response)
  if (!body) return undefined

  // Only treat as deferred when there is a transaction_id and no credential
  const transactionId = readString(body.transaction_id)
  if (!transactionId) return undefined

  // If the response also has a credential (JWT/SD-JWT or mso_mdoc), issuer is done
  if (readCompactCredentialValue(body) || readMdocCredentialValue(body)) {
    return undefined
  }

  return transactionId
}

function readCredentialResponseBody(response: unknown): Record<string, unknown> | undefined {
  const responseRecord = readRecord(response)
  // Prefer successBody when it is a plain object; @openid4vc/openid4vci wraps parsed
  // credential payloads under credentialResponse on RetrieveCredentialsResponseOk.
  return (
    readRecord(responseRecord?.successBody)
    ?? readRecord(responseRecord?.credentialResponse)
    ?? readRecord(responseRecord?.deferredCredentialResponse)
    ?? responseRecord
  )
}

/**
 * Walk nested credential/credentials like compact JWT parsing, but accept any
 * non-empty string (mDOC is base64url CBOR, not a JWT). Skip records whose
 * explicit format is present and not mso_mdoc.
 */
function readMdocCredentialValue(value: unknown): string | undefined {
  const direct = readString(value)
  if (direct && direct.length > 0) return direct

  if (Array.isArray(value)) {
    for (const item of value) {
      const credential = readMdocCredentialValue(item)
      if (credential) return credential
    }
    return undefined
  }

  const record = readRecord(value)
  if (!record) return undefined

  const format = readString(record.format)
  if (format && format !== 'mso_mdoc') {
    // Format explicitly names a non-mdoc profile — do not treat its credential
    // string as mso_mdoc, but still walk nested credentials arrays.
    return (
      readMdocCredentialValue(record.credentials) ??
      readMdocCredentialValue(record.credential_response)
    )
  }

  return (
    readMdocCredentialValue(record.credential) ??
    readMdocCredentialValue(record.credentials) ??
    readMdocCredentialValue(record.credential_response)
  )
}

function readCompactCredentialValue(value: unknown): string | undefined {
  const direct = readString(value)
  if (direct && isCompactCredentialString(direct)) return direct

  if (Array.isArray(value)) {
    for (const item of value) {
      const credential = readCompactCredentialValue(item)
      if (credential) return credential
    }
    return undefined
  }

  const record = readRecord(value)
  if (!record) return undefined

  return (
    readCompactCredentialValue(record.credential) ??
    readCompactCredentialValue(record.credentials) ??
    readCompactCredentialValue(record.credential_response)
  )
}

function isCompactCredentialString(value: string): boolean {
  const issuerJwt = value.split('~')[0] ?? value
  return issuerJwt.split('.').length >= 3
}

/**
 * Safe diagnostic summary for credential-response parse failures.
 * Never includes credential bytes, tokens, or PII — only types/keys/presence.
 */
function describeCredentialResponseShape(response: unknown): string {
  const responseRecord = readRecord(response)
  if (!responseRecord) {
    return `response:${response === undefined ? 'undefined' : typeof response}`
  }

  const successBodyRaw = responseRecord.successBody
  const successBody = readRecord(successBodyRaw)
  const errorBodyRaw = responseRecord.errorBody
  const errorBody = readRecord(errorBodyRaw)
  const httpStatus = readCredentialResponseHttpStatus(responseRecord)

  // When caller already passed a success body (no HTTP client wrapper), treat the
  // whole record as the credential body for presence checks.
  const looksLikeClientResponseWrapper =
    'successBody' in responseRecord ||
    'errorBody' in responseRecord ||
    'origResponse' in responseRecord ||
    'access_token' in responseRecord
  const body = looksLikeClientResponseWrapper ? (successBody ?? {}) : responseRecord

  const parts: string[] = []

  if (httpStatus !== undefined) {
    parts.push(`httpStatus:${httpStatus}`)
  }

  if (looksLikeClientResponseWrapper) {
    if (successBodyRaw === undefined) {
      parts.push('successBody:undefined')
    } else if (typeof successBodyRaw === 'string') {
      parts.push('successBody:string')
    } else if (successBody) {
      const keys = Object.keys(successBody)
      parts.push(`successBodyKeys:${keys.length > 0 ? keys.join(',') : '(empty)'}`)
    } else {
      parts.push(`successBody:${typeof successBodyRaw}`)
    }

    if (errorBody) {
      parts.push(`errorBodyKeys:${Object.keys(errorBody).join(',')}`)
      const oidError = readString(errorBody.error)
      const oidDescription = readString(errorBody.error_description)
      if (oidError) {
        const preview = safeErrorBodyPreview(oidError)
        if (preview) parts.push(`error:${preview}`)
      }
      if (oidDescription) {
        const preview = safeErrorBodyPreview(oidDescription)
        if (preview) parts.push(`error_description:${preview}`)
      }
    } else if (errorBodyRaw !== undefined) {
      const preview = safeErrorBodyPreview(errorBodyRaw)
      if (preview) {
        parts.push(`errorBody:string:${preview}`)
      } else {
        parts.push(`errorBody:${typeof errorBodyRaw}`)
      }
    }

    parts.push(`outerKeys:${Object.keys(responseRecord).join(',')}`)
  } else {
    const keys = Object.keys(responseRecord)
    parts.push(`keys:${keys.length > 0 ? keys.join(',') : '(empty)'}`)
  }

  parts.push(`transaction_id:${body.transaction_id !== undefined}`)
  parts.push(`acceptance_token:${body.acceptance_token !== undefined}`)

  const credentials = body.credentials
  if (Array.isArray(credentials)) {
    parts.push(`credentials:array[${credentials.length}]`)
  } else {
    parts.push(`credentials:${typeof credentials}`)
  }
  parts.push(`credential:${typeof body.credential}`)

  return parts.join('; ')
}

function isJwtVcFormat(format: string): boolean {
  return format === 'jwt_vc_json' || format === 'jwt_vc'
}

function isSdJwtVcFormat(format: string): boolean {
  return format === 'dc+sd-jwt' || format === 'vc+sd-jwt'
}

function isMsoMdocFormat(format: string): boolean {
  return format === 'mso_mdoc'
}

/** mso_mdoc / cose_key configs need public key material in the PoP JWT (`jwk` header).
 * SD-JWT VC Verifiers that require `cnf.jwk` also need the Issuer to receive a PoP `jwk`
 * (did-kid alone yields credentials with only `cnf.kid` → `missing_holder_binding_key`).
 */
function readProofKeyBinding(
  configuration: OfferedCredentialConfiguration | undefined,
): 'did-kid' | 'jwk' {
  if (!configuration) return 'did-kid'
  if (isMsoMdocFormat(configuration.format)) return 'jwk'
  if (isSdJwtVcFormat(configuration.format)) return 'jwk'

  const raw = readRecord(configuration.rawConfiguration)
  const methods = raw?.cryptographic_binding_methods_supported
  if (!Array.isArray(methods)) return 'did-kid'
  if (methods.some((method) => method === 'cose_key' || method === 'jwk')) return 'jwk'
  return 'did-kid'
}

function readMdocDocType(configuration: OfferedCredentialConfiguration): string | undefined {
  const rawConfiguration = readRecord(configuration.rawConfiguration)
  return readString(rawConfiguration?.doctype) ?? readString(rawConfiguration?.docType)
}

export function isCredentialWalletAttestationEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
  return raw === 'true' || raw === '1'
}

function readWalletAttestationsForCredentialRequest(): { wua: string; wia: string } | undefined {
  if (!isWalletCryptoV2Enabled()) return undefined
  if (!isCredentialWalletAttestationEnabled()) return undefined

  const cached = readCachedWalletAttestations()
  if (!cached.wua?.value || !cached.wia?.value) return undefined

  return { wua: cached.wua.value, wia: cached.wia.value }
}

function applyWalletAttestationFields(
  credentialRequest: Record<string, unknown>,
  walletAttestations?: { wua: string; wia: string },
): Record<string, unknown> {
  if (!walletAttestations) return credentialRequest

  return {
    ...credentialRequest,
    wua: walletAttestations.wua,
    wia: walletAttestations.wia,
  }
}

function sanitizeCredentialAdditionalRequestPayload(
  issuer: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!isZenithCredentialIssuer(issuer)) return payload
  if (isCredentialWalletAttestationEnabled()) return payload

  const { wua: _wua, wia: _wia, ...rest } = payload
  if (Object.prototype.hasOwnProperty.call(payload, 'wua') || Object.prototype.hasOwnProperty.call(payload, 'wia')) {
    logWalletStep('oid4vci', 'credential-request-stripped-wallet-attestations', {
      issuer,
      strippedKeys: ['wua', 'wia'].filter((key) => Object.prototype.hasOwnProperty.call(payload, key)),
    })
  }
  return rest
}

function isZenithCredentialIssuer(issuer: string): boolean {
  try {
    return new URL(issuer).hostname.toLowerCase().includes('zenithcomp.co.th')
  } catch {
    return issuer.toLowerCase().includes('zenithcomp.co.th')
  }
}

function applyMsoMdocCredentialRequestFields(
  credentialRequest: Record<string, unknown>,
  configuration: OfferedCredentialConfiguration,
): Record<string, unknown> {
  if (!isMsoMdocFormat(configuration.format)) {
    return credentialRequest
  }

  const docType = readMdocDocType(configuration)
  const {
    proof: _legacyProof,
    format: _legacyFormat,
    cose_key: _requestCoseKey,
    proofs: _existingProofs,
    credential_configuration_id: _configId,
    ...rest
  } = credentialRequest

  // Issuer `/credential` expects OID4VCI 1.0:
  // { credential_configuration_id, proofs: { jwt: [...] } }.
  // PoP JWTs are attached by retrieveCredentialViaOid4vc — not in additionalRequestPayload.
  return {
    ...rest,
    credential_configuration_id: configuration.requestId,
    ...(docType ? { doctype: docType } : {}),
  }
}

function isSupportedCredentialFormat(format: string): boolean {
  return isJwtVcFormat(format) || isSdJwtVcFormat(format) || isMsoMdocFormat(format)
}

function assertSupportedCredentialFormat(resolvedOffer: ResolvedCredentialOffer): void {
  const unsupportedConfiguration = resolvedOffer.credentialConfigurations.find(
    (configuration) => !isSupportedCredentialFormat(configuration.format),
  )

  if (unsupportedConfiguration) {
    throw new Error('CredentialFormatUnsupported: JWT VC, SD-JWT VC, or mso_mdoc response is required')
  }
}

function finalizeMdocCredentialRecord(
  rawBase64: string,
  resolvedOffer: ResolvedCredentialOffer,
  configuration: OfferedCredentialConfiguration,
): VerifiableCredentialRecord {
  const docType = readMdocDocType(configuration) ?? 'unknown'
  const type = readCredentialType({ vct: docType }, undefined, resolvedOffer)
  const mdocBytes = base64UrlToBytes(rawBase64)
  const claims: Record<string, unknown> = {
    doctype: docType,
    ...extractMdocWalletClaims(mdocBytes),
  }

  return {
    id: hashCredential(rawBase64),
    type,
    rawVc: `mdoc:${rawBase64}`,
    claims,
    issuedAt: new Date().toISOString(),
  }
}

async function persistClaimedCredentialFormats(
  record: VerifiableCredentialRecord,
  resolvedOffer: ResolvedCredentialOffer,
  _dependencies: ClaimCredentialDependencies,
): Promise<void> {
  if (!record.rawVc.startsWith('mdoc:')) return

  const configuration = resolvedOffer.credentialConfigurations[0]
  if (!configuration || !isMsoMdocFormat(configuration.format)) return

  const docType = readMdocDocType(configuration) ?? readString(record.claims.doctype) ?? 'unknown'
  const mdocBytes = base64UrlToBytes(record.rawVc.slice('mdoc:'.length))
  try {
    await storeMdocCredential({ credentialId: record.id, docType }, mdocBytes)
  } catch (error) {
    logWalletError('oid4vci', 'mdoc-native-store-failed', error, {
      credentialId: record.id,
      docType,
    })
    // Keep MMKV record; proximity presentation will fail until native store succeeds on retry/reclaim.
  }
}

function decodeCredentialClaims(rawVc: string): Record<string, unknown> {
  if (isCompactSdJwt(rawVc)) {
    return decodeSdJwtClaims(rawVc)
  }

  return flattenCredentialSubject(decodeJwtPayload(rawVc))
}

export function readCredentialClaimMap(record: VerifiableCredentialRecord): Record<string, unknown> {
  let decoded: Record<string, unknown> = {}
  try {
    decoded = decodeCredentialClaims(record.rawVc)
  } catch {
    return { ...record.claims }
  }

  const merged = { ...decoded, ...record.claims }
  for (const [key, value] of Object.entries(record.claims)) {
    if (stringifyClaim(value).trim().length === 0 && key in decoded) {
      const decodedText = stringifyClaim(decoded[key]).trim()
      if (decodedText.length > 0) {
        merged[key] = decoded[key]
      }
    }
  }

  return merged
}

function isCompactSdJwt(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
}

function assertCredentialIssuerSignatureAlg(rawVc: string): void {
  const issuerJwt = isCompactSdJwt(rawVc) ? rawVc.split('~')[0] : rawVc
  const header = decodeJwtHeader(issuerJwt)
  const alg = readString(header.alg)
  if (alg !== 'EdDSA') {
    throw new Error(`CredentialSignatureAlgUnsupported: issuer credential alg must be EdDSA, got ${alg ?? 'missing'}`)
  }
}

function assertDevelopmentEddsaHolderBinding(rawVc: string, proofJwt: string): void {
  if (!isCompactSdJwt(rawVc)) return

  const proofHeader = readProofJwtHeader(proofJwt)
  const expectedJwk = readRecord(proofHeader?.jwk)
  const expectedKid = readString(proofHeader?.kid)
  if (!expectedJwk && !expectedKid) return

  const issuerJwt = rawVc.split('~')[0] ?? rawVc
  const credentialClaims = decodeJwtPayload(issuerJwt)
  const cnf = readRecord(credentialClaims.cnf)
  const cnfJwk = readRecord(cnf?.jwk)
  const cnfKid = readString(cnf?.kid)
  if (!cnfJwk && !cnfKid) {
    throw new Error('CredentialHolderBindingMissing: Issuer returned SD-JWT credential without cnf.jwk or cnf.kid holder binding')
  }

  if (cnfJwk && expectedJwk && isSameJwk(cnfJwk, expectedJwk)) return
  if (cnfKid && expectedKid && isSameKid(cnfKid, expectedKid)) return

  throw new Error(
    `CredentialHolderBindingMismatch: expected=${formatWalletHolderBindingHint(expectedJwk, expectedKid)}; got=${formatCredentialCnfHint(cnfJwk, cnfKid)}`,
  )
}

function readProofJwtHeader(proofJwt: string): Record<string, unknown> | undefined {
  try {
    return decodeJwtHeader(proofJwt)
  } catch {
    return undefined
  }
}

function decodeSdJwtClaims(compactSdJwt: string): Record<string, unknown> {
  const [issuerJwt, ...segments] = compactSdJwt.split('~')
  const issuerClaims = decodeJwtPayload(issuerJwt)
  const disclosureClaims = decodeSdJwtDisclosureClaims(segments)

  return flattenCredentialSubject({
    ...issuerClaims,
    ...disclosureClaims,
  })
}

function decodeSdJwtDisclosureClaims(segments: string[]): Record<string, unknown> {
  const claims: Record<string, unknown> = {}

  for (const segment of segments) {
    if (!segment || segment.includes('.')) {
      continue
    }

    try {
      const disclosure = JSON.parse(base64UrlDecodeToString(segment)) as unknown

      if (
        Array.isArray(disclosure) &&
        disclosure.length >= 3 &&
        typeof disclosure[1] === 'string'
      ) {
        claims[disclosure[1]] = disclosure[2]
      }
    } catch {
      // Ignore malformed disclosure segments; the signed issuer payload is still retained.
    }
  }

  return claims
}

function flattenCredentialSubject(claims: Record<string, unknown>): Record<string, unknown> {
  const vc = readRecord(claims.vc)
  const credentialSubject = readRecord(claims.credentialSubject) ?? readRecord(vc?.credentialSubject)

  if (!credentialSubject) {
    return claims
  }

  return {
    ...claims,
    ...credentialSubject,
  }
}

function decodeJwtHeader(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')

  if (parts.length < 2 || !parts[0]) {
    throw new Error('CredentialJwtInvalid: JWT header is required')
  }

  try {
    const header = base64UrlDecodeToString(parts[0])
    const parsed = JSON.parse(header) as unknown

    if (!isRecord(parsed)) {
      throw new Error('header is not an object')
    }

    return parsed
  } catch (error) {
    throw new Error(`CredentialJwtInvalid: ${toErrorMessage(error)}`)
  }
}

function readCredentialType(
  claims: Record<string, unknown>,
  vc: Record<string, unknown> | undefined,
  resolvedOffer?: Pick<ResolvedCredentialOffer, 'credentialConfigurations' | 'issuer' | 'issuerDisplay'>,
): string {
  const vcType = readTypeValue(vc?.type)
  if (vcType) return canonicalCredentialType(vcType)

  const sdJwtType = readString(claims.vct)
  if (sdJwtType) return canonicalCredentialType(sdJwtType)

  const claimType = readTypeValue(claims.type)
  if (claimType) return canonicalCredentialType(claimType)

  const offeredType = resolvedOffer?.credentialConfigurations[0]?.id
  if (offeredType) return canonicalCredentialType(offeredType)

  return 'VerifiableCredential'
}

function canonicalCredentialType(type: string): string {
  const normalized = type.toLowerCase()

  if (normalized.includes('transcript')) {
    return 'ChulalongkornUniversityTranscript'
  }

  if (normalized.includes('driving') || normalized.includes('licence') || normalized.includes('license')) {
    return 'DLTDrivingLicence'
  }

  if (normalized.includes('mdl') || normalized.endsWith('.mdl') || normalized.includes('18013.5.1.mdl')) {
    return 'DLTDrivingLicence'
  }

  if (normalized === 'idcard' || normalized.includes('idcard')) return 'ThaiNationalID'

  if (normalized.includes('thai') || normalized.includes('nationalid') || normalized.includes('national_id')) {
    return 'ThaiNationalID'
  }

  return type
}

function readTypeValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string')
    return strings.findLast((item) => item !== 'VerifiableCredential') ?? strings.at(-1)
  }

  return readString(value)
}

function normalizeDate(value: string | number): string {
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString()
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`CredentialJwtInvalid: invalid date ${value}`)
  }

  return date.toISOString()
}

function hashCredential(rawVc: string): string {
  return createHash('sha256').update(rawVc).digest('hex')
}

function storeCredentialRecord(storage: CredentialStorage, record: VerifiableCredentialRecord): void {
  try {
    storage.set(`${CREDENTIAL_KEY_PREFIX}${record.id}`, JSON.stringify(record))

    const existingIndex = storage.getString(CREDENTIAL_INDEX_KEY)
    const parsedIndex = existingIndex ? (JSON.parse(existingIndex) as unknown) : []
    const index = Array.isArray(parsedIndex) ? parsedIndex.filter((item): item is string => typeof item === 'string') : []
    const replacementIds = index.filter((id) => isReplaceableCredentialId(storage, id, record))
    const nextIndex = [
      ...index.filter((id) => id !== record.id && !replacementIds.includes(id)),
      record.id,
    ]

    storage.set(CREDENTIAL_INDEX_KEY, JSON.stringify(nextIndex))
    for (const id of replacementIds) {
      storage.remove?.(`${CREDENTIAL_KEY_PREFIX}${id}`)
      storage.remove?.(`${CREDENTIAL_LIFECYCLE_KEY_PREFIX}${id}`)
      storage.remove?.(`${CREDENTIAL_SUSPENSION_KEY_PREFIX}${id}`)
      storage.remove?.(`${CREDENTIAL_RENEWAL_KEY_PREFIX}${id}`)
    }
    storage.remove?.(`${CREDENTIAL_LIFECYCLE_KEY_PREFIX}${record.id}`)
    storage.remove?.(`${CREDENTIAL_SUSPENSION_KEY_PREFIX}${record.id}`)
    storage.remove?.(`${CREDENTIAL_RENEWAL_KEY_PREFIX}${record.id}`)
    notifyCredentialsChanged()
  } catch (error) {
    throw new Error(`CredentialStorageFailed: ${toErrorMessage(error)}`)
  }
}

function isCredentialWithdrawnInStorage(
  storage: CredentialStorage,
  credentialId: string,
): boolean {
  const lifecycleRaw = storage.getString(`${CREDENTIAL_LIFECYCLE_KEY_PREFIX}${credentialId}`)
  if (lifecycleRaw) {
    try {
      const lifecycle = JSON.parse(lifecycleRaw) as { status?: string }
      if (lifecycle.status === 'revoked' || lifecycle.status === 'deleted') {
        return true
      }
    } catch {
      // ignore malformed lifecycle records
    }
  }

  return Boolean(storage.getString(`${CREDENTIAL_SUSPENSION_KEY_PREFIX}${credentialId}`))
}

function isReplaceableCredentialId(
  storage: CredentialStorage,
  credentialId: string,
  replacement: VerifiableCredentialRecord,
): boolean {
  if (credentialId === replacement.id) return false

  const existingRaw = storage.getString(`${CREDENTIAL_KEY_PREFIX}${credentialId}`)
  if (!existingRaw) return false

  try {
    const existing = JSON.parse(existingRaw) as Partial<VerifiableCredentialRecord>
    if (existing.type !== replacement.type) return false

    const existingHolderDid = readCredentialHolderDid(existing as VerifiableCredentialRecord)
    const replacementHolderDid = readCredentialHolderDid(replacement)

    if (isCredentialWithdrawnInStorage(storage, credentialId)) {
      return true
    }

    if (!existingHolderDid || !replacementHolderDid) {
      return false
    }

    return existingHolderDid === replacementHolderDid
  } catch {
    return false
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function describeUriForLog(uri: string): Record<string, unknown> {
  try {
    const parsed = new URL(uri)
    return {
      scheme: parsed.protocol.replace(':', ''),
      host: parsed.host || undefined,
      path: parsed.pathname || undefined,
      queryKeys: Array.from(parsed.searchParams.keys()),
      uriBytes: uri.length,
    }
  } catch {
    return {
      scheme: uri.split(':')[0] || 'unknown',
      uriBytes: uri.length,
    }
  }
}
