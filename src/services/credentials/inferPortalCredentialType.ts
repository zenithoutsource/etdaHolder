import type { IssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import { CREDENTIAL_TYPE_TO_CONFIGURATION_IDS } from '../../config/sameDeviceIssuance'
import type { ResolvedCredentialOffer } from '../vci/exchangeService'

function configurationIdsMatch(
  offerIds: readonly string[],
  expectedIds: readonly string[],
): boolean {
  return expectedIds.every((id) => offerIds.includes(id))
}

/** Map a resolved offer's configuration IDs to a portal credential type when possible. */
export function inferPortalCredentialTypeFromOffer(
  offer: ResolvedCredentialOffer,
): IssuerPortalCredentialType | undefined {
  const offerIds = offer.credentialConfigurations.map((configuration) => configuration.id)
  const entries = Object.entries(CREDENTIAL_TYPE_TO_CONFIGURATION_IDS) as Array<
    [IssuerPortalCredentialType, readonly string[]]
  >

  for (const [credentialType, expectedIds] of entries) {
    if (configurationIdsMatch(offerIds, expectedIds)) {
      return credentialType
    }
    if (expectedIds.some((id) => offerIds.includes(id))) {
      return credentialType
    }
  }

  return undefined
}
