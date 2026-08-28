/**
 * Orchestrates trusted DC API mdoc resolution and one-sign-boundary response completion.
 */
import { buildDcApiDeviceResponseAsync } from '@/src/services/proximity/dcApiDeviceResponse'
import {
  ensureNativeMdocStored,
  enumeratePresentableMdocCredentials,
  isMdocPresentableRecord,
  isMdocRawVc,
  readMdocDocTypeFromRecord,
} from '@/src/services/proximity/mdocCredential'
import { recordHasLogicalMdocFormat } from '@/src/services/credentials/logicalCredentialStorage'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'
import { readString, toErrorMessage } from '@/src/utils/jwtUtils'

import {
  assertSupportedDcqlRequest,
  readCredentialTypeFromDcqlTypeValue,
} from '../dcqlCredentialMatch'
import { resolveDcqlCredentialSelection } from '../dcqlCredentialSetResolver'
import { resolveOid4vpResponseEncryptionParams } from '../oid4vpResponseEncryption'
import {
  type DcqlCredentialQuery,
  type DcqlQuery,
  type TrustedVerifier,
} from '../presentationService'
import { PresentationCredentialUnavailableError } from '../presentationUnavailable'
import {
  parseDcApiIncomingRequest,
  type DcApiIncomingRequest,
  type DcApiProtocol,
} from './dcApiRequestParser'
import {
  buildDcApiPresentationPayload,
  type DcApiPresentationPayload,
} from './dcApiResponseBuilder'
import { evaluateDcApiTrust, readCanonicalDcApiOrigin } from './dcApiTrustPolicy'
import { DC_API_MDL_DOCTYPE } from './dcApiRegistryFields'

export type ResolveDcApiPresentationOptions = {
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
  preferredCredentialId?: string | null
}

export type DcApiResolvedPresentation = {
  sessionId: string
  protocol: DcApiProtocol
  origin: string
  responseMode: 'dc_api' | 'dc_api.jwt'
  authorizationRequest: Record<string, unknown>
  dcqlQuery: DcqlQuery
  selectedDcqlQueryId: string
  matchedCredential: VerifiableCredentialRecord
  nonce: string
  requestedNamespaceKeys: string[]
  verifier?: TrustedVerifier
}

export type DcApiCompletionInput = {
  presentation: DcApiResolvedPresentation
  approvedNamespaceKeys: string[]
}

type TrustedCompletionContext = {
  origin: string
  responseMode: 'dc_api' | 'dc_api.jwt'
  authorizationRequest: Record<string, unknown>
  selectedDcqlQueryId: string
  credentialId: string
  nonce: string
  requestedNamespaceKeys: string[]
}

const trustedCompletionContexts = new WeakMap<object, TrustedCompletionContext>()

export async function resolveDcApiPresentation(
  input: DcApiIncomingRequest,
  credentials: VerifiableCredentialRecord[],
  options: ResolveDcApiPresentationOptions,
): Promise<DcApiResolvedPresentation> {
  try {
    const parsed = await parseDcApiIncomingRequest(input, options)
    const trust = parsed.isSignedRequest
      ? evaluateDcApiTrust({
          isSignedRequest: true,
          origin: parsed.origin,
          signedRequest: requireSignedRequestEvidence(parsed.signedRequest),
          trustedVerifiers: options.trustedVerifiers,
        })
      : evaluateDcApiTrust({
          isSignedRequest: false,
          origin: parsed.origin,
          responseMode: parsed.responseMode,
          authorizationRequest: parsed.authorizationRequest,
          trustedVerifiers: options.trustedVerifiers,
        })

    if (!trust.allowed) throw new Error(trust.reason)

    await hydrateDcApiMdocCredentials(credentials)
    const presentableCredentials = await enumeratePresentableMdocCredentials(credentials)
    const dcqlQuery = resolveDcqlCredentialSelection(parsed.dcqlQuery, presentableCredentials)
    assertSupportedDcqlRequest(dcqlQuery)
    const credentialQuery = readStandaloneMdocQuery(dcqlQuery)
    const matchedCredential = pickMatchedDcApiCredential(
      presentableCredentials,
      credentials,
      credentialQuery,
      options.preferredCredentialId,
    )
    if (!matchedCredential) {
      const requestedDoctype = credentialQuery.meta?.doctype_value
      const requestedType = requestedDoctype
        ? readCredentialTypeFromDcqlTypeValue(requestedDoctype)
        : undefined
      logWalletStep('oid4vp', 'dc-api-credential-match-failed', {
        requestedDoctype,
        preferredCredentialId: options.preferredCredentialId ?? null,
        presentableCount: presentableCredentials.length,
        presentableDocTypes: presentableCredentials.map((credential) => ({
          id: credential.id,
          type: credential.type,
          doctype: readMdocDocTypeFromRecord(credential),
        })),
      })
      throw new PresentationCredentialUnavailableError({
        message: 'PresentationCredentialMissing: no stored mso_mdoc matches the requested doctype',
        reason: 'credential-missing',
        requestedCredentialTypes: requestedType ? [requestedType] : [],
        matchFailureKind: 'document-not-stored',
      })
    }

    const hasNativeMdoc = await ensureNativeMdocStored(matchedCredential)
    if (!hasNativeMdoc) {
      throw new PresentationCredentialUnavailableError({
        message: 'PresentationCredentialMissing: stored mso_mdoc bytes are unavailable for presentation',
        reason: 'credential-missing',
        matchFailureKind: 'document-not-stored',
        recordType: matchedCredential.type,
      })
    }

    const canonicalOrigin = readCanonicalDcApiOrigin(parsed.origin)
    const nonce = readString(parsed.authorizationRequest.nonce)
    if (!nonce) {
      throw new Error('PresentationRequestInvalid: dc_api nonce is required')
    }
    const requestedNamespaceKeys = readRequestedMdocNamespaceKeys(credentialQuery)

    const resolved: DcApiResolvedPresentation = {
      sessionId: parsed.sessionId,
      protocol: parsed.protocol,
      origin: canonicalOrigin,
      responseMode: parsed.responseMode,
      authorizationRequest: parsed.authorizationRequest,
      dcqlQuery,
      selectedDcqlQueryId: credentialQuery.id,
      matchedCredential,
      nonce,
      requestedNamespaceKeys,
      ...(trust.verifier ? { verifier: trust.verifier } : {}),
    }
    trustedCompletionContexts.set(resolved, {
      origin: canonicalOrigin,
      responseMode: parsed.responseMode,
      authorizationRequest: cloneJsonRecord(parsed.authorizationRequest),
      selectedDcqlQueryId: credentialQuery.id,
      credentialId: matchedCredential.id,
      nonce,
      requestedNamespaceKeys: [...requestedNamespaceKeys],
    })
    return resolved
  } catch (error) {
    logWalletError('oid4vp', 'dc-api-resolve-failed', error, {
      protocol: input.protocol,
      origin: input.origin,
      failureMessage: error instanceof Error ? error.message : toErrorMessage(error),
    })
    throw mapDcApiError(error, 'resolve')
  }
}

export async function completeDcApiPresentation(
  input: DcApiCompletionInput,
): Promise<DcApiPresentationPayload> {
  try {
    const context = trustedCompletionContexts.get(input.presentation)
    if (!context) {
      throw new Error('PresentationRequestInvalid: DC API completion requires a trusted resolution')
    }
    assertApprovedNamespaceKeys(input.approvedNamespaceKeys, context.requestedNamespaceKeys)

    const hasNativeMdoc = await ensureNativeMdocStored(input.presentation.matchedCredential)
    if (!hasNativeMdoc) {
      throw new PresentationCredentialUnavailableError({
        message: 'PresentationCredentialMissing: stored mso_mdoc bytes are unavailable for presentation',
        reason: 'credential-missing',
        matchFailureKind: 'document-not-stored',
        recordType: input.presentation.matchedCredential.type,
      })
    }

    const encryptionJwkJson = context.responseMode === 'dc_api.jwt'
      ? JSON.stringify(resolveOid4vpResponseEncryptionParams(context.authorizationRequest).jwk)
      : undefined
    const deviceResponse = await buildDcApiDeviceResponseAsync({
      credentialId: context.credentialId,
      approvedNamespaceKeys: [...input.approvedNamespaceKeys],
      origin: context.origin,
      nonce: context.nonce,
      ...(encryptionJwkJson ? { encryptionJwkJson } : {}),
    })

    return buildDcApiPresentationPayload({
      responseMode: context.responseMode,
      authorizationRequest: context.authorizationRequest,
      selectedDcqlQueryId: context.selectedDcqlQueryId,
      deviceResponse,
    })
  } catch (error) {
    logWalletError('oid4vp', 'dc-api-completion-failed', error)
    throw mapDcApiError(error, 'complete')
  }
}

function requireSignedRequestEvidence<T>(value: T | undefined): T {
  if (!value) {
    throw new Error('PresentationRequestInvalid: signed dc_api authentication evidence is missing')
  }
  return value
}

function matchesDcApiMdocCredentialQuery(
  record: VerifiableCredentialRecord,
  credentialQuery: DcqlCredentialQuery,
): boolean {
  const storedDoctype = readMdocDocTypeFromRecord(record)
  const requestedDoctypes = [
    ...(credentialQuery.meta?.doctype_value ? [credentialQuery.meta.doctype_value] : []),
    ...(credentialQuery.meta?.type_values ?? []),
  ]
  if (requestedDoctypes.includes(storedDoctype)) {
    return true
  }
  return requestedDoctypes.includes('org.iso.18013.5.1.mDL') && record.type === 'DLTDrivingLicence'
}

function pickMatchedDcApiCredential(
  presentableCredentials: VerifiableCredentialRecord[],
  allCredentials: VerifiableCredentialRecord[],
  credentialQuery: DcqlCredentialQuery,
  preferredCredentialId?: string | null,
): VerifiableCredentialRecord | undefined {
  if (preferredCredentialId) {
    const preferred = presentableCredentials.find((credential) => credential.id === preferredCredentialId)
      ?? allCredentials.find((credential) =>
        credential.id === preferredCredentialId && isDcApiMdocCandidate(credential),
      )
    if (preferred) {
      // Credential Manager already matched this wallet entry to the verifier DCQL query.
      return preferred
    }
  }

  return presentableCredentials.find((credential) =>
    matchesDcApiMdocCredentialQuery(credential, credentialQuery),
  )
}

async function hydrateDcApiMdocCredentials(credentials: VerifiableCredentialRecord[]): Promise<void> {
  for (const credential of credentials) {
    if (!isDcApiMdocCandidate(credential)) continue
    await ensureNativeMdocStored(credential)
  }
}

function isDcApiMdocCandidate(record: VerifiableCredentialRecord): boolean {
  if (readMdocDocTypeFromRecord(record) !== DC_API_MDL_DOCTYPE) return false
  if (record.type === 'DLTDrivingLicence') return true
  if (isMdocRawVc(record.rawVc)) return true
  if (isMdocPresentableRecord(record)) return true
  return recordHasLogicalMdocFormat(record.id)
}

function readStandaloneMdocQuery(query: DcqlQuery): DcqlCredentialQuery {
  if (query.credentials.length !== 1 || query.credentialSets) {
    throw new Error('PresentationRequestUnsupported: DC API requires one standalone mso_mdoc credential query')
  }

  const credential = query.credentials[0]!
  if (credential.format !== 'mso_mdoc' || !credential.meta?.doctype_value) {
    throw new Error('PresentationRequestUnsupported: DC API requires mso_mdoc with doctype_value')
  }
  return credential
}

function readRequestedMdocNamespaceKeys(credential: DcqlCredentialQuery): string[] {
  const claims = credential.claims ?? []
  if (claims.length === 0) {
    throw new Error('PresentationRequestUnsupported: DC API mso_mdoc claim paths are required')
  }

  const keys = new Set<string>()
  for (const claim of claims) {
    const [namespace, identifier, extra] = claim.path
    if (!namespace || !identifier || extra) {
      throw new Error('PresentationRequestUnsupported: DC API mso_mdoc claims require namespace and identifier')
    }
    keys.add(`${namespace}/${identifier}`)
  }
  return [...keys]
}

function assertApprovedNamespaceKeys(approved: string[], requested: string[]): void {
  if (approved.length === 0) {
    throw new Error('PresentationRequestInvalid: at least one approved mdoc field is required')
  }

  const requestedSet = new Set(requested)
  if (approved.some((key) => !requestedSet.has(key))) {
    throw new Error('PresentationRequestInvalid: approved mdoc field was not requested')
  }
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function mapDcApiError(error: unknown, stage: 'resolve' | 'complete'): Error {
  if (error instanceof Error && isSafeDcApiError(error.message)) return error

  const nativeCode = readNativeModuleErrorCode(error)
  if (nativeCode === 'DC_API_DEVICE_RESPONSE_X5CHAIN_MISSING') {
    return new Error(
      'PresentationCredentialMissing: stored mDL is missing issuer certificate chain (x5chain); claim a new Driving Licence from the issuer',
    )
  }
  if (nativeCode === 'DC_API_DEVICE_RESPONSE_FAILED') {
    return new Error('PresentationSubmissionFailed: DC API DeviceResponse construction failed')
  }

  return new Error(stage === 'resolve'
    ? 'PresentationRequestInvalid: DC API request could not be resolved'
    : 'PresentationSubmissionFailed: DC API presentation could not be completed')
}

function readNativeModuleErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function isSafeDcApiError(message: string): boolean {
  return [
    'PresentationRequest',
    'PresentationCredential',
    'PresentationSubmission',
    'DcApiHardwareCredentialKeyRequired',
    'NativeProximityModuleRequired',
  ].some((prefix) => message.startsWith(prefix))
}
