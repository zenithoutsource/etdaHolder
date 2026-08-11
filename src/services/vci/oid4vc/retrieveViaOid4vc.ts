import {
  type IssuerMetadataResult,
} from '@openid4vc/openid4vci'
import type { RequestDpopOptions } from '@openid4vc/oauth2'

import { isRecord, readString, toErrorMessage } from '@/src/utils/jwtUtils'

import { logWalletStep } from '@/src/services/debug/walletLogger'
import { InvalidProofError } from '../invalidProofError'
import { createDpopSignJwtCallback, type DpopIssuanceSession } from '@/src/services/oid4vc/dpopIssuanceSession'
import { createOid4vcVciClient } from './createOid4vcVciClient'
import type { Oid4vcAuthorizationCodeExchangeInput, Oid4vcVciAdapterContext } from './types'

export type Oid4vcRetrieveDpopInput = {
  dpop?: RequestDpopOptions
  dpopSession?: DpopIssuanceSession
}

function readFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function readAuthorizationHeader(init?: RequestInit): string | undefined {
  if (!init?.headers) return undefined
  if (init.headers instanceof Headers) {
    return init.headers.get('Authorization') ?? undefined
  }
  if (Array.isArray(init.headers)) {
    const match = init.headers.find(([key]) => key.toLowerCase() === 'authorization')
    return match?.[1]
  }
  const record = init.headers as Record<string, string>
  return record.Authorization ?? record.authorization
}

export type CredentialRequestWireShape = {
  bodyKeys: string[]
  hasProof: boolean
  hasProofs: boolean
  proofsJwtCount: number
  credentialConfigurationId?: string
  credentialIdentifier?: string
  hasWalletAttestationFields: boolean
}

function readCredentialRequestBodyShape(body: unknown): CredentialRequestWireShape {
  if (typeof body !== 'string') {
    return {
      bodyKeys: [],
      hasProof: false,
      hasProofs: false,
      proofsJwtCount: 0,
      hasWalletAttestationFields: false,
    }
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const proofs = isRecord(parsed.proofs) ? parsed.proofs.jwt : undefined
    const credentialConfigurationId = readString(parsed.credential_configuration_id)
    const credentialIdentifier = readString(parsed.credential_identifier)
    return {
      bodyKeys: Object.keys(parsed),
      hasProof: Object.prototype.hasOwnProperty.call(parsed, 'proof'),
      hasProofs: Object.prototype.hasOwnProperty.call(parsed, 'proofs'),
      proofsJwtCount: Array.isArray(proofs) ? proofs.length : 0,
      ...(credentialConfigurationId ? { credentialConfigurationId } : {}),
      ...(credentialIdentifier ? { credentialIdentifier } : {}),
      hasWalletAttestationFields:
        Object.prototype.hasOwnProperty.call(parsed, 'wua')
        || Object.prototype.hasOwnProperty.call(parsed, 'wia'),
    }
  } catch {
    return {
      bodyKeys: [],
      hasProof: false,
      hasProofs: false,
      proofsJwtCount: 0,
      hasWalletAttestationFields: false,
    }
  }
}

function readCredentialRequestAuthShape(
  init?: RequestInit,
): Pick<CredentialRequestWireFailure, 'authScheme' | 'bearerTokenLength'> {
  const authorization = readAuthorizationHeader(init)
  return {
    authScheme: authorization?.startsWith('DPoP ')
      ? 'DPoP'
      : authorization?.startsWith('Bearer ')
        ? 'Bearer'
        : 'missing',
    bearerTokenLength: authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).length
      : authorization?.startsWith('DPoP ')
        ? authorization.slice('DPoP '.length).length
        : 0,
  }
}

export type CredentialRequestWireFailure = {
  httpStatus?: number
  oauthError?: string
  oauthDescription?: string
  wwwAuthenticatePresent: boolean
  wwwAuthenticateScheme?: string
  wwwAuthenticateMentionsDpop: boolean
  authScheme: 'Bearer' | 'DPoP' | 'missing'
  bearerTokenLength: number
} & CredentialRequestWireShape

let lastCredentialRequestWireFailure: CredentialRequestWireFailure | undefined

export function readLastCredentialRequestWireFailure(): CredentialRequestWireFailure | undefined {
  return lastCredentialRequestWireFailure
}

export function clearLastCredentialRequestWireFailure(): void {
  lastCredentialRequestWireFailure = undefined
}

function createDebugCredentialFetch(fetchImpl?: typeof fetch): typeof fetch | undefined {
  const baseFetch = fetchImpl ?? fetch
  return async (input, init) => {
    const url = readFetchUrl(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const isCredentialPost = method === 'POST' && url.includes('/credential')
    const bodyShape = isCredentialPost ? readCredentialRequestBodyShape(init?.body) : undefined

    if (isCredentialPost) {
      const wireShape = {
        urlEndsWithCredential: url.endsWith('/credential') || url.includes('/credential'),
        ...readCredentialRequestAuthShape(init),
        ...bodyShape,
      }
      logWalletStep('oid4vci', 'debug-credential-request-wire', wireShape)
      // #region agent log
      fetch('http://127.0.0.1:7299/ingest/bf197faa-a717-4eb9-bdf8-a2aa24a25fe4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ade581' },
        body: JSON.stringify({
          sessionId: 'ade581',
          runId: 'invalid-token-v2',
          hypothesisId: 'H',
          location: 'retrieveViaOid4vc.ts:debugFetch',
          message: 'credential-request-wire',
          data: wireShape,
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
    }

    const response = await baseFetch(input, init)
    if (isCredentialPost && !response.ok) {
      const oauth = readOauthErrorFields(await response.clone().json().catch(() => undefined))
      const wwwAuthenticate = response.headers.get('WWW-Authenticate') ?? undefined
      const wireError: CredentialRequestWireFailure = {
        httpStatus: response.status,
        oauthError: oauth.error,
        oauthDescription: oauth.error_description,
        wwwAuthenticatePresent: Boolean(wwwAuthenticate),
        wwwAuthenticateScheme: wwwAuthenticate?.split(/\s+/)[0],
        wwwAuthenticateMentionsDpop: wwwAuthenticate?.toLowerCase().includes('dpop') ?? false,
        ...readCredentialRequestAuthShape(init),
        ...bodyShape!,
      }
      lastCredentialRequestWireFailure = wireError
      logWalletStep('oid4vci', 'credential-request-wire-error', wireError)
      // #region agent log
      fetch('http://127.0.0.1:7299/ingest/bf197faa-a717-4eb9-bdf8-a2aa24a25fe4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ade581' },
        body: JSON.stringify({
          sessionId: 'ade581',
          runId: 'invalid-token-v2',
          hypothesisId: 'H',
          location: 'retrieveViaOid4vc.ts:debugFetch',
          message: 'credential-request-wire-error',
          data: wireError,
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
    }
    return response
  }
}

function resolveOid4vcVciClientOptions(input?: Oid4vcRetrieveDpopInput) {
  if (!input?.dpopSession) {
    return { signJwtImpl: undefined }
  }

  return {
    signJwtImpl: createDpopSignJwtCallback(input.dpopSession),
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function withDeferredCredentialEndpoint(
  issuerMetadata: IssuerMetadataResult,
  deferredEndpoint: string,
): IssuerMetadataResult {
  return {
    ...issuerMetadata,
    credentialIssuer: {
      ...issuerMetadata.credentialIssuer,
      deferred_credential_endpoint: deferredEndpoint,
    },
  }
}

function readCredentialErrorResponseResult(error: unknown): {
  error?: string
  error_description?: string
  c_nonce?: string
  interval?: number
} {
  const roots: unknown[] = [error]
  if (error instanceof Error && error.cause !== undefined) {
    roots.push(error.cause)
  }

  for (const root of roots) {
    if (!isRecord(root) || !isRecord(root.response)) continue

    const errorParse =
      root.response.deferredCredentialErrorResponseResult ?? root.response.credentialErrorResponseResult
    if (isRecord(errorParse) && errorParse.success === true && isRecord(errorParse.data)) {
      const data = errorParse.data
      const oauthError = readString(data.error)
      if (!oauthError) continue

      return {
        error: oauthError,
        error_description: readString(data.error_description),
        c_nonce: readString(data.c_nonce),
        interval: readNumber(data.interval),
      }
    }
  }

  return {}
}

export function readHttpStatusFromError(error: unknown): number | undefined {
  const roots: unknown[] = [error]
  if (error instanceof Error && error.cause !== undefined) {
    roots.push(error.cause)
  }

  for (const root of roots) {
    if (!isRecord(root)) continue

    const directStatus = readNumber(root.status) ?? readNumber(root.httpStatus)
    if (directStatus !== undefined) return directStatus

    if (!isRecord(root.response)) continue

    const responseStatus = readNumber(root.response.status)
    if (responseStatus !== undefined) return responseStatus

    if (isRecord(root.response.response)) {
      const nestedStatus = readNumber(root.response.response.status)
      if (nestedStatus !== undefined) return nestedStatus
    }
  }

  return undefined
}

export function readOauthErrorFields(error: unknown): {
  error?: string
  error_description?: string
  interval?: number
} {
  const fromRetrieve = readCredentialErrorResponseResult(error)
  if (fromRetrieve.error) return fromRetrieve

  const candidates: unknown[] = [error]
  if (error instanceof Error && error.cause !== undefined) {
    candidates.push(error.cause)
  }
  if (isRecord(error)) {
    candidates.push(error.oauth2ErrorResponse, error.errorBody, error.body, error.cause)
  }

  for (const candidate of candidates) {
    const record = isRecord(candidate) ? candidate : undefined
    if (!record) continue

    const oauthError = readString(record.error)
    if (!oauthError) continue

    return {
      error: oauthError,
      error_description: readString(record.error_description),
      interval: readNumber(record.interval),
    }
  }

  if (error instanceof Error && 'textResponse' in error) {
    try {
      const parsed = JSON.parse(String(error.textResponse)) as unknown
      if (isRecord(parsed) && readString(parsed.error)) {
        return {
          error: readString(parsed.error),
          error_description: readString(parsed.error_description),
          interval: readNumber(parsed.interval),
        }
      }
    } catch {
      // ignore non-JSON error bodies
    }
  }

  return {}
}

function buildInvalidProofErrorMessage(errorDescription?: string): string {
  return errorDescription
    ? `CredentialRequestFailed: invalid_proof - ${errorDescription}`
    : 'CredentialRequestFailed: invalid_proof'
}

function readInvalidProofError(error: unknown): {
  error_description?: string
  c_nonce?: string
} | undefined {
  const credentialError = readCredentialErrorResponseResult(error)
  if (credentialError.error === 'invalid_proof') {
    return {
      error_description: credentialError.error_description,
      c_nonce: credentialError.c_nonce,
    }
  }

  const oauthError = readOauthErrorFields(error)
  if (oauthError.error === 'invalid_proof') {
    return { error_description: oauthError.error_description }
  }

  return undefined
}

async function throwInvalidProofErrorFromCredentialFailure(
  error: unknown,
  input: Pick<
    Parameters<typeof retrieveCredentialViaOid4vc>[0],
    'oid4vcContext' | 'fetchImpl' | 'signal'
  >,
): Promise<never> {
  const invalidProof = readInvalidProofError(error)
  if (!invalidProof) {
    throwMappedCredentialRequestError(error)
  } else {
    const cNonce =
      invalidProof.c_nonce ??
      (
        await requestNonceViaOid4vc({
          oid4vcContext: input.oid4vcContext,
          fetchImpl: input.fetchImpl,
          signal: input.signal,
        })
      ).c_nonce

    throw new InvalidProofError(buildInvalidProofErrorMessage(invalidProof.error_description), cNonce)
  }
}

function throwMappedCredentialRequestError(error: unknown): never {
  const oauthError = readOauthErrorFields(error)
  if (oauthError.error) {
    const detail = oauthError.error_description
      ? `${oauthError.error} - ${oauthError.error_description}`
      : oauthError.error
    throw new Error(`CredentialRequestFailed: ${detail}`, { cause: error })
  }

  throw new Error(`CredentialRequestFailed: ${toErrorMessage(error)}`, { cause: error })
}

export async function requestNonceViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<{ c_nonce: string; c_nonce_expires_in?: number }> {
  if (input.signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }

  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl })

  try {
    return await client.requestNonce({
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
    })
  } catch (error) {
    throw new Error(`CredentialNonceRequestFailed: ${toErrorMessage(error)}`)
  }
}

export async function retrieveAuthorizationCodeTokenViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  authorizationCodeExchange: Oid4vcAuthorizationCodeExchangeInput
  fetchImpl?: typeof fetch
  signal?: AbortSignal
} & Oid4vcRetrieveDpopInput): Promise<{
  access_token: string
  c_nonce: string
  credential_identifiers?: string[]
  authorization_details?: unknown[]
  dpop?: RequestDpopOptions
}> {
  if (input.signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }

  const clientOptions = resolveOid4vcVciClientOptions(input)
  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl, ...clientOptions })
  const exchange = input.authorizationCodeExchange

  try {
    const result = await client.retrieveAuthorizationCodeAccessTokenFromOffer({
      credentialOffer: input.oid4vcContext.credentialOfferObject,
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
      authorizationCode: exchange.authorizationCode,
      pkceCodeVerifier: exchange.codeVerifier,
      redirectUri: exchange.redirectUri,
      additionalRequestPayload: {
        client_id: exchange.clientId,
      },
      ...(input.dpop ? { dpop: input.dpop } : {}),
    })

    const accessTokenResponse = result.accessTokenResponse as Record<string, unknown>
    return {
      ...(accessTokenResponse as {
        access_token: string
        c_nonce: string
        credential_identifiers?: string[]
        authorization_details?: unknown[]
      }),
      ...(result.dpop ? { dpop: result.dpop } : {}),
    }
  } catch (error) {
    throw new Error(`CredentialTokenExchangeFailed: ${toErrorMessage(error)}`)
  }
}

export async function retrievePreAuthorizedTokenViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  txCode?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
} & Oid4vcRetrieveDpopInput): Promise<{
  access_token: string
  c_nonce: string
  credential_identifiers?: string[]
  authorization_details?: unknown[]
  dpop?: RequestDpopOptions
}> {
  if (input.signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }

  const clientOptions = resolveOid4vcVciClientOptions(input)
  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl, ...clientOptions })

  try {
    const result = await client.retrievePreAuthorizedCodeAccessTokenFromOffer({
      credentialOffer: input.oid4vcContext.credentialOfferObject,
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
      ...(input.txCode ? { txCode: input.txCode } : {}),
      ...(input.dpop ? { dpop: input.dpop } : {}),
    })

    const accessTokenResponse = result.accessTokenResponse as Record<string, unknown>
    return {
      ...(accessTokenResponse as {
        access_token: string
        c_nonce: string
        credential_identifiers?: string[]
        authorization_details?: unknown[]
      }),
      ...(result.dpop ? { dpop: result.dpop } : {}),
    }
  } catch (error) {
    throw new Error(`CredentialTokenExchangeFailed: ${toErrorMessage(error)}`)
  }
}

export async function retrieveCredentialViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  accessToken: string
  proofJwt: string
  credentialConfigurationId: string
  credentialIdentifier?: string
  additionalRequestPayload?: Record<string, unknown>
  fetchImpl?: typeof fetch
  signal?: AbortSignal
} & Oid4vcRetrieveDpopInput): Promise<Record<string, unknown>> {
  if (input.signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }

  const credentialFetch = createDebugCredentialFetch(input.fetchImpl)
  const clientOptions = resolveOid4vcVciClientOptions(input)
  const client = createOid4vcVciClient({
    ...clientOptions,
    fetchImpl: credentialFetch ?? input.fetchImpl,
  })
  const additionalKeys = input.additionalRequestPayload ? Object.keys(input.additionalRequestPayload) : []

  try {
    if (input.credentialIdentifier) {
      const credentialEndpoint = input.oid4vcContext.issuerMetadataResult.credentialIssuer.credential_endpoint
      const credentialRequest = {
        credential_identifier: input.credentialIdentifier,
        proofs: { jwt: [input.proofJwt] },
      }
      const response = await (credentialFetch ?? input.fetchImpl ?? fetch)(credentialEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.accessToken}`,
        },
        signal: input.signal,
        body: JSON.stringify(credentialRequest),
      })
      if (!response.ok) {
        const oauth = readOauthErrorFields(await response.clone().json().catch(() => undefined))
        throw new Error(
          oauth.error
            ? `CredentialRequestFailed: ${oauth.error}${oauth.error_description ? ` - ${oauth.error_description}` : ''}`
            : `CredentialRequestFailed: HTTP ${response.status}`,
          { cause: { response: { status: response.status }, ...oauth } },
        )
      }
      return (await response.json()) as Record<string, unknown>
    }

    const response = await client.retrieveCredentials({
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
      accessToken: input.accessToken,
      credentialConfigurationId: input.credentialConfigurationId,
      proofs: { jwt: [input.proofJwt] },
      ...(additionalKeys.length > 0 ? { additionalRequestPayload: input.additionalRequestPayload } : {}),
      ...(input.dpop ? { dpop: input.dpop } : {}),
    })

    return response as unknown as Record<string, unknown>
  } catch (error) {
    if (error instanceof InvalidProofError) {
      throw error
    }
    return await throwInvalidProofErrorFromCredentialFailure(error, input)
  }
}

export async function retrieveDeferredCredentialsViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  accessToken: string
  transactionId: string
  deferredEndpoint: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
} & Oid4vcRetrieveDpopInput): Promise<Record<string, unknown>> {
  if (input.signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }

  const clientOptions = resolveOid4vcVciClientOptions(input)
  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl, ...clientOptions })
  const issuerMetadata = withDeferredCredentialEndpoint(
    input.oid4vcContext.issuerMetadataResult,
    input.deferredEndpoint,
  )

  try {
    const response = await client.retrieveDeferredCredentials({
      issuerMetadata,
      accessToken: input.accessToken,
      transactionId: input.transactionId,
      ...(input.dpop ? { dpop: input.dpop } : {}),
    })

    return response as unknown as Record<string, unknown>
  } catch (error) {
    const oauthError = readOauthErrorFields(error)
    const httpStatus = readHttpStatusFromError(error)

    if (oauthError.error) {
      const detail = oauthError.error_description
        ? `${oauthError.error} - ${oauthError.error_description}`
        : oauthError.error
      const prefix = httpStatus !== undefined ? `HTTP ${httpStatus}: ` : ''
      throw new Error(`DeferredCredentialFailed: ${prefix}${detail}`, { cause: error })
    }

    if (error instanceof Error && 'response' in error && isRecord(error.response)) {
      const responseStatus = readNumber(error.response.status)
      if (responseStatus !== undefined) {
        throw new Error(`DeferredCredentialFailed: HTTP ${responseStatus}: unknown_error`, { cause: error })
      }
    }

    throw new Error(`DeferredCredentialFetchFailed: ${toErrorMessage(error)}`, { cause: error })
  }
}
