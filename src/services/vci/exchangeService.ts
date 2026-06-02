import { CredentialOfferClient } from '@sphereon/oid4vci-client'
import type {
  CredentialConfigurationSupportedV1_0_15,
  CredentialOfferRequestWithBaseUrl,
  CredentialsSupportedDisplay,
  IssuerMetadataV1_0_15,
  MetadataDisplay,
  TxCode,
} from '@sphereon/oid4vci-common'

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
  const configurationIds = offeredIds?.length ? offeredIds : Object.keys(issuerMetadata.credential_configurations_supported)

  return configurationIds.map((id) => {
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
