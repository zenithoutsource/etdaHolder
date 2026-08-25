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
  selectedDcqlQueryId: string
  deviceResponse: string
}

export function buildDcApiPresentationPayload(
  input: BuildDcApiPresentationPayloadInput,
): DcApiPresentationPayload {
  const vpToken = buildDcqlObjectArrayVpToken(input)

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

function buildDcqlObjectArrayVpToken(input: BuildDcApiPresentationPayloadInput): Record<string, string[]> {
  assertSelectedDcqlQueryId(input.authorizationRequest, input.selectedDcqlQueryId)
  const envelope = formatDcqlVpTokenEnvelope({
    entries: { [input.selectedDcqlQueryId]: input.deviceResponse },
    shape: 'object_array',
  })
  return JSON.parse(envelope) as Record<string, string[]>
}

function assertSelectedDcqlQueryId(
  authorizationRequest: Record<string, unknown>,
  selectedDcqlQueryId: string,
): void {
  const dcqlQuery = authorizationRequest.dcql_query
  if (!isRecord(dcqlQuery) || !Array.isArray(dcqlQuery.credentials)) {
    throw new Error('PresentationRequestInvalid: dc_api requires dcql_query.credentials')
  }

  const selectedQueryExists = dcqlQuery.credentials.some(
    (credential) => isRecord(credential) && readString(credential.id) === selectedDcqlQueryId,
  )
  if (!selectedQueryExists) {
    throw new Error('PresentationRequestInvalid: dc_api selected DCQL credential query ID is not requested')
  }
}
