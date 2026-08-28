import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'
import { agentDebugLog } from '@/src/services/debug/agentDebugLog'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { buildDirectPostFormBody } from '../directPostFormBody'
import { createSafePresentationTransportHint, type SafePresentationTransportHint } from '../presentationDiagnostics'
import type { Oid4vpResponseEncryptionParams, Oid4vpResponseMode } from '../oid4vpResponseEncryption'
import type { Oid4vcAdapterContext } from './types'

type PresentationSubmissionError = Error & {
  presentationTransportHint?: SafePresentationTransportHint
  verifierResponseKeys?: string[]
  verifierContentType?: string
  verifierError?: string
  verifierErrorDescription?: string
}

function createPresentationSubmissionError(
  message: string,
  presentationTransportHint: SafePresentationTransportHint | undefined,
  extras?: {
    verifierResponseKeys?: string[]
    verifierContentType?: string
    verifierError?: string
    verifierErrorDescription?: string
  },
): PresentationSubmissionError {
  const submissionError: PresentationSubmissionError = new Error(message)
  if (presentationTransportHint) submissionError.presentationTransportHint = presentationTransportHint
  if (extras?.verifierResponseKeys) submissionError.verifierResponseKeys = extras.verifierResponseKeys
  if (extras?.verifierContentType) submissionError.verifierContentType = extras.verifierContentType
  if (extras?.verifierError) submissionError.verifierError = extras.verifierError
  if (extras?.verifierErrorDescription) submissionError.verifierErrorDescription = extras.verifierErrorDescription
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
  let verifierResponseKeys: string[] | undefined
  let verifierContentType: string | undefined

  try {
    const response = await fetchImpl(input.responseUri, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    verifierContentType = response.headers.get('content-type') ?? undefined
    const parsedBody = await readJsonResponse(response)
    if (!response.ok) {
      const error = isRecord(parsedBody) && typeof parsedBody.error === 'string' ? parsedBody.error : undefined
      const description =
        isRecord(parsedBody) && typeof parsedBody.error_description === 'string'
          ? parsedBody.error_description
          : isRecord(parsedBody) && typeof parsedBody.message === 'string'
            ? parsedBody.message
            : undefined
      verifierResponseKeys = isRecord(parsedBody) ? Object.keys(parsedBody) : []
      logWalletStep('oid4vp', 'submit-http-failure', {
        responseUri: input.responseUri,
        status: response.status,
        responseMode: input.responseMode,
        verifierContentType,
        verifierResponseKeys,
        ...(error ? { verifierError: error } : {}),
        ...(description ? { verifierErrorDescription: description } : {}),
        ...(presentationTransportHint ? { transportHint: presentationTransportHint } : {}),
      })
      // #region agent log
      agentDebugLog({
        location: 'submitDirectPostViaOid4vc.ts:failure',
        message: 'verifier-http-failure',
        hypothesisId: 'H4',
        data: {
          status: response.status,
          responseKeys: verifierResponseKeys,
          error,
          errorDescription: description,
          contentType: verifierContentType ?? 'none',
          host: (() => {
            try {
              return new URL(input.responseUri).hostname
            } catch {
              return 'unknown'
            }
          })(),
        },
      })
      // #endregion
      const suffix =
        error && description ? `: ${error} - ${description}` : error ? `: ${error}` : description ? `: ${description}` : ''
      throw createPresentationSubmissionError(
        `PresentationSubmissionFailed: HTTP ${response.status}${suffix}`,
        presentationTransportHint,
        {
          verifierResponseKeys,
          ...(verifierContentType ? { verifierContentType } : {}),
          ...(error ? { verifierError: error } : {}),
          ...(description ? { verifierErrorDescription: description } : {}),
        },
      )
    }

    return {
      ok: response.ok,
      status: response.status,
      parsedBody,
    }
  } catch (error) {
    const failure = error as PresentationSubmissionError
    const extras = {
      ...(failure.verifierResponseKeys ?? verifierResponseKeys
        ? { verifierResponseKeys: failure.verifierResponseKeys ?? verifierResponseKeys }
        : {}),
      ...((failure.verifierContentType ?? verifierContentType)
        ? { verifierContentType: failure.verifierContentType ?? verifierContentType }
        : {}),
      ...(failure.verifierError ? { verifierError: failure.verifierError } : {}),
      ...(failure.verifierErrorDescription
        ? { verifierErrorDescription: failure.verifierErrorDescription }
        : {}),
    }
    if (error instanceof Error && error.message.startsWith('PresentationSubmissionFailed:')) {
      throw createPresentationSubmissionError(error.message, presentationTransportHint, extras)
    }
    throw createPresentationSubmissionError(
      `PresentationSubmissionFailed: ${toErrorMessage(error)}`,
      presentationTransportHint,
      extras,
    )
  }
}
