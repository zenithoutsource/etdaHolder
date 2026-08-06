import { submitOpenid4vpAuthorizationResponse } from '@openid4vc/openid4vp'

import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'
import { createOid4vcCallbacks } from './oid4vcCallbacks'
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
  vpToken: string
  state?: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; status: number; parsedBody: unknown }> {
  const callbacks = createOid4vcCallbacks({ fetchImpl: input.fetchImpl })

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
      const suffix = isRecord(parsedBody) && typeof parsedBody.error === 'string'
        ? `: ${parsedBody.error}`
        : ''
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
