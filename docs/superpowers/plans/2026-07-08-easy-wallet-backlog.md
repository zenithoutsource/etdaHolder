# User Journey Gap Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four wallet-side gaps from the 2026-07-06 User Journey audit: document the single-key deviation (ADR 0009), complete same-device OID4VP deeplink intake, add P6 Case 3 `Used` lifecycle, and add P6 Case 1 dev-Issuer holder revoke round-trip.

**Architecture:** Four independent slices merged in order 1→2→3→4. Slice 1 is docs-only. Slice 2 completes native scheme registration plus deeplink handoff tests/polish on top of existing JS routing (`deeplinkStore` + `_layout` → Scan → `resolvePresentationRequest`). Slice 3 extends the existing `recordCredentialLifecycleAction` choke point (no parallel `recordCredentialUsed`). Slice 4 adds a dev Issuer endpoint and defers local revoke until HTTP 201; keeps the credential record for history (P6-Case1); does not destroy a per-credential key (ADR 0009).

**Tech Stack:** Expo SDK 54, expo-router, Zustand, Jest, Express (`server/src/routes/devWallet.ts` mounted at `/wallet-api/dev`), encrypted MMKV, NativeWind.

**Review source:** `C:\Users\mysti\.claude\plans\vivid-zooming-rose.md` (findings folded in 2026-07-08).

## Global Constraints

- Mobile never queries MySQL; dev Issuer routes live under `server/` at `/wallet-api/dev/*`.
- One biometric prompt per user action: if a flow calls `signProof()`, that Keychain sign-time gate is the **only** auth prompt — no Wallet PIN security screen in front of it for the same action.
- Slice 4 v1 dev revoke: **no PoP JWT** — request body is `{ credentialId, holderDid }` only; existing Wallet PIN `security` → `approve` UX stays. When PoP is added later, remove PIN steps and use `signProof()` as the sole gate.
- Slice 4 v1 local state: call `recordCredentialLifecycleAction(id, 'Revoke')` only — **keep** the credential record for history display (`docs/User_Journey/transcript/P6-Case1.md`); do **not** call `removeStoredCredential`. Per ADR 0009: no per-credential key destruction.
- Production Holder DID: one Keychain-protected Ed25519 seed (ADR 0008).
- Redact secrets/PII in logs; use `walletLogger` scoped tags.
- After each slice: `yarn tsc --noEmit`, `yarn lint`, focused `yarn test`; update `docs/TASKS.md`.
- Do not commit unless the user explicitly requests it.

---

## File map

| Slice | Create | Modify |
|-------|--------|--------|
| 1 | `docs/adr/0009-wallet-level-holder-signing-key.md` | `docs/TASKS.md` |
| 2 | — | `app.json`, `src/store/deeplinkStore.ts`, `src/store/deeplinkStore.test.ts`, `app/_layout.tsx`, `app/(tabs)/scan.tsx`, `src/screens/ScanScreenDeeplink.test.tsx` |
| 3 | — | `src/services/credentials/credentialLifecycle.ts`, `credentialLifecycle.test.ts`, `credentialInactiveState.ts`, `credentialInactiveState.test.ts`, `src/services/history/walletEventLog.ts`, `walletHistory.ts`, `walletHistoryFilters.ts`, `docs/superpowers/specs/2026-07-06-history-log-design.md`, `server/src/routes/devWallet.ts`, `server/src/testApp.test.ts` |
| 4 | `src/services/credentials/holderRevokeService.ts`, `holderRevokeService.test.ts` | `server/src/routes/devWallet.ts`, `server/src/testApp.test.ts`, `app/(tabs)/credential/[id].tsx`, `.env.example` |

---

## Slice 1 — ADR 0009: wallet-level signing key

### Task 1: Write ADR 0009

**Files:**
- Create: `docs/adr/0009-wallet-level-holder-signing-key.md`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Create ADR**

```markdown
# ADR 0009 - Wallet-Level Holder Signing Key

Status: Accepted
Date: 2026-07-08

## Context
User journeys (P2 step 12, P3, P6) describe per-credential `did:key` identities and per-document private-key destruction after Issuer confirmation. The wallet uses one Keychain-protected Ed25519 seed shared across OID4VCI PoP, OID4VP JWT VP, and SD-JWT KB-JWT (ADR 0008).

## Decision
Accept a single wallet-level Holder signing key for v1. Lifecycle changes (revoked, deleted, used) gate presentation via local MMKV markers; they do not destroy cryptographic material per document.

## Consequences
- P3 `rotateWalletKey()` marks all bound credentials `renewal-required`.
- P6 "destroy that document's key" is not implemented; revoke/used flows update lifecycle + history only.
- v2 per-credential keys require a superseding ADR and storage/crypto refactor.

## Alternatives considered
1. Per-credential Ed25519 seeds (journey-aligned, high cost).
2. Hybrid PID + per-document keys (highest complexity).
```

- [ ] **Step 2: Mark TASKS.md backlog item `[x]`** with link to ADR 0009.

- [ ] **Step 3: Verify**

Run: `yarn tsc --noEmit`
Expected: PASS (docs only).

---

## Slice 2 — `openid4vp://` same-device deeplink

**Baseline (already in repo — do not rebuild):**
- `isSupportedWalletDeeplink()` accepts `openid4vp:` (`deeplinkStore.ts:22`)
- `_layout.routeDeeplink()` pushes `/(tabs)/scan` for non-offer deeplinks (`_layout.tsx:443-445`)
- `scan.tsx` `handleDeeplink()` → `handleBarcode()` → `resolvePresentationRequest()` (`scan.tsx:163-224`)

**Gaps:** `app.json` missing `openid4vp` scheme; VP dismiss/`vpGeneration` parity; integration tests; Android prebuild.

### Task 2: Register `openid4vp` native scheme

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Add scheme**

```json
"scheme": [
  "etdawallet",
  "openid-credential-offer",
  "openid4vp"
]
```

- [ ] **Step 2: Android prebuild**

Run: `npx expo prebuild --clean --platform android`

Verify: `rg "openid4vp" android/app/src/main/AndroidManifest.xml` shows intent filter.

- [ ] **Step 3: Document manual test in TASKS.md session note**

```bash
adb shell am start -a android.intent.action.VIEW -d "openid4vp://authorize?client_id=redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/test&request_uri=http://verifier.zenithcomp.co.th:455/openid4vc/request/test"
```

Expected: app opens Scan tab, enters presentation resolving phase.

### Task 3: VP deeplink helpers + generation counter

**Files:**
- Modify: `src/store/deeplinkStore.ts`
- Modify: `src/store/deeplinkStore.test.ts`

**Interfaces:**
- Produces: `isPresentationRequestDeeplink(uri: string): boolean`
- Produces: `readPendingPresentationRoute(input): '/(tabs)/scan' | undefined`
- Produces: `vpGeneration: number` on store (increment when VP URI stored)

- [ ] **Step 1: Write failing tests**

```typescript
import {
  isPresentationRequestDeeplink,
  readPendingPresentationRoute,
  useDeeplinkStore,
} from './deeplinkStore'

it('detects presentation request deeplinks', () => {
  const uri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'
  expect(isPresentationRequestDeeplink(uri)).toBe(true)
  expect(isPresentationRequestDeeplink('openid-credential-offer://?credential_offer={}')).toBe(false)
})

it('routes pending VP deeplinks to scan when auth and PIN are ready', () => {
  expect(readPendingPresentationRoute({
    pendingUri: 'openid4vp://?response_type=vp_token',
    isAuthenticated: true,
    platform: 'android',
    hasWalletPin: true,
  })).toBe('/(tabs)/scan')
})

it('increments vpGeneration when a VP deeplink is stored', () => {
  useDeeplinkStore.setState({ pendingUri: null, dismissedUri: null, vpGeneration: 0 })
  useDeeplinkStore.getState().setPendingDeeplinkUri('openid4vp://?response_type=vp_token&state=a')
  expect(useDeeplinkStore.getState().vpGeneration).toBe(1)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test src/store/deeplinkStore.test.ts --runInBand`

- [ ] **Step 3: Implement**

Add to `DeeplinkState`:

```typescript
vpGeneration: number
```

Initialize `vpGeneration: 0`. In `setPendingDeeplinkUri` / `setIncomingDeeplinkUri`, when `isPresentationRequestDeeplink(uri)`:

```typescript
offerGeneration: isCredentialOfferDeeplink(uri) ? state.offerGeneration + 1 : state.offerGeneration,
vpGeneration: isPresentationRequestDeeplink(uri) ? state.vpGeneration + 1 : state.vpGeneration,
```

```typescript
export function isPresentationRequestDeeplink(uri: string): boolean {
  if (!uri || isCredentialOfferDeeplink(uri)) return false
  return isSupportedWalletDeeplink(uri)
}

export function readPendingPresentationRoute(input: {
  pendingUri: string | null
  dismissedUri?: string | null
  isAuthenticated: boolean
  platform: PlatformOSType
  hasWalletPin: boolean
}): '/(tabs)/scan' | undefined {
  if (!input.pendingUri || !isPresentationRequestDeeplink(input.pendingUri)) return undefined
  if (input.pendingUri === input.dismissedUri) return undefined
  if (!input.isAuthenticated) return undefined
  if (input.platform !== 'web' && !input.hasWalletPin) return undefined
  return '/(tabs)/scan'
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test src/store/deeplinkStore.test.ts --runInBand`

### Task 4: Layout uses `readPendingPresentationRoute`

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Import `readPendingPresentationRoute`**

- [ ] **Step 2: In `routeDeeplink`, after credential-offer branch:**

```typescript
const presentationRoute = readPendingPresentationRoute({
  pendingUri: url,
  dismissedUri: dismissed,
  isAuthenticated: isAuthenticatedRef.current,
  platform: Platform.OS,
  hasWalletPin: pinExists,
})
if (presentationRoute) {
  router.push(presentationRoute)
  return
}
```

Remove the generic `if (!isCredentialOfferDeeplink(url) && ...) router.push('/(tabs)/scan')` fallback or keep it only as safety net behind the explicit helper.

### Task 5: Scan remounts on new VP deeplink + dismiss parity

**Files:**
- Modify: `app/(tabs)/scan.tsx`
- Modify: `src/screens/ScanScreenDeeplink.test.tsx`

- [ ] **Step 1: Write failing Scan test — pending VP triggers resolve**

```typescript
it('processes pending OID4VP deeplink into resolvePresentationRequest', async () => {
  const requestUri = 'openid4vp://?client_id=did%3Aweb%3Averifier.example&response_type=vp_token'
  presentationServiceMock.isOid4VpAuthorizationRequest.mockImplementation((uri: string) => uri === requestUri)
  cameraMock.useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()])

  render(<ScanScreen />)

  await act(async () => {
    useDeeplinkStore.getState().setPendingDeeplinkUri(requestUri)
  })

  await waitFor(() => {
    expect(presentationServiceMock.resolvePresentationRequest).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Subscribe Scan to `vpGeneration`**

In `scan.tsx`, read `vpGeneration` from store; extend deeplink `useEffect` deps to `[pendingDeeplinkUri, vpGeneration]`; reset `lastDeeplinkRef` when `vpGeneration` changes.

- [ ] **Step 3: VP dismiss — on presentation cancel/back, call `setDismissedDeeplinkUri(uri)`** (mirror credential-offer dismiss). Add `deeplinkStore.test.ts` case: dismissed VP URI → `readPendingPresentationRoute` returns `undefined`.

- [ ] **Step 4: Run tests**

Run: `yarn test src/screens/ScanScreenDeeplink.test.tsx src/store/deeplinkStore.test.ts --runInBand`

### Task 6: Close Slice 2 in TASKS.md

- [ ] Mark OID4VP same-device link intake `[x]`.

---

## Slice 3 — P6 Case 3 `Used` lifecycle

### Task 7: Extend `recordCredentialLifecycleAction` for `Used`

**Files:**
- Modify: `src/services/credentials/credentialLifecycle.ts`
- Modify: `src/services/credentials/credentialLifecycle.test.ts`

**Interfaces:**
- Produces: `CredentialLifecycleAction = 'Revoke' | 'Delete' | 'Used'`
- Produces: `CredentialLifecycleStatus.status` adds `'used'`
- `recordCredentialLifecycleAction(id, 'Used')` sets `status: 'used'`, appends `kind: 'credential-used'` history event

- [ ] **Step 1: Write failing test**

```typescript
test('recordCredentialLifecycleAction Used marks credential and blocks presentation', () => {
  readStoredCredentialByIdMock.mockReturnValue(transcriptRecord)
  recordCredentialLifecycleAction('transcript-1', 'Used', 'system')
  expect(readCredentialLifecycleStatus('transcript-1')?.status).toBe('used')
  expect(filterPresentableCredentials([transcriptRecord])).toEqual([])
  expect(appendWalletHistoryEventMock).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'credential-used', initiatedBy: 'system' }),
  )
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/credentials/credentialLifecycle.test.ts --runInBand`

- [ ] **Step 3: Implement type + choke point + parser whitelist**

```typescript
export type CredentialLifecycleAction = 'Revoke' | 'Delete' | 'Used'

export type CredentialLifecycleStatus = {
  credentialId: string
  action: CredentialLifecycleAction
  status: 'revoked' | 'deleted' | 'used'
  occurredAt: string
}

function statusForLifecycleAction(action: CredentialLifecycleAction): CredentialLifecycleStatus['status'] {
  if (action === 'Revoke') return 'revoked'
  if (action === 'Delete') return 'deleted'
  return 'used'
}

function historyKindForLifecycleAction(action: CredentialLifecycleAction): WalletHistoryEventKind {
  if (action === 'Revoke') return 'credential-revoked'
  if (action === 'Delete') return 'credential-deleted'
  return 'credential-used'
}
```

Update `recordCredentialLifecycleAction` to use helpers above.

Update parser at line 68:

```typescript
(parsed.action === 'Revoke' || parsed.action === 'Delete' || parsed.action === 'Used') &&
(parsed.status === 'revoked' || parsed.status === 'deleted' || parsed.status === 'used') &&
```

`filterPresentableCredentials` already excludes any parsed lifecycle entry via `!lifecycleStatuses[record.id]` — add regression test only, no filter code change required.

- [ ] **Step 4: Run test — expect PASS**

### Task 8: History log types + UI copy

**Files:**
- Modify: `src/services/history/walletEventLog.ts`
- Modify: `src/services/history/walletHistory.ts`
- Modify: `src/services/history/walletHistoryFilters.ts`
- Modify: `docs/superpowers/specs/2026-07-06-history-log-design.md`

- [ ] **Step 1: Add `credential-used` to `WalletHistoryEventKind`**

- [ ] **Step 2: Add `'used'` to `WalletHistoryEventStatus`**

- [ ] **Step 3: Update `statusForKind`:**

```typescript
case 'credential-used':
  return 'used'
```

- [ ] **Step 4: `walletHistory.ts` — action label + subtitle**

```typescript
case 'credential-used':
  return 'ใช้งานเอกสารแล้ว'
// subtitle:
case 'credential-used':
  return 'เอกสารถูกใช้สิทธิ์แล้ว — ไม่สามารถแสดงซ้ำได้'
```

- [ ] **Step 5: `walletHistoryFilters.ts` — add to `LIFECYCLE_KINDS`**

```typescript
'credential-used',
```

- [ ] **Step 6: Update history spec events table** with `credential-used` / `Used` trigger = `recordCredentialLifecycleAction(id, 'Used')`.

- [ ] **Step 7: Run history-related tests**

Run: `yarn test src/services/history --runInBand`

### Task 9: Inactive badge for `used`

**Files:**
- Modify: `src/services/credentials/credentialInactiveState.ts`
- Modify: `src/services/credentials/credentialInactiveState.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
test('shows used inactive state before renewal badges', () => {
  const state = readCredentialInactiveState({
    lifecycleStatus: {
      credentialId: 't1',
      action: 'Used',
      status: 'used',
      occurredAt: '2026-07-08T00:00:00.000Z',
    },
  })
  expect(state.kind).toBe('used')
  expect(state.badgeLabel).toBe('ใช้งานแล้ว')
})
```

- [ ] **Step 2: Add `kind: 'used'` to `InactiveCredentialState` union; branch after `revoked` / before `issuer-suspended`:**

```typescript
if (lifecycleStatus?.status === 'used') {
  return {
    kind: 'used',
    badgeLabel: 'ใช้งานแล้ว',
    badgeClassName: 'bg-gray-badge',
    panelMessage: 'เอกสารถูกใช้สิทธิ์แล้ว — ไม่สามารถแสดงซ้ำได้',
  }
}
```

Badge precedence: lifecycle `used`/`revoked`/`deleted` > issuer suspension > P3 renewal (existing P6 > P3 tests still pass).

- [ ] **Step 3: Run tests**

Run: `yarn test src/services/credentials/credentialInactiveState.test.ts --runInBand`

### Task 10: Dev endpoint to simulate Verifier consumption

**Files:**
- Modify: `server/src/routes/devWallet.ts`
- Modify: `server/src/testApp.test.ts`

- [ ] **Step 1: Write failing supertest**

```typescript
test('POST /wallet-api/dev/wallet/mark-used accepts credentialId', async () => {
  const res = await request(app)
    .post('/wallet-api/dev/wallet/mark-used')
    .send({ credentialId: 'transcript-1' })
  expect(res.status).toBe(201)
  expect(res.body).toEqual({ used: true, credentialId: 'transcript-1' })
})
```

- [ ] **Step 2: Implement in-memory `usedCredentials` Set + route** (dev-only; no mobile poller in v1 — document curl for testers).

Optional mobile helper (YAGNI for v1): testers call `recordCredentialLifecycleAction(id, 'Used', 'system')` from a future dev menu or integration test only.

- [ ] **Step 3: Run server tests**

Run: `cd server && yarn test src/testApp.test.ts --runInBand`

### Task 11: Close Slice 3 in TASKS.md

- [ ] Mark P6 Case 3 `[x]` with v1 scope: local Used + presentation block + history.

---

## Slice 4 — P6 Case 1 dev-Issuer holder revoke

**Depends on:** Slice 1 ADR 0009 (key destruction semantics documented).

**Locked v1 behavior:**
- POST `/wallet-api/dev/issuer/holder-revoke` with `{ credentialId, holderDid }` → `201 { status: 'revoked', credentialId, confirmedAt }`
- Wallet: after existing PIN `approve` phase, call `submitHolderRevokeRequest()`; on 201 only then `recordCredentialLifecycleAction(id, 'Revoke')`; navigate to history
- **Keep** credential record (do not `removeStoredCredential`)
- **No PoP** in v1 → PIN flow unchanged; when PoP is added, replace PIN `security`/`approve` with single `signProof()` call per Global Constraints

### Task 12: Dev Issuer holder-revoke endpoint

**Files:**
- Modify: `server/src/routes/devWallet.ts`
- Modify: `server/src/testApp.test.ts`

**Interfaces:**
- Produces: `POST /wallet-api/dev/issuer/holder-revoke` body `{ credentialId: string, holderDid: string }` → `201 { status: 'revoked', credentialId, confirmedAt: string }`
- Produces: `GET /wallet-api/dev/wallet/revoke-status?credentialId=` → `{ status: 'none' | 'revoked', confirmedAt?: string }`
- Produces: `resetDevWalletState()` clears revoke map (extend existing export if present)

- [ ] **Step 1: Write failing tests**

```typescript
test('POST /wallet-api/dev/issuer/holder-revoke confirms revoke', async () => {
  const res = await request(app)
    .post('/wallet-api/dev/issuer/holder-revoke')
    .send({ credentialId: 'transcript-1', holderDid: 'did:key:z6Mktest' })
  expect(res.status).toBe(201)
  expect(res.body.status).toBe('revoked')
})

test('GET revoke-status returns revoked after POST', async () => {
  await request(app).post('/wallet-api/dev/issuer/holder-revoke').send({
    credentialId: 'transcript-1',
    holderDid: 'did:key:z6Mktest',
  })
  const res = await request(app).get('/wallet-api/dev/wallet/revoke-status?credentialId=transcript-1')
  expect(res.body.status).toBe('revoked')
})
```

- [ ] **Step 2: Implement `holderRevocations` Map** (mirror `suspensions` pattern in `devWallet.ts`).

- [ ] **Step 3: Run server tests**

Run: `cd server && yarn test src/testApp.test.ts --runInBand`

### Task 13: Mobile `holderRevokeService`

**Files:**
- Create: `src/services/credentials/holderRevokeService.ts`
- Create: `src/services/credentials/holderRevokeService.test.ts`
- Modify: `.env.example` (document `EXPO_PUBLIC_ENABLE_DEV_ISSUER_REVOKE=true` default-on in `__DEV__`)

**Interfaces:**
- Produces: `submitHolderRevokeRequest(credentialId: string): Promise<{ status: 'revoked'; confirmedAt: string }>`
- Throws: `HolderRevokeRejectedError` (4xx), `HolderRevokeNetworkError`

- [ ] **Step 1: Write failing test**

```typescript
import { submitHolderRevokeRequest, HolderRevokeRejectedError } from './holderRevokeService'

test('submitHolderRevokeRequest posts credentialId and holderDid', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ status: 'revoked', confirmedAt: '2026-07-08T12:00:00.000Z' }),
  })
  const result = await submitHolderRevokeRequest('transcript-1', {
    fetchImpl: fetchMock,
    getHolderDid: () => 'did:key:z6Mkholder',
  })
  expect(result.status).toBe('revoked')
  expect(fetchMock).toHaveBeenCalledWith(
    '/wallet-api/dev/issuer/holder-revoke',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ credentialId: 'transcript-1', holderDid: 'did:key:z6Mkholder' }),
    }),
  )
})

test('submitHolderRevokeRequest throws on 400', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'bad' }) })
  await expect(
    submitHolderRevokeRequest('transcript-1', { fetchImpl: fetchMock, getHolderDid: () => 'did:key:x' }),
  ).rejects.toBeInstanceOf(HolderRevokeRejectedError)
})
```

- [ ] **Step 2: Implement**

```typescript
const DEV_HOLDER_REVOKE_ENDPOINT = '/wallet-api/dev/issuer/holder-revoke'

export class HolderRevokeRejectedError extends Error {
  constructor(message = 'HolderRevokeRejected') {
    super(message)
    this.name = 'HolderRevokeRejectedError'
  }
}

export class HolderRevokeNetworkError extends Error {
  constructor(message = 'HolderRevokeNetworkError') {
    super(message)
    this.name = 'HolderRevokeNetworkError'
  }
}

export async function submitHolderRevokeRequest(
  credentialId: string,
  deps: { fetchImpl?: typeof fetch; getHolderDid?: () => string } = {},
): Promise<{ status: 'revoked'; confirmedAt: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const getHolderDid = deps.getHolderDid ?? (() => { throw new Error('getHolderDid missing') })
  const holderDid = getHolderDid()
  let response: Response
  try {
    response = await fetchImpl(DEV_HOLDER_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, holderDid }),
    })
  } catch (error) {
    logWalletError('holder-revoke', 'network-failed', error, { credentialId })
    throw new HolderRevokeNetworkError()
  }
  if (!response.ok) {
    logWalletError('holder-revoke', 'issuer-rejected', new Error(`HTTP ${response.status}`), { credentialId, status: response.status })
    throw new HolderRevokeRejectedError()
  }
  const body = (await response.json()) as { status?: string; confirmedAt?: string }
  if (body.status !== 'revoked' || typeof body.confirmedAt !== 'string') {
    throw new HolderRevokeRejectedError('HolderRevokeInvalidResponse')
  }
  logWalletStep('holder-revoke', 'issuer-confirmed', { credentialId })
  return { status: 'revoked', confirmedAt: body.confirmedAt }
}
```

Wire real `getHolderDid` from `../crypto/crypto` in production call path.

- [ ] **Step 3: Run test**

Run: `yarn test src/services/credentials/holderRevokeService.test.ts --runInBand`

### Task 14: Credential detail — Issuer round-trip on Revoke

**Files:**
- Modify: `app/(tabs)/credential/[id].tsx`

- [ ] **Step 1: Add phase variant**

```typescript
| { tag: "revokeSubmitting" }
```

- [ ] **Step 2: Replace `approveAction` Revoke branch**

```typescript
async function approveAction(action: CredentialLifecycleAction) {
  if (!credential) return
  if (action === "Revoke") {
    setPhase({ tag: "revokeSubmitting" })
    try {
      await submitHolderRevokeRequest(credential.id)
      recordCredentialLifecycleAction(credential.id, "Revoke")
      router.push("/(tabs)/history")
    } catch (error) {
      logWalletError("credential-detail", "holder-revoke-failed", error, { credentialId: credential.id })
      setPhase({ tag: "detail" })
      // useAppDialog or inline error — generic message, no PII
    }
    return
  }
  recordCredentialLifecycleAction(credential.id, action)
  router.push("/(tabs)/history")
}
```

- [ ] **Step 3: Render `revokeSubmitting` spinner UI** (copy pattern from `renewalProcessing` block).

- [ ] **Step 4: Manual test checklist**
  1. Store transcript credential
  2. Revoke → PIN approve → spinner → history shows revoked event
  3. Credential detail shows revoked badge; record still visible
  4. OID4VP scan no longer matches credential
  5. Wallet signing key unchanged (ADR 0009)

### Task 15: Close Slice 4 in TASKS.md

- [ ] Mark P6 Case 1 issuer round-trip `[x]` with dev-endpoint + no-PoP v1 note.

---

## Verification matrix

| Slice | Commands |
|-------|----------|
| 1 | `yarn tsc --noEmit` |
| 2 | `yarn test src/store/deeplinkStore.test.ts src/screens/ScanScreenDeeplink.test.tsx --runInBand`; Android prebuild + adb deeplink |
| 3 | `yarn test src/services/credentials/credentialLifecycle.test.ts src/services/credentials/credentialInactiveState.test.ts src/services/history --runInBand`; `cd server && yarn test src/testApp.test.ts --runInBand` |
| 4 | `yarn test src/services/credentials/holderRevokeService.test.ts --runInBand`; `cd server && yarn test src/testApp.test.ts --runInBand`; manual revoke flow |

---

## Out of scope

- NFC / mDOC / HCE / ACR1311U physical validation
- Trust Registry, DID Resolver, VC Status Registry
- Production OID4VP `did:web` + JAR signature verification
- EAS release walkthrough
- Per-credential key migration (ADR 0009 documents deviation only)
- PoP-signed holder revoke (v2: replaces PIN with `signProof()` sole gate)
- `removeStoredCredential` on holder revoke (journey keeps record for history)

---

## Self-review

| Requirement | Task |
|-------------|------|
| ADR single-key deviation | 1 |
| OID4VP deeplink native + handoff (not scheme-only) | 2–6 |
| Used via `recordCredentialLifecycleAction` | 7 |
| Parser whitelist for Used | 7 |
| History spec + `walletEventLog` enum | 8 |
| Used inactive badge | 9 |
| Dev mark-used endpoint | 10 |
| Dev holder-revoke endpoint | 12 |
| Issuer confirm before local revoke | 14 |
| ADR 0009 no key destruction | 1, 14 |
| One biometric if PoP added later | Global Constraints + Task 14 note |
| Keep credential record on revoke | Global Constraints + Task 14 |

**Placeholder scan:** none.

**Type consistency:** `CredentialLifecycleAction` uses `'Used'` (PascalCase, matches `'Revoke' | 'Delete'`). History kind `credential-used` (kebab-case, matches `credential-revoked`).
