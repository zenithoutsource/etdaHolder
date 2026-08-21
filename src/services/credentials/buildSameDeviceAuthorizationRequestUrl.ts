import type { IssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import {
  readSameDeviceCredentialIssuer,
  readSameDeviceOAuthClientId,
  resolveCredentialConfigurationIds,
} from '../../config/sameDeviceIssuance'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { resolveAuthorizationCodeIssuance } from '../vci/exchangeService'
import { createAuthorizationRequestUrlFromOfferViaOid4vc } from '../vci/oid4vc/authorizationCodeViaOid4vc'
import { useSameDeviceIssuanceStore } from '../../store/sameDeviceIssuanceStore'

export async function buildSameDeviceAuthorizationRequestUrl(
  credentialType: IssuerPortalCredentialType,
): Promise<string> {
  const session = useSameDeviceIssuanceStore.getState().session
  if (!session) {
    throw new Error('SameDeviceSessionMissing: beginSameDeviceIssuanceSession must run first')
  }

  logWalletStep('same-device-issuance', 'authorization-url-build-start', {
    credentialType,
    sessionId: session.id,
  })

  try {
    const resolvedOffer = await resolveAuthorizationCodeIssuance({
      issuer: readSameDeviceCredentialIssuer(),
      credentialConfigurationIds: resolveCredentialConfigurationIds(credentialType),
    })

    if (!resolvedOffer.oid4vcContext) {
      throw new Error('CredentialFlowUnsupported: authorization-code offer missing oid4vc context')
    }

    const { authorizationRequestUrl } = await createAuthorizationRequestUrlFromOfferViaOid4vc({
      oid4vcContext: resolvedOffer.oid4vcContext,
      clientId: readSameDeviceOAuthClientId(),
      redirectUri: session.redirectUri,
      pkceCodeVerifier: session.codeVerifier,
      state: session.id,
    })

    useSameDeviceIssuanceStore.getState().patchSession({ resolvedOffer })

    logWalletStep('same-device-issuance', 'authorization-url-build-complete', {
      credentialType,
      sessionId: session.id,
    })

    return authorizationRequestUrl
  } catch (error) {
    logWalletError('same-device-issuance', 'authorization-url-build-failed', error, {
      credentialType,
      sessionId: session.id,
    })
    throw error
  }
}
