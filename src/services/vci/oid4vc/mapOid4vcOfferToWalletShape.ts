import type {
  CredentialOfferObject,
  IssuerMetadataResult,
} from '@openid4vc/openid4vci'

import type {
  CredentialOfferRequestWithBaseUrl,
  IssuerMetadataV1_0_15,
  TxCode,
} from '../walletVciTypes'
import { isRecord, readString } from '@/src/utils/jwtUtils'

const PRE_AUTHORIZED_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const AUTHORIZATION_CODE_GRANT = 'authorization_code'

export function mapCredentialOfferObjectToWalletOffer(
  offerUri: string,
  offer: CredentialOfferObject,
): CredentialOfferRequestWithBaseUrl {
  const supportedFlows: string[] = []
  const grants = offer.grants

  if (isRecord(grants?.[PRE_AUTHORIZED_CODE_GRANT])) {
    supportedFlows.push(PRE_AUTHORIZED_CODE_GRANT)
  }
  if (isRecord(grants?.authorization_code)) {
    supportedFlows.push(AUTHORIZATION_CODE_GRANT)
  }

  const preAuthGrant = isRecord(grants?.[PRE_AUTHORIZED_CODE_GRANT])
    ? grants[PRE_AUTHORIZED_CODE_GRANT]
    : undefined

  return {
    credential_offer: {
      credential_issuer: String(offer.credential_issuer),
      credential_configuration_ids: [...offer.credential_configuration_ids],
      grants: grants as CredentialOfferRequestWithBaseUrl['credential_offer']['grants'],
    },
    preAuthorizedCode: readString(preAuthGrant?.['pre-authorized_code']),
    txCode: preAuthGrant?.tx_code as TxCode | undefined,
    supportedFlows,
    version: 1,
    baseUrl: offerUri.split('?')[0] ?? 'openid-credential-offer://',
  }
}

export function mapIssuerMetadataResultToWalletMetadata(
  issuer: string,
  metadata: IssuerMetadataResult,
): IssuerMetadataV1_0_15 {
  const mapped = {
    ...(metadata as unknown as IssuerMetadataV1_0_15),
    credential_issuer: issuer.replace(/\/$/, ''),
  }

  if (typeof mapped.credential_issuer !== 'string' || mapped.credential_issuer.length === 0) {
    mapped.credential_issuer = issuer.replace(/\/$/, '')
  }

  return mapped
}
