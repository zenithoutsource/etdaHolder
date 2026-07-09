import { readCredentialHolderProfile } from '../credentials/credentialDisplay'
import { getCardSchema } from '../../config/cardSchemas'
import {
  isSdJwtKbDisabledForTesting,
  readVerifierDcqlVpTokenShape,
  readVerifierKbAudienceMode,
} from '../../config/runtimeFlags'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { decodeJwtPayload, isRecord, readString, toErrorMessage } from '@/src/utils/jwtUtils'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { parseAuthorizationRequestBody } from './authorizationRequestJar'
import { parseClientId, readResponseUriMatchesClientId } from './clientIdScheme'
import {
  assertNoSetDcqlCardinality,
  assertSupportedDcqlRequest,
  canWalletSatisfyDcqlCredentialQuery,
  isCredentialCompatibleWithDcqlFormat,
  isCredentialCompatibleWithDcqlMetadata,
  readCredentialTypeFromDcqlTypeValue,
} from './dcqlCredentialMatch'
import { parseDcqlCredentialSets, resolveDcqlCredentialSelection } from './dcqlCredentialSetResolver'
import { assertDualFormatPresentationReady, isDualFormatDcqlRequest, isSdJwtSideCompatibleWithDualFormatRequest } from './dualFormatPresentationMatch'
import { isPreformattedDualFormatVpToken } from './dualFormatVpToken'
import { fetchPresentationDefinition } from './presentationDefinitionResolver'

type JsonRecord = Record<string, unknown>

export type TrustedVerifier = {
  clientId: string
  name: string
  allowedOrigins: string[]
  verificationJwk?: Record<string, unknown>
}

export type PresentationDisclosure = {
  key: string
  label: string
  value: string
}

export type PresentationDefinitionField = {
  path?: string[]
}

export type PresentationDefinitionInputDescriptor = {
  id: string
  constraints?: {
    fields?: PresentationDefinitionField[]
  }
}

export type PresentationDefinition = {
  id: string
  input_descriptors: PresentationDefinitionInputDescriptor[]
}

export type DcqlClaimsQuery = {
  path: string[]
}

export type DcqlCredentialQuery = {
  id: string
  format?: string
  require_cryptographic_holder_binding?: boolean
  meta?: {
    type_values?: string[]
    vct_values?: string[]
  }
  claims?: DcqlClaimsQuery[]
}

export type DcqlCredentialSetQuery = {
  options: string[][]
  required?: boolean
}

export type DcqlQuery = {
  credentials: DcqlCredentialQuery[]
  credentialSets?: DcqlCredentialSetQuery[]
}

export type ResolvedPresentationRequest = {
  requestUri: string
  clientId: string
  responseUri: string
  responseMode: 'direct_post'
  nonce: string
  state?: string
  presentationDefinition?: PresentationDefinition
  dcqlQuery?: DcqlQuery
  verifier: TrustedVerifier
  matchedCredential: VerifiableCredentialRecord
  disclosures: PresentationDisclosure[]
}

export type PresentationSubmission = {
  id: string
  definition_id: string
  descriptor_map: {
    id: string
    format: 'jwt_vc'
    path: string
  }[]
}

export type ResolvePresentationRequestOptions = {
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
}

export type SubmitPresentationResponseOptions = {
  vpToken: string
  presentationSubmission?: PresentationSubmission
  fetchImpl?: typeof fetch
}

export type VerifierResponse = {
  status: string
  message?: string
}

export type PresentationTokenMode = 'signed-vp-jwt' | 'raw-credential' | 'sd-jwt-kb'

type PresentationTokenModeOptions =
  | boolean
  | {
    sdJwtKbDisabledForTesting?: boolean
  }


const SUPPORTED_RESPONSE_MODE = 'direct_post'
const THAI_ID_TYPE = 'ThaiNationalID'
const TRANSCRIPT_TYPE = 'BangkokUniversityTranscript'
const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'
const BIRTH_DATE_PATHS = new Set(['$.birthDate', '$.birthdate', '$.birth_date', '$.dateOfBirth', '$.date_of_birth', '$.dob'])
const BIRTH_DATE_KEYS = ['birthDate', 'birthdate', 'birth_date', 'dateOfBirth', 'date_of_birth', 'dob']

export function isOid4VpAuthorizationRequest(raw: string): boolean {
  if (!raw.trim()) return false

  try {
    const parsed = new URL(raw)
    if (parsed.protocol === 'openid4vp:') return true
    return parsed.searchParams.get('response_type') === 'vp_token'
  } catch {
    return false
  }
}

export async function resolvePresentationRequest(
  rawRequestUri: string,
  credentials: VerifiableCredentialRecord[],
  options: ResolvePresentationRequestOptions,
): Promise<ResolvedPresentationRequest> {
  logWalletStep('oid4vp', 'resolve-request-start', {
    requestUriBytes: rawRequestUri.length,
    credentialCandidates: credentials.map((credential) => ({
      id: credential.id,
      type: credential.type,
      credentialKind: isCompactSdJwt(credential.rawVc)
        ? 'sd-jwt'
        : isCompactJwtVc(credential.rawVc)
          ? 'jwt-vc'
          : 'unknown',
    })),
  })
  const authorizationRequest = await readAuthorizationRequest(rawRequestUri, {
    fetchImpl: options.fetchImpl,
    trustedVerifiers: options.trustedVerifiers,
  })
  const clientId = readRequiredString(authorizationRequest, 'client_id', 'PresentationRequestInvalid')
  const responseUri = readRequiredString(authorizationRequest, 'response_uri', 'PresentationRequestInvalid')
  const responseMode = readRequiredString(authorizationRequest, 'response_mode', 'PresentationRequestInvalid')
  const nonce = readRequiredString(authorizationRequest, 'nonce', 'PresentationRequestInvalid')

  if (responseMode !== SUPPORTED_RESPONSE_MODE) {
    throw new Error(`PresentationRequestUnsupported: response_mode ${responseMode} is not supported`)
  }

  assertMutuallyExclusiveQueryLanguages(authorizationRequest)

  const verifier = findTrustedVerifier(clientId, responseUri, options.trustedVerifiers)
  if (!verifier) {
    throw new Error('VerifierUntrusted: did:web client_id and response_uri origin must be allowlisted')
  }

  const presentationDefinition = await resolvePresentationDefinitionFromRequest(
    authorizationRequest,
    verifier,
    options.fetchImpl ?? fetch,
  )
  const dcqlQuery = readOptionalDcqlQuery(authorizationRequest)
  if (!presentationDefinition && !dcqlQuery) {
    throw new Error('PresentationRequestInvalid: presentation_definition or dcql_query is required')
  }
  if (presentationDefinition) {
    assertSupportedBirthDateRequest(presentationDefinition)
  }

  let effectiveDcqlQuery = dcqlQuery
  if (dcqlQuery) {
    if (dcqlQuery.credentialSets && dcqlQuery.credentialSets.length > 0) {
      effectiveDcqlQuery = resolveDcqlCredentialSelection(dcqlQuery, credentials)
      logWalletStep('oid4vp', 'dcql-credential-set-selected', {
        selectedCredentialQueryId: effectiveDcqlQuery.credentials[0]?.id,
      })
    } else {
      assertNoSetDcqlCardinality(dcqlQuery)
      effectiveDcqlQuery = dcqlQuery
    }

    assertSupportedDcqlRequest(effectiveDcqlQuery)
  }

  const requestedTypes = effectiveDcqlQuery ? readRequestedCredentialTypes(effectiveDcqlQuery) : [THAI_ID_TYPE]
  const matchedCredential = credentials.find((record) => {
    if (presentationDefinition) {
      return (
        requestedTypes.includes(record.type) &&
        hasRequiredClaimForRequest(record, { presentationDefinition, dcqlQuery: effectiveDcqlQuery })
      )
    }

    if (!effectiveDcqlQuery) return false

    if (isDualFormatDcqlRequest(effectiveDcqlQuery)) {
      return isSdJwtSideCompatibleWithDualFormatRequest(record, effectiveDcqlQuery)
    }

    return effectiveDcqlQuery.credentials.every((credential) =>
      canWalletSatisfyDcqlCredentialQuery(record, credential),
    )
  })
  if (!matchedCredential) {
    const candidateCredentials = credentials.filter((record) => {
      if (presentationDefinition) {
        return (
          requestedTypes.includes(record.type) &&
          hasRequiredClaimForRequest(record, { presentationDefinition, dcqlQuery: effectiveDcqlQuery })
        )
      }

      if (!effectiveDcqlQuery) return false

      if (isDualFormatDcqlRequest(effectiveDcqlQuery)) {
        return isSdJwtSideCompatibleWithDualFormatRequest(record, effectiveDcqlQuery)
      }

      const mappedTypes = effectiveDcqlQuery.credentials
        .flatMap((credential) => credential.meta?.type_values ?? [])
        .map(readCredentialTypeFromDcqlTypeValue)
        .filter((type): type is string => Boolean(type))

      if (mappedTypes.length > 0 && !mappedTypes.includes(record.type)) {
        return false
      }

      return true
    })
    const formatCompatibleCredentials = candidateCredentials.filter((record) => {
      if (presentationDefinition) return true
      if (!effectiveDcqlQuery) return false

      if (isDualFormatDcqlRequest(effectiveDcqlQuery)) {
        return isSdJwtSideCompatibleWithDualFormatRequest(record, effectiveDcqlQuery)
      }

      return effectiveDcqlQuery.credentials.every((credential) =>
        isCredentialCompatibleWithDcqlFormat(record, credential.format),
      )
    })
    if (formatCompatibleCredentials.length > 0) {
      const metadataCompatibleCredentials = formatCompatibleCredentials.filter((record) => {
        if (!effectiveDcqlQuery || isDualFormatDcqlRequest(effectiveDcqlQuery)) return true
        return effectiveDcqlQuery.credentials.every((credential) =>
          isCredentialCompatibleWithDcqlMetadata(record, credential),
        )
      })
      if (metadataCompatibleCredentials.length === 0) {
        throw new Error(`PresentationCredentialMetadataMismatch: ${describeCredentialMetadataMismatch(effectiveDcqlQuery, formatCompatibleCredentials)}`)
      }
      throw new Error('PresentationCredentialMissing: requested credential is not available')
    }
    if (candidateCredentials.length > 0) {
      throw new Error('PresentationCredentialFormatUnsupported: stored credential format does not match the Verifier request')
    }
    throw new Error('PresentationCredentialMissing: requested credential is not available')
  }

  if (effectiveDcqlQuery && isDualFormatDcqlRequest(effectiveDcqlQuery)) {
    await assertDualFormatPresentationReady(matchedCredential)
  }

  const dcqlClaimDisclosures = effectiveDcqlQuery ? readDcqlClaimDisclosures(matchedCredential, effectiveDcqlQuery) : undefined
  const disclosures = presentationDefinition
    ? readBirthDateDisclosures(matchedCredential)
    : dcqlClaimDisclosures ?? [readCredentialDisclosure(matchedCredential)]
  const resolvedRequest: ResolvedPresentationRequest = {
    requestUri: rawRequestUri,
    clientId,
    responseUri,
    responseMode: SUPPORTED_RESPONSE_MODE,
    nonce,
    ...(readString(authorizationRequest.state) ? { state: readString(authorizationRequest.state) } : {}),
    ...(presentationDefinition ? { presentationDefinition } : {}),
    ...(effectiveDcqlQuery ? { dcqlQuery: effectiveDcqlQuery } : {}),
    verifier,
    matchedCredential,
    disclosures,
  }
  logResolvedPresentationRequest(resolvedRequest, authorizationRequest, readDisclosureSource({
    presentationDefinition,
    dcqlQuery: effectiveDcqlQuery,
    dcqlClaimDisclosures,
  }))
  logWalletStep('oid4vp', 'resolve-request-complete', {
    clientId,
    responseUri,
    verifierName: verifier.name,
    matchedCredentialId: matchedCredential.id,
    matchedCredentialType: matchedCredential.type,
    selectedItemsCount: disclosures.length,
    requestKind: effectiveDcqlQuery ? 'dcql' : 'presentation_definition',
  })

  return resolvedRequest
}

export function buildPresentationSubmission(request: ResolvedPresentationRequest): PresentationSubmission {
  if (!request.presentationDefinition) {
    throw new Error('PresentationRequestUnsupported: presentation_submission is only available for Presentation Exchange')
  }
  const descriptor = request.presentationDefinition.input_descriptors[0]
  if (!descriptor) {
    throw new Error('PresentationRequestInvalid: input_descriptors is required')
  }

  return {
    id: `presentation-submission:${request.presentationDefinition.id}`,
    definition_id: request.presentationDefinition.id,
    descriptor_map: [
      {
        id: descriptor.id,
        format: 'jwt_vc',
        path: '$.vp.verifiableCredential[0]',
      },
    ],
  }
}

export function readPresentationTokenMode(
  request: ResolvedPresentationRequest,
  options: PresentationTokenModeOptions = {},
): PresentationTokenMode {
  const sdJwtKbDisabledForTesting = typeof options === 'boolean'
    ? options
    : options.sdJwtKbDisabledForTesting ?? isSdJwtKbDisabledForTesting()
  if (
    request.dcqlQuery?.credentials.every((credential) =>
      credential.format === 'dc+sd-jwt' || credential.format === 'vc+sd-jwt',
    )
  ) {
    return request.dcqlQuery.credentials.every((credential) =>
      credential.require_cryptographic_holder_binding === false ||
      (sdJwtKbDisabledForTesting && credential.require_cryptographic_holder_binding !== true),
    )
      ? 'raw-credential'
      : 'sd-jwt-kb'
  }

  return 'signed-vp-jwt'
}

export function readPresentationTokenAudience(request: Pick<ResolvedPresentationRequest, 'clientId' | 'responseUri'>): string {
  return readVerifierKbAudienceMode() === 'response_uri' ? request.responseUri : request.clientId
}

export async function submitPresentationResponse(
  request: ResolvedPresentationRequest,
  options: SubmitPresentationResponseOptions,
): Promise<VerifierResponse> {
  const body = new URLSearchParams()
  body.set('vp_token', formatVpTokenForResponse(request, options.vpToken))
  if (options.presentationSubmission) {
    body.set('presentation_submission', JSON.stringify(options.presentationSubmission))
  }
  if (request.state) body.set('state', request.state)

  logWalletStep('oid4vp', 'submit-response-start', {
    responseUri: request.responseUri,
    verifierName: request.verifier.name,
    presentationBytes: options.vpToken.length,
    tokenShape: request.dcqlQuery ? readVerifierDcqlVpTokenShape() : 'raw',
    submissionPresent: Boolean(options.presentationSubmission),
    statePresent: Boolean(request.state),
  })
  if (__DEV__) {
    console.info('[wallet:oid4vp] submit-response-debug', {
      body: formatVpTokenForResponse(request, options.vpToken),
      submission: options.presentationSubmission,
    })
  }
  const response = await (options.fetchImpl ?? fetch)(request.responseUri, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const parsedBody = await readJsonResponse(response)
  logWalletStep('oid4vp', 'submit-response-received', {
    responseUri: request.responseUri,
    verifierName: request.verifier.name,
    status: response.status,
    ok: response.ok,
    responseKeys: isRecord(parsedBody) ? Object.keys(parsedBody) : [],
  })
  if (!response.ok) {
    logWalletError('oid4vp', 'submit-response-failed', new Error(`PresentationSubmissionFailed: HTTP ${response.status}${formatVerifierError(parsedBody)}`), {
      responseUri: request.responseUri,
      verifierName: request.verifier.name,
      status: response.status,
      parsedBody,
    })
    throw new Error(`PresentationSubmissionFailed: HTTP ${response.status}${formatVerifierError(parsedBody)}`)
  }

  return {
    status: readString(parsedBody.status) ?? 'verified',
    ...(readString(parsedBody.message) ? { message: readString(parsedBody.message) } : {}),
  }
}

function formatVpTokenForResponse(request: ResolvedPresentationRequest, vpToken: string): string {
  if (!request.dcqlQuery) return vpToken
  if (isPreformattedDualFormatVpToken(request, vpToken)) return vpToken

  const shape = readVerifierDcqlVpTokenShape()
  if (shape === 'raw') return vpToken

  return JSON.stringify(
    Object.fromEntries(
      request.dcqlQuery.credentials.map((credential) => [
        credential.id,
        shape === 'object_string' ? vpToken : [vpToken],
      ]),
    ),
  )
}

function formatVerifierError(body: JsonRecord): string {
  const error = readString(body.error)
  const description = readString(body.error_description) ?? readString(body.message)
  if (error && description) return `: ${error} - ${description}`
  if (error) return `: ${error}`
  if (description) return `: ${description}`
  return ''
}

async function readAuthorizationRequest(
  rawRequestUri: string,
  options: {
    fetchImpl?: typeof fetch
    trustedVerifiers: TrustedVerifier[]
  },
): Promise<JsonRecord> {
  const parsed = parseUrl(rawRequestUri)
  const requestUri = parsed.searchParams.get('request_uri')
  if (requestUri) {
    return fetchAuthorizationRequestObject(requestUri, options)
  }

  const requestObject = Object.fromEntries(parsed.searchParams.entries())
  if (!requestObject.presentation_definition && !requestObject.presentation_definition_uri && !requestObject.dcql_query) {
    throw new Error('PresentationRequestInvalid: presentation_definition or dcql_query is required')
  }
  return requestObject
}

async function fetchAuthorizationRequestObject(
  requestUri: string,
  options: {
    fetchImpl?: typeof fetch
    trustedVerifiers: TrustedVerifier[]
  },
): Promise<JsonRecord> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(requestUri, { headers: { Accept: 'application/json, application/oauth-authz-req+jwt' } })
  if (!response.ok) {
    throw new Error(`PresentationRequestFetchFailed: HTTP ${response.status}`)
  }

  const text = await response.text()
  const parsed = await parseAuthorizationRequestBody(text, {
    trustedVerifiers: options.trustedVerifiers,
    fetchImpl,
  })
  if (!parsed) {
    throw new Error('PresentationRequestInvalid: request_uri response must be an object')
  }
  return parsed
}

function assertMutuallyExclusiveQueryLanguages(request: JsonRecord): void {
  const inlineDefinition = readString(request.presentation_definition)
  const definitionUri = readString(request.presentation_definition_uri)
  const hasPresentationExchange = Boolean(inlineDefinition || definitionUri)
  const hasDcqlQuery = request.dcql_query !== undefined && request.dcql_query !== null

  if (inlineDefinition && definitionUri) {
    throw new Error('PresentationRequestInvalid: presentation_definition and presentation_definition_uri are mutually exclusive')
  }
  if (hasPresentationExchange && hasDcqlQuery) {
    throw new Error('PresentationRequestInvalid: Presentation Exchange and dcql_query are mutually exclusive')
  }
}

async function resolvePresentationDefinitionFromRequest(
  request: JsonRecord,
  verifier: TrustedVerifier,
  fetchImpl: typeof fetch,
): Promise<PresentationDefinition | undefined> {
  const inlineDefinition = readString(request.presentation_definition)
  const definitionUri = readString(request.presentation_definition_uri)

  if (inlineDefinition) {
    return parsePresentationDefinitionJson(inlineDefinition)
  }
  if (definitionUri) {
    return fetchPresentationDefinition(definitionUri, {
      allowedOrigins: verifier.allowedOrigins,
      fetchImpl,
    })
  }
  return undefined
}

export function parsePresentationDefinitionJson(text: string): PresentationDefinition {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: ${toErrorMessage(error)}`)
  }

  if (!isRecord(parsed) || typeof parsed.id !== 'string' || !Array.isArray(parsed.input_descriptors)) {
    throw new Error('PresentationRequestInvalid: Presentation Exchange definition is required')
  }

  const inputDescriptors = parsed.input_descriptors
    .map(readInputDescriptor)
    .filter((descriptor): descriptor is PresentationDefinitionInputDescriptor => Boolean(descriptor))

  if (inputDescriptors.length === 0) {
    throw new Error('PresentationRequestInvalid: input_descriptors is required')
  }

  return {
    id: parsed.id,
    input_descriptors: inputDescriptors,
  }
}

function readOptionalDcqlQuery(request: JsonRecord): DcqlQuery | undefined {
  if (!isRecord(request.dcql_query)) return undefined

  const credentials = Array.isArray(request.dcql_query.credentials)
    ? request.dcql_query.credentials
      .map(readDcqlCredentialQuery)
      .filter((query): query is DcqlCredentialQuery => Boolean(query))
    : []

  if (credentials.length === 0) {
    throw new Error('PresentationRequestInvalid: dcql_query.credentials is required')
  }

  const credentialSets = parseDcqlCredentialSets(request.dcql_query.credential_sets)

  return {
    credentials,
    ...(credentialSets ? { credentialSets } : {}),
  }
}

function readDcqlCredentialQuery(value: unknown): DcqlCredentialQuery | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const meta = isRecord(value.meta) ? value.meta : undefined
  const typeValues = Array.isArray(meta?.type_values)
    ? meta.type_values.filter((item): item is string => typeof item === 'string')
    : undefined
  const vctValues = Array.isArray(meta?.vct_values)
    ? meta.vct_values.filter((item): item is string => typeof item === 'string')
    : undefined

  const claims = Array.isArray(value.claims)
    ? value.claims.map(readDcqlClaimsQuery).filter((claim): claim is DcqlClaimsQuery => Boolean(claim))
    : undefined

  return {
    id: value.id,
    ...(readString(value.format) ? { format: readString(value.format) } : {}),
    ...(typeof value.require_cryptographic_holder_binding === 'boolean'
      ? { require_cryptographic_holder_binding: value.require_cryptographic_holder_binding }
      : {}),
    ...(typeValues || vctValues ? { meta: { ...(typeValues ? { type_values: typeValues } : {}), ...(vctValues ? { vct_values: vctValues } : {}) } } : {}),
    ...(claims && claims.length > 0 ? { claims } : {}),
  }
}

function readDcqlClaimsQuery(value: unknown): DcqlClaimsQuery | undefined {
  if (!isRecord(value) || !Array.isArray(value.path)) return undefined
  const path = value.path.filter((item): item is string => typeof item === 'string')
  return path.length > 0 ? { path } : undefined
}

function readInputDescriptor(value: unknown): PresentationDefinitionInputDescriptor | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const constraints = isRecord(value.constraints) ? value.constraints : undefined
  const fields = Array.isArray(constraints?.fields)
    ? constraints.fields.map(readPresentationField).filter((field): field is PresentationDefinitionField => Boolean(field))
    : undefined

  return {
    id: value.id,
    ...(fields ? { constraints: { fields } } : {}),
  }
}

function readPresentationField(value: unknown): PresentationDefinitionField | undefined {
  if (!isRecord(value)) return undefined
  const path = Array.isArray(value.path) ? value.path.filter((item): item is string => typeof item === 'string') : undefined
  return path ? { path } : {}
}

function assertSupportedBirthDateRequest(definition: PresentationDefinition): void {
  const fields = definition.input_descriptors.flatMap((descriptor) => descriptor.constraints?.fields ?? [])
  const paths = fields.flatMap((field) => field.path ?? [])
  if (paths.length === 0) {
    throw new Error('PresentationRequestUnsupported: requested claim paths are required')
  }

  const onlyBirthDate = paths.every((path) => BIRTH_DATE_PATHS.has(path))
  if (!onlyBirthDate) {
    throw new Error('PresentationRequestUnsupported: only ThaiNationalID birth date disclosure is supported')
  }
}

function readRequestedCredentialTypes(query: DcqlQuery): string[] {
  const types = query.credentials
    .flatMap((credential) => credential.meta?.type_values ?? [])
    .map(readCredentialTypeFromDcqlTypeValue)
    .filter((type): type is string => Boolean(type))
  return [...new Set(types)]
}

function hasRequiredClaimForRequest(
  record: VerifiableCredentialRecord,
  request: Pick<ResolvedPresentationRequest, 'presentationDefinition' | 'dcqlQuery'>,
): boolean {
  if (request.presentationDefinition) return Boolean(readBirthDateClaim(record))
  return true
}

function readCredentialDisclosure(record: VerifiableCredentialRecord): PresentationDisclosure {
  const credentialLabelByType: Record<string, string> = {
    [THAI_ID_TYPE]: 'Thai National ID',
    [TRANSCRIPT_TYPE]: 'Academic Transcript',
    [DRIVING_LICENCE_TYPE]: 'Driving Licence',
  }

  return {
    key: 'credential',
    label: 'Credential',
    value: credentialLabelByType[record.type] ?? 'Credential',
  }
}

function readDisclosureSource(input: {
  presentationDefinition?: PresentationDefinition
  dcqlQuery?: DcqlQuery
  dcqlClaimDisclosures?: PresentationDisclosure[]
}): string {
  if (input.presentationDefinition) return 'presentation-definition'
  const claimsQueries = input.dcqlQuery?.credentials.flatMap((credential) => credential.claims ?? []) ?? []
  if (claimsQueries.length === 0) return 'credential-fallback: dcql claims omitted'
  if (input.dcqlClaimDisclosures && input.dcqlClaimDisclosures.length > 0) return 'dcql claims'
  return 'credential-fallback: dcql claims did not match stored credential claims'
}

function logResolvedPresentationRequest(
  request: ResolvedPresentationRequest,
  authorizationRequest: JsonRecord,
  disclosureSource: string,
): void {
  if (!__DEV__) return

  const payload = {
    selectionSource: disclosureSource,
    request_uri: request.requestUri,
    client_id: request.clientId,
    response_uri: request.responseUri,
    response_mode: request.responseMode,
    nonce: request.nonce,
    state: request.state,
    verifier: {
      name: request.verifier.name,
      client_id: request.verifier.clientId,
      allowed_origins: request.verifier.allowedOrigins,
    },
    matched_credential: {
      id: request.matchedCredential.id,
      type: request.matchedCredential.type,
    },
    disclosures: request.disclosures,
    presentation_definition: request.presentationDefinition,
    dcql_query: request.dcqlQuery,
    authorization_request: authorizationRequest,
  }

  logWalletStep('oid4vp', 'resolved-request-debug', payload)
}

function readDcqlClaimDisclosures(record: VerifiableCredentialRecord, query: DcqlQuery): PresentationDisclosure[] | undefined {
  const claimsQueries = query.credentials.flatMap((credential) => credential.claims ?? [])
  if (claimsQueries.length === 0) return undefined

  const schema = getCardSchema(record.type)
  const normalizedClaimKeys = new Map(Object.keys(record.claims).map((key) => [normalizeClaimKey(key), key]))

  const disclosures: PresentationDisclosure[] = []
  for (const claimQuery of claimsQueries) {
    const requestedKey = claimQuery.path[0]
    if (!requestedKey) continue

    const normalizedRequestedKey = normalizeClaimKey(requestedKey)
    const matchedKey = normalizedClaimKeys.get(normalizedRequestedKey)
    if (!matchedKey) continue

    const value = readClaimValueAsString(record.claims[matchedKey])
    if (value === undefined) continue

    const field = schema.displayFields.find(
      (displayField) =>
        normalizeClaimKey(displayField.key) === normalizedRequestedKey ||
        (displayField.aliases ?? []).some((alias) => normalizeClaimKey(alias) === normalizedRequestedKey),
    )

    disclosures.push({ key: matchedKey, label: field?.presentationLabel ?? field?.label ?? requestedKey, value })
  }

  return disclosures.length > 0 ? disclosures : undefined
}

function readClaimValueAsString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function describeCredentialMetadataMismatch(
  query: DcqlQuery | undefined,
  candidates: VerifiableCredentialRecord[],
): string {
  const requestedVctValues = uniqueValues(query?.credentials.flatMap((credential) => credential.meta?.vct_values ?? []) ?? [])
  const storedVctValues = uniqueValues(candidates.map(readCredentialVct).filter((vct): vct is string => Boolean(vct)))

  return `requested vct_values [${formatList(requestedVctValues)}]; stored vct [${formatList(storedVctValues)}]`
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)]
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none'
}

function readCredentialVct(record: VerifiableCredentialRecord): string | undefined {
  const claimVct = readString(record.claims.vct)
  if (claimVct) return claimVct

  const issuerJwt = record.rawVc.split('~')[0] ?? record.rawVc
  return readString(decodeJwtPayload(issuerJwt)?.vct)
}

function isCompactJwtVc(rawVc: string): boolean {
  if (isCompactSdJwt(rawVc)) return false
  const payload = decodeJwtPayload(rawVc)
  return isRecord(payload?.vc)
}

function isCompactSdJwt(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
}

function findTrustedVerifier(
  clientId: string,
  responseUri: string,
  trustedVerifiers: TrustedVerifier[],
): TrustedVerifier | undefined {
  const responseOrigin = readUrlOrigin(responseUri)
  if (!responseOrigin) return undefined

  const parsedClientId = parseClientId(clientId)
  if (
    parsedClientId.scheme === 'unknown' ||
    parsedClientId.scheme === 'openid_federation' ||
    parsedClientId.scheme === 'verifier_attestation' ||
    parsedClientId.scheme === 'x509_san_dns' ||
    parsedClientId.scheme === 'x509_hash' ||
    parsedClientId.scheme === 'origin'
  ) {
    return undefined
  }

  if (!readResponseUriMatchesClientId(clientId, responseUri)) {
    return undefined
  }

  return trustedVerifiers.find((verifier) => {
    if (!verifier.allowedOrigins.includes(responseOrigin)) return false

    const verifierClientId = parseClientId(verifier.clientId)
    if (parsedClientId.scheme !== verifierClientId.scheme) return false

    if (parsedClientId.scheme === 'redirect_uri') {
      return (
        verifier.clientId === clientId ||
        clientId.startsWith(`${verifier.clientId}/`)
      )
    }

    if (parsedClientId.scheme === 'decentralized_identifier') {
      return parsedClientId.originalClientId === verifierClientId.originalClientId
    }

    return verifier.clientId === clientId || clientId.startsWith(`${verifier.clientId}/`)
  })
}

function readBirthDateDisclosures(record: VerifiableCredentialRecord): PresentationDisclosure[] {
  const birthDate = readBirthDateClaim(record)
  if (!birthDate) {
    throw new Error('PresentationClaimMissing: birth date is required')
  }

  return [{ key: 'age', label: 'อายุ', value: readAgeFromBirthDate(birthDate.value) }]
}

function readAgeFromBirthDate(value: string, now = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) {
    throw new Error('PresentationClaimInvalid: birth date must use YYYY-MM-DD format')
  }

  const birthYear = Number(match[1])
  const birthMonthIndex = Number(match[2]) - 1
  const birthDay = Number(match[3])
  let age = now.getFullYear() - birthYear
  const hasHadBirthdayThisYear =
    now.getMonth() > birthMonthIndex ||
    (now.getMonth() === birthMonthIndex && now.getDate() >= birthDay)
  if (!hasHadBirthdayThisYear) age -= 1

  return String(Math.max(age, 0))
}

function readBirthDateClaim(record: VerifiableCredentialRecord): { key: string; value: string } | undefined {
  const profileBirthDate = readCredentialHolderProfile(record).birthDate
  if (!profileBirthDate) return undefined

  const normalizedKeys = new Map(Object.keys(record.claims).map((key) => [normalizeClaimKey(key), key]))
  const matchedKey = BIRTH_DATE_KEYS.map((key) => normalizedKeys.get(normalizeClaimKey(key))).find(
    (key): key is string => Boolean(key),
  )

  return { key: matchedKey ?? 'birthDate', value: profileBirthDate }
}

function parseUrl(raw: string): URL {
  try {
    return new URL(raw)
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: ${toErrorMessage(error)}`)
  }
}

function readUrlOrigin(raw: string): string | undefined {
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
}

async function readJsonResponse(response: Response): Promise<JsonRecord> {
  try {
    const parsed = (await response.json()) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function readRequiredString(record: JsonRecord, key: string, errorCode: string): string {
  const value = readString(record[key])
  if (!value) throw new Error(`${errorCode}: ${key} is required`)
  return value
}

function normalizeClaimKey(key: string): string {
  return key.replace(/[\s_\-.]/g, '').toLowerCase()
}

