# Phase 4 Screen Capture Guard + Route Error Logging Design

Status: Approved for implementation

## Goal

Close two Phase 4 quick-win items without waiting on external ecosystem services:

1. Re-enable focus-scoped screen capture prevention on sensitive Wallet screens, with a tester override env flag.
2. Add diagnostic logging to bare `catch` blocks in production-like local backend routes (`auth`, `credentials`, `wallets`).

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Screen capture default | **On** — guard active unless explicitly disabled |
| Tester override | `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true` skips all prevent/allow calls |
| Guard mechanism | Focus-scoped `useScreenCaptureGuard` (`preventScreenCaptureAsync` / `allowScreenCaptureAsync`) — not `usePreventScreenCapture()` (window-level leak onto My QR) |
| My QR | **Never** guarded — intentional share surface |
| Scan scope | Entire Scan tab while focused (issuance preview + OID4VP consent share one screen file) |
| Server scope | `auth.ts`, `credentials.ts`, `wallets.ts` only — **not** `devWallet.ts` / `devIssuerProxy.ts` |
| Mobile authService | Already logs via `logWalletError` — audit-only; no code change |
| Response contracts | HTTP status codes and JSON bodies unchanged |

## Screen capture architecture

### Hook: `src/hooks/useScreenCaptureGuard.ts`

```text
useFocusEffect:
  on focus  → if guard enabled → preventScreenCaptureAsync()
  on blur   → if guard enabled → allowScreenCaptureAsync()
  cleanup   → allowScreenCaptureAsync() when guard was active
```

Guard enabled when:

```ts
process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD !== 'true'
```

### Call sites

| Screen | File | Rationale |
|--------|------|-----------|
| Wallet Home | `app/(tabs)/index.tsx` | Credential summary / PII |
| Credential Detail | `app/(tabs)/credential/[id].tsx` | Full claim display |
| Scan | `app/(tabs)/scan.tsx` | Issuance preview + OID4VP Holder consent |
| History Log | `app/(tabs)/history.tsx` | Presentation / lifecycle events |

**Excluded:** `app/(tabs)/qr.tsx` (My QR VP share).

### Env documentation

Add to `.env.example` and `.env.development.local.example`:

```bash
# When true, disables FLAG_SECURE / iOS capture prevention on sensitive screens (tester screenshots).
# Default: guard active. Production builds should leave this unset or false.
# EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true
```

## Server route error logging architecture

### Helper: `server/src/logging/routeError.ts`

```ts
export function logRouteError(scope: 'auth' | 'credentials' | 'wallets', operation: string, error: unknown): void
```

- Emits `console.error('[wallet-api:<scope>] <operation>-failed', error)`
- Callers pass operation slug only — no email, password, token, or credential payload in the log line
- Used immediately before existing `res.status(500).json({ message: 'Internal Server Error' })` paths

### Files to update

| File | Bare catches |
|------|----------------|
| `server/src/routes/auth.ts` | 6 |
| `server/src/routes/credentials.ts` | 1 |
| `server/src/routes/wallets.ts` | 1 |

## Error handling rules

- Screen capture: if `preventScreenCaptureAsync` throws, log via `logWalletError('screen-capture', 'prevent-failed', error)` — do not block navigation
- Server routes: log raw `Error` object; never include request body fields in log metadata

## Testing

### Mobile

- `src/hooks/useScreenCaptureGuard.test.ts` (or colocated test):
  - Default: `preventScreenCaptureAsync` on focus, `allowScreenCaptureAsync` on blur
  - `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true`: neither called

### Server

- Extend existing route tests or add focused test: mock handler throw → expect `console.error` called with scoped tag before 500 response
- `cd server && yarn test && yarn tsc`

### Regression

- Root: `yarn tsc --noEmit`, `yarn lint`, focused `yarn test`

## Non-goals

- Re-enabling guard on PIN setup / auth screens outside the four tab surfaces (future slice if needed)
- Phase-scoped Scan guard (consent-only) — whole-tab guard matches prior validated behavior
- Structured logging library (pino/winston)
- Dev route logging (`devWallet`, `devIssuerProxy`)
- Email enumeration fix in local backend registration (separate advisory item)

## TASKS.md updates

- Mark `[x] Screen capture prevention` with env override note
- Mark authService portion of advisory error-logging item done; note server routes completed by this slice
