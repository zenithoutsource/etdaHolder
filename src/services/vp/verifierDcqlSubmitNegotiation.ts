import type { VerifierDcqlVpTokenShape } from '@/src/config/runtimeFlags'
import { getMetaStorage } from '@/src/services/storage/storage'
import { parseClientId } from './clientIdScheme'

const CACHE_PREFIX = 'verifier-dcql-vp-shape:'

const DEFAULT_SHAPE_ORDER: readonly VerifierDcqlVpTokenShape[] = [
  'object_array',
  'object_string',
  'raw',
]

/**
 * Known verifier defaults when no cached successful shape exists yet.
 * Empty by design: Animo Playground rejected `object_string` with HTTP 500 on
 * 2026-08-26, so no host overrides the spec-correct `object_array` default.
 */
const VERIFIER_DCQL_VP_TOKEN_SHAPE_HINTS: Readonly<Record<string, VerifierDcqlVpTokenShape>> = {}

export type DcqlVpTokenShapeSource = 'env' | 'cached' | 'hint' | 'default'

export type ResolvedDcqlVpTokenShape = {
  shape: VerifierDcqlVpTokenShape
  source: DcqlVpTokenShapeSource
  cacheKey: string
}

function isShapeAllowedForCredentialCount(
  shape: VerifierDcqlVpTokenShape,
  dcqlCredentialCount: number,
): boolean {
  return shape !== 'raw' || dcqlCredentialCount === 1
}

export function readVerifierDcqlVpTokenShapeHint(cacheKey: string): VerifierDcqlVpTokenShape | undefined {
  const hint = VERIFIER_DCQL_VP_TOKEN_SHAPE_HINTS[cacheKey]
  if (!hint) return undefined
  return hint
}

export function readVerifierDcqlVpTokenShapeEnvOverride(): VerifierDcqlVpTokenShape | undefined {
  const value = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
  if (value === 'object_array' || value === 'object_string' || value === 'raw') return value
  return undefined
}

export function buildVerifierInteropCacheKey(clientId: string, responseUri: string): string {
  const parsed = parseClientId(clientId)
  let origin = 'unknown-origin'
  try {
    origin = new URL(responseUri).hostname.toLowerCase()
  } catch {
    // keep unknown-origin
  }
  return `${origin}|${parsed.scheme}`
}

function readCacheStorageKey(cacheKey: string): string {
  return `${CACHE_PREFIX}${cacheKey}`
}

export function readCachedVerifierDcqlVpTokenShape(cacheKey: string): VerifierDcqlVpTokenShape | undefined {
  const raw = getMetaStorage().getString(readCacheStorageKey(cacheKey))
  if (raw === 'object_array' || raw === 'object_string' || raw === 'raw') return raw
  return undefined
}

export function writeCachedVerifierDcqlVpTokenShape(cacheKey: string, shape: VerifierDcqlVpTokenShape): void {
  getMetaStorage().set(readCacheStorageKey(cacheKey), shape)
}

export function buildDcqlVpTokenShapeAttemptOrder(input: {
  cachedShape?: VerifierDcqlVpTokenShape
  dcqlCredentialCount: number
  envOverride?: VerifierDcqlVpTokenShape
  verifierHint?: VerifierDcqlVpTokenShape
}): VerifierDcqlVpTokenShape[] {
  if (input.envOverride) return [input.envOverride]

  const allowed = input.dcqlCredentialCount === 1
    ? [...DEFAULT_SHAPE_ORDER]
    : DEFAULT_SHAPE_ORDER.filter((shape) => shape !== 'raw')

  const preferred = [
    input.cachedShape,
    input.verifierHint,
    ...allowed,
  ].filter((shape): shape is VerifierDcqlVpTokenShape => Boolean(shape))
    .filter((shape, index, values) => values.indexOf(shape) === index)
    .filter((shape) => allowed.includes(shape))

  return preferred.length > 0 ? preferred : allowed
}

/**
 * Pick one DCQL vp_token shape for this submit. Demo interop uses cache and verifier
 * hints only — no in-session retry, because many verifiers (e.g. Animo Playground)
 * invalidate the authorization session after the first POST.
 */
export function resolveDcqlVpTokenShapeForSubmit(input: {
  cacheKey: string
  dcqlCredentialCount: number
  envOverride?: VerifierDcqlVpTokenShape
}): VerifierDcqlVpTokenShape {
  const order = buildDcqlVpTokenShapeAttemptOrder({
    cachedShape: readCachedVerifierDcqlVpTokenShape(input.cacheKey),
    verifierHint: readVerifierDcqlVpTokenShapeHint(input.cacheKey),
    dcqlCredentialCount: input.dcqlCredentialCount,
    envOverride: input.envOverride,
  })
  return order.find((shape) => isShapeAllowedForCredentialCount(shape, input.dcqlCredentialCount))
    ?? (input.dcqlCredentialCount === 1 ? 'object_array' : 'object_array')
}

function readDcqlVpTokenShapeSource(input: {
  envOverride?: VerifierDcqlVpTokenShape
  cachedShape?: VerifierDcqlVpTokenShape
  verifierHint?: VerifierDcqlVpTokenShape
  resolvedShape: VerifierDcqlVpTokenShape
}): DcqlVpTokenShapeSource {
  if (input.envOverride) return 'env'
  if (input.cachedShape && input.cachedShape === input.resolvedShape) return 'cached'
  if (input.verifierHint && input.verifierHint === input.resolvedShape) return 'hint'
  return 'default'
}

export function resolveDcqlVpTokenShapeForPresentation(input: {
  clientId: string
  responseUri: string
  dcqlCredentialCount: number
  envOverride?: VerifierDcqlVpTokenShape
}): ResolvedDcqlVpTokenShape {
  const cacheKey = buildVerifierInteropCacheKey(input.clientId, input.responseUri)
  const cachedShape = readCachedVerifierDcqlVpTokenShape(cacheKey)
  const verifierHint = readVerifierDcqlVpTokenShapeHint(cacheKey)
  const envOverride = input.envOverride
  const shape = resolveDcqlVpTokenShapeForSubmit({
    cacheKey,
    dcqlCredentialCount: input.dcqlCredentialCount,
    envOverride,
  })

  return {
    shape,
    cacheKey,
    source: readDcqlVpTokenShapeSource({
      envOverride,
      cachedShape,
      verifierHint,
      resolvedShape: shape,
    }),
  }
}

export function persistSuccessfulDcqlVpTokenShape(input: {
  cacheKey: string
  shape: VerifierDcqlVpTokenShape
  envOverride?: VerifierDcqlVpTokenShape
}): void {
  if (input.envOverride) return
  writeCachedVerifierDcqlVpTokenShape(input.cacheKey, input.shape)
}

export function isRetryableDcqlVpTokenShapeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (!error.message.startsWith('PresentationSubmissionFailed:')) return false
  if (error.message.startsWith('PresentationSubmissionFailed:issuer:')) return false
  if (/invalid session/i.test(error.message)) return false
  if (/HTTP 500/.test(error.message)) return false
  return /HTTP (400|401|403|404|422)/.test(error.message)
}
