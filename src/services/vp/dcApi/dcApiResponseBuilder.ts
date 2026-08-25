/**
 * Builds Digital Credentials API presentation responses from a DCQL mdoc DeviceResponse.
 */
import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'
import { encryptCompactJweEcdhEsP256 } from '@/src/services/crypto/jweEcdhEs'
import { isRecord, readString } from '@/src/utils/jwtUtils'

import { formatDcqlVpTokenEnvelope } from '../oid4vc/formatDcqlVpTokenEnvelope'
import { resolveOid4vpResponseEncryptionParams } from '../oid4vpResponseEncryption'

export type DcApiPresentationPayload =
  | { responseMode: 'dc_api'; data: { vp_token: Record<string, string[]> } }
  | { responseMode: 'dc_api.jwt'; response: string }

export type BuildDcApiPresentationPayloadInput = {
  responseMode: DcApiPresentationPayload['responseMode']
  authorizationRequest: Record<string, unknown>
  deviceResponse: string
}

export function buildDcApiPresentationPayload(
  input: BuildDcApiPresentationPayloadInput,
): DcApiPresentationPayload {
  const vpToken = buildDcqlObjectArrayVpToken(input.authorizationRequest, input.deviceResponse)

  if (input.responseMode === 'dc_api') {
    return { responseMode: 'dc_api', data: { vp_token: vpToken } }
  }

  const responseEncryption = resolveOid4vpResponseEncryptionParams(input.authorizationRequest)
  return {
    responseMode: 'dc_api.jwt',
    response: encryptCompactJweEcdhEsP256({
      recipientJwk: responseEncryption.jwk,
      enc: responseEncryption.enc,
      payload: { vp_token: vpToken },
      lenientRecipientCoordinates: readWalletDemoInteropEnabled(),
    }),
  }
}

function buildDcqlObjectArrayVpToken(
  authorizationRequest: Record<string, unknown>,
  deviceResponse: string,
): Record<string, string[]> {
  const queryId = readFirstDcqlQueryId(authorizationRequest)
  const envelope = formatDcqlVpTokenEnvelope({
    entries: { [queryId]: deviceResponse },
    shape: 'object_array',
  })
  return JSON.parse(envelope) as Record<string, string[]>
}

function readFirstDcqlQueryId(authorizationRequest: Record<string, unknown>): string {
  const dcqlQuery = authorizationRequest.dcql_query
  if (!isRecord(dcqlQuery) || !Array.isArray(dcqlQuery.credentials)) {
    throw new Error('PresentationRequestInvalid: dc_api requires dcql_query.credentials')
  }

  const firstCredential = dcqlQuery.credentials[0]
  const queryId = isRecord(firstCredential) ? readString(firstCredential.id) : undefined
  if (!queryId) {
    throw new Error('PresentationRequestInvalid: dc_api requires a DCQL credential query ID')
  }
  return queryId
}
