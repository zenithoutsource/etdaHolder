/** Debug-mode logging for agent session b2930b. Metro only — no network. No secrets/PII. */
import { decodeJwtPayload, decodeJwtHeader, readString, base64UrlDecodeToString } from '@/src/utils/jwtUtils'

import { logWalletStep } from '@/src/services/debug/walletLogger'
import type { VerifierDcqlVpTokenShape } from '@/src/config/runtimeFlags'
import type { ResolvedPresentationRequest } from '@/src/services/vp/presentationService'

export function agentDebugLog(input: {
  location: string
  message: string
  hypothesisId: string
  data?: Record<string, unknown>
  runId?: string
}): void {
  if (!__DEV__) return

  logWalletStep('agent-debug', input.hypothesisId, {
    location: input.location,
    message: input.message,
    runId: input.runId ?? 'pre-fix',
    ...(input.data ?? {}),
  })
}

export function describeVpTokenEnvelopeForDebug(vpToken: unknown): {
  vpTokenType: string
  queryIds: string[]
  entryValueKinds: string[]
} {
  if (typeof vpToken === 'string') {
    return { vpTokenType: 'string', queryIds: [], entryValueKinds: [] }
  }
  if (Array.isArray(vpToken)) {
    return { vpTokenType: 'array', queryIds: [], entryValueKinds: [`array_len_${vpToken.length}`] }
  }
  if (vpToken !== null && typeof vpToken === 'object') {
    const record = vpToken as Record<string, unknown>
    const queryIds = Object.keys(record)
    const entryValueKinds = queryIds.map((id) => {
      const value = record[id]
      if (Array.isArray(value)) return `array_len_${value.length}`
      if (typeof value === 'string') return 'string'
      return typeof value
    })
    return { vpTokenType: 'object', queryIds, entryValueKinds }
  }
  return { vpTokenType: typeof vpToken, queryIds: [], entryValueKinds: [] }
}

export function readSdJwtDisclosureClaimKeys(vpToken: string): string[] {
  const segments = vpToken.split('~')
  const keys: string[] = []
  for (const segment of segments.slice(1)) {
    if (!segment || segment.split('.').length === 3) continue
    try {
      const decoded = JSON.parse(base64UrlDecodeToString(segment)) as unknown
      if (Array.isArray(decoded) && typeof decoded[1] === 'string') keys.push(decoded[1])
    } catch {
      // skip malformed disclosure
    }
  }
  return keys
}

function readJweInnerVpTokenValue(formattedVpToken: string): unknown {
  try {
    const parsed = JSON.parse(formattedVpToken) as unknown
    if (parsed !== null && typeof parsed === 'object') return parsed
  } catch {
    // raw token string
  }
  return formattedVpToken
}

/** Evidence bundle attached to submit-response-failed for hypothesis testing. */
export function buildSubmitDebugEvidence(input: {
  request: ResolvedPresentationRequest
  formattedVpToken: string
  vpToken: string
  tokenShape?: VerifierDcqlVpTokenShape
}): Record<string, unknown> {
  const issuerJwt = input.vpToken.split('~')[0] ?? ''
  const issuerPayload = decodeJwtPayload(issuerJwt)
  const issuerHeader = decodeJwtHeader(issuerJwt)
  const jweInnerVpToken = readJweInnerVpTokenValue(input.formattedVpToken)
  const envelope = describeVpTokenEnvelopeForDebug(jweInnerVpToken)
  const dcqlQueryIds = input.request.dcqlQuery?.credentials.map((credential) => credential.id) ?? []
  const queryIdsMatch = envelope.queryIds.length === dcqlQueryIds.length
    && envelope.queryIds.every((id, index) => id === dcqlQueryIds[index])

  return {
    tokenShape: input.tokenShape ?? 'raw',
    dcqlQueryIds,
    dcqlClaimPaths: input.request.dcqlQuery?.credentials.flatMap((credential) =>
      (credential.claims ?? []).map((claim) => claim.path.join('.')),
    ) ?? [],
    jweInnerVpToken: envelope,
    queryIdsMatchDcql: queryIdsMatch,
    disclosureClaimKeys: readSdJwtDisclosureClaimKeys(input.vpToken),
    credentialIss: readString(issuerPayload?.iss),
    credentialIssType: issuerPayload?.iss === undefined ? 'none' : typeof issuerPayload.iss,
    issuerJwtTyp: readString(issuerHeader?.typ),
    issuerJwtX5cCount: Array.isArray(issuerHeader?.x5c) ? issuerHeader.x5c.length : 0,
    issuerSdCount: Array.isArray(issuerPayload?._sd) ? issuerPayload._sd.length : 0,
    statusClaimType: issuerPayload?.status === undefined ? 'none' : typeof issuerPayload.status,
    statusListPresent: Boolean(isRecord(issuerPayload?.status) && isRecord((issuerPayload.status as Record<string, unknown>).status_list)),
    credentialVct: readString(issuerPayload?.vct),
    credentialType: input.request.matchedCredential.type,
    verifierHost: (() => {
      try {
        return new URL(input.request.responseUri).hostname
      } catch {
        return 'unknown'
      }
    })(),
  }
}

export function formatSubmitDebugEvidenceSummary(evidence: Record<string, unknown>): string {
  const inner = isRecord(evidence.jweInnerVpToken)
    ? evidence.jweInnerVpToken as { queryIds?: string[]; entryValueKinds?: string[]; vpTokenType?: string }
    : undefined
  const disclosureKeys = Array.isArray(evidence.disclosureClaimKeys)
    ? evidence.disclosureClaimKeys.filter((key): key is string => typeof key === 'string')
    : []

  return [
    `query_ids_match=${String(evidence.queryIdsMatchDcql)}`,
    `inner_query_ids=${inner?.queryIds?.join(',') || 'none'}`,
    `inner_entry_kinds=${inner?.entryValueKinds?.join(',') || 'none'}`,
    `inner_vp_type=${inner?.vpTokenType ?? 'unknown'}`,
    `disclosure_keys=${disclosureKeys.join(',') || 'none'}`,
    `credential_iss=${typeof evidence.credentialIss === 'string' ? evidence.credentialIss : 'none'}`,
    `credential_iss_type=${typeof evidence.credentialIssType === 'string' ? evidence.credentialIssType : 'unknown'}`,
    `issuer_jwt_typ=${typeof evidence.issuerJwtTyp === 'string' ? evidence.issuerJwtTyp : 'none'}`,
    `issuer_jwt_x5c_count=${typeof evidence.issuerJwtX5cCount === 'number' ? String(evidence.issuerJwtX5cCount) : '0'}`,
    `issuer_sd_count=${typeof evidence.issuerSdCount === 'number' ? String(evidence.issuerSdCount) : '0'}`,
    `status_claim_type=${typeof evidence.statusClaimType === 'string' ? evidence.statusClaimType : 'unknown'}`,
    `status_list_present=${String(evidence.statusListPresent === true)}`,
    `credential_vct=${typeof evidence.credentialVct === 'string' ? evidence.credentialVct : 'none'}`,
    `token_shape=${typeof evidence.tokenShape === 'string' ? evidence.tokenShape : 'unknown'}`,
  ].join('; ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
