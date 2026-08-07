import type { CredentialOfferObject, IssuerMetadataResult } from '@openid4vc/openid4vci'

export type VciProtocolPath = 'oid4vc'

/** Alias for wallet resolved-offer routing. */
export type ProtocolPath = VciProtocolPath

export type Oid4vcAuthorizationCodeExchangeInput = {
  authorizationCode: string
  codeVerifier: string
  redirectUri: string
  clientId: string
  tokenEndpoint?: string
}

export type Oid4vcVciAdapterContext = {
  credentialOfferObject: CredentialOfferObject
  issuerMetadataResult: IssuerMetadataResult
}
