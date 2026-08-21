import { encryptCompactJweEcdhEsP256 } from '@/src/services/crypto/jweEcdhEs'
import { toErrorMessage } from '@/src/utils/jwtUtils'

import { isDualFormatDcqlRequest } from './dualFormatQuery'
import { parseDcqlVpTokenViaOid4vc } from './oid4vc/parseDcqlVpTokenViaOid4vc'
import type { Oid4vpResponseEncryptionParams } from './oid4vpResponseEncryption'

export type DirectPostFormBodyRequest = {
  responseMode: 'direct_post' | 'direct_post.jwt'
  responseEncryption?: Oid4vpResponseEncryptionParams
  state?: string
  dcqlQuery?: {
    credentials: { id: string; format?: string }[]
  }
}

function parseDcqlVpTokenForEncryptedPayload(formattedVpToken: string): unknown {
  try {
    const parsed = JSON.parse(formattedVpToken) as unknown
    if (parsed !== null && typeof parsed === 'object') return parsed
  } catch {
    // raw token string
  }
  return formattedVpToken
}

function isDualFormatEnvelope(
  dcqlQuery: DirectPostFormBodyRequest['dcqlQuery'],
  formattedVpToken: string,
): boolean {
  if (!dcqlQuery || !isDualFormatDcqlRequest(dcqlQuery)) return false
  if (!formattedVpToken.trimStart().startsWith('{')) return false
  try {
    parseDcqlVpTokenViaOid4vc(formattedVpToken)
    return true
  } catch {
    return false
  }
}

function buildAuthorizationResponsePayload(input: {
  request: DirectPostFormBodyRequest
  formattedVpToken: string
  presentationSubmission?: Record<string, unknown>
}): Record<string, unknown> {
  const vpTokenValue = input.request.dcqlQuery
    ? isDualFormatEnvelope(input.request.dcqlQuery, input.formattedVpToken)
      ? JSON.parse(input.formattedVpToken) as unknown
      : parseDcqlVpTokenForEncryptedPayload(input.formattedVpToken)
    : input.formattedVpToken

  const payload: Record<string, unknown> = {
    vp_token: vpTokenValue,
  }

  if (input.presentationSubmission) {
    payload.presentation_submission = input.presentationSubmission
  }
  if (input.request.state) {
    payload.state = input.request.state
  }

  return payload
}

export function buildDirectPostFormBody(input: {
  request: DirectPostFormBodyRequest
  formattedVpToken: string
  presentationSubmission?: Record<string, unknown>
}): URLSearchParams {
  const body = new URLSearchParams()

  if (input.request.responseMode === 'direct_post.jwt') {
    if (!input.request.responseEncryption) {
      throw new Error('PresentationSubmissionFailed: direct_post.jwt response encryption parameters are missing')
    }

    const authorizationPayload = buildAuthorizationResponsePayload({
      request: input.request,
      formattedVpToken: input.formattedVpToken,
      ...(input.presentationSubmission ? { presentationSubmission: input.presentationSubmission } : {}),
    })

    try {
      const compactJwe = encryptCompactJweEcdhEsP256({
        recipientJwk: input.request.responseEncryption.jwk,
        enc: input.request.responseEncryption.enc,
        payload: authorizationPayload,
      })
      body.set('response', compactJwe)
      return body
    } catch (error) {
      throw new Error(`PresentationSubmissionFailed: ${toErrorMessage(error)}`)
    }
  }

  body.set('vp_token', input.formattedVpToken)
  if (input.presentationSubmission) {
    body.set('presentation_submission', JSON.stringify(input.presentationSubmission))
  }
  if (input.request.state) body.set('state', input.request.state)
  return body
}
