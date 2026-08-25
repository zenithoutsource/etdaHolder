import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { buildDirectPostFormBody } from '../directPostFormBody'
import { logOid4vpRawPresentationSubmit } from '../oid4vpRawProtocolLog'
import { createSafePresentationTransportHint, type SafePresentationTransportHint } from '../presentationDiagnostics'
import type { Oid4vpResponseEncryptionParams, Oid4vpResponseMode } from '../oid4vpResponseEncryption'
import type { Oid4vcAdapterContext } from './types'

type PresentationSubmissionError = Error & { presentationTransportHint?: SafePresentationTransportHint }

function createPresentationSubmissionError(
  message: string,
  presentationTransportHint: SafePresentationTransportHint | undefined,
): PresentationSubmissionError {
  const submissionError: PresentationSubmissionError = new Error(message)
  if (presentationTransportHint) submissionError.presentationTransportHint = presentationTransportHint
  return submissionError
}

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
    nonce?: string
    state?: string
    dcqlQuery?: { credentials: { id: string; format?: string }[] }
  }
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; status: number; parsedBody: unknown }> {
  const fetchImpl = input.fetchImpl ?? fetch
  const body = buildDirectPostFormBody({
    request: input.request,
    formattedVpToken: input.vpToken,
    ...(input.presentationSubmission
      ? { presentationSubmission: input.presentationSubmission as Record<string, unknown> }
      : {}),
  })
  const compactJwe = body.get('response') ?? undefined
  const presentationTransportHint = typeof compactJwe === 'string'
    ? createSafePresentationTransportHint({
      formattedVpToken: input.vpToken,
      compactJwe,
    })
    : undefined

  logOid4vpRawPresentationSubmit({
    responseUri: input.responseUri,
    responseMode: input.responseMode,
    vpToken: input.vpToken,
    wireBody: body.toString(),
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
      logWalletStep('oid4vp', 'submit-http-failure', {
        responseUri: input.responseUri,
        status: response.status,
        responseMode: input.responseMode,
        ...(error ? { verifierError: error } : {}),
        ...(description ? { verifierErrorDescription: description } : {}),
        ...(presentationTransportHint ? { transportHint: presentationTransportHint } : {}),
      })
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
      throw createPresentationSubmissionError(error.message, presentationTransportHint)
    }
    throw createPresentationSubmissionError(
      `PresentationSubmissionFailed: ${toErrorMessage(error)}`,
      presentationTransportHint,
    )
  }
}
