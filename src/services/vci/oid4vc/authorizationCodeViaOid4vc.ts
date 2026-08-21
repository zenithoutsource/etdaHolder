import {
  determineAuthorizationServerForCredentialOffer,
  extractScopesForCredentialConfigurationIds,
} from '@openid4vc/openid4vci'
import { getAuthorizationServerMetadataFromList } from '@openid4vc/oauth2'

import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'

import { createOid4vcVciClient } from './createOid4vcVciClient'
import type { Oid4vcVciAdapterContext } from './types'

function readCredentialConfigurationIds(credentialOfferObject: Oid4vcVciAdapterContext['credentialOfferObject']): string[] {
  const ids = credentialOfferObject.credential_configuration_ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

function resolveAuthorizationServerMetadata(oid4vcContext: Oid4vcVciAdapterContext) {
  const authorizationServer = determineAuthorizationServerForCredentialOffer({
    issuerMetadata: oid4vcContext.issuerMetadataResult,
  })
  return getAuthorizationServerMetadataFromList(
    oid4vcContext.issuerMetadataResult.authorizationServers,
    authorizationServer,
  )
}

export async function createAuthorizationRequestUrlFromOfferViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  clientId: string
  redirectUri: string
  state?: string
  pkceCodeVerifier?: string
  fetchImpl?: typeof fetch
}): Promise<{
  authorizationRequestUrl: string
  pkce?: { codeVerifier: string; codeChallenge: string; codeChallengeMethod: string }
  authorizationServer: string
}> {
  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl })
  const credentialConfigurationIds = readCredentialConfigurationIds(input.oid4vcContext.credentialOfferObject)
  const scopes = extractScopesForCredentialConfigurationIds({
    credentialConfigurationIds,
    issuerMetadata: input.oid4vcContext.issuerMetadataResult,
  })
  const scope = scopes?.length ? scopes.join(' ') : undefined

  try {
    const result = await client.createAuthorizationRequestUrlFromOffer({
      credentialOffer: input.oid4vcContext.credentialOfferObject,
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      state: input.state,
      pkceCodeVerifier: input.pkceCodeVerifier,
      ...(scope ? { scope } : {}),
    })

    return {
      authorizationRequestUrl: result.authorizationRequestUrl,
      pkce: result.pkce,
      authorizationServer: result.authorizationServer,
    }
  } catch (error) {
    throw new Error(`CredentialAuthorizationRequestFailed: ${toErrorMessage(error)}`)
  }
}

export function parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc(input: {
  url: string
  oid4vcContext: Oid4vcVciAdapterContext
  fetchImpl?: typeof fetch
}):
  | { code: string; state?: string; iss?: string; error?: undefined }
  | {
    error: string
    state?: string
    iss?: string
    code?: undefined
    error_description?: string
    error_uri?: string
  } {
  const authorizationServerMetadata = resolveAuthorizationServerMetadata(input.oid4vcContext)
  if (!isRecord(authorizationServerMetadata)) {
    throw new Error('CredentialFlowUnsupported: authorization server metadata not found')
  }

  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl })
  return client.parseAndVerifyAuthorizationResponseRedirectUrl({
    url: input.url,
    authorizationServerMetadata,
  })
}
