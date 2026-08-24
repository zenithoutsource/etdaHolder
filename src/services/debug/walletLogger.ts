type LogScope =
  | 'startup'
  | 'crypto'
  | 'oid4vci'
  | 'oid4vp'
  | 'scan'
  | 'storage'
  | 'sdk'
  | string

const DEFAULT_WALLET_DEBUG_MAX_BODY_BYTES = 32768

const SENSITIVE_KEY_PATTERN =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|vp[_-]?token|raw[_-]?vc|sd[_-]?jwt|jwt|proof|disclosure|credentialSubject|claims|private|secret|seed|password|authorization|email|photo|image|birthdate|id_number|full_name|given_name|family_name|tx_code|pre[-_]?authorized)/i

export function isWalletDebugLoggingEnabled(isDevelopment = __DEV__): boolean {
  if (!isDevelopment) return false
  return process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS !== 'false'
}

export function isWalletRawProtocolLoggingEnabled(isDevelopment = __DEV__): boolean {
  if (!isDevelopment) return false
  if (!isWalletDebugLoggingEnabled(isDevelopment)) return false
  return process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL === 'true'
}

export function readWalletDebugMaxBodyBytes(): number {
  const parsed = Number(process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WALLET_DEBUG_MAX_BODY_BYTES
}

export function logWalletRawProtocol(scope: LogScope, event: string, details?: unknown): void {
  if (!isWalletRawProtocolLoggingEnabled()) return
  logWalletStep(scope, event, details)
}

function shouldRedactSensitiveKeys(isDevelopment = __DEV__): boolean {
  return !isWalletRawProtocolLoggingEnabled(isDevelopment)
}

function shouldRedactKey(keyHint: string, isDevelopment = __DEV__): boolean {
  if (/^authorization$/i.test(keyHint)) return true
  if (!shouldRedactSensitiveKeys(isDevelopment)) return false
  return SENSITIVE_KEY_PATTERN.test(keyHint)
}

export function sanitizeForWalletLog(value: unknown, isDevelopment = __DEV__): unknown {
  return sanitizeValue(value, undefined, isDevelopment)
}

export function logWalletStep(scope: LogScope, event: string, details?: unknown): void {
  if (!isWalletDebugLoggingEnabled()) return

  if (details === undefined) {
    console.info(`[wallet:${scope}] ${event}`)
    return
  }

  console.info(`[wallet:${scope}] ${event}`, sanitizeForWalletLog(details))
}

export function logWalletError(scope: LogScope, event: string, error: unknown, details?: unknown): void {
  if (!isWalletDebugLoggingEnabled()) return

  const sanitizedError = sanitizeError(error, __DEV__)
  if (details === undefined) {
    console.error(`[wallet:${scope}] ${event}`, sanitizedError)
    return
  }

  console.error(`[wallet:${scope}] ${event}`, sanitizeForWalletLog(details), sanitizedError)
}

function sanitizeValue(value: unknown, keyHint?: string, isDevelopment = __DEV__): unknown {
  if (keyHint && shouldRedactKey(keyHint, isDevelopment)) return '[redacted]'
  if (value === null || value === undefined) return value

  if (value instanceof Error) return sanitizeError(value, isDevelopment)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, undefined, isDevelopment))
  }

  if (typeof value === 'string') {
    if (shouldRedactSensitiveKeys(isDevelopment) && looksLikeCompactToken(value)) return '[redacted]'
    return value
  }

  if (typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sanitizeValue(nestedValue, key, isDevelopment)
  }
  return output
}

function sanitizeError(error: unknown, isDevelopment = __DEV__): Record<string, unknown> {
  if (error instanceof Error) {
    const coded = error as Error & { code?: unknown }
    return {
      ...(typeof coded.code === 'string' ? { code: coded.code } : {}),
      message: error.message,
      name: error.name,
    }
  }

  if (typeof error === 'object' && error !== null) {
    return sanitizeValue(error, undefined, isDevelopment) as Record<string, unknown>
  }

  return { message: String(error) }
}

function looksLikeCompactToken(value: string): boolean {
  const parts = value.split('.')
  return parts.length >= 3 &&
    parts.slice(0, 3).every((part) => /^[A-Za-z0-9_-]+$/.test(part)) &&
    parts.slice(0, 3).some((part) => part.length >= 16)
}
