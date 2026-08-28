/**
 * Normalizes Digital Credentials API platform payloads into authenticated OID4VP requests.
 */
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { isRecord, readString, toErrorMessage } from '@/src/utils/jwtUtils'

import {
  authenticateDcApiSignedRequest,
  type AuthenticatedDcApiSignedRequest,
} from './dcApiTrustPolicy'
import {
  readSignedDcApiRequestShape,
  resolveCompactJarFromSignedDcApiRequest,
} from './dcApiSignedRequestNormalizer'
import { parseDcqlCredentialSets } from '../dcqlCredentialSetResolver'
import type {
  DcqlClaimsQuery,
  DcqlCredentialQuery,
  DcqlQuery,
  TrustedVerifier,
} from '../presentationService'

export type DcApiProtocol = 'openid4vp-v1-unsigned' | 'openid4vp-v1-signed'

export type DcApiIncomingRequest = {
  sessionId: string
  protocol: DcApiProtocol
  origin: string
  request: Record<string, unknown>
}

export type ParsedDcApiRequest = {
  sessionId: string
  protocol: DcApiProtocol
  origin: string
  isSignedRequest: boolean
  authorizationRequest: Record<string, unknown>
  responseMode: 'dc_api' | 'dc_api.jwt'
  dcqlQuery: DcqlQuery
  signedRequest?: AuthenticatedDcApiSignedRequest
}

export type ParseDcApiIncomingRequestOptions = {
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
}

export async function parseDcApiIncomingRequest(
  input: DcApiIncomingRequest,
  options: ParseDcApiIncomingRequestOptions,
): Promise<ParsedDcApiRequest> {
  assertSupportedProtocol(input.protocol)

  if (input.protocol === 'openid4vp-v1-signed') {
    const requestShape = readSignedDcApiRequestShape(input.request)
    logWalletStep('oid4vp', 'dc-api-signed-request-shape', {
      origin: input.origin,
      ...requestShape,
    })

    const jar = await resolveCompactJarFromSignedDcApiRequest(
      input.request,
      options.fetchImpl ?? fetch,
    )

    const signedRequest = await authenticateDcApiSignedRequest({
      request: jar,
      origin: input.origin,
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl,
    })
    const dcqlQuery = readRequiredDcqlQuery(signedRequest.authorizationRequest)

    return {
      sessionId: input.sessionId,
      protocol: input.protocol,
      origin: input.origin,
      isSignedRequest: true,
      authorizationRequest: signedRequest.authorizationRequest,
      responseMode: signedRequest.responseMode,
      dcqlQuery,
      signedRequest,
    }
  }

  const authorizationRequest = { ...input.request }
  const responseMode = readString(authorizationRequest.response_mode)
  if (!responseMode) {
    throw new Error('PresentationRequestInvalid: dc_api response_mode is required')
  }
  assertSupportedDcApiResponseMode(responseMode)

  return {
    sessionId: input.sessionId,
    protocol: input.protocol,
    origin: input.origin,
    isSignedRequest: false,
    authorizationRequest,
    responseMode,
    dcqlQuery: readRequiredDcqlQuery(authorizationRequest),
  }
}

export function assertSupportedDcApiResponseMode(
  mode: string,
): asserts mode is 'dc_api' | 'dc_api.jwt' {
  if (mode !== 'dc_api' && mode !== 'dc_api.jwt') {
    throw new Error(`PresentationRequestUnsupported: response_mode ${mode} is not supported for DC API`)
  }
}

function assertSupportedProtocol(protocol: string): asserts protocol is DcApiProtocol {
  if (protocol !== 'openid4vp-v1-unsigned' && protocol !== 'openid4vp-v1-signed') {
    throw new Error(`PresentationRequestUnsupported: DC API protocol ${protocol} is not supported`)
  }
}

function readRequiredDcqlQuery(authorizationRequest: Record<string, unknown>): DcqlQuery {
  const rawQuery = readDcqlQueryValue(authorizationRequest.dcql_query)
  const credentials = Array.isArray(rawQuery?.credentials)
    ? rawQuery.credentials
      .map(readDcqlCredentialQuery)
      .filter((credential): credential is DcqlCredentialQuery => Boolean(credential))
    : []

  if (credentials.length === 0) {
    throw new Error('PresentationRequestInvalid: dc_api requires dcql_query.credentials')
  }

  const credentialSets = parseDcqlCredentialSets(rawQuery?.credential_sets)
  return {
    credentials,
    ...(credentialSets ? { credentialSets } : {}),
  }
}

function readDcqlQueryValue(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: dcql_query must be valid JSON (${toErrorMessage(error)})`)
  }
}

function readDcqlCredentialQuery(value: unknown): DcqlCredentialQuery | undefined {
  if (!isRecord(value)) return undefined
  const id = typeof value.id === 'string'
    ? value.id
    : typeof value.id === 'number' && Number.isFinite(value.id)
      ? String(value.id)
      : undefined
  if (!id) return undefined

  const meta = isRecord(value.meta) ? value.meta : undefined
  const typeValues = readStringArray(meta?.type_values)
  const vctValues = readStringArray(meta?.vct_values)
  const doctypeValue = readString(meta?.doctype_value)
  const claims = Array.isArray(value.claims)
    ? value.claims.map(readDcqlClaim).filter((claim): claim is DcqlClaimsQuery => Boolean(claim))
    : []
  const claimSets = Array.isArray(value.claim_sets)
    ? value.claim_sets
      .map((set) => readStringArray(set))
      .filter((set) => set.length > 0)
    : []

  return {
    id,
    ...(readString(value.format) ? { format: readString(value.format) } : {}),
    ...(typeof value.require_cryptographic_holder_binding === 'boolean'
      ? { require_cryptographic_holder_binding: value.require_cryptographic_holder_binding }
      : {}),
    ...(typeValues.length > 0 || vctValues.length > 0 || doctypeValue
      ? {
          meta: {
            ...(typeValues.length > 0 ? { type_values: typeValues } : {}),
            ...(vctValues.length > 0 ? { vct_values: vctValues } : {}),
            ...(doctypeValue ? { doctype_value: doctypeValue } : {}),
          },
        }
      : {}),
    ...(claims.length > 0 ? { claims } : {}),
    ...(claimSets.length > 0 ? { claimSets } : {}),
  }
}

function readDcqlClaim(value: unknown): DcqlClaimsQuery | undefined {
  if (!isRecord(value) || !Array.isArray(value.path)) return undefined
  const path = readStringArray(value.path)
  if (path.length === 0) return undefined
  return { path, ...(readString(value.id) ? { id: readString(value.id) } : {}) }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
