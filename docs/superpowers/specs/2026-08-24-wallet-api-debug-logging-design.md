# Wallet API and Protocol Debug Logging

**Status:** Approved (approach C — hybrid central HTTP trace + protocol payload hooks)  
**Date:** 2026-08-24  
**Scope:** Development builds only (`__DEV__`). No change to production/release logging behavior.

## Problem

Wallet debug logging today is inconsistent:

- `installWalletApiFetch` logs only relative `/wallet-api/*` paths; full-URL wallet calls and all issuer/verifier/broker traffic are excluded.
- HTTP 4xx/5xx responses are logged as `fetch-complete` with `ok: false` (info level), not as errors; response bodies are not captured.
- Orval-generated SDK functions return `{ status, data }` without throwing, so transport failures never reach `logWalletError` at the fetch layer.
- Several service paths throw or return silently without `logWalletError` (`syncCredentialToBackend`, `logout` non-2xx, renewal status poll, `presentationDefinitionResolver`, broker client uses `logWalletStep` for failures).
- `walletLogger` redacts VC/VP/JWT/token/PII fields, which blocks protocol debugging when developers need raw wire payloads.

## Goals

1. Log **all outbound HTTP** in development when debug logging is enabled.
2. Log **every API failure** (network error or `!response.ok`) at error level with safe diagnostic context.
3. Optionally log **raw protocol payloads** (VC, VP, JWT, token responses) when explicitly enabled.
4. Preserve production fail-closed posture: no protocol or PII logs in release builds.

## Non-goals

- Production observability / crash reporting integration.
- Persisting logs to disk or remote telemetry.
- Changing user-facing error messages or retry behavior.

## Approach

**Hybrid (C):**

1. **Central HTTP trace** — wrap global `fetch` indirection to trace every outbound request/response.
2. **Protocol payload hooks** — emit semantic raw-payload events at OID4VCI/OID4VP/backend boundaries when raw mode is on.
3. **Service-layer gap fixes** — add missing `logWalletError` calls at known silent failure sites.

## Configuration

All flags are read at runtime from `process.env`. Hard gate: functions return `false` when `!__DEV__` regardless of env value.

| Variable | Unit | Default (dev) | Effect |
|----------|------|---------------|--------|
| `EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS` | boolean | enabled when unset | Master switch for wallet debug logs (existing). Set `false` to disable all debug logging. |
| `EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL` | boolean | `false` | When `true`, disable redaction for protocol fields (VC/VP/JWT/tokens). **Opt-in only.** |
| `EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES` | bytes | `32768` | Max UTF-8 bytes captured per request/response body preview; remainder truncated with marker. |

Document all three in `.env.example` with warnings that raw mode logs credentials and PII to Metro/device logs.

### Logger API additions (`src/services/debug/walletLogger.ts`)

```typescript
isWalletDebugLoggingEnabled()       // existing
isWalletRawProtocolLoggingEnabled() // new: __DEV__ && EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL === 'true'
sanitizeForWalletLog(value)         // skip SENSITIVE_KEY_PATTERN redaction when raw mode on
```

Raw mode does **not** bypass the `__DEV__` gate. Release builds never log raw protocol data.

## Central HTTP trace

**New module:** `src/services/debug/walletHttpTrace.ts`  
**Wired from:** `src/sdk/installWalletApiFetch.ts` (inside the existing `setFetchImplementation` wrapper, before/after the pinned fetch call).

### Classification

A request is traced when `isWalletDebugLoggingEnabled()` is true. No URL is excluded (wallet-api, issuer, verifier, broker, wallet attestation full URLs, Expo push, etc.).

Wallet-backend attribution for logging scope tag:

- Relative path starts with `/wallet-api/`, **or**
- Absolute URL host matches configured wallet API base URL host **and** path contains `/wallet-api/`

Use scope `sdk` for wallet-backend traffic; use `http` for all other hosts (or derive scope from path: `oid4vci`, `oid4vp` when URL matches known issuer/verifier patterns — optional enhancement, not required for v1).

### Events

| Event | Level | When |
|-------|-------|------|
| `http-request-start` | info (`logWalletStep`) | Before `fetch` |
| `http-response` | info if 2xx; **error** if `!ok` | After response received |
| `http-response-body` | same as parent event | Body preview attached |
| `http-request-failed` | error | Thrown network/abort (non-abort: error; abort: info `http-request-aborted`) |

### Fields (always safe / structural)

- `method`, `host`, `path`, `queryKeys`, `durationMs`, `status`, `ok`, `contentType`
- Never log full Authorization header values (redact even in raw mode; log `authorizationPresent: true` and scheme only)

### Body capture rules

1. **On failure** (`!response.ok` or network throw): capture response body preview (and request body if present).
2. **On success + raw protocol mode**: also capture bodies when URL or content suggests protocol traffic:
   - Path contains `/credential`, `/token`, `/openid4vc`, `/verify`, `/presentation`, `/deferred`
   - Request `Content-Type` is `application/x-www-form-urlencoded` and body contains `vp_token`
   - Response `Content-Type` is `application/json` and body keys include `access_token`, `c_nonce`, `credential`, `error`
3. Apply `EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES`; append `…[truncated N bytes]` when exceeded.
4. When raw mode off, run existing `sanitizeForWalletLog` on body objects/strings (redact JWT-like compact tokens in values).

### Interaction with existing `installWalletApiFetch` logging

Replace duplicate `fetch-start` / `fetch-complete` / `fetch-failed` events with HTTP trace events to avoid double logging. Keep `fetch-aborted` semantics (info, not error) for `AbortError`.

## Protocol payload hooks

When `isWalletRawProtocolLoggingEnabled()`, emit additional semantic events (in addition to HTTP trace):

| Scope | Event | Payload |
|-------|-------|---------|
| `oid4vci` | `debug-raw-credential-received` | Full `rawVc` after successful credential parse |
| `oid4vci` | `debug-raw-token-response` | Token endpoint JSON body |
| `oid4vci` | `debug-raw-proof-jwt` | PoP / proof JWT sent on credential request |
| `oid4vp` | `debug-raw-vp-token` | Formatted VP token immediately before submit |
| `oid4vp` | `debug-raw-presentation-submission` | `direct_post` form body or `direct_post.jwt` compact JWE |
| `oid4vp` | `debug-raw-verifier-response` | Verifier response body after submit |
| `sdk` | `debug-raw-backend-sync` | Import request: full `jwt` in raw mode; otherwise jwt byte length only |

Hook locations:

- `src/services/vci/exchangeService.ts` — claim / credential received / backend sync
- `src/services/vp/presentationService.ts` — submit path (oid4vc adapter and legacy direct_post)
- Existing `retrieveViaOid4vc.ts` debug wire logging remains; align event names with table above where overlapping

## Service-layer gap fixes

Add `logWalletError` (operational mode, redacted) at these sites regardless of raw flag:

| File | Change |
|------|--------|
| `exchangeService.ts` `syncCredentialToBackend` | Log on catch and on `status !== 201` with HTTP status and safe message |
| `authService.ts` `logout` | Check `logoutUser` status; log error on non-2xx before local keychain clear |
| `presentationDefinitionResolver.ts` | Log fetch/parse failures before rethrow |
| `brokerSessionClient.ts` | Use `logWalletError` for `!response.ok` (not `logWalletStep`) |
| `credentialRenewalService.ts` | Log non-OK status poll instead of silent return |
| `issuerSuspension.ts` | Use `logWalletError` for non-OK refresh (optional: keep step + add error) |

## Error handling

- Logging must never throw; wrap body read/parse in try/catch and log read failures as `{ bodyReadFailed: true }`.
- Use `response.clone()` before reading body so consumers are unaffected.
- AbortError: info-level `http-request-aborted`, not error (matches current push-token behavior).

## Testing

| Area | Tests |
|------|-------|
| `walletLogger.ts` | Raw mode on/off redaction; `__DEV__` false ignores raw flag |
| `walletHttpTrace.ts` | Truncation, failure → error level, 2xx → info, body on !ok |
| `installWalletApiFetch.ts` | Issuer URL traced; 4xx emits error-level response log; no duplicate legacy events |
| Service gaps | Unit tests for `syncCredentialToBackend` and `logout` logging mocks |

## Security

- Raw protocol logging is **developer-only** and **opt-in**.
- Do not add `console.info` raw payload blocks outside `walletLogger` / `walletHttpTrace`.
- CI and release builds: `isWalletRawProtocolLoggingEnabled()` always false.
- Team guidance: disable screen recording and avoid shared dev devices when raw mode is on.

## Rollout

1. Implement logger flags + sanitization bypass.
2. Add `walletHttpTrace` and wire into fetch indirection.
3. Add protocol hooks and service gap fixes.
4. Update `.env.example` and `docs/TASKS.md` backlog entry to completed when done.

## Success criteria

- Reproducing a failed issuer credential request shows error-level log with HTTP status and OAuth error fields.
- Reproducing a failed wallet login shows error-level log with HTTP status and server message.
- With raw mode on, claim + present flows log full VC and VP payloads in Metro.
- With debug logs off or in release build, no new log output.
