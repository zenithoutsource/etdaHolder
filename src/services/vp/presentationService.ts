import { readCredentialHolderProfile } from '../credentials/credentialDisplay'
import { getCardSchema } from '../../config/cardSchemas'
import {
  isSdJwtKbDisabledForTesting,
  isSoftwareEddsaEnabledForTesting,
  readVerifierDcqlVpTokenShape,
  readVerifierKbAudienceMode,
} from '../../config/runtimeFlags'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

type JsonRecord = Record<string, unknown>

export type TrustedVerifier = {
  clientId: string
  name: string
  allowedOrigins: string[]
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

export type DcqlQuery = {
  credentials: DcqlCredentialQuery[]
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

export type PresentationTokenMode = 'signed-vp-jwt' | 'raw-credential' | 'sd-jwt-kb' | 'software-ed25519-kb'

type PresentationTokenModeOptions =
  | boolean
  | {
    sdJwtKbDisabledForTesting?: boolean
    softwareEddsaEnabledForTesting?: boolean
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
  const authorizationRequest = await readAuthorizationRequest(rawRequestUri, options.fetchImpl ?? fetch)
  const clientId = readRequiredString(authorizationRequest, 'client_id', 'PresentationRequestInvalid')
  const responseUri = readRequiredString(authorizationRequest, 'response_uri', 'PresentationRequestInvalid')
  const responseMode = readRequiredString(authorizationRequest, 'response_mode', 'PresentationRequestInvalid')
  const nonce = readRequiredString(authorizationRequest, 'nonce', 'PresentationRequestInvalid')

  if (responseMode !== SUPPORTED_RESPONSE_MODE) {
    throw new Error(`PresentationRequestUnsupported: response_mode ${responseMode} is not supported`)
  }

  const presentationDefinition = readOptionalPresentationDefinition(authorizationRequest)
  const dcqlQuery = readOptionalDcqlQuery(authorizationRequest)
  if (!presentationDefinition && !dcqlQuery) {
    throw new Error('PresentationRequestInvalid: presentation_definition or dcql_query is required')
  }
  if (presentationDefinition) {
    assertSupportedBirthDateRequest(presentationDefinition)
  }
  if (dcqlQuery) {
    assertSupportedDcqlRequest(dcqlQuery)
  }

  const verifier = findTrustedVerifier(clientId, responseUri, options.trustedVerifiers)
  if (!verifier) {
    throw new Error('VerifierUntrusted: did:web client_id and response_uri origin must be allowlisted')
  }

  const requestedTypes = dcqlQuery ? readRequestedCredentialTypes(dcqlQuery) : [THAI_ID_TYPE]
  const matchedCredential = credentials.find((record) =>
    requestedTypes.includes(record.type) &&
    hasRequiredClaimForRequest(record, { presentationDefinition, dcqlQuery }) &&
    isCredentialCompatibleWithRequest(record, { presentationDefinition, dcqlQuery }),
  )
  if (!matchedCredential) {
    const candidateCredentials = credentials.filter((record) =>
      requestedTypes.includes(record.type) && hasRequiredClaimForRequest(record, { presentationDefinition, dcqlQuery }),
    )
    const formatCompatibleCredentials = candidateCredentials.filter((record) =>
      isCredentialCompatibleWithRequestFormatOnly(record, { presentationDefinition, dcqlQuery }),
    )
    if (formatCompatibleCredentials.length > 0) {
      throw new Error(`PresentationCredentialMetadataMismatch: ${describeCredentialMetadataMismatch(dcqlQuery, formatCompatibleCredentials)}`)
    }
    if (candidateCredentials.length > 0) {
      throw new Error('PresentationCredentialFormatUnsupported: stored credential format does not match the Verifier request')
    }
    throw new Error('PresentationCredentialMissing: requested credential is not available')
  }

  const dcqlClaimDisclosures = dcqlQuery ? readDcqlClaimDisclosures(matchedCredential, dcqlQuery) : undefined
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
    ...(dcqlQuery ? { dcqlQuery } : {}),
    verifier,
    matchedCredential,
    disclosures,
  }
  logResolvedPresentationRequest(resolvedRequest, authorizationRequest, readDisclosureSource({
    presentationDefinition,
    dcqlQuery,
    dcqlClaimDisclosures,
  }))

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
  const softwareEddsaEnabledForTesting = typeof options === 'boolean'
    ? false
    : options.softwareEddsaEnabledForTesting ?? isSoftwareEddsaEnabledForTesting()

  if (
    request.dcqlQuery?.credentials.every((credential) =>
      credential.format === 'dc+sd-jwt' || credential.format === 'vc+sd-jwt',
    )
  ) {
    if (softwareEddsaEnabledForTesting) return 'software-ed25519-kb'

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

  const response = await (options.fetchImpl ?? fetch)(request.responseUri, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const parsedBody = await readJsonResponse(response)
  if (!response.ok) {
    throw new Error(`PresentationSubmissionFailed: HTTP ${response.status}${formatVerifierError(parsedBody)}`)
  }

  return {
    status: readString(parsedBody.status) ?? 'verified',
    ...(readString(parsedBody.message) ? { message: readString(parsedBody.message) } : {}),
  }
}

function formatVpTokenForResponse(request: ResolvedPresentationRequest, vpToken: string): string {
  if (!request.dcqlQuery) return vpToken

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

async function readAuthorizationRequest(rawRequestUri: string, fetchImpl: typeof fetch): Promise<JsonRecord> {
  const parsed = parseUrl(rawRequestUri)
  const requestUri = parsed.searchParams.get('request_uri')
  if (requestUri) return fetchAuthorizationRequestObject(requestUri, fetchImpl)

  const requestObject = Object.fromEntries(parsed.searchParams.entries())
  if (!requestObject.presentation_definition && !requestObject.presentation_definition_uri) {
    throw new Error('PresentationRequestInvalid: presentation_definition is required')
  }
  return requestObject
}

async function fetchAuthorizationRequestObject(requestUri: string, fetchImpl: typeof fetch): Promise<JsonRecord> {
  const response = await fetchImpl(requestUri, { headers: { Accept: 'application/json, application/oauth-authz-req+jwt' } })
  if (!response.ok) {
    throw new Error(`PresentationRequestFetchFailed: HTTP ${response.status}`)
  }

  const text = await response.text()
  const parsed = parseAuthorizationRequestBody(text)
  if (!parsed) {
    throw new Error('PresentationRequestInvalid: request_uri response must be an object')
  }
  return parsed
}

function parseAuthorizationRequestBody(text: string): JsonRecord | undefined {
  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return decodeJwtPayload(text)
  }
}

function readOptionalPresentationDefinition(request: JsonRecord): PresentationDefinition | undefined {
  const inlineDefinition = readString(request.presentation_definition)
  if (!inlineDefinition) {
    if (request.presentation_definition_uri) {
      throw new Error('PresentationRequestUnsupported: presentation_definition_uri is not supported yet')
    }
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(inlineDefinition)
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

  return { credentials }
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

function assertSupportedDcqlRequest(query: DcqlQuery): void {
  const supported = query.credentials.every((credential) => {
    const typeValues = readDcqlTypeValues(credential)
    return typeValues.some((type) => readCredentialTypeFromDcqlValue(type))
  })

  if (!supported) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }
}

function readRequestedCredentialTypes(query: DcqlQuery): string[] {
  const types = query.credentials
    .flatMap(readDcqlTypeValues)
    .map(readCredentialTypeFromDcqlValue)
    .filter((type): type is string => Boolean(type))
  return [...new Set(types)]
}

function readDcqlTypeValues(credential: DcqlCredentialQuery): string[] {
  return [...(credential.meta?.type_values ?? []), ...(credential.meta?.vct_values ?? [])]
}

function readCredentialTypeFromDcqlValue(value: string): string | undefined {
  const normalized = normalizeCredentialType(value)
  if (normalized.includes('idcard') || normalized.includes('nationalid')) return THAI_ID_TYPE
  if (normalized.includes('transcript')) return TRANSCRIPT_TYPE
  if (normalized.includes('drivinglicence') || normalized.includes('drivinglicense') || normalized.includes('dlt')) return DRIVING_LICENCE_TYPE
  return undefined
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
    disclosureSource,
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

  console.info('[OID4VP] Resolved Verifier request', JSON.stringify(payload, null, 2))
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

function isCredentialCompatibleWithRequest(
  record: VerifiableCredentialRecord,
  request: Pick<ResolvedPresentationRequest, 'presentationDefinition' | 'dcqlQuery'>,
): boolean {
  if (request.presentationDefinition) return true
  if (!request.dcqlQuery) return false

  return request.dcqlQuery.credentials.every((credential) =>
    isCredentialCompatibleWithDcqlFormat(record, credential.format) &&
    isCredentialCompatibleWithDcqlMetadata(record, credential),
  )
}

function isCredentialCompatibleWithRequestFormatOnly(
  record: VerifiableCredentialRecord,
  request: Pick<ResolvedPresentationRequest, 'presentationDefinition' | 'dcqlQuery'>,
): boolean {
  if (request.presentationDefinition) return true
  if (!request.dcqlQuery) return false

  return request.dcqlQuery.credentials.every((credential) => isCredentialCompatibleWithDcqlFormat(record, credential.format))
}

function isCredentialCompatibleWithDcqlFormat(record: VerifiableCredentialRecord, format: string | undefined): boolean {
  if (!format) return true
  if (format === 'jwt_vc_json' || format === 'jwt_vc') return isCompactJwtVc(record.rawVc)
  if (format === 'dc+sd-jwt' || format === 'vc+sd-jwt') return isCompactSdJwt(record.rawVc)
  return false
}

function isCredentialCompatibleWithDcqlMetadata(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const requestedVctValues = credential.meta?.vct_values ?? []
  if (requestedVctValues.length === 0) return true

  const credentialVct = readCredentialVct(record)
  return Boolean(credentialVct && requestedVctValues.includes(credentialVct))
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

  return trustedVerifiers.find(
    (verifier) =>
      (verifier.clientId === clientId || clientId.startsWith(`${verifier.clientId}/`)) &&
      verifier.allowedOrigins.includes(responseOrigin),
  )
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

function decodeJwtPayload(jwt: string): JsonRecord | undefined {
  const parts = jwt.split('.')
  if (parts.length < 2 || !parts[1]) return undefined

  try {
    const parsed = JSON.parse(base64UrlDecodeToString(parts[1])) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function base64UrlDecodeToString(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new TextDecoder().decode(bytes)
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeClaimKey(key: string): string {
  return key.replace(/[\s_\-.]/g, '').toLowerCase()
}

function normalizeCredentialType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
