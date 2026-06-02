import {
  CredentialOfferClient,
  CredentialRequestClientBuilder,
  OpenID4VCIClient,
} from '@sphereon/oid4vci-client'
import { createHash } from 'react-native-quick-crypto'
import type {
  CredentialConfigurationSupportedV1_0_15,
  CredentialOfferRequestWithBaseUrl,
  CredentialsSupportedDisplay,
  IssuerMetadataV1_0_15,
  MetadataDisplay,
  OID4VCICredentialFormat,
  TxCode,
} from '@sphereon/oid4vci-common'

import {
  signProof as defaultSignProof,
  getHolderDid,
} from '../crypto/crypto'
import {
  importCredential as defaultImportCredential,
} from '../../sdk/walletApi'
import { getCredentialStorage as getDefaultCredentialStorage } from '../storage/storage'

const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'

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
}

export type SignProof = (cNonce: string, issuerUrl: string) => Promise<string>

export type AcquireAccessTokenInput = {
  resolvedOffer: ResolvedCredentialOffer
  tx_code?: string
}

export type AcquireAccessTokenResult = {
  accessToken: string
  cNonce: string
}

export type RequestCredentialInput = {
  resolvedOffer: ResolvedCredentialOffer
  accessToken: string
  proof: string
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
  const credentialOffer = await parseCredentialOffer(offerUri)
  const issuer = readCredentialIssuer(credentialOffer)
  const issuerMetadata = await (options.fetchIssuerMetadata ?? fetchIssuerMetadata)(issuer)

  assertIssuerMetadata(issuer, issuerMetadata)

  return {
    offerUri,
    issuer,
    credentialOffer,
    issuerMetadata,
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
  if (resolvedOffer.txCode && !options.tx_code) {
    throw new Error('TransactionCodeRequired: tx_code is required')
  }

  if (!resolvedOffer.preAuthorizedCode) {
    throw new Error('CredentialFlowUnsupported: Pre-Authorized Code flow is required')
  }

  assertJwtCredentialFormat(resolvedOffer)

  const dependencies = {
    ...createDefaultClaimCredentialDependencies(),
    ...options.dependencies,
  }

  const token = await dependencies.acquireAccessToken({ resolvedOffer, tx_code: options.tx_code })
  const proof = await dependencies.signProof(token.cNonce, resolvedOffer.issuer)
  const rawVc = await dependencies.requestCredential({ resolvedOffer, accessToken: token.accessToken, proof })
  const record = normalizeCredentialRecord(rawVc)
  storeCredentialRecord(dependencies.getCredentialStorage(), record)

  return record
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
    const rawConfiguration = issuerMetadata.credential_configurations_supported[id]

    if (!rawConfiguration) {
      throw new Error(`CredentialConfigurationNotSupported: ${id}`)
    }

    return {
      id,
      format: rawConfiguration.format,
      display: toCredentialDisplay(rawConfiguration.display),
      rawConfiguration,
    }
  })
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

function normalizeCredentialRecord(rawVc: string): VerifiableCredentialRecord {
  const claims = decodeJwtPayload(rawVc)
  const vc = readRecord(claims.vc)
  const id = readString(claims.jti) ?? readString(vc?.id) ?? readString(claims.id) ?? hashCredential(rawVc)
  const issuedAt = normalizeDate(readString(vc?.issuanceDate) ?? readNumber(claims.iat) ?? readNumber(claims.nbf) ?? Date.now() / 1000)
  const expiresAtSource = readString(vc?.expirationDate) ?? readNumber(claims.exp)
  const expiresAt = expiresAtSource === undefined ? undefined : normalizeDate(expiresAtSource)

  return {
    id,
    type: readCredentialType(claims, vc),
    rawVc,
    claims,
    issuedAt,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

function createDefaultClaimCredentialDependencies(): ClaimCredentialDependencies {
  let client: OpenID4VCIClient | undefined

  async function getClient(resolvedOffer: ResolvedCredentialOffer): Promise<OpenID4VCIClient> {
    if (!client) {
      client = await OpenID4VCIClient.fromURI({
        uri: resolvedOffer.offerUri,
        resolveOfferUri: true,
        retrieveServerMetadata: true,
      })
    }

    return client
  }

  return {
    acquireAccessToken: async ({ resolvedOffer, tx_code }) => {
      try {
        const oid4vciClient = await getClient(resolvedOffer)
        const response = await oid4vciClient.acquireAccessToken({ pin: tx_code })

        if (!response.access_token || !response.c_nonce) {
          throw new Error('access_token and c_nonce are required')
        }

        return {
          accessToken: response.access_token,
          cNonce: response.c_nonce,
        }
      } catch (error) {
        throw new Error(`CredentialTokenExchangeFailed: ${toErrorMessage(error)}`)
      }
    },
    requestCredential: async ({ resolvedOffer, accessToken, proof }) => {
      try {
        const credentialConfiguration = resolvedOffer.credentialConfigurations[0]

        if (!credentialConfiguration || !isJwtVcFormat(credentialConfiguration.format)) {
          throw new Error('CredentialFormatUnsupported: JWT VC response is required')
        }

        const credentialClient = CredentialRequestClientBuilder.fromCredentialOffer({
          credentialOffer: resolvedOffer.credentialOffer,
        })
          .withCredentialEndpoint(resolvedOffer.issuerMetadata.credential_endpoint)
          .withToken(accessToken)
          .build()
        const response = await credentialClient.acquireCredentialsUsingProof({
          proofInput: { proof_type: 'jwt', jwt: proof },
          format: credentialConfiguration.format as OID4VCICredentialFormat,
        })
        const credential = response.successBody?.credentials?.[0]?.credential

        if (typeof credential !== 'string') {
          throw new Error('CredentialFormatUnsupported: JWT VC response is required')
        }

        return credential
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('CredentialFormatUnsupported')) {
          throw error
        }

        throw new Error(`CredentialRequestFailed: ${toErrorMessage(error)}`)
      }
    },
    signProof: defaultSignProof,
    getCredentialStorage: getDefaultCredentialStorage,
  }
}

function isJwtVcFormat(format: string): boolean {
  return format === 'jwt_vc_json' || format === 'jwt_vc'
}

function assertJwtCredentialFormat(resolvedOffer: ResolvedCredentialOffer): void {
  const unsupportedConfiguration = resolvedOffer.credentialConfigurations.find(
    (configuration) => !isJwtVcFormat(configuration.format),
  )

  if (unsupportedConfiguration) {
    throw new Error('CredentialFormatUnsupported: JWT VC response is required')
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

function readCredentialType(claims: Record<string, unknown>, vc: Record<string, unknown> | undefined): string {
  const vcType = readTypeValue(vc?.type)
  if (vcType) return vcType

  return readTypeValue(claims.type) ?? 'VerifiableCredential'
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
    const nextIndex = index.includes(record.id) ? index : [...index, record.id]

    storage.set(CREDENTIAL_INDEX_KEY, JSON.stringify(nextIndex))
  } catch (error) {
    throw new Error(`CredentialStorageFailed: ${toErrorMessage(error)}`)
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
