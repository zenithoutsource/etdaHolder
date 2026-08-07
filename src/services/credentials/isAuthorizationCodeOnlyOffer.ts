import type { ResolvedCredentialOffer } from '../vci/exchangeService'

const AUTHORIZATION_CODE_FLOW = 'authorization_code'
const PRE_AUTHORIZED_FLOW = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

/** True when the offer requires Authorization Code grant and has no pre-authorized code. */
export function isAuthorizationCodeOnlyOffer(offer: ResolvedCredentialOffer): boolean {
  const flows = offer.supportedFlows.map(String)
  const hasAuthCode = flows.includes(AUTHORIZATION_CODE_FLOW)
  const hasPreAuth = flows.includes(PRE_AUTHORIZED_FLOW) || Boolean(offer.preAuthorizedCode)
  return hasAuthCode && !hasPreAuth
}
