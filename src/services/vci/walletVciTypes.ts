/** Wallet-owned OID4VCI types. */

export type TxCode = {
  input_mode?: 'numeric' | 'text'
  length?: number
  description?: string
}

export type CredentialDisplayMetadata = {
  name?: string
  locale?: string
  description?: string
  logo?: { uri?: string; alt_text?: string }
  background_color?: string
  text_color?: string
}

export type CredentialConfigurationSupported = {
  format: string
  vct?: string
  doctype?: string
  scope?: string
  display?: CredentialDisplayMetadata[]
  credential_metadata?: Record<string, unknown>
  claims?: unknown
  credential_definition?: { type?: string[] }
  cryptographic_binding_methods_supported?: string[]
  [key: string]: unknown
}

export type IssuerMetadataV1_0_15 = {
  credential_issuer: string
  credential_endpoint: string
  token_endpoint?: string
  authorization_servers?: string[]
  deferred_credential_endpoint?: string
  credential_configurations_supported: Record<string, CredentialConfigurationSupported>
  display?: CredentialDisplayMetadata[]
  [key: string]: unknown
}

export type CredentialOfferGrants = {
  authorization_code?: Record<string, unknown>
  'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
    'pre-authorized_code'?: string
    tx_code?: TxCode
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type CredentialOfferRequestWithBaseUrl = {
  credential_offer: {
    credential_issuer: string
    credential_configuration_ids?: string[]
    grants?: CredentialOfferGrants
  }
  preAuthorizedCode?: string
  txCode?: TxCode
  supportedFlows: string[]
  version: number
  baseUrl?: string
}

/** @deprecated Phase 3 — wallet uses @openid4vc only; retained for compatibility casts. */
export type CredentialConfigurationSupportedV1_0_15 = CredentialConfigurationSupported

export type MetadataDisplay = CredentialDisplayMetadata
export type CredentialsSupportedDisplay = CredentialDisplayMetadata
