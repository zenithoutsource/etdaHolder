import {
  CredentialOfferClient,
  CredentialRequestClientBuilder,
} from '@sphereon/oid4vci-client'
import { createHash } from 'react-native-quick-crypto'
import type {
  CredentialConfigurationSupportedV1_0_15,
  CredentialOfferRequestWithBaseUrl,
  CredentialsSupportedDisplay,
  IssuerMetadataV1_0_15,
  MetadataDisplay,
  OID4VCICredentialFormat,
  OpenId4VCIVersion,
  TxCode,
} from '@sphereon/oid4vci-common'

import {
  signProof as defaultSignProof,
  getHolderDid,
} from '../crypto/crypto'
import {
  importCredential as defaultImportCredential,
} from '../../sdk/walletApi'
import { resolveDevIssuerProxyUrl } from '../../sdk/installWalletApiFetch'
import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'

const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'
const CREDENTIAL_LIFECYCLE_KEY_PREFIX = 'credential:lifecycle:'
const PRE_AUTHORIZED_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const PRE_AUTHORIZED_CODE_KEY = 'pre-authorized_code'

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
}

export type ResolveOfferOptions = {
  fetchIssuerMetadata?: FetchIssuerMetadata
}

export type VerifiableCredentialRecord = {
  id: string
  type: string
  rawVc: string
  claims: Record<string, unknown>
  issuedAt: string
  expiresAt?: string
}

export type CredentialStorage = {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
  remove?: (key: string) => boolean
}

export type SignProof = (cNonce: string, issuerUrl: string) => Promise<string>

export type AcquireAccessTokenInput = {
  resolvedOffer: ResolvedCredentialOffer
  tx_code?: string
}

export type AcquireAccessTokenResult = {
  accessToken: string
  cNonce: string
  credentialIdentifier?: string
}

export type RequestCredentialInput = {
  resolvedOffer: ResolvedCredentialOffer
  accessToken: string
  proof: string
  credentialIdentifier?: string
}

export type ClaimCredentialDependencies = {
  acquireAccessToken: (input: AcquireAccessTokenInput) => Promise<AcquireAccessTokenResult>
  requestCredential: (input: RequestCredentialInput) => Promise<string>
  signProof: SignProof
  getCredentialStorage: () => CredentialStorage
}

export type ClaimCredentialOptions = {
  tx_code?: string
  dependencies?: Partial<ClaimCredentialDependencies>
}

export type AcquireCredentialRecordOptions = ClaimCredentialOptions

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
}

export type SyncCredentialToBackendOptions = {
  walletId: string
  sessionToken: string
  dependencies?: Partial<SyncCredentialToBackendDependencies>
}

export async function resolveOffer(offerUri: string, options: ResolveOfferOptions = {}): Promise<ResolvedCredentialOffer> {
  const resolvedOfferUri = await resolveCredentialOfferUriForTransport(offerUri)
  const credentialOffer = await parseCredentialOffer(resolvedOfferUri)
  const issuer = readCredentialIssuer(credentialOffer)
  const issuerMetadata = await (options.fetchIssuerMetadata ?? fetchIssuerMetadata)(issuer)

  assertIssuerMetadata(issuer, issuerMetadata)
  const transportIssuerMetadata = rewriteIssuerMetadataForTransport(issuerMetadata)

  return {
    offerUri: resolvedOfferUri,
    issuer,
    credentialOffer,
    issuerMetadata: transportIssuerMetadata,
    issuerDisplay: toCredentialDisplay(issuerMetadata.display),
    credentialConfigurations: resolveCredentialConfigurations(credentialOffer, issuerMetadata),
    preAuthorizedCode: credentialOffer.preAuthorizedCode,
    txCode: credentialOffer.txCode,
    supportedFlows: credentialOffer.supportedFlows.map(String),
    version: credentialOffer.version,
  }
}

export async function fetchIssuerMetadata(issuer: string): Promise<IssuerMetadataV1_0_15> {
  const metadataUrl = getIssuerMetadataUrl(issuer)

  let response: Response
  try {
    response = await fetch(metadataUrl, {
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (error) {
    throw new Error(`IssuerMetadataFetchFailed: ${toErrorMessage(error)}`)
  }

  if (!response.ok) {
    throw new Error(`IssuerMetadataFetchFailed: HTTP ${response.status}`)
  }

  try {
    return (await response.json()) as IssuerMetadataV1_0_15
  } catch (error) {
    throw new Error(`IssuerMetadataParseFailed: ${toErrorMessage(error)}`)
  }
}

export async function claimCredential(
  resolvedOffer: ResolvedCredentialOffer,
  options: ClaimCredentialOptions = {},
): Promise<VerifiableCredentialRecord> {
  const dependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }
  const record = await acquireCredentialRecord(resolvedOffer, { ...options, dependencies })
  saveCredentialRecord(record, { getCredentialStorage: dependencies.getCredentialStorage })

  return record
}

export async function acquireCredentialRecord(
  resolvedOffer: ResolvedCredentialOffer,
  options: AcquireCredentialRecordOptions = {},
): Promise<VerifiableCredentialRecord> {
  if (resolvedOffer.txCode && !options.tx_code) {
    throw new Error('TransactionCodeRequired: tx_code is required')
  }

  if (!resolvedOffer.preAuthorizedCode) {
    throw new Error('CredentialFlowUnsupported: Pre-Authorized Code flow is required')
  }

  assertSupportedCredentialFormat(resolvedOffer)

  const dependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }

  const token = await dependencies.acquireAccessToken({ resolvedOffer, tx_code: options.tx_code })
  let proof = await dependencies.signProof(token.cNonce, resolvedOffer.issuer)
  let rawVc: string
  try {
    rawVc = await dependencies.requestCredential({
      resolvedOffer,
      accessToken: token.accessToken,
      proof,
      credentialIdentifier: token.credentialIdentifier,
    })
  } catch (error) {
    if (!(error instanceof InvalidProofError)) throw error

    proof = await dependencies.signProof(error.cNonce, resolvedOffer.issuer)
    rawVc = await dependencies.requestCredential({
      resolvedOffer,
      accessToken: token.accessToken,
      proof,
      credentialIdentifier: token.credentialIdentifier,
    })
  }
  assertDevelopmentEddsaHolderBinding(rawVc, proof)
  return normalizeCredentialRecord(rawVc, resolvedOffer)
}

export function saveCredentialRecord(
  record: VerifiableCredentialRecord,
  dependencies: Pick<ClaimCredentialDependencies, 'getCredentialStorage'> = {
    getCredentialStorage: getDefaultCredentialStorage,
  },
): void {
  storeCredentialRecord(dependencies.getCredentialStorage(), record)
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

  let response: Awaited<ReturnType<ImportCredentialToBackend>>
  try {
    response = await dependencies.importCredential(
      options.walletId,
      {
        jwt: record.rawVc,
        associated_did: dependencies.getHolderDid(),
      },
      {
        headers: {
          Authorization: `Bearer ${options.sessionToken}`,
        },
      },
    )
  } catch (error) {
    throw new Error(`BackendSyncFailed: ${toErrorMessage(error)}`)
  }

  if (response.status !== 201) {
    throw new Error(`BackendSyncFailed: HTTP ${response.status}`)
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

async function parseCredentialOffer(offerUri: string): Promise<CredentialOfferRequestWithBaseUrl> {
  try {
    return await CredentialOfferClient.fromURI(offerUri, { resolve: true })
  } catch (error) {
    throw new Error(`CredentialOfferParseFailed: ${toErrorMessage(error)}`)
  }
}

async function resolveCredentialOfferUriForTransport(offerUri: string): Promise<string> {
  const credentialOfferUri = readCredentialOfferUriParameter(offerUri)
  if (!credentialOfferUri) return offerUri

  const rewrittenOfferUri = resolveDevIssuerProxyUrl(credentialOfferUri)
  let response: Response
  try {
    response = await fetch(rewrittenOfferUri, {
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

function rewriteIssuerMetadataForTransport(metadata: IssuerMetadataV1_0_15): IssuerMetadataV1_0_15 {
  return {
    ...metadata,
    ...(metadata.token_endpoint ? { token_endpoint: resolveDevIssuerProxyUrl(metadata.token_endpoint) as string } : {}),
    credential_endpoint: resolveDevIssuerProxyUrl(metadata.credential_endpoint) as string,
    ...(metadata.deferred_credential_endpoint
      ? { deferred_credential_endpoint: resolveDevIssuerProxyUrl(metadata.deferred_credential_endpoint) as string }
      : {}),
  }
}

function readCredentialIssuer(credentialOffer: CredentialOfferRequestWithBaseUrl): string {
  const issuer = credentialOffer.credential_offer?.credential_issuer

  if (typeof issuer !== 'string' || issuer.length === 0) {
    throw new Error('CredentialOfferIssuerMissing: credential_offer.credential_issuer is required')
  }

  return issuer
}

function assertIssuerMetadata(issuer: string, metadata: IssuerMetadataV1_0_15): void {
  if (metadata.credential_issuer !== issuer) {
    throw new Error('IssuerMetadataMismatch: credential_issuer does not match the credential offer issuer')
  }

  if (typeof metadata.credential_endpoint !== 'string' || metadata.credential_endpoint.length === 0) {
    throw new Error('IssuerMetadataInvalid: credential_endpoint is required')
  }

  if (!metadata.credential_configurations_supported || typeof metadata.credential_configurations_supported !== 'object') {
    throw new Error('IssuerMetadataInvalid: credential_configurations_supported is required')
  }
}

function resolveCredentialConfigurations(
  credentialOffer: CredentialOfferRequestWithBaseUrl,
  issuerMetadata: IssuerMetadataV1_0_15,
): OfferedCredentialConfiguration[] {
  const offeredIds = credentialOffer.credential_offer?.credential_configuration_ids

  if (!offeredIds?.length) {
    throw new Error('CredentialOfferInvalid: credential_configuration_ids is required')
  }

  return offeredIds.map((id) => {
    const matchedConfiguration = findCredentialConfiguration(id, issuerMetadata.credential_configurations_supported)

    if (!matchedConfiguration) {
      throw new Error(`CredentialConfigurationNotSupported: ${id}`)
    }

    return {
      id,
      requestId: matchedConfiguration.id,
      format: matchedConfiguration.rawConfiguration.format,
      display: toCredentialDisplay(matchedConfiguration.rawConfiguration.display),
      rawConfiguration: matchedConfiguration.rawConfiguration,
    }
  })
}

type MatchedCredentialConfiguration = {
  id: string
  rawConfiguration: CredentialConfigurationSupportedV1_0_15
}

function findCredentialConfiguration(
  id: string,
  supported: Record<string, CredentialConfigurationSupportedV1_0_15>,
): MatchedCredentialConfiguration | undefined {
  const direct = supported[id]
  if (direct) return { id, rawConfiguration: direct }

  const normalizedId = normalizeCredentialConfigurationId(id)
  const matchedKey = Object.keys(supported).find((key) => normalizeCredentialConfigurationId(key) === normalizedId)
  if (matchedKey) return { id: matchedKey, rawConfiguration: supported[matchedKey] }

  const baseId = stripCredentialConfigurationFormatSuffix(normalizedId)
  const baseMatchedKey = Object.keys(supported).find((key) => normalizeCredentialConfigurationId(key) === baseId)
  if (baseMatchedKey) return { id: baseMatchedKey, rawConfiguration: supported[baseMatchedKey] }

  const containedBaseMatchedKey = Object.keys(supported).find((key) => {
    const supportedBaseId = stripCredentialConfigurationFormatSuffix(normalizeCredentialConfigurationId(key))
    return supportedBaseId.includes(baseId) || baseId.includes(supportedBaseId)
  })
  if (containedBaseMatchedKey) return { id: containedBaseMatchedKey, rawConfiguration: supported[containedBaseMatchedKey] }

  const offeredFormat = readCredentialConfigurationFormatSuffix(normalizedId)
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

  return undefined
}

function normalizeCredentialConfigurationId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function stripCredentialConfigurationFormatSuffix(normalizedId: string): string {
  return normalizedId
    .replace(/dcsdjwt$/, '')
    .replace(/vcsdjwt$/, '')
    .replace(/jwtvcjson$/, '')
    .replace(/jwtvc$/, '')
}

function readCredentialConfigurationFormatSuffix(normalizedId: string): string | undefined {
  if (normalizedId.endsWith('dcsdjwt')) return 'dc+sd-jwt'
  if (normalizedId.endsWith('vcsdjwt')) return 'vc+sd-jwt'
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
  return !offeredFormat || configuration.format === offeredFormat
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

function readCredentialIdentifierFromTokenResponse(
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
  resolvedOffer?: Pick<ResolvedCredentialOffer, 'credentialConfigurations'>,
): VerifiableCredentialRecord {
  const claims = decodeCredentialClaims(rawVc)
  const vc = readRecord(claims.vc)
  const id = readString(claims.jti) ?? readString(vc?.id) ?? readString(claims.id) ?? hashCredential(rawVc)
  const issuedAt = normalizeDate(readString(vc?.issuanceDate) ?? readNumber(claims.iat) ?? readNumber(claims.nbf) ?? Date.now() / 1000)
  const expiresAtSource = readString(vc?.expirationDate) ?? readNumber(claims.exp)
  const expiresAt = expiresAtSource === undefined ? undefined : normalizeDate(expiresAtSource)

  return {
    id,
    type: readCredentialType(claims, vc, resolvedOffer),
    rawVc,
    claims,
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

function createDefaultClaimCredentialDependencies(): ClaimCredentialDependencies {
  return {
    acquireAccessToken: async ({ resolvedOffer, tx_code }) => {
      try {
        const response = await requestPreAuthorizedAccessToken(resolvedOffer, tx_code)

        const accessToken = readString(response.access_token)
        const cNonce = readString(response.c_nonce)
        if (!accessToken || !cNonce) {
          throw new Error('access_token and c_nonce are required')
        }

        return {
          accessToken,
          cNonce,
          credentialIdentifier: readCredentialIdentifierFromTokenResponse(response, resolvedOffer.credentialConfigurations[0]),
        }
      } catch (error) {
        throw new Error(`CredentialTokenExchangeFailed: ${toErrorMessage(error)}`)
      }
    },
    requestCredential: async ({ resolvedOffer, accessToken, proof, credentialIdentifier }) => {
      try {
        const credentialConfiguration = resolvedOffer.credentialConfigurations[0]

        if (!credentialConfiguration || !isSupportedCredentialFormat(credentialConfiguration.format)) {
          throw new Error('CredentialFormatUnsupported: JWT VC or SD-JWT VC response is required')
        }

        const credentialClientBuilder = CredentialRequestClientBuilder.fromCredentialIssuer({
          credentialIssuer: resolvedOffer.issuer,
          version: resolvedOffer.version as OpenId4VCIVersion,
          ...(credentialIdentifier
            ? { credentialIdentifier }
            : { credentialConfigurationId: credentialConfiguration.requestId }),
        })
          .withCredentialEndpoint(resolvedOffer.issuerMetadata.credential_endpoint)
          .withToken(accessToken)
        const credentialClient = credentialClientBuilder.build()
        const credentialRequest = await credentialClient.createCredentialRequest({
          proofInput: { proof_type: 'jwt', jwt: proof },
          format: credentialConfiguration.format as OID4VCICredentialFormat,
          ...(credentialIdentifier
            ? { credentialIdentifier }
            : { credentialConfigurationId: credentialConfiguration.requestId }),
          version: resolvedOffer.version as OpenId4VCIVersion,
        })
        const response = await credentialClient.acquireCredentialsUsingRequest(
          credentialRequest,
          credentialConfiguration.format as OID4VCICredentialFormat,
        )
        assertCredentialEndpointSuccess(response)
        return readCompactCredentialFromResponse(response)
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith('CredentialFormatUnsupported') ||
            error.message.startsWith('CredentialResponseUnsupported') ||
            error.message.startsWith('CredentialRequestFailed'))
        ) {
          throw error
        }

        throw new Error(`CredentialRequestFailed: ${toErrorMessage(error)}`)
      }
    },
    signProof: defaultSignProof,
    getCredentialStorage: getDefaultCredentialStorage,
  }
}

async function requestPreAuthorizedAccessToken(
  resolvedOffer: ResolvedCredentialOffer,
  txCode?: string,
): Promise<Record<string, unknown>> {
  const tokenEndpoint = readString(readRecord(resolvedOffer.issuerMetadata)?.token_endpoint)
    ?? await discoverAuthorizationServerTokenEndpoint(resolvedOffer.issuerMetadata)
    ?? `${resolvedOffer.issuer.replace(/\/$/, '')}/token`
  const body = new URLSearchParams()
  body.set('grant_type', PRE_AUTHORIZED_CODE_GRANT)
  body.set(PRE_AUTHORIZED_CODE_KEY, resolvedOffer.preAuthorizedCode ?? '')
  if (txCode) {
    body.set('tx_code', txCode)
    body.set('user_pin', txCode)
  }

  const response = await fetch(resolveDevIssuerProxyUrl(tokenEndpoint), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  const responseBody = await readJsonResponseBody(response)

  if (!response.ok) {
    const error = readString(responseBody.error)
    const description = readString(responseBody.error_description)
    throw new Error(description ? `${error ?? 'token_error'} - ${description}` : error ?? `HTTP ${response.status}`)
  }

  return responseBody
}

const AUTHORIZATION_SERVER_METADATA_PATHS = ['.well-known/oauth-authorization-server', '.well-known/openid-configuration']

async function discoverAuthorizationServerTokenEndpoint(
  issuerMetadata: IssuerMetadataV1_0_15,
): Promise<string | undefined> {
  const authorizationServers = readRecord(issuerMetadata)?.authorization_servers
  if (!Array.isArray(authorizationServers)) return undefined

  for (const server of authorizationServers) {
    const baseUrl = readString(server)
    if (!baseUrl) continue

    for (const wellKnownPath of AUTHORIZATION_SERVER_METADATA_PATHS) {
      const metadataUrl = `${baseUrl.replace(/\/$/, '')}/${wellKnownPath}`

      try {
        const response = await fetch(resolveDevIssuerProxyUrl(metadataUrl), { headers: { Accept: 'application/json' } })
        if (!response.ok) continue

        const metadata = await readJsonResponseBody(response)
        const tokenEndpoint = readString(metadata.token_endpoint)
        if (tokenEndpoint) return resolveDevIssuerProxyUrl(tokenEndpoint) as string
      } catch {
        continue
      }
    }
  }

  return undefined
}

async function readJsonResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown
    return readRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

export class InvalidProofError extends Error {
  constructor(message: string, public readonly cNonce: string) {
    super(message)
    this.name = 'InvalidProofError'
  }
}

function assertCredentialEndpointSuccess(response: unknown): void {
  const responseRecord = readRecord(response)
  const errorBody = readRecord(responseRecord?.errorBody)
  if (!errorBody) return

  const error = readString(errorBody.error)
  const description = readString(errorBody.error_description)
  const status = readNumber(readRecord(responseRecord?.origResponse)?.status)
  const statusMessage = status ? `HTTP ${status}: ` : ''
  const message = `CredentialRequestFailed: ${statusMessage}${
    error ? (description ? `${error} - ${description}` : error) : describeCredentialEndpointError(errorBody)
  }`

  if (error === 'invalid_proof') {
    const freshCNonce = readString(errorBody.c_nonce)
    if (freshCNonce) {
      throw new InvalidProofError(message, freshCNonce)
    }
  }

  throw new Error(message)
}

function describeCredentialEndpointError(errorBody: Record<string, unknown>): string {
  const compact = safeJsonStringify(errorBody)
  return compact ? `unknown_error ${compact}` : 'unknown_error'
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

export function readCompactCredentialFromResponse(response: unknown): string {
  const body = readCredentialResponseBody(response)
  const credential = readCompactCredentialValue(body)

  if (credential) return credential

  throw new Error(`CredentialResponseUnsupported: compact credential response is required (${describeCredentialResponseShape(body)})`)
}

function readCredentialResponseBody(response: unknown): Record<string, unknown> | undefined {
  const responseRecord = readRecord(response)
  return readRecord(responseRecord?.successBody) ?? responseRecord
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

function describeCredentialResponseShape(successBody: Record<string, unknown> | undefined): string {
  if (!successBody) {
    return 'missing successBody'
  }

  const keys = Object.keys(successBody)
  if (keys.length === 0) {
    return 'empty successBody'
  }

  const credentials = successBody.credentials
  const credentialsShape = Array.isArray(credentials)
    ? `credentials[${credentials.map((item) => typeof item).join(',')}]`
    : `credentials:${typeof credentials}`

  return `keys:${keys.join(',')}; ${credentialsShape}; credential:${typeof successBody.credential}`
}

function isJwtVcFormat(format: string): boolean {
  return format === 'jwt_vc_json' || format === 'jwt_vc'
}

function isSdJwtVcFormat(format: string): boolean {
  return format === 'dc+sd-jwt' || format === 'vc+sd-jwt'
}

function isSupportedCredentialFormat(format: string): boolean {
  return isJwtVcFormat(format) || isSdJwtVcFormat(format)
}

function assertSupportedCredentialFormat(resolvedOffer: ResolvedCredentialOffer): void {
  const unsupportedConfiguration = resolvedOffer.credentialConfigurations.find(
    (configuration) => !isSupportedCredentialFormat(configuration.format),
  )

  if (unsupportedConfiguration) {
    throw new Error('CredentialFormatUnsupported: JWT VC or SD-JWT VC response is required')
  }
}

function decodeCredentialClaims(rawVc: string): Record<string, unknown> {
  if (isCompactSdJwt(rawVc)) {
    return decodeSdJwtClaims(rawVc)
  }

  return flattenCredentialSubject(decodeJwtPayload(rawVc))
}

function isCompactSdJwt(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
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

  throw new Error('CredentialHolderBindingMismatch: Issuer returned SD-JWT credential bound to a different holder key')
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

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')

  if (parts.length < 2 || !parts[1]) {
    throw new Error('CredentialJwtInvalid: JWT payload is required')
  }

  try {
    const payload = base64UrlDecodeToString(parts[1])
    const parsed = JSON.parse(payload) as unknown

    if (!isRecord(parsed)) {
      throw new Error('payload is not an object')
    }

    return parsed
  } catch (error) {
    throw new Error(`CredentialJwtInvalid: ${toErrorMessage(error)}`)
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

function isSameJwk(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return (
    actual.kty === expected.kty &&
    actual.crv === expected.crv &&
    actual.x === expected.x &&
    (expected.y ? actual.y === expected.y : !actual.y)
  )
}

function isSameKid(actual: string, expected: string): boolean {
  const expectedDid = expected.split('#')[0]
  return actual === expected || actual === expectedDid
}

function base64UrlDecodeToString(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new TextDecoder().decode(bytes)
}

function readCredentialType(
  claims: Record<string, unknown>,
  vc: Record<string, unknown> | undefined,
  resolvedOffer?: Pick<ResolvedCredentialOffer, 'credentialConfigurations'>,
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
    return 'BangkokUniversityTranscript'
  }

  if (normalized.includes('driving') || normalized.includes('licence') || normalized.includes('license')) {
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
    }
    storage.remove?.(`${CREDENTIAL_LIFECYCLE_KEY_PREFIX}${record.id}`)
  } catch (error) {
    throw new Error(`CredentialStorageFailed: ${toErrorMessage(error)}`)
  }
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
    return existing.type === replacement.type
  } catch {
    return false
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
