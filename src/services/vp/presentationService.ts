import { readCredentialHolderProfile, readPresentationFieldValue } from '../credentials/credentialDisplay'
import { hasAnyClaimValue, readClaimText } from '../credentials/claimFormatting'
import { isIssuerOid4VpClientId, isIssuerOid4VpResponseUri } from '../../config/trustedVerifiers'
import { findDisplayFieldForClaimKey, collectDisplayFieldMatchKeys, resolvePresentationDisclosureLabel, resolveCardSchema } from '../../config/cardSchemas'
import { isFirstPartyDrivingLicence } from '../../config/firstPartyCredential'
import { formatDrivingLicenceVehicleTypeDisplay } from '../../config/drivingLicenceVehicleCategories'
import {
  isSdJwtKbDisabledForTesting,
  readVerifierDcqlVpTokenShape,
  readVerifierKbAudienceMode,
} from '../../config/runtimeFlags'
import { logWalletError, logWalletRawProtocol, logWalletStep } from '../debug/walletLogger'
import { isRecord, readString, toErrorMessage } from '@/src/utils/jwtUtils'
import { normalizeClaimKey } from '@/src/utils/claimKeyNormalization'
import { enrichDisclosuresWithPolicy } from './claimDisclosurePolicy'
import type { FetchIssuerMetadata, VerifiableCredentialRecord } from '../vci/exchangeService'
import { fetchIssuerMetadata, readCredentialClaimMap } from '../vci/exchangeService'
import { parseClientId } from './clientIdScheme'
import { parseAuthorizationRequestBody } from './authorizationRequestJar'
import {
  assertNoSetDcqlCardinality,
  assertSupportedDcqlRequest,
  describeDcqlMatchFailure,
  type DcqlMatchFailure,
  isCompactJwtVc,
  isCompactSdJwt,
  readCredentialTypeFromDcqlTypeValue,
  readCredentialVct,
} from './dcqlCredentialMatch'
import { parseDcqlCredentialSets, resolveDcqlCredentialSelection } from './dcqlCredentialSetResolver'
import { formatDcqlVpTokenEnvelope } from './oid4vc/formatDcqlVpTokenEnvelope'
import {
  createSafePresentationTransportHint,
  describeEncryptedSubmitAttempt,
  describePresentationAttempt,
  type SafePresentationTransportHint,
} from './presentationDiagnostics'
import { assertDualFormatPresentationReady, isDualFormatDcqlRequest } from './dualFormatPresentationMatch'
import { isMsoMdocDcqlFormat, isSdJwtDcqlFormat } from './dualFormatQuery'
import {
  matchesPresentationDefinitionCredential,
  satisfiesDcqlCandidateTypes,
  satisfiesDcqlFormats,
  satisfiesDcqlMetadata,
  satisfiesFullDcqlRequest,
} from './presentationCredentialMatch'
import { isPreformattedDualFormatVpToken } from './dualFormatVpToken'
import { fetchPresentationDefinition } from './presentationDefinitionResolver'
import { hasUsablePidCredential } from '../credentials/credentialGuard'
import { ensureNativeMdocStored } from '../proximity/mdocCredential'
import { findTrustedVerifier, type TrustedVerifier } from './trustedVerifierMatcher'
import { PresentationCredentialUnavailableError, type PresentationMatchFailureKind } from './presentationUnavailable'
import { isPresentationNonceConsumed } from './presentationRequestReplay'
import {
  fetchAuthorizationRequestMaterial,
  readRoutingPreviewFromMaterial,
} from './oid4vc/fetchAuthorizationRequestMaterial'
import { isOid4vcVpAdapterEnabled } from './oid4vc/isOid4vcVpAdapterEnabled'
import { normalizeAuthorizationRequestForRouting } from './oid4vc/normalizeAuthorizationRequestForRouting'
import { parseAuthorizationRequestViaOid4vc } from './oid4vc/parseAuthorizationRequestViaOid4vc'
import { shouldUseOid4vcVpAdapter } from './oid4vc/shouldUseOid4vcVpAdapter'
import { submitDirectPostViaOid4vc } from './oid4vc/submitDirectPostViaOid4vc'
import type { Oid4vcAdapterContext, PresentationFlowOrigin, ProtocolPath } from './oid4vc/types'
import {
  isSupportedOid4vpResponseMode,
  resolveOid4vpResponseEncryptionParams,
  type Oid4vpResponseEncryptionParams,
  type Oid4vpResponseMode,
} from './oid4vpResponseEncryption'
import { buildDirectPostFormBody } from './directPostFormBody'

type JsonRecord = Record<string, unknown>

export type { TrustedVerifier } from './trustedVerifierMatcher'

export type PresentationDisclosure = {
  key: string
  label: string
  value: string
  mandatory?: boolean
  selective?: boolean
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
  id?: string
}

export type DcqlCredentialQuery = {
  id: string
  format?: string
  require_cryptographic_holder_binding?: boolean
  meta?: {
    type_values?: string[]
    vct_values?: string[]
    doctype_value?: string
  }
  claims?: DcqlClaimsQuery[]
  claimSets?: string[][]
}

export type DcqlCredentialSetQuery = {
  options: string[][]
  required?: boolean
}

export type DcqlQuery = {
  credentials: DcqlCredentialQuery[]
  credentialSets?: DcqlCredentialSetQuery[]
}

export type { PresentationFlowOrigin, ProtocolPath } from './oid4vc/types'

export type { Oid4vpResponseMode } from './oid4vpResponseEncryption'

export type ResolvedPresentationRequest = {
  requestUri: string
  clientId: string
  responseUri: string
  responseMode: Oid4vpResponseMode
  nonce: string
  state?: string
  presentationDefinition?: PresentationDefinition
  dcqlQuery?: DcqlQuery
  verifier: TrustedVerifier
  matchedCredential: VerifiableCredentialRecord
  disclosures: PresentationDisclosure[]
  protocolPath: ProtocolPath
  oid4vcContext?: Oid4vcAdapterContext
  responseEncryption?: Oid4vpResponseEncryptionParams
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
  presentationFlowOrigin: PresentationFlowOrigin
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
  fetchIssuerMetadata?: FetchIssuerMetadata
  walletCredentials?: VerifiableCredentialRecord[]
}

export type SubmitPresentationResponseOptions = {
  vpToken: string
  presentationSubmission?: PresentationSubmission
  fetchImpl?: typeof fetch
}

export type VerifierResponse = {
  status: string
  message?: string
  redirectUri?: string
}

export type PresentationTokenMode = 'signed-vp-jwt' | 'raw-credential' | 'sd-jwt-kb' | 'mso-mdoc'

type PresentationTokenModeOptions =
  | boolean
  | {
    sdJwtKbDisabledForTesting?: boolean
  }


const THAI_ID_TYPE = 'ThaiNationalID'
const TRANSCRIPT_TYPE = 'ChulalongkornUniversityTranscript'
const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'
const BIRTH_DATE_PATHS = new Set(['$.birthDate', '$.birthdate', '$.birth_date', '$.dateOfBirth', '$.date_of_birth', '$.dob'])
const BIRTH_DATE_KEYS = ['birthDate', 'birthdate', 'birth_date', 'dateOfBirth', 'date_of_birth', 'dob']

function hasPidPresentationAnchor(
  presentableCredentials: VerifiableCredentialRecord[],
  walletCredentials?: VerifiableCredentialRecord[],
): boolean {
  return hasUsablePidCredential(walletCredentials ?? presentableCredentials)
}

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
  const parsedAuthorizationRequest = await readAuthorizationRequest(rawRequestUri, {
    fetchImpl: options.fetchImpl,
    trustedVerifiers: options.trustedVerifiers,
    presentationFlowOrigin: options.presentationFlowOrigin,
  })
  const { authorizationRequest, protocolPath, oid4vcContext } = parsedAuthorizationRequest
  const clientId = readRequiredString(authorizationRequest, 'client_id', 'PresentationRequestInvalid')
  const responseUri = readRequiredString(authorizationRequest, 'response_uri', 'PresentationRequestInvalid')
  const responseMode = readRequiredString(authorizationRequest, 'response_mode', 'PresentationRequestInvalid')
  const nonce = readRequiredString(authorizationRequest, 'nonce', 'PresentationRequestInvalid')

  if (isPresentationNonceConsumed(nonce)) {
    const replayError = new Error('PresentationRequestReplay')
    logWalletError('oid4vp', 'resolve-request-replay-blocked', replayError)
    throw replayError
  }

  if (!isSupportedOid4vpResponseMode(responseMode)) {
    throw new Error(`PresentationRequestUnsupported: response_mode ${responseMode} is not supported`)
  }

  const responseEncryption =
    responseMode === 'direct_post.jwt'
      ? resolveOid4vpResponseEncryptionParams(authorizationRequest)
      : undefined

  assertMutuallyExclusiveQueryLanguages(authorizationRequest)

  const verifier = findTrustedVerifier(clientId, responseUri, options.trustedVerifiers)
  if (!verifier) {
    if (isIssuerOid4VpClientId(clientId)) {
      throw new Error('IssuerOid4VpUntrusted: client_id and response_uri origin must be allowlisted')
    }
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
  const issuerPidRequest = isIssuerOid4VpClientId(clientId) && requestedTypes.includes(THAI_ID_TYPE)
  const hasRequiredClaims = (candidate: VerifiableCredentialRecord) =>
    hasRequiredClaimForRequest(candidate, { presentationDefinition, dcqlQuery: effectiveDcqlQuery })
  const matchedCredential = credentials.find((record) => {
    if (presentationDefinition) {
      return matchesPresentationDefinitionCredential(record, requestedTypes, hasRequiredClaims)
    }

    if (!effectiveDcqlQuery) return false

    return satisfiesFullDcqlRequest(record, effectiveDcqlQuery)
  })
  if (!matchedCredential) {
    const dcqlMatchFailures =
      effectiveDcqlQuery && !isDualFormatDcqlRequest(effectiveDcqlQuery)
        ? credentials.flatMap((record) =>
            effectiveDcqlQuery.credentials.map((credentialQuery) =>
              describeDcqlMatchFailure(record, credentialQuery),
            ),
          )
        : []
    const primaryMatchFailure = pickPrimaryMatchFailure(dcqlMatchFailures)
    const matchDiagnostics = (() => {
      if (credentials.length === 0) return 'wallet has no presentable credentials'
      if (dcqlMatchFailures.length > 0) {
        return dcqlMatchFailures
          .map((failure) => {
            if (__DEV__) logWalletStep('oid4vp', 'dcql-match-failed', failure)
            const missing = failure.unsatisfiedClaimKeys?.length
              ? ` [missing claims: ${failure.unsatisfiedClaimKeys.join(', ')}]`
              : ''
            const has = __DEV__ && failure.unsatisfiedClaimKeys?.length
              ? ` [has: ${failure.recordClaimKeys.join(', ')}]`
              : ''
            return `${failure.recordType}(${failure.recordFormat}) failed ${failure.failedGate} gate${missing}${has}`
          })
          .join('; ')
      }
      if (presentationDefinition) {
        return credentials
          .map((record) =>
            requestedTypes.includes(record.type)
              ? `${record.type} is missing a required claim for this request`
              : `${record.type} is not in requested types [${requestedTypes.join(', ')}]`,
          )
          .join('; ')
      }
      return 'no matching rule applied'
    })()
    const candidateCredentials = credentials.filter((record) => {
      if (presentationDefinition) {
        return matchesPresentationDefinitionCredential(record, requestedTypes, hasRequiredClaims)
      }

      if (!effectiveDcqlQuery) return false

      return satisfiesDcqlCandidateTypes(record, effectiveDcqlQuery)
    })
    const formatCompatibleCredentials = candidateCredentials.filter((record) => {
      if (presentationDefinition) return true
      if (!effectiveDcqlQuery) return false

      return satisfiesDcqlFormats(record, effectiveDcqlQuery)
    })
    if (formatCompatibleCredentials.length > 0) {
      const metadataCompatibleCredentials = formatCompatibleCredentials.filter((record) =>
        satisfiesDcqlMetadata(record, effectiveDcqlQuery),
      )
      if (metadataCompatibleCredentials.length === 0) {
        throw new PresentationCredentialUnavailableError({
          message: `PresentationCredentialMetadataMismatch: ${describeCredentialMetadataMismatch(effectiveDcqlQuery, formatCompatibleCredentials)}`,
          reason: 'metadata-mismatch',
          requestedVctValues: readRequestedVctValues(effectiveDcqlQuery),
          requestedCredentialTypes: requestedTypes,
          matchFailureKind: 'metadata-mismatch',
        })
      }
      throwCredentialMissingUnavailable({
        issuerPidRequest,
        matchDiagnostics,
        effectiveDcqlQuery,
        requestedTypes,
        primaryMatchFailure,
        noPresentableCredentials: credentials.length === 0,
      })
    }
    if (candidateCredentials.length > 0) {
      throw new Error('PresentationCredentialFormatUnsupported: stored credential format does not match the Verifier request')
    }
    throwCredentialMissingUnavailable({
      issuerPidRequest,
      matchDiagnostics,
      effectiveDcqlQuery,
      requestedTypes,
      primaryMatchFailure,
      noPresentableCredentials: credentials.length === 0,
    })
  }

  if (
    !hasPidPresentationAnchor(credentials, options.walletCredentials) &&
    matchedCredential.type !== THAI_ID_TYPE
  ) {
    throw new Error('PresentationPidRequired')
  }

  if (effectiveDcqlQuery && isDualFormatDcqlRequest(effectiveDcqlQuery)) {
    await assertDualFormatPresentationReady(matchedCredential)
  } else if (effectiveDcqlQuery?.credentials.every((credential) => isMsoMdocDcqlFormat(credential.format))) {
    await ensureNativeMdocStored(matchedCredential)
  }

  const dcqlClaimDisclosures = effectiveDcqlQuery ? readDcqlClaimDisclosures(matchedCredential, effectiveDcqlQuery) : undefined
  const rawDisclosures = presentationDefinition
    ? readBirthDateDisclosures(matchedCredential)
    : dcqlClaimDisclosures ?? [readCredentialDisclosure(matchedCredential)]
  const disclosures = await enrichDisclosuresWithPolicy(matchedCredential, rawDisclosures, {
    fetchIssuerMetadata: options.fetchIssuerMetadata ?? fetchIssuerMetadata,
    ...(matchedCredential.issuerUrl ? { issuerUrl: matchedCredential.issuerUrl } : {}),
    ...(matchedCredential.credentialConfigurationId
      ? { credentialConfigurationId: matchedCredential.credentialConfigurationId }
      : {}),
  })
  const resolvedRequest: ResolvedPresentationRequest = {
    requestUri: rawRequestUri,
    clientId,
    responseUri,
    responseMode: responseMode as Oid4vpResponseMode,
    nonce,
    protocolPath,
    ...(oid4vcContext ? { oid4vcContext } : {}),
    ...(responseEncryption ? { responseEncryption } : {}),
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
  if (request.dcqlQuery?.credentials.every((credential) => isMsoMdocDcqlFormat(credential.format))) {
    return 'mso-mdoc'
  }
  if (request.dcqlQuery?.credentials.every((credential) => isSdJwtDcqlFormat(credential.format))) {
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
  const formattedVpToken = formatVpTokenForResponse(request, options.vpToken)

  logWalletRawProtocol('oid4vp', 'debug-raw-vp-token', {
    responseUri: request.responseUri,
    vpToken: formattedVpToken,
  })

  logWalletStep('oid4vp', 'submit-response-start', {
    responseUri: request.responseUri,
    verifierName: request.verifier.name,
    presentationBytes: options.vpToken.length,
    tokenShape: request.dcqlQuery ? readVerifierDcqlVpTokenShape() : 'raw',
    submissionPresent: Boolean(options.presentationSubmission),
    statePresent: Boolean(request.state),
    protocolPath: request.protocolPath,
    responseMode: request.responseMode,
    encryptedResponse: request.responseMode === 'direct_post.jwt',
  })
  if (request.protocolPath === 'oid4vc') {
    if (!request.oid4vcContext) {
      throw new Error('PresentationSubmissionFailed: oid4vc adapter context is missing')
    }

    try {
      logWalletRawProtocol('oid4vp', 'debug-raw-presentation-submission', {
        responseUri: request.responseUri,
        responseMode: request.responseMode,
        body: '[oid4vc-adapter]',
      })
      const adapterResult = await submitDirectPostViaOid4vc({
        oid4vcContext: request.oid4vcContext,
        responseUri: request.responseUri,
        responseMode: request.responseMode,
        ...(request.responseEncryption ? { responseEncryption: request.responseEncryption } : {}),
        vpToken: formattedVpToken,
        ...(request.state ? { state: request.state } : {}),
        ...(options.presentationSubmission ? { presentationSubmission: options.presentationSubmission } : {}),
        request,
        fetchImpl: options.fetchImpl,
      })

      logWalletStep('oid4vp', 'submit-response-received', {
        responseUri: request.responseUri,
        verifierName: request.verifier.name,
        status: adapterResult.status,
        ok: adapterResult.ok,
        responseKeys: isRecord(adapterResult.parsedBody) ? Object.keys(adapterResult.parsedBody) : [],
        protocolPath: request.protocolPath,
      })

      const parsedBody = adapterResult.parsedBody
      logWalletRawProtocol('oid4vp', 'debug-raw-verifier-response', {
        responseUri: request.responseUri,
        parsedBody,
      })
      const redirectUri = readVerifierReturnUrl(parsedBody, request)

      return {
        status: readString(isRecord(parsedBody) ? parsedBody.status : undefined) ?? 'verified',
        ...(readString(isRecord(parsedBody) ? parsedBody.message : undefined)
          ? { message: readString(isRecord(parsedBody) ? parsedBody.message : undefined) }
          : {}),
        ...(redirectUri ? { redirectUri } : {}),
      }
    } catch (error) {
      const diagnostic = describePresentationAttempt({
        request,
        vpToken: options.vpToken,
      })
      const compactJwe = error instanceof Error
        ? (error as Error & { compactJwe?: unknown }).compactJwe
        : undefined
      const transportDiagnostic = request.responseMode === 'direct_post.jwt'
        ? describeEncryptedSubmitAttempt({
          request,
          formattedVpToken,
          ...(typeof compactJwe === 'string' ? { compactJwe } : {}),
          ...(request.responseEncryption?.jwkCoordinatePadded ? { jwkCoordPadded: true } : {}),
        })
        : undefined
      logWalletError('oid4vp', 'submit-response-failed', error, {
        responseUri: request.responseUri,
        verifierName: request.verifier.name,
        protocolPath: request.protocolPath,
        diagnostic,
        ...(transportDiagnostic ? { transportDiagnostic } : {}),
      })
      const raw = error instanceof Error ? error.message : String(error)
      const safeTransportHint = request.responseMode === 'direct_post.jwt'
        ? createSafePresentationTransportHint({
          formattedVpToken,
          ...(typeof compactJwe === 'string' ? { compactJwe } : {}),
        })
        : undefined
      throw createPresentationSubmissionError(raw, safeTransportHint)
    }
  }

  const body = buildDirectPostFormBody({
    request,
    formattedVpToken,
    presentationSubmission: options.presentationSubmission,
  })

  logWalletRawProtocol('oid4vp', 'debug-raw-presentation-submission', {
    responseUri: request.responseUri,
    responseMode: request.responseMode,
    body: body.toString(),
  })

  const response = await (options.fetchImpl ?? fetch)(request.responseUri, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const parsedBody = await readJsonResponse(response)
  logWalletRawProtocol('oid4vp', 'debug-raw-verifier-response', {
    responseUri: request.responseUri,
    parsedBody,
  })
  logWalletStep('oid4vp', 'submit-response-received', {
    responseUri: request.responseUri,
    verifierName: request.verifier.name,
    status: response.status,
    ok: response.ok,
    responseKeys: isRecord(parsedBody) ? Object.keys(parsedBody) : [],
  })
  if (!response.ok) {
    const diagnostic = describePresentationAttempt({
      request,
      vpToken: options.vpToken,
    })
    logWalletError('oid4vp', 'submit-response-failed', new Error(`PresentationSubmissionFailed: HTTP ${response.status}${formatVerifierError(parsedBody)}`), {
      responseUri: request.responseUri,
      verifierName: request.verifier.name,
      status: response.status,
      parsedBody,
      diagnostic,
    })
    const isIssuerPost = isIssuerOid4VpResponseUri(request.responseUri) || isIssuerOid4VpClientId(request.clientId)
    throw new Error(
      isIssuerPost
        ? `PresentationSubmissionFailed:issuer: HTTP ${response.status}${formatVerifierError(parsedBody)}`
        : `PresentationSubmissionFailed: HTTP ${response.status}${formatVerifierError(parsedBody)}`,
    )
  }

  const redirectUri = readVerifierReturnUrl(parsedBody, request)

  return {
    status: readString(parsedBody.status) ?? 'verified',
    ...(readString(parsedBody.message) ? { message: readString(parsedBody.message) } : {}),
    ...(redirectUri ? { redirectUri } : {}),
  }
}

function createPresentationSubmissionError(
  message: string,
  presentationTransportHint?: SafePresentationTransportHint,
): Error {
  return Object.assign(new Error(message), {
    ...(presentationTransportHint ? { presentationTransportHint } : {}),
  })
}

export function readVerifierReturnUrl(
  parsedBody: unknown,
  request: Pick<ResolvedPresentationRequest, 'clientId' | 'state' | 'responseUri' | 'verifier'>,
): string | undefined {
  // Reference / Scan Verifier API (direct_post to /openid4vc/verify/*): stay in Wallet.
  if (isOpenId4VcApiEndpointUrl(request.responseUri)) {
    return undefined
  }

  const fromBody = readString(isRecord(parsedBody) ? parsedBody.redirect_uri : undefined)
  if (
    fromBody &&
    isHolderPortalReturnUrl(fromBody, request.responseUri) &&
    isAllowlistedReturnUrl(fromBody, request.verifier.allowedOrigins)
  ) {
    return fromBody
  }

  const parsedClientId = parseClientId(request.clientId)
  if (parsedClientId.scheme !== 'redirect_uri') return undefined

  try {
    if (!isHolderPortalReturnUrl(parsedClientId.originalClientId, request.responseUri)) {
      return undefined
    }

    const url = new URL(parsedClientId.originalClientId)
    if (request.state) {
      url.searchParams.set('state', request.state)
    }
    const candidate = url.toString()
    return isAllowlistedReturnUrl(candidate, request.verifier.allowedOrigins) ? candidate : undefined
  } catch {
    return undefined
  }
}

const OPENID4VC_API_PATH_PREFIXES = ['/openid4vc/verify', '/openid4vc/request'] as const

/** Host:port + pathname key for endpoint equality (ignores scheme and trailing slashes). */
export function readNormalizedEndpointKey(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return `${parsed.hostname.toLowerCase()}:${port}${pathname}`
  } catch {
    return undefined
  }
}

/** Holder portal return URLs must differ from the direct_post response_uri API endpoint. */
export function isDirectPostResponseEndpoint(candidateUrl: string, responseUri: string): boolean {
  const candidateKey = readNormalizedEndpointKey(candidateUrl)
  const responseKey = readNormalizedEndpointKey(responseUri)
  return Boolean(candidateKey && responseKey && candidateKey === responseKey)
}

export function isOpenId4VcApiEndpointUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '') || '/'
    return OPENID4VC_API_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  } catch {
    return false
  }
}

/** True when URL is a genuine Holder portal callback, not a direct_post or OID4VC API route. */
export function isHolderPortalReturnUrl(candidateUrl: string, responseUri: string): boolean {
  if (isDirectPostResponseEndpoint(candidateUrl, responseUri)) return false
  if (isOpenId4VcApiEndpointUrl(candidateUrl)) return false

  if (isOpenId4VcApiEndpointUrl(responseUri)) {
    try {
      const pathname = new URL(candidateUrl).pathname.replace(/\/+$/, '') || '/'
      if (pathname === '/') return false
    } catch {
      return false
    }
  }

  return true
}

function readComparableOrigin(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    const port = url.port || (url.protocol === 'https:' ? '443' : '80')
    return `${url.hostname.toLowerCase()}:${port}`
  } catch {
    return undefined
  }
}

export function isAllowlistedReturnUrl(returnUrl: string, allowedOrigins: readonly string[]): boolean {
  const returnOrigin = readComparableOrigin(returnUrl)
  if (!returnOrigin) return false
  return allowedOrigins.some((allowed) => readComparableOrigin(allowed) === returnOrigin)
}

function formatVpTokenForResponse(request: ResolvedPresentationRequest, vpToken: string): string {
  if (!request.dcqlQuery) return vpToken
  if (isPreformattedDualFormatVpToken(request, vpToken)) return vpToken

  return formatDcqlVpTokenEnvelope({
    entries: Object.fromEntries(
      request.dcqlQuery.credentials.map((credential) => [credential.id, vpToken]),
    ),
    shape: readVerifierDcqlVpTokenShape(),
  })
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
    presentationFlowOrigin: PresentationFlowOrigin
  },
): Promise<{
  authorizationRequest: JsonRecord
  protocolPath: ProtocolPath
  oid4vcContext?: Oid4vcAdapterContext
}> {
  const material = await fetchAuthorizationRequestMaterial(rawRequestUri, {
    fetchImpl: options.fetchImpl,
  })
  const routingPreview = readRoutingPreviewFromMaterial(material)
  const normalizedForRouting = normalizeAuthorizationRequestForRouting(routingPreview)
  const useOid4vcAdapter = shouldUseOid4vcVpAdapter({
    flagEnabled: isOid4vcVpAdapterEnabled(),
    presentationFlowOrigin: options.presentationFlowOrigin,
    authorizationRequest: normalizedForRouting,
  })

  if (useOid4vcAdapter) {
    const parsed = await parseAuthorizationRequestViaOid4vc(material, {
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl,
    })
    return {
      authorizationRequest: parsed.authorizationRequest,
      protocolPath: 'oid4vc',
      oid4vcContext: parsed.oid4vcContext,
    }
  }

  const authorizationRequest = await parseAuthorizationRequestFromMaterial(material, options)
  return { authorizationRequest, protocolPath: 'legacy' }
}

async function parseAuthorizationRequestFromMaterial(
  material: Awaited<ReturnType<typeof fetchAuthorizationRequestMaterial>>,
  options: {
    fetchImpl?: typeof fetch
    trustedVerifiers: TrustedVerifier[]
  },
): Promise<JsonRecord> {
  if (material.rawBody) {
    const parsed = await parseAuthorizationRequestBody(material.rawBody, {
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl: options.fetchImpl,
    })
    if (!parsed) {
      throw new Error('PresentationRequestInvalid: request_uri response must be an object')
    }
    return parsed
  }

  if (material.byValueParams) {
    return { ...material.byValueParams }
  }

  throw new Error('PresentationRequestInvalid: authorization request material is empty')
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
  const rawDcqlQuery = readDcqlQueryValue(request.dcql_query)
  if (!rawDcqlQuery) return undefined

  const credentials = Array.isArray(rawDcqlQuery.credentials)
    ? rawDcqlQuery.credentials
      .map(readDcqlCredentialQuery)
      .filter((query): query is DcqlCredentialQuery => Boolean(query))
    : []

  if (credentials.length === 0) {
    throw new Error('PresentationRequestInvalid: dcql_query.credentials is required')
  }

  const credentialSets = parseDcqlCredentialSets(rawDcqlQuery.credential_sets)

  return {
    credentials,
    ...(credentialSets ? { credentialSets } : {}),
  }
}

function readDcqlQueryValue(value: unknown): JsonRecord | undefined {
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
  if (!isRecord(value) || typeof value.id !== 'string') return undefined
  const meta = isRecord(value.meta) ? value.meta : undefined
  const typeValues = Array.isArray(meta?.type_values)
    ? meta.type_values.filter((item): item is string => typeof item === 'string')
    : undefined
  const vctValues = Array.isArray(meta?.vct_values)
    ? meta.vct_values.filter((item): item is string => typeof item === 'string')
    : undefined
  const doctypeValue = readString(meta?.doctype_value)

  const claims = Array.isArray(value.claims)
    ? value.claims.map(readDcqlClaimsQuery).filter((claim): claim is DcqlClaimsQuery => Boolean(claim))
    : undefined

  const claimSets = Array.isArray(value.claim_sets)
    ? value.claim_sets
      .map((option) => (Array.isArray(option) ? option.filter((id): id is string => typeof id === 'string') : []))
      .filter((option) => option.length > 0)
    : undefined

  return {
    id: value.id,
    ...(readString(value.format) ? { format: readString(value.format) } : {}),
    ...(typeof value.require_cryptographic_holder_binding === 'boolean'
      ? { require_cryptographic_holder_binding: value.require_cryptographic_holder_binding }
      : {}),
    ...(typeValues || vctValues || doctypeValue
      ? {
        meta: {
          ...(typeValues ? { type_values: typeValues } : {}),
          ...(vctValues ? { vct_values: vctValues } : {}),
          ...(doctypeValue ? { doctype_value: doctypeValue } : {}),
        },
      }
      : {}),
    ...(claims && claims.length > 0 ? { claims } : {}),
    ...(claimSets && claimSets.length > 0 ? { claimSets } : {}),
  }
}

function readDcqlClaimsQuery(value: unknown): DcqlClaimsQuery | undefined {
  if (!isRecord(value) || !Array.isArray(value.path)) return undefined
  const path = value.path.filter((item): item is string => typeof item === 'string')
  if (path.length === 0) return undefined
  return { path, ...(typeof value.id === 'string' ? { id: value.id } : {}) }
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

function throwCredentialMissingUnavailable(input: {
  issuerPidRequest: boolean
  matchDiagnostics: string
  effectiveDcqlQuery: DcqlQuery | undefined
  requestedTypes: string[]
  primaryMatchFailure?: DcqlMatchFailure
  noPresentableCredentials?: boolean
}): never {
  const matchFailureKind = deriveMatchFailureKind(input)
  throw new PresentationCredentialUnavailableError({
    message: input.issuerPidRequest
      ? `PresentationCredentialMissing:issuer-pid: no ThaiNationalID (${input.matchDiagnostics})`
      : `PresentationCredentialMissing: requested credential is not available (${input.matchDiagnostics})`,
    reason: 'credential-missing',
    requestedVctValues: readRequestedVctValues(input.effectiveDcqlQuery),
    requestedCredentialTypes: input.requestedTypes,
    matchFailureKind,
    unsatisfiedClaimKeys: input.primaryMatchFailure?.unsatisfiedClaimKeys,
    recordType: input.primaryMatchFailure?.recordType,
  })
}

function pickPrimaryMatchFailure(failures: DcqlMatchFailure[]): DcqlMatchFailure | undefined {
  if (failures.length === 0) return undefined

  const gatePriority: DcqlMatchFailure['failedGate'][] = ['claims', 'format', 'vct', 'type']
  for (const gate of gatePriority) {
    const match = failures.find((failure) => failure.failedGate === gate)
    if (match) return match
  }

  return failures[0]
}

function deriveMatchFailureKind(input: {
  matchDiagnostics: string
  primaryMatchFailure?: DcqlMatchFailure
  noPresentableCredentials?: boolean
}): PresentationMatchFailureKind {
  if (input.noPresentableCredentials) return 'not-presentable'

  const gate = input.primaryMatchFailure?.failedGate
  if (gate === 'claims') return 'claims-incomplete'
  if (gate === 'format') return 'format-mismatch'
  if (gate === 'vct') return 'metadata-mismatch'

  if (input.matchDiagnostics.includes('no presentable credentials')) return 'not-presentable'
  if (input.matchDiagnostics.includes('failed format gate')) return 'format-mismatch'
  if (input.matchDiagnostics.includes('failed vct gate')) return 'metadata-mismatch'
  if (input.matchDiagnostics.includes('failed claims gate') || input.matchDiagnostics.includes('missing claims:')) {
    return 'claims-incomplete'
  }

  return 'document-not-stored'
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
    [DRIVING_LICENCE_TYPE]: 'Driver License',
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

  const schema = resolveCardSchema(record)
  const claims = readCredentialClaimMap(record)
  const normalizedClaimKeys = new Map(Object.keys(claims).map((key) => [normalizeClaimKey(key), key]))

  const disclosures: PresentationDisclosure[] = []
  for (const claimQuery of claimsQueries) {
    const requestedKey = claimQuery.path[0]
    if (!requestedKey) continue

    const normalizedRequestedKey = normalizeClaimKey(requestedKey)
    const field = findDisplayFieldForClaimKey(schema.displayFields, requestedKey)

    const lookupKeys = field
      ? collectDisplayFieldMatchKeys(field)
      : [normalizedClaimKeys.get(normalizedRequestedKey) ?? requestedKey]

    const rawValue = field
      ? readPresentationFieldValue(claims, field)
      : readClaimText(claims, lookupKeys)
    const value =
      isFirstPartyDrivingLicence(record) && field?.key === 'licenceClass'
        ? formatDrivingLicenceVehicleTypeDisplay(rawValue) ?? rawValue
        : rawValue
    const present = value !== undefined || hasAnyClaimValue(claims, lookupKeys)
    if (!present) continue

    disclosures.push({
      key: requestedKey,
      label: resolvePresentationDisclosureLabel(record.type, requestedKey),
      value: value ?? '',
    })
  }

  return disclosures.length > 0 ? disclosures : undefined
}

function describeCredentialMetadataMismatch(
  query: DcqlQuery | undefined,
  candidates: VerifiableCredentialRecord[],
): string {
  const requestedVctValues = uniqueValues(query?.credentials.flatMap((credential) => credential.meta?.vct_values ?? []) ?? [])
  const storedVctValues = uniqueValues(candidates.map(readCredentialVct).filter((vct): vct is string => Boolean(vct)))

  return `requested vct_values [${formatList(requestedVctValues)}]; stored vct [${formatList(storedVctValues)}]`
}

function readRequestedVctValues(query: DcqlQuery | undefined): string[] {
  return uniqueValues(query?.credentials.flatMap((credential) => credential.meta?.vct_values ?? []) ?? [])
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)]
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none'
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

