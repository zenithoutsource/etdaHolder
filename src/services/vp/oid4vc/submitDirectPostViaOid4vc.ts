import { submitOpenid4vpAuthorizationResponse } from '@openid4vc/openid4vp'

import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'
import { buildDirectPostFormBody } from '../directPostFormBody'
import type { Oid4vpResponseEncryptionParams, Oid4vpResponseMode } from '../oid4vpResponseEncryption'
import { createOid4vcCallbacks } from '@/src/services/oid4vc/oid4vcCallbacks'
import type { Oid4vcAdapterContext } from './types'

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

export async function submitDirectPostViaOid4vc(input: {
  oid4vcContext: Oid4vcAdapterContext
  responseUri: string
  responseMode: Oid4vpResponseMode
  responseEncryption?: Oid4vpResponseEncryptionParams
  vpToken: string
  state?: string
  presentationSubmission?: Record<string, unknown>
  request: {
    responseMode: Oid4vpResponseMode
    responseEncryption?: Oid4vpResponseEncryptionParams
    state?: string
    dcqlQuery?: { credentials: { id: string; format?: string }[] }
  }
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; status: number; parsedBody: unknown }> {
  const fetchImpl = input.fetchImpl ?? fetch

  if (input.responseMode === 'direct_post.jwt') {
    const body = buildDirectPostFormBody({
      request: input.request,
      formattedVpToken: input.vpToken,
      ...(input.presentationSubmission
        ? { presentationSubmission: input.presentationSubmission as Record<string, unknown> }
        : {}),
    })

    try {
      const response = await fetchImpl(input.responseUri, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      const parsedBody = await readJsonResponse(response)
      if (!response.ok) {
        const error = isRecord(parsedBody) && typeof parsedBody.error === 'string' ? parsedBody.error : undefined
        const description =
          isRecord(parsedBody) && typeof parsedBody.error_description === 'string'
            ? parsedBody.error_description
            : isRecord(parsedBody) && typeof parsedBody.message === 'string'
              ? parsedBody.message
              : undefined
        const suffix =
          error && description ? `: ${error} - ${description}` : error ? `: ${error}` : description ? `: ${description}` : ''
        throw new Error(`PresentationSubmissionFailed: HTTP ${response.status}${suffix}`)
      }

      return {
        ok: response.ok,
        status: response.status,
        parsedBody,
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('PresentationSubmissionFailed:')) {
        throw error
      }
      throw new Error(`PresentationSubmissionFailed: ${toErrorMessage(error)}`)
    }
  }

  const callbacks = createOid4vcCallbacks({ fetchImpl })

  const authorizationResponsePayload: Record<string, unknown> = {
    vp_token: input.vpToken,
  }
  if (input.state) authorizationResponsePayload.state = input.state

  try {
    const result = await submitOpenid4vpAuthorizationResponse({
      authorizationRequestPayload: {
        response_uri: input.responseUri,
      },
      authorizationResponsePayload: authorizationResponsePayload as { vp_token: string; state?: string },
      callbacks: { fetch: callbacks.fetch },
    })

    const parsedBody = await readJsonResponse(result.response)
    if (!result.response.ok) {
      const error = isRecord(parsedBody) && typeof parsedBody.error === 'string' ? parsedBody.error : undefined
      const description =
        isRecord(parsedBody) && typeof parsedBody.error_description === 'string'
          ? parsedBody.error_description
          : isRecord(parsedBody) && typeof parsedBody.message === 'string'
            ? parsedBody.message
            : undefined
      const suffix =
        error && description ? `: ${error} - ${description}` : error ? `: ${error}` : description ? `: ${description}` : ''
      throw new Error(`PresentationSubmissionFailed: HTTP ${result.response.status}${suffix}`)
    }

    return {
      ok: result.response.ok,
      status: result.response.status,
      parsedBody,
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PresentationSubmissionFailed:')) {
      throw error
    }
    throw new Error(`PresentationSubmissionFailed: ${toErrorMessage(error)}`)
  }
}
