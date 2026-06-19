type LogScope =
  | 'startup'
  | 'crypto'
  | 'oid4vci'
  | 'oid4vp'
  | 'scan'
  | 'storage'
  | 'sdk'
  | string

const SENSITIVE_KEY_PATTERN =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|vp[_-]?token|raw[_-]?vc|sd[_-]?jwt|jwt|proof|disclosure|credentialSubject|claims|private|secret|seed|password|authorization|email|photo|image|birthdate|id_number|full_name|given_name|family_name|tx_code|pre[-_]?authorized)/i

export function isWalletDebugLoggingEnabled(isDevelopment = __DEV__): boolean {
  if (!isDevelopment) return false
  return process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS !== 'false'
}

export function sanitizeForWalletLog(value: unknown): unknown {
  return sanitizeValue(value)
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

  const sanitizedError = sanitizeError(error)
  if (details === undefined) {
    console.error(`[wallet:${scope}] ${event}`, sanitizedError)
    return
  }

  console.error(`[wallet:${scope}] ${event}`, sanitizeForWalletLog(details), sanitizedError)
}

function sanitizeValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) return '[redacted]'
  if (value === null || value === undefined) return value

  if (value instanceof Error) return sanitizeError(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item))
  }

  if (typeof value === 'string') {
    if (looksLikeCompactToken(value)) return '[redacted]'
    return value
  }

  if (typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    output[key] = sanitizeValue(nestedValue, key)
  }
  return output
}

function sanitizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const coded = error as Error & { code?: unknown }
    return {
      ...(typeof coded.code === 'string' ? { code: coded.code } : {}),
      message: error.message,
      name: error.name,
    }
  }

  if (typeof error === 'object' && error !== null) {
    return sanitizeValue(error) as Record<string, unknown>
  }

  return { message: String(error) }
}

function looksLikeCompactToken(value: string): boolean {
  const parts = value.split('.')
  return parts.length >= 3 &&
    parts.slice(0, 3).every((part) => /^[A-Za-z0-9_-]+$/.test(part)) &&
    parts.slice(0, 3).some((part) => part.length >= 16)
}
