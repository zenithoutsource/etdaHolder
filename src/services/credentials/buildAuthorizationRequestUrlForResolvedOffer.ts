import type { IssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import { readSameDeviceOAuthClientId } from '../../config/sameDeviceIssuance'
import type { ResolvedCredentialOffer } from '../vci/exchangeService'
import { createAuthorizationRequestUrlFromOfferViaOid4vc } from '../vci/oid4vc/authorizationCodeViaOid4vc'
import { beginSameDeviceIssuanceSession } from './sameDeviceIssuanceSession'
import { useSameDeviceIssuanceStore } from '../../store/sameDeviceIssuanceStore'

export async function buildAuthorizationRequestUrlForResolvedOffer(
  offer: ResolvedCredentialOffer,
  credentialType: IssuerPortalCredentialType,
): Promise<string> {
  if (!offer.oid4vcContext) {
    throw new Error('CredentialFlowUnsupported: authorization-code offer missing oid4vc context')
  }

  const session = useSameDeviceIssuanceStore.getState().session
    ?? await beginSameDeviceIssuanceSession(credentialType)

  useSameDeviceIssuanceStore.getState().patchSession({ resolvedOffer: offer })

  const { authorizationRequestUrl } = await createAuthorizationRequestUrlFromOfferViaOid4vc({
    oid4vcContext: offer.oid4vcContext,
    clientId: readSameDeviceOAuthClientId(),
    redirectUri: session.redirectUri,
    pkceCodeVerifier: session.codeVerifier,
    state: session.id,
  })

  return authorizationRequestUrl
}
