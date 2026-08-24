# Wallet API and Protocol Debug Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log all outbound HTTP failures in development, with optional raw VC/VP/JWT payload logging for protocol debugging.

**Architecture:** Extend `walletLogger` with raw-protocol mode and body-size config; add `walletHttpTrace` as the single fetch wrapper for transport logging; wire it through `installWalletApiFetch`; add semantic raw-payload hooks in OID4VCI/OID4VP services and close known service-layer logging gaps.

**Tech Stack:** TypeScript, React Native / Expo SDK 54, Jest, existing `walletLogger` + global `fetch` indirection (`fetchIndirection.ts`).

## Global Constraints

- Development only: `isWalletDebugLoggingEnabled()` and `isWalletRawProtocolLoggingEnabled()` return `false` when `!__DEV__`.
- Raw protocol logging opt-in: `EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL=true` (never default on).
- Master switch: `EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS` — unset means enabled in dev; `false` disables all wallet debug logs.
- Body preview cap: `EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES` default `32768`.
- Never log full `Authorization` header values (scheme + `authorizationPresent` only).
- Logging must never throw; use `response.clone()` before reading bodies.
- Use existing `logWalletStep` / `logWalletError`; no new `console.info` raw blocks outside `walletLogger` / `walletHttpTrace`.
- Yarn only; run `yarn test` for focused files after each task.

**Spec:** `docs/superpowers/specs/2026-08-24-wallet-api-debug-logging-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/services/debug/walletLogger.ts` | Raw-mode flag, sanitization bypass, `logWalletRawProtocol` helper |
| `src/services/debug/walletLogger.test.ts` | Raw/redaction/`__DEV__` gate tests |
| `src/services/debug/walletHttpTrace.ts` | Central HTTP trace: classify URL, capture bodies, emit events |
| `src/services/debug/walletHttpTrace.test.ts` | Trace behavior unit tests |
| `src/sdk/installWalletApiFetch.ts` | Replace legacy fetch-start/complete with `traceHttpFetch` |
| `src/sdk/installWalletApiFetch.test.ts` | Update expectations for HTTP trace events |
| `src/services/vci/exchangeService.ts` | Raw protocol hooks + `syncCredentialToBackend` error logging |
| `src/services/vp/presentationService.ts` | Raw VP/submission/verifier-response hooks |
| `src/services/auth/authService.ts` | Logout non-2xx logging |
| `src/services/vp/presentationDefinitionResolver.ts` | Fetch failure logging |
| `src/services/vp/brokerSessionClient.ts` | `logWalletError` on broker HTTP failures |
| `src/services/credentials/credentialRenewalService.ts` | Log silent status-poll non-OK |
| `src/services/credentials/issuerSuspension.ts` | `logWalletError` on non-OK refresh |
| `.env.example` | Document new env vars |
| `docs/TASKS.md` | Mark work complete |

---

### Task 1: Raw protocol mode in `walletLogger`

**Files:**
- Modify: `src/services/debug/walletLogger.ts`
- Modify: `src/services/debug/walletLogger.test.ts`

**Interfaces:**
- Produces: `isWalletRawProtocolLoggingEnabled(isDevelopment?: boolean): boolean`
- Produces: `readWalletDebugMaxBodyBytes(): number`
- Produces: `logWalletRawProtocol(scope, event, details): void` — no-op unless raw mode on
- Produces: `sanitizeForWalletLog(value)` — skips key/token redaction when raw mode on (Authorization header keys still redacted via explicit check in http trace, not here)

- [ ] **Step 1: Write failing tests**

Add to `src/services/debug/walletLogger.test.ts`:

```typescript
import {
  isWalletRawProtocolLoggingEnabled,
  logWalletRawProtocol,
  readWalletDebugMaxBodyBytes,
  sanitizeForWalletLog,
} from './walletLogger'

describe('walletLogger raw protocol mode', () => {
  const originalRaw = process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
  const originalMax = process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES

  afterEach(() => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = originalRaw
    process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES = originalMax
  })

  test('raw protocol mode is off unless explicitly enabled in development', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
    expect(isWalletRawProtocolLoggingEnabled(true)).toBe(false)
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    expect(isWalletRawProtocolLoggingEnabled(true)).toBe(true)
    expect(isWalletRawProtocolLoggingEnabled(false)).toBe(false)
  })

  test('sanitizeForWalletLog preserves rawVc when raw mode is on', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
    expect(sanitizeForWalletLog({ rawVc: jwt }, true)).toEqual({ rawVc: jwt })
  })

  test('sanitizeForWalletLog still redacts rawVc when raw mode is off', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signaturepart'
    expect(sanitizeForWalletLog({ rawVc: jwt }, true)).toEqual({ rawVc: '[redacted]' })
  })

  test('readWalletDebugMaxBodyBytes defaults to 32768', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES
    expect(readWalletDebugMaxBodyBytes()).toBe(32768)
  })

  test('logWalletRawProtocol emits only when raw mode enabled', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
    logWalletRawProtocol('oid4vci', 'debug-raw-credential-received', { rawVc: 'x' })
    expect(console.info).not.toHaveBeenCalled()
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    logWalletRawProtocol('oid4vci', 'debug-raw-credential-received', { rawVc: 'x' })
    expect(console.info).toHaveBeenCalledWith(
      '[wallet:oid4vci] debug-raw-credential-received',
      { rawVc: 'x' },
    )
  })
})
```

Note: extend `sanitizeForWalletLog` signature to accept optional `isDevelopment` param for testability, or pass through `isWalletRawProtocolLoggingEnabled()` internally — tests above assume internal read of env + `__DEV__` override via optional second param:

```typescript
export function sanitizeForWalletLog(value: unknown, isDevelopment = __DEV__): unknown
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/services/debug/walletLogger.test.ts -t "raw protocol"`
Expected: FAIL — `isWalletRawProtocolLoggingEnabled` not defined

- [ ] **Step 3: Implement `walletLogger` changes**

In `src/services/debug/walletLogger.ts`, add:

```typescript
const DEFAULT_WALLET_DEBUG_MAX_BODY_BYTES = 32768

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

export function sanitizeForWalletLog(value: unknown, isDevelopment = __DEV__): unknown {
  return sanitizeValue(value, undefined, isDevelopment)
}
```

Update `sanitizeValue` to accept `isDevelopment` and skip key-hint redaction + `looksLikeCompactToken` when `!shouldRedactSensitiveKeys(isDevelopment)`. Keep redacting keys matching `/^authorization$/i` always.

Update `logWalletStep` / `logWalletError` to call `sanitizeForWalletLog(details)` without overriding dev flag.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/services/debug/walletLogger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/debug/walletLogger.ts src/services/debug/walletLogger.test.ts
git commit -m "feat(debug): add raw protocol logging mode to walletLogger"
```

---

### Task 2: `walletHttpTrace` module

**Files:**
- Create: `src/services/debug/walletHttpTrace.ts`
- Create: `src/services/debug/walletHttpTrace.test.ts`

**Interfaces:**
- Consumes: `isWalletDebugLoggingEnabled`, `isWalletRawProtocolLoggingEnabled`, `readWalletDebugMaxBodyBytes`, `logWalletStep`, `logWalletError`, `sanitizeForWalletLog` from `walletLogger.ts`
- Produces: `traceHttpFetch(fetchImpl, input, init, options?): Promise<Response>`
- Produces: `resolveHttpTraceScope(resolvedUrl: string, walletApiBaseUrl?: string): string` — returns `'sdk'` or `'http'`
- Produces: `truncateBodyPreview(text: string, maxBytes?: number): string`
- Produces: `shouldCaptureSuccessBody(url: string, init?: RequestInit, response?: Response, responseText?: string): boolean`

- [ ] **Step 1: Write failing tests**

Create `src/services/debug/walletHttpTrace.test.ts`:

```typescript
import {
  resolveHttpTraceScope,
  shouldCaptureSuccessBody,
  traceHttpFetch,
  truncateBodyPreview,
} from './walletHttpTrace'
import { logWalletError, logWalletStep } from './walletLogger'

jest.mock('./walletLogger', () => ({
  isWalletDebugLoggingEnabled: jest.fn(() => true),
  isWalletRawProtocolLoggingEnabled: jest.fn(() => false),
  readWalletDebugMaxBodyBytes: jest.fn(() => 32),
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
  sanitizeForWalletLog: jest.fn((value: unknown) => value),
}))

describe('walletHttpTrace', () => {
  const logWalletStepMock = logWalletStep as jest.Mock
  const logWalletErrorMock = logWalletError as jest.Mock

  beforeEach(() => {
    logWalletStepMock.mockClear()
    logWalletErrorMock.mockClear()
  })

  test('resolveHttpTraceScope uses sdk for relative wallet-api paths', () => {
    expect(resolveHttpTraceScope('/wallet-api/auth/login')).toBe('sdk')
    expect(resolveHttpTraceScope('https://issuer.example.com/credential')).toBe('http')
  })

  test('truncateBodyPreview appends truncation marker', () => {
    expect(truncateBodyPreview('abcdef', 3)).toBe('abc…[truncated 3 bytes]')
  })

  test('traceHttpFetch logs error on HTTP 400 with response body', async () => {
    const fetchImpl = jest.fn(async () => new Response('{"message":"bad"}', { status: 400 }))
    const response = await traceHttpFetch(fetchImpl as typeof fetch, '/wallet-api/auth/login', { method: 'POST' })
    expect(response.status).toBe(400)
    expect(logWalletErrorMock).toHaveBeenCalledWith(
      'sdk',
      'http-response',
      expect.any(Error),
      expect.objectContaining({ status: 400, ok: false, responseBody: expect.any(String) }),
    )
  })

  test('traceHttpFetch logs info on HTTP 200', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))
    await traceHttpFetch(fetchImpl as typeof fetch, 'https://issuer.example.com/.well-known/openid-credential-issuer')
    expect(logWalletStepMock).toHaveBeenCalledWith('http', 'http-response', expect.objectContaining({ ok: true }))
    expect(logWalletErrorMock).not.toHaveBeenCalled()
  })

  test('shouldCaptureSuccessBody is true for credential path when raw mode would be on', () => {
    expect(shouldCaptureSuccessBody('https://issuer.example.com/credential', { method: 'POST' })).toBe(true)
    expect(shouldCaptureSuccessBody('https://issuer.example.com/health', { method: 'GET' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/services/debug/walletHttpTrace.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `walletHttpTrace.ts`**

Core implementation sketch (fill in helpers):

```typescript
import {
  isWalletDebugLoggingEnabled,
  isWalletRawProtocolLoggingEnabled,
  logWalletError,
  logWalletStep,
  readWalletDebugMaxBodyBytes,
  sanitizeForWalletLog,
} from './walletLogger'

const PROTOCOL_PATH_PATTERN = /\/(credential|token|openid4vc|verify|presentation|deferred)(\/|$)/i

export function resolveHttpTraceScope(resolvedUrl: string, walletApiHost?: string): string {
  try {
    const parsed = new URL(resolvedUrl, 'http://local.invalid')
    if (parsed.pathname.startsWith('/wallet-api/')) return 'sdk'
    if (walletApiHost && parsed.host === walletApiHost && parsed.pathname.includes('/wallet-api/')) return 'sdk'
  } catch {
    if (resolvedUrl.startsWith('/wallet-api/')) return 'sdk'
  }
  return 'http'
}

export function truncateBodyPreview(text: string, maxBytes = readWalletDebugMaxBodyBytes()): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return text
  const slice = bytes.slice(0, maxBytes)
  return `${new TextDecoder().decode(slice)}…[truncated ${bytes.length - maxBytes} bytes]`
}

export function shouldCaptureSuccessBody(
  url: string,
  init?: RequestInit,
  responseText?: string,
): boolean {
  if (!isWalletRawProtocolLoggingEnabled()) return false
  if (PROTOCOL_PATH_PATTERN.test(url)) return true
  const contentType = init?.headers
    ? readHeader(init.headers, 'content-type')
    : undefined
  const body = typeof init?.body === 'string' ? init.body : ''
  if (contentType?.includes('application/x-www-form-urlencoded') && body.includes('vp_token')) return true
  if (responseText) {
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>
      if ('access_token' in parsed || 'c_nonce' in parsed || 'credential' in parsed || 'error' in parsed) return true
    } catch {
      // not json
    }
  }
  return false
}

export async function traceHttpFetch(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { walletApiBaseUrl?: string },
): Promise<Response> {
  if (!isWalletDebugLoggingEnabled()) {
    return fetchImpl(input, init)
  }

  const resolvedUrl = readResolvedUrl(input)
  const walletApiHost = readHostFromBaseUrl(options?.walletApiBaseUrl)
  const scope = resolveHttpTraceScope(resolvedUrl, walletApiHost)
  const method = (init?.method ?? 'GET').toUpperCase()
  const startedAt = Date.now()

  logWalletStep(scope, 'http-request-start', {
    method,
    ...describeUrl(resolvedUrl),
    requestHeaders: describeSafeHeaders(init?.headers),
    requestBodyPreview: await readRequestBodyPreview(init),
  })

  try {
    const response = await fetchImpl(input, init)
    const durationMs = Date.now() - startedAt
    const contentType = response.headers.get('Content-Type') ?? undefined
    const responseText = await safeReadResponseText(response)
    const baseDetails = {
      method,
      ...describeUrl(resolvedUrl),
      durationMs,
      status: response.status,
      ok: response.ok,
      contentType,
    }
    const captureBody =
      !response.ok ||
      shouldCaptureSuccessBody(resolvedUrl, init, responseText)
    const bodyDetails = captureBody
      ? {
          responseBody: sanitizeForWalletLog(
            tryParseJson(responseText) ?? truncateBodyPreview(responseText),
          ),
        }
      : {}

    if (!response.ok) {
      logWalletError(
        scope,
        'http-response',
        new Error(`HttpRequestFailed:${response.status}`),
        { ...baseDetails, ...bodyDetails },
      )
    } else {
      logWalletStep(scope, 'http-response', { ...baseDetails, ...bodyDetails })
    }

    return response
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const details = { method, ...describeUrl(resolvedUrl), durationMs }
    if (isAbortError(error)) {
      logWalletStep(scope, 'http-request-aborted', details)
    } else {
      logWalletError(scope, 'http-request-failed', error, details)
    }
    throw error
  }
}
```

Implement `readResolvedUrl`, `describeUrl`, `describeSafeHeaders` (redact Authorization value), `safeReadResponseText` (clone + catch), `tryParseJson`, `isAbortError`, `readHostFromBaseUrl` as private helpers in the same file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/services/debug/walletHttpTrace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/debug/walletHttpTrace.ts src/services/debug/walletHttpTrace.test.ts
git commit -m "feat(debug): add central wallet HTTP trace helper"
```

---

### Task 3: Wire HTTP trace into `installWalletApiFetch`

**Files:**
- Modify: `src/sdk/installWalletApiFetch.ts`
- Modify: `src/sdk/installWalletApiFetch.test.ts`

**Interfaces:**
- Consumes: `traceHttpFetch` from `walletHttpTrace.ts`

- [ ] **Step 1: Update failing tests**

In `installWalletApiFetch.test.ts`, replace expectations for `fetch-start` / `fetch-complete` / `fetch-failed` with `http-request-start` / `http-response` / `http-request-failed`. Add test:

```typescript
test('traces issuer HTTPS calls at http scope', async () => {
  const fetchMock = jest.fn(async () => new Response('{}', { status: 200 }))
  installWalletApiFetch({ baseUrl: 'http://localhost:3001', fetchImpl: fetchMock as typeof fetch })
  await fetch('https://issuer.example.com/credential', { method: 'POST', body: '{}' })
  expect(logWalletStepMock).toHaveBeenCalledWith(
    'http',
    'http-request-start',
    expect.objectContaining({ method: 'POST', host: 'issuer.example.com' }),
  )
})

test('logs HTTP 400 wallet-api response as error', async () => {
  const fetchMock = jest.fn(async () => new Response('{"message":"bad"}', { status: 400 }))
  installWalletApiFetch({ baseUrl: 'http://localhost:3001', fetchImpl: fetchMock as typeof fetch })
  await fetch('/wallet-api/auth/login', { method: 'POST' })
  expect(logWalletErrorMock).toHaveBeenCalledWith(
    'sdk',
    'http-response',
    expect.any(Error),
    expect.objectContaining({ status: 400, ok: false }),
  )
})
```

Mock `walletHttpTrace` only if needed; prefer integration through real `traceHttpFetch` with mocked `walletLogger`.

- [ ] **Step 2: Run tests to verify failures**

Run: `yarn test src/sdk/installWalletApiFetch.test.ts`
Expected: FAIL on updated expectations

- [ ] **Step 3: Replace inline logging with `traceHttpFetch`**

In `installWalletApiFetch.ts`:

```typescript
import { traceHttpFetch } from '../services/debug/walletHttpTrace'

// Remove imports of logWalletError, logWalletStep if no longer used
// Remove isAbortError, describeFetchInputForLog helpers if only used by old logging

setFetchImplementation((async (input: FetchInput, init?: FetchInit) => {
  const resolvedInput = resolveWalletApiUrl(input, baseUrl)
  const trackAsWalletApi = isWalletApiFetchInput(input)

  const response = await traceHttpFetch(
    fetchImpl,
    resolvedInput,
    init,
    { walletApiBaseUrl: baseUrl },
  )

  return trackAsWalletApi ? normalizeWalletApiResponse(response) : response
}) as FetchFn)
```

Remove the old `trackAsWalletApi` try/catch logging block entirely.

- [ ] **Step 4: Run tests**

Run: `yarn test src/sdk/installWalletApiFetch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sdk/installWalletApiFetch.ts src/sdk/installWalletApiFetch.test.ts
git commit -m "feat(debug): route global fetch through wallet HTTP trace"
```

---

### Task 4: Protocol raw-payload hooks (OID4VCI / OID4VP)

**Files:**
- Modify: `src/services/vci/exchangeService.ts`
- Modify: `src/services/vp/presentationService.ts`

**Interfaces:**
- Consumes: `logWalletRawProtocol` from `walletLogger.ts`

- [ ] **Step 1: Write failing tests**

In `src/services/vci/exchangeService.test.ts` (or a focused new describe block), mock `logWalletRawProtocol` and assert call when raw mode enabled after mocked claim path — use existing claim test patterns with env `EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL=true`.

In `src/services/vp/presentationService.test.ts` (or existing test file), add test that `submitPresentationResponse` calls `logWalletRawProtocol('oid4vp', 'debug-raw-vp-token', ...)` when raw mode on (mock presentation request + fetch).

- [ ] **Step 2: Run tests — verify fail**

Run targeted test files; expect FAIL until hooks added.

- [ ] **Step 3: Add hooks in `exchangeService.ts`**

Import `logWalletRawProtocol`.

After token acquisition (~line 587):

```typescript
logWalletRawProtocol('oid4vci', 'debug-raw-token-response', {
  issuer: resolvedOffer.issuer,
  tokenResponse: {
    credentialIdentifier: token.credentialIdentifier,
    cNonce: token.cNonce,
    // include access token only in raw mode — already gated by logWalletRawProtocol
    accessToken: token.accessToken,
  },
})
```

After `rawVc` is available (~line 808):

```typescript
logWalletRawProtocol('oid4vci', 'debug-raw-credential-received', {
  issuer: resolvedOffer.issuer,
  rawVc,
})
```

Before credential HTTP request, where proof JWT is built (~line 704 area):

```typescript
logWalletRawProtocol('oid4vci', 'debug-raw-proof-jwt', {
  issuer: resolvedOffer.issuer,
  proofJwt,
})
```

In `syncCredentialToBackend` before `importCredential` call:

```typescript
logWalletRawProtocol('sdk', 'debug-raw-backend-sync', {
  walletId: options.walletId,
  jwt: record.rawVc,
  associatedDid,
})
```

- [ ] **Step 4: Add hooks in `presentationService.ts`**

Before submit in `submitPresentationResponse`:

```typescript
logWalletRawProtocol('oid4vp', 'debug-raw-vp-token', {
  responseUri: request.responseUri,
  vpToken: formattedVpToken,
})
```

Before fetch/adapter submit — log submission wire:

```typescript
logWalletRawProtocol('oid4vp', 'debug-raw-presentation-submission', {
  responseUri: request.responseUri,
  responseMode: request.responseMode,
  body: request.protocolPath === 'oid4vc' ? '[oid4vc-adapter]' : body.toString(),
})
```

After successful parse of verifier response:

```typescript
logWalletRawProtocol('oid4vp', 'debug-raw-verifier-response', {
  responseUri: request.responseUri,
  parsedBody,
})
```

- [ ] **Step 5: Run tests**

Run: `yarn test src/services/vci/exchangeService.test.ts src/services/vp/presentationService.test.ts` (focused describes)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/vci/exchangeService.ts src/services/vp/presentationService.ts src/services/vci/exchangeService.test.ts src/services/vp/presentationService.test.ts
git commit -m "feat(debug): add raw VC/VP protocol payload hooks"
```

---

### Task 5: Service-layer error logging gaps

**Files:**
- Modify: `src/services/vci/exchangeService.ts` (`syncCredentialToBackend`)
- Modify: `src/services/auth/authService.ts`
- Modify: `src/services/vp/presentationDefinitionResolver.ts`
- Modify: `src/services/vp/brokerSessionClient.ts`
- Modify: `src/services/credentials/credentialRenewalService.ts`
- Modify: `src/services/credentials/issuerSuspension.ts`
- Test: extend existing test files per service

- [ ] **Step 1: Write failing tests**

`exchangeService.test.ts` — existing sync tests: assert `logWalletError` called when `importCredential` returns 400.

`authService.test.ts` — add test: `logoutUser` resolves `{ status: 500 }` → `logWalletError('sdk', 'logout-server-failed', ...)`.

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement gap fixes**

`syncCredentialToBackend`:

```typescript
} catch (error) {
  logWalletError('sdk', 'backend-sync-failed', error, { credentialId: record.id })
  // existing history + throw
}
if (response.status !== 201) {
  const message = readResponseMessage(response.data) ?? `HTTP ${response.status}`
  logWalletError('sdk', 'backend-sync-failed', new Error(message), {
    credentialId: record.id,
    status: response.status,
  })
  // existing history + throw
}
```

Add local `readResponseMessage` helper (same pattern as `authService.ts`) or import shared util if one exists.

`authService.ts` `logout`:

```typescript
const logoutRes = await logoutUser({ headers: { Authorization: `Bearer ${session.token}` } })
if (logoutRes.status < 200 || logoutRes.status >= 300) {
  logWalletError('sdk', 'logout-server-failed', new Error(`LogoutFailed: HTTP ${logoutRes.status}`), {
    accountId: session.accountId,
    status: logoutRes.status,
  })
} else {
  logWalletStep('sdk', 'logout-server-complete', { accountId: session.accountId, walletId: session.walletId })
}
```

`presentationDefinitionResolver.ts` — import `logWalletError`; in each catch / `!response.ok` branch before throw:

```typescript
logWalletError('oid4vp', 'fetch-presentation-definition-failed', errorOrError, { host: parsed.host })
```

`brokerSessionClient.ts` — replace `logWalletStep(..., 'create-session-failed')` and `fetch-request-failed` with `logWalletError` (same details).

`credentialRenewalService.ts` ~line 393:

```typescript
if (!response.ok) {
  logWalletError('renewal', 'status-poll-non-ok', new Error(`HTTP ${response.status}`))
  return
}
```

`issuerSuspension.ts` ~line 115:

```typescript
if (!response.ok) {
  logWalletError('storage', 'issuer-suspension-refresh-non-ok', new Error(`HTTP ${response.status}`), {
    status: response.status,
  })
  return
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/vci/exchangeService.test.ts src/services/auth/authService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vci/exchangeService.ts src/services/auth/authService.ts src/services/vp/presentationDefinitionResolver.ts src/services/vp/brokerSessionClient.ts src/services/credentials/credentialRenewalService.ts src/services/credentials/issuerSuspension.ts
git commit -m "fix(debug): log silent API failures at service layer"
```

---

### Task 6: Documentation and verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Add env documentation to `.env.example`**

```bash
# Wallet debug logging (development only; ignored in release builds).
# EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS=false  # set to disable all wallet debug logs
# EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL=true    # WARNING: logs raw VC/VP/JWT and tokens to Metro — opt-in only
# EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES=32768 # max bytes per HTTP body preview in debug logs
```

- [ ] **Step 2: Update `docs/TASKS.md`**

Add completed entry under recent work referencing spec + plan paths.

- [ ] **Step 3: Run full verification**

```bash
yarn test src/services/debug/walletLogger.test.ts src/services/debug/walletHttpTrace.test.ts src/sdk/installWalletApiFetch.test.ts
yarn tsc --noEmit
yarn lint
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/TASKS.md
git commit -m "docs: document wallet debug and raw protocol logging flags"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Raw protocol env flag + `__DEV__` gate | Task 1 |
| Central HTTP trace all URLs | Task 2–3 |
| HTTP 4xx as error + body on failure | Task 2–3 |
| Authorization header never logged | Task 2 |
| Protocol payload hooks | Task 4 |
| Service gap fixes (6 files) | Task 5 |
| Tests | Tasks 1–5 |
| `.env.example` | Task 6 |
| No production logging change | Task 1 `__DEV__` gates |

No TBD placeholders remain. Type names consistent: `traceHttpFetch`, `logWalletRawProtocol`, `isWalletRawProtocolLoggingEnabled`.
