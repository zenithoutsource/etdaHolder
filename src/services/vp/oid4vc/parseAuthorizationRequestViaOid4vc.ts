import {
  parseOpenid4vpAuthorizationRequest,
  resolveOpenid4vpAuthorizationRequest,
} from '@openid4vc/openid4vp'

import {
  decodeJsonBase64Url,
  isRecord,
  looksLikeCompactJwt,
  readString,
  toErrorMessage,
} from '@/src/utils/jwtUtils'
import { findTrustedVerifier, type TrustedVerifier } from '../trustedVerifierMatcher'
import { createOid4vcCallbacks } from './oid4vcCallbacks'
import type { AuthorizationRequestMaterial, Oid4vcAdapterContext } from './types'

function buildAuthorizationRequestInput(material: AuthorizationRequestMaterial): string | Record<string, unknown> {
  const rawBody = material.rawBody?.trim()
  if (rawBody) {
    if (looksLikeCompactJwt(rawBody)) {
      const parts = rawBody.split('.')
      const headerSegment = parts[0]
      const payloadSegment = parts[1]
      const signatureSegment = parts[2]

      if (headerSegment && payloadSegment) {
        const header = decodeJsonBase64Url<Record<string, unknown>>(headerSegment)
        const alg = readString(header?.alg)
        if (!signatureSegment || !alg || alg === 'none') {
          const payload = decodeJsonBase64Url<Record<string, unknown>>(payloadSegment)
          if (isRecord(payload)) return payload
        }
      }
    }

    return rawBody
  }

  if (material.byValueParams) return material.byValueParams

  throw new Error('PresentationRequestInvalid: authorization request material is empty')
}

function extractTrustFields(material: AuthorizationRequestMaterial): {
  clientId?: string
  responseUri?: string
} {
  const rawBody = material.rawBody?.trim()
  if (rawBody) {
    if (looksLikeCompactJwt(rawBody)) {
      const parts = rawBody.split('.')
      const payloadSegment = parts[1]
      if (payloadSegment) {
        const payload = decodeJsonBase64Url<Record<string, unknown>>(payloadSegment)
        if (isRecord(payload)) {
          return {
            clientId: readString(payload.client_id),
            responseUri: readString(payload.response_uri),
          }
        }
      }
    }

    try {
      const parsed = JSON.parse(rawBody) as unknown
      if (isRecord(parsed)) {
        return {
          clientId: readString(parsed.client_id),
          responseUri: readString(parsed.response_uri),
        }
      }
    } catch {
      // fall through to by-value params
    }
  }

  if (material.byValueParams) {
    return {
      clientId: material.byValueParams.client_id,
      responseUri: material.byValueParams.response_uri,
    }
  }

  return {}
}

function mapOid4vcError(error: unknown): Error {
  const message = toErrorMessage(error)
  if (message.includes('PresentationRequest')) return new Error(message)
  return new Error(`PresentationRequestInvalid: ${message}`)
}

export async function parseAuthorizationRequestViaOid4vc(
  material: AuthorizationRequestMaterial,
  options: {
    trustedVerifiers: TrustedVerifier[]
    fetchImpl?: typeof fetch
  },
): Promise<{
  authorizationRequest: Record<string, unknown>
  oid4vcContext: Oid4vcAdapterContext
}> {
  const { clientId, responseUri } = extractTrustFields(material)
  if (!clientId || !responseUri) {
    throw new Error('PresentationRequestInvalid: client_id and response_uri are required')
  }

  const trustedVerifier = findTrustedVerifier(clientId, responseUri, options.trustedVerifiers)
  if (!trustedVerifier) {
    throw new Error('PresentationRequestInvalid: verifier is not trusted')
  }

  const callbacks = createOid4vcCallbacks({ fetchImpl: options.fetchImpl })

  try {
    const authorizationRequestInput = buildAuthorizationRequestInput(material)
    const parsed = parseOpenid4vpAuthorizationRequest({ authorizationRequest: authorizationRequestInput })

    const resolved = await resolveOpenid4vpAuthorizationRequest({
      authorizationRequestPayload: parsed.params as Record<string, unknown>,
      responseMode: { type: 'direct_post' },
      callbacks,
    })

    const authorizationRequestPayload = resolved.authorizationRequestPayload as Record<string, unknown>

    return {
      authorizationRequest: authorizationRequestPayload,
      oid4vcContext: { authorizationRequestPayload },
    }
  } catch (error) {
    throw mapOid4vcError(error)
  }
}
