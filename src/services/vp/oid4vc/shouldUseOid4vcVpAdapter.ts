import { isIssuerOid4VpClientId, isIssuerOid4VpResponseUri } from '@/src/config/trustedVerifiers'
import { isRecord, readString } from '@/src/utils/jwtUtils'
import type { DcqlQuery } from '../presentationService'
import { isDualFormatDcqlRequest } from '../dualFormatQuery'
import { normalizeAuthorizationRequestForRouting } from './normalizeAuthorizationRequestForRouting'
import type { PresentationFlowOrigin } from './types'

function toMinimalDcqlQuery(raw: unknown): DcqlQuery | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.credentials)) return undefined

  const credentials = raw.credentials
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.id !== 'string') return undefined
      return {
        id: entry.id,
        ...(readString(entry.format) ? { format: readString(entry.format) } : {}),
      }
    })
    .filter((entry): entry is DcqlQuery['credentials'][number] => Boolean(entry))

  if (credentials.length === 0) return undefined
  return { credentials }
}

export function shouldUseOid4vcVpAdapter(input: {
  flagEnabled: boolean
  presentationFlowOrigin: PresentationFlowOrigin
  authorizationRequest: Record<string, unknown>
  env?: Record<string, string | undefined>
}): boolean {
  if (!input.flagEnabled) return false
  if (input.presentationFlowOrigin !== 'scan' && input.presentationFlowOrigin !== 'same-device') {
    return false
  }

  const request = normalizeAuthorizationRequestForRouting(input.authorizationRequest)

  if (request.presentation_definition !== undefined || request.presentation_definition_uri !== undefined) {
    return false
  }

  if (!request.dcql_query) return false
  if (readString(request.response_mode) !== 'direct_post') return false

  const clientId = readString(request.client_id)
  const responseUri = readString(request.response_uri)
  if (clientId && isIssuerOid4VpClientId(clientId, input.env)) return false
  if (responseUri && isIssuerOid4VpResponseUri(responseUri, input.env)) return false

  const dcqlQuery = toMinimalDcqlQuery(request.dcql_query)
  if (dcqlQuery && isDualFormatDcqlRequest(dcqlQuery)) return false

  return true
}
