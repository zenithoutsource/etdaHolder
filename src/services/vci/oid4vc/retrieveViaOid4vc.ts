import {
  type IssuerMetadataResult,
} from '@openid4vc/openid4vci'
import type { RequestDpopOptions } from '@openid4vc/oauth2'

import { isRecord, readString, toErrorMessage, decodeJwtHeader, decodeJwtPayload } from '@/src/utils/jwtUtils'

import { logWalletStep } from '@/src/services/debug/walletLogger'
import { InvalidProofError } from '../invalidProofError'
import { createDpopProofJwt, createDpopSignJwtCallback, type DpopIssuanceSession } from '@/src/services/oid4vc/dpopIssuanceSession'
import { createOid4vcVciClient } from './createOid4vcVciClient'
import { resolveTokenClientAuthentication } from './tokenClientAuthentication'
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

function readProofJwtFromCredentialBody(parsed: Record<string, unknown>): string | undefined {
  if (isRecord(parsed.proofs) && Array.isArray(parsed.proofs.jwt)) {
    return readString(parsed.proofs.jwt[0])
  }
  if (isRecord(parsed.proof)) {
    return readString(parsed.proof.jwt)
  }
  return undefined
}

function readProofJwtWireDiagnostics(body: unknown): Record<string, unknown> {
  if (typeof body !== 'string') {
    return { bodyParseable: false }
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const proofJwt = readProofJwtFromCredentialBody(parsed)
    const header = proofJwt ? decodeJwtHeader(proofJwt) : undefined
    const payload = proofJwt ? decodeJwtPayload(proofJwt) : undefined
    const headerHasJwk = Boolean(header && 'jwk' in header)
    const headerHasKid = Boolean(header && 'kid' in header)
    const aud = payload ? readString(payload.aud) : undefined
    const nonce = payload ? readString(payload.nonce) : undefined
    return {
      bodyKeys: Object.keys(parsed),
      usesLegacyProofObject: Object.prototype.hasOwnProperty.call(parsed, 'proof'),
      usesProofsObject: Object.prototype.hasOwnProperty.call(parsed, 'proofs'),
      compactTokenCount: isRecord(parsed.proofs) && Array.isArray(parsed.proofs.jwt)
        ? parsed.proofs.jwt.length
        : 0,
      headerTyp: header ? readString(header.typ) : undefined,
      headerAlg: header ? readString(header.alg) : undefined,
      headerHasJwk,
      headerHasKid,
      headerHasBothJwkAndKid: headerHasJwk && headerHasKid,
      payloadHasAud: Boolean(aud),
      payloadAud: aud,
      payloadHasNonce: Boolean(nonce),
      payloadNonceLen: nonce?.length,
      payloadHasIss: Boolean(payload && readString(payload.iss)),
      payloadHasIat: Boolean(payload && payload.iat != null),
    }
  } catch {
    return { bodyParseable: false }
  }
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
      logWalletStep('oid4vci', 'debug-credential-proof-shape', readProofJwtWireDiagnostics(init?.body))
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
    }
    return response
  }
}

function resolveDpopClientOptions(input?: Oid4vcRetrieveDpopInput) {
  if (!input?.dpopSession) {
    return { signJwtImpl: undefined }
  }

  return {
    signJwtImpl: createDpopSignJwtCallback(input.dpopSession),
  }
}

async function resolveTokenRetrieveClientOptions(
  input: Oid4vcRetrieveDpopInput & { oid4vcContext: Oid4vcVciAdapterContext },
) {
  return {
    ...resolveDpopClientOptions(input),
    clientAuthentication: await resolveTokenClientAuthentication(input.oid4vcContext.issuerMetadataResult),
  }
}

function readOfferCredentialIssuer(oid4vcContext: Oid4vcVciAdapterContext): string | undefined {
  return readString(oid4vcContext.credentialOfferObject.credential_issuer)
}

/**
 * OID4VCI 1.0 recommends `resource` = Credential Issuer Identifier.
 * Origin metadata walks can leave `issuerMetadata.credential_issuer` as the
 * host origin while the offer still uses a session-path identifier. The AS
 * binds the pre-authorized code to that offer identifier, so sending the
 * origin as `resource` yields `invalid_grant`.
 */
function withOfferResourcePayload(
  oid4vcContext: Oid4vcVciAdapterContext,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const resource = readOfferCredentialIssuer(oid4vcContext)
  return {
    ...extra,
    ...(resource ? { resource } : {}),
  }
}

function rethrowTokenExchangeError(error: unknown): never {
  const message = toErrorMessage(error)
  if (message.startsWith('WalletAttestationRequired')) {
    throw error instanceof Error ? error : new Error(message)
  }
  throw new Error(`CredentialTokenExchangeFailed: ${message}`)
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

async function resolveCNonceForProof(input: {
  accessTokenResponse: Record<string, unknown>
  oid4vcContext: Oid4vcVciAdapterContext
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<string> {
  const fromToken = readString(input.accessTokenResponse.c_nonce)
  if (fromToken) return fromToken

  logWalletStep('oid4vci', 'token-nonce-from-endpoint', {
    nonceEndpoint: readString(input.oid4vcContext.issuerMetadataResult.credentialIssuer.nonce_endpoint),
  })
  const requested = await requestNonceViaOid4vc({
    oid4vcContext: input.oid4vcContext,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  })
  const cNonce = readString(requested.c_nonce)
  if (!cNonce) {
    throw new Error('CredentialNonceRequestFailed: nonce endpoint returned an empty c_nonce')
  }
  return cNonce
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

  const clientOptions = await resolveTokenRetrieveClientOptions(input)
  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl, ...clientOptions })
  const exchange = input.authorizationCodeExchange

  try {
    const result = await client.retrieveAuthorizationCodeAccessTokenFromOffer({
      credentialOffer: input.oid4vcContext.credentialOfferObject,
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
      authorizationCode: exchange.authorizationCode,
      pkceCodeVerifier: exchange.codeVerifier,
      redirectUri: exchange.redirectUri,
      additionalRequestPayload: withOfferResourcePayload(input.oid4vcContext, {
        client_id: exchange.clientId,
      }),
      ...(input.dpop ? { dpop: input.dpop } : {}),
    })

    const accessTokenResponse = result.accessTokenResponse as Record<string, unknown>
    const accessToken = readString(accessTokenResponse.access_token)
    if (!accessToken) {
      throw new Error('access_token is required')
    }
    const cNonce = await resolveCNonceForProof({
      accessTokenResponse,
      oid4vcContext: input.oid4vcContext,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    })
    return {
      ...(accessTokenResponse as {
        access_token: string
        c_nonce: string
        credential_identifiers?: string[]
        authorization_details?: unknown[]
      }),
      access_token: accessToken,
      c_nonce: cNonce,
      ...(result.dpop ? { dpop: result.dpop } : {}),
    }
  } catch (error) {
    rethrowTokenExchangeError(error)
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

  const clientOptions = await resolveTokenRetrieveClientOptions(input)
  const client = createOid4vcVciClient({ fetchImpl: input.fetchImpl, ...clientOptions })
  const tokenResource = readOfferCredentialIssuer(input.oid4vcContext)
  const authorizationServer = input.oid4vcContext.issuerMetadataResult.authorizationServers?.[0]
  logWalletStep('oid4vci', 'token-retrieve-start', {
    metadataIssuer: readString(input.oid4vcContext.issuerMetadataResult.credentialIssuer.credential_issuer),
    resource: tokenResource,
    tokenEndpoint: readString(authorizationServer?.token_endpoint),
    asIssuer: readString(authorizationServer?.issuer),
    txCodeProvided: Boolean(input.txCode),
  })

  try {
    const result = await client.retrievePreAuthorizedCodeAccessTokenFromOffer({
      credentialOffer: input.oid4vcContext.credentialOfferObject,
      issuerMetadata: input.oid4vcContext.issuerMetadataResult,
      additionalRequestPayload: withOfferResourcePayload(input.oid4vcContext),
      ...(input.txCode ? { txCode: input.txCode } : {}),
      ...(input.dpop ? { dpop: input.dpop } : {}),
    })

    const accessTokenResponse = result.accessTokenResponse as Record<string, unknown>
    const accessToken = readString(accessTokenResponse.access_token)
    if (!accessToken) {
      throw new Error('access_token is required')
    }
    const cNonce = await resolveCNonceForProof({
      accessTokenResponse,
      oid4vcContext: input.oid4vcContext,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    })
    return {
      ...(accessTokenResponse as {
        access_token: string
        c_nonce: string
        credential_identifiers?: string[]
        authorization_details?: unknown[]
      }),
      access_token: accessToken,
      c_nonce: cNonce,
      ...(result.dpop ? { dpop: result.dpop } : {}),
    }
  } catch (error) {
    rethrowTokenExchangeError(error)
  }
}

function readDpopNonceHeader(response: Response): string | undefined {
  return response.headers.get('DPoP-Nonce') ?? response.headers.get('dpop-nonce') ?? undefined
}

function throwCredentialIdentifierRequestFailed(response: Response, oauth: ReturnType<typeof readOauthErrorFields>): never {
  throw new Error(
    oauth.error
      ? `CredentialRequestFailed: ${oauth.error}${oauth.error_description ? ` - ${oauth.error_description}` : ''}`
      : `CredentialRequestFailed: HTTP ${response.status}`,
    { cause: { response: { status: response.status }, ...oauth } },
  )
}

async function postCredentialIdentifierRequest(input: {
  fetchImpl: typeof fetch
  credentialEndpoint: string
  credentialIdentifier: string
  proofJwt: string
  accessToken: string
  signal?: AbortSignal
  dpop?: RequestDpopOptions
  dpopSession?: DpopIssuanceSession
}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (input.dpop && input.dpopSession) {
    const dpopJwt = await createDpopProofJwt({
      session: input.dpopSession,
      htm: 'POST',
      htu: input.credentialEndpoint,
      accessToken: input.accessToken,
      nonce: input.dpopSession.nonce ?? input.dpop.nonce,
    })
    headers.Authorization = `DPoP ${input.accessToken}`
    headers.DPoP = dpopJwt
  } else {
    headers.Authorization = `Bearer ${input.accessToken}`
  }

  return input.fetchImpl(input.credentialEndpoint, {
    method: 'POST',
    headers,
    signal: input.signal,
    body: JSON.stringify({
      credential_identifier: input.credentialIdentifier,
      proofs: { jwt: [input.proofJwt] },
    }),
  })
}

function isCredentialConfigurationRecord(
  value: unknown,
): value is Record<string, unknown> & { format: string } {
  return isRecord(value) && typeof value.format === 'string' && value.format.length > 0
}

function readSingleCredentialConfiguration(
  configurations: Record<string, unknown> | undefined,
): (Record<string, unknown> & { format: string }) | undefined {
  if (!configurations) return undefined
  const values = Object.values(configurations)
  if (values.length !== 1) return undefined
  return isCredentialConfigurationRecord(values[0]) ? values[0] : undefined
}

/**
 * Origin Credential Issuer metadata can list a different configuration id than
 * the offer. The wallet still requests the offered id (OID4VCI 1.0
 * `credential_configuration_id`). The library looks that id up in metadata
 * before POST, so copy a known/offered template under the offered id.
 */
function withOfferedCredentialConfiguration(
  issuerMetadata: IssuerMetadataResult,
  credentialConfigurationId: string,
  offeredConfiguration?: Record<string, unknown>,
): IssuerMetadataResult {
  const supported = {
    ...(issuerMetadata.credentialIssuer.credential_configurations_supported ?? {}),
  }
  const known = { ...(issuerMetadata.knownCredentialConfigurations ?? {}) }
  if (supported[credentialConfigurationId] && known[credentialConfigurationId]) {
    return issuerMetadata
  }

  const template =
    (isCredentialConfigurationRecord(offeredConfiguration) ? offeredConfiguration : undefined) ??
    (isCredentialConfigurationRecord(known[credentialConfigurationId])
      ? known[credentialConfigurationId]
      : undefined) ??
    (isCredentialConfigurationRecord(supported[credentialConfigurationId])
      ? supported[credentialConfigurationId]
      : undefined) ??
    readSingleCredentialConfiguration(known) ??
    readSingleCredentialConfiguration(supported)

  if (!template) return issuerMetadata

  logWalletStep('oid4vci', 'credential-configuration-overlay', {
    credentialConfigurationId,
    format: template.format,
  })

  const configuration = { ...template }
  return {
    ...issuerMetadata,
    knownCredentialConfigurations: {
      ...known,
      [credentialConfigurationId]: configuration,
    } as IssuerMetadataResult['knownCredentialConfigurations'],
    credentialIssuer: {
      ...issuerMetadata.credentialIssuer,
      credential_configurations_supported: {
        ...supported,
        [credentialConfigurationId]: configuration,
      },
    },
  }
}

export async function retrieveCredentialViaOid4vc(input: {
  oid4vcContext: Oid4vcVciAdapterContext
  accessToken: string
  proofJwt: string
  credentialConfigurationId: string
  credentialConfiguration?: Record<string, unknown>
  credentialIdentifier?: string
  additionalRequestPayload?: Record<string, unknown>
  fetchImpl?: typeof fetch
  signal?: AbortSignal
} & Oid4vcRetrieveDpopInput): Promise<Record<string, unknown>> {
  if (input.signal?.aborted) {
    throw new Error('CredentialAcquisitionAborted')
  }

  const credentialFetch = createDebugCredentialFetch(input.fetchImpl)
  const clientOptions = resolveDpopClientOptions(input)
  const client = createOid4vcVciClient({
    ...clientOptions,
    fetchImpl: credentialFetch ?? input.fetchImpl,
  })
  const additionalKeys = input.additionalRequestPayload ? Object.keys(input.additionalRequestPayload) : []

  try {
    if (input.credentialIdentifier) {
      const credentialEndpoint = input.oid4vcContext.issuerMetadataResult.credentialIssuer.credential_endpoint
      if (!credentialEndpoint) {
        throw new Error('CredentialRequestFailed: credential_endpoint is missing')
      }
      const credentialFetchImpl = credentialFetch ?? input.fetchImpl ?? fetch
      const postInput = {
        fetchImpl: credentialFetchImpl,
        credentialEndpoint,
        credentialIdentifier: input.credentialIdentifier,
        proofJwt: input.proofJwt,
        accessToken: input.accessToken,
        signal: input.signal,
        dpop: input.dpop,
        dpopSession: input.dpopSession,
      }
      let response = await postCredentialIdentifierRequest(postInput)
      if (!response.ok && input.dpop && input.dpopSession) {
        const dpopNonce = readDpopNonceHeader(response)
        if (dpopNonce && dpopNonce !== input.dpopSession.nonce) {
          input.dpopSession.nonce = dpopNonce
          response = await postCredentialIdentifierRequest(postInput)
        }
      }
      if (!response.ok) {
        const oauth = readOauthErrorFields(await response.clone().json().catch(() => undefined))
        throwCredentialIdentifierRequestFailed(response, oauth)
      }
      return (await response.json()) as Record<string, unknown>
    }

    const response = await client.retrieveCredentials({
      issuerMetadata: withOfferedCredentialConfiguration(
        input.oid4vcContext.issuerMetadataResult,
        input.credentialConfigurationId,
        input.credentialConfiguration,
      ),
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

  const clientOptions = resolveDpopClientOptions(input)
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
