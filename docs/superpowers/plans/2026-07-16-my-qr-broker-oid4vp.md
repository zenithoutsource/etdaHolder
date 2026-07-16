# My QR Broker Engagement + OID4VP Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Option A VP-by-reference My QR with Broker engagement (`POST /broker/session` → show `qr_payload` → poll/push for deposited OID4VP request → existing Scan disclosure → `direct_post`).

**Architecture:** Mobile talks to Wallet Broker at `EXPO_PUBLIC_BROKER_BASE_URL` (dev: `http://192.100.10.49`). After Verifier scans via `/verifier/scan`, Broker holds the Authorization Request. Wallet normalizes `GET .../request` into a URI for `resolvePresentationRequest()`, then reuses Scan disclosure panels and `submitPresentationResponse`. Broker does not verify VPs.

**Tech Stack:** Expo SDK 54, React Native, existing `presentationService`, NativeWind, Expo Notifications, Jest.

**Spec:** `docs/superpowers/specs/2026-07-16-my-qr-broker-oid4vp-design.md`

## Global Constraints

- Neutral naming only — no customer org name in new identifiers, files, comments, or UI copy (`broker`, `session_id`, `Verifier`).
- One biometric per approve action: sign-time Keychain gate only for signed presentation modes (same rule as Scan).
- Never log `vp_token`, JWT payloads, claims, or push tokens.
- ThaID / My QR v1 credential remains PID (`ThaiNationalID`); Verifier `docType` for scan is Verifier-side (`IDCard`).
- Reuse Scan disclosure components — do not fork a second consent UI.
- Configurable base URL via `EXPO_PUBLIC_BROKER_BASE_URL` with fallback default `http://192.100.10.49`.
- After each task: focused tests + `yarn tsc --noEmit` on touched scope; commit when asked or per task if executing with commit steps.

---

## File map

| File | Action |
|------|--------|
| `src/services/vp/brokerBaseUrl.ts` | **Create** — resolve `EXPO_PUBLIC_BROKER_BASE_URL` |
| `src/services/vp/brokerBaseUrl.test.ts` | **Create** |
| `src/services/vp/brokerSessionClient.ts` | **Create** — types + HTTP client + request normalizer |
| `src/services/vp/brokerSessionClient.test.ts` | **Create** |
| `src/services/notifications/expoPushTokenCache.ts` | **Create** — cache last Expo push token for broker create |
| `src/services/notifications/pushNotificationService.ts` | **Modify** — write cache on successful token fetch |
| `src/hooks/useWalletInitiatedVpQrSession.ts` | **Modify** — broker create + waiting_scan poll (no pre-upload VP) |
| `src/hooks/useWalletInitiatedVpQrSession.test.ts` | **Create** (or extend if exists) |
| `src/components/WalletInitiatedVpQrPanel.tsx` | **Modify** — waiting_scan / request_ready copy |
| `src/components/Oid4VpDisclosureFlow.tsx` | **Create** — shared Scan-style disclosure phase machine |
| `src/components/Oid4VpDisclosureFlow.test.tsx` | **Create** |
| `app/(tabs)/qr.tsx` | **Modify** — hand off to disclosure when request ready |
| `src/components/VpQrModal.tsx` | **Modify** — same handoff |
| `app/(tabs)/scan.tsx` | **Modify** — optionally thin-wrap to shared flow (or leave Scan as-is if extraction is My-QR-only first) |
| `src/services/notifications/notificationRouter.ts` | **Modify** — `presentation-request` + `session_id` |
| `src/services/notifications/notificationRouter.test.ts` | **Modify/Create** |
| `.env.example` | **Modify** — document broker URL; deprecate presentation-gateway My QR notes |
| `docs/ARCHITECTURE.md` | **Modify** — My QR section → broker model |
| `docs/TASKS.md` | **Modify** — session note |

---

### Task 1: Broker base URL helper

**Files:**
- Create: `src/services/vp/brokerBaseUrl.ts`
- Create: `src/services/vp/brokerBaseUrl.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `resolveBrokerBaseUrl(): string`

- [ ] **Step 1: Write the failing test**

```typescript
import { resolveBrokerBaseUrl } from './brokerBaseUrl'

const ORIGINAL = process.env.EXPO_PUBLIC_BROKER_BASE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  else process.env.EXPO_PUBLIC_BROKER_BASE_URL = ORIGINAL
})

test('defaults to LAN broker host', () => {
  delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  expect(resolveBrokerBaseUrl()).toBe('http://192.100.10.49')
})

test('trims trailing slash from override', () => {
  process.env.EXPO_PUBLIC_BROKER_BASE_URL = 'http://192.100.10.49/'
  expect(resolveBrokerBaseUrl()).toBe('http://192.100.10.49')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/vp/brokerBaseUrl.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```typescript
const DEFAULT_BROKER_BASE_URL = 'http://192.100.10.49'

export function resolveBrokerBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_BROKER_BASE_URL?.trim()
  const base = override && override.length > 0 ? override : DEFAULT_BROKER_BASE_URL
  return base.endsWith('/') ? base.slice(0, -1) : base
}
```

Add to `.env.example`:

```bash
# My QR — Wallet Broker (engagement QR + deposited OID4VP request).
# EXPO_PUBLIC_BROKER_BASE_URL=http://192.100.10.49
```

Mark Option A My QR env vars as deprecated for production My QR (keep lines, comment supersession).

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/vp/brokerBaseUrl.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/brokerBaseUrl.ts src/services/vp/brokerBaseUrl.test.ts .env.example
git commit -m "feat(vp): add broker base URL resolver for My QR"
```

---

### Task 2: Broker session client + GET normalizer

**Files:**
- Create: `src/services/vp/brokerSessionClient.ts`
- Create: `src/services/vp/brokerSessionClient.test.ts`

**Interfaces:**
- Consumes: `resolveBrokerBaseUrl()`
- Produces:
  - `BrokerCreateSessionResponse` (`session_id`, `broker_request_endpoint`, `expires_at`, `qr_payload`)
  - `createBrokerSessionClient(baseUrl?): BrokerSessionClient`
  - `normalizeBrokerPresentationRequest(body: unknown): string | null`  
    Returns URI string for `resolvePresentationRequest`, or `null` if request not ready yet.

**Normalization rules (locked for v1):**

1. If body is a non-empty string and looks like `openid4vp:` or HTTPS with `response_type=vp_token` / `request_uri=` → return trimmed string.  
2. If body is object with string `request_uri` → return that.  
3. If body is object with string `authorization_request` or `qr` or `openid4vp` → return that.  
4. If HTTP 404 / 204 / empty object / `{ status: "pending" }` → return `null`.  
5. Otherwise throw `BrokerPresentationRequestInvalid`.

- [ ] **Step 1: Write failing tests**

```typescript
import { normalizeBrokerPresentationRequest, createBrokerSessionClient } from './brokerSessionClient'

test('normalize returns openid4vp string', () => {
  expect(normalizeBrokerPresentationRequest('openid4vp://authorize?client_id=x&request_uri=http://v/r/1')).toContain('openid4vp://')
})

test('normalize returns request_uri from JSON', () => {
  expect(
    normalizeBrokerPresentationRequest({ request_uri: 'http://192.100.10.48/openid4vc/request/abc' }),
  ).toBe('http://192.100.10.48/openid4vc/request/abc')
})

test('normalize returns null when pending', () => {
  expect(normalizeBrokerPresentationRequest({ status: 'pending' })).toBeNull()
  expect(normalizeBrokerPresentationRequest(null)).toBeNull()
})

test('createSession posts walletId deviceToken platform', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      session_id: 's1',
      broker_request_endpoint: 'http://192.100.10.49/broker/session/s1/request',
      expires_at: '2026-07-16T03:54:33.1725204+00:00',
      qr_payload: 'http://192.100.10.49/broker/session/s1/request',
    }),
  })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  const session = await client.createSession({
    walletId: 'w1',
    deviceToken: 'ExponentPushToken[x]',
    platform: 'android',
  })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://192.100.10.49/broker/session',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(session.qr_payload).toContain('/broker/session/s1/request')
})

test('fetchPresentationRequest returns null while pending', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'pending' }),
  })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  await expect(client.fetchPresentationRequestUri('s1')).resolves.toBeNull()
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test src/services/vp/brokerSessionClient.test.ts`

- [ ] **Step 3: Implement client**

```typescript
export type BrokerCreateSessionRequest = {
  walletId: string
  deviceToken: string
  platform: 'android' | 'ios'
}

export type BrokerCreateSessionResponse = {
  session_id: string
  broker_request_endpoint: string
  expires_at: string
  qr_payload: string
}

export type BrokerSessionClient = {
  createSession(input: BrokerCreateSessionRequest): Promise<BrokerCreateSessionResponse>
  fetchPresentationRequestUri(sessionId: string): Promise<string | null>
}

export function normalizeBrokerPresentationRequest(body: unknown): string | null { /* rules above */ }

export function createBrokerSessionClient(
  baseUrl = resolveBrokerBaseUrl(),
  fetchImpl: typeof fetch = fetch,
): BrokerSessionClient {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return {
    async createSession(input) {
      const response = await fetchImpl(`${normalizedBase}/broker/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(`BrokerSessionCreateFailed:${response.status}`)
      const json = (await response.json()) as BrokerCreateSessionResponse
      if (!json.session_id || !json.qr_payload || !json.expires_at) {
        throw new Error('BrokerSessionCreateFailed:invalid-response')
      }
      return json
    },
    async fetchPresentationRequestUri(sessionId) {
      const response = await fetchImpl(`${normalizedBase}/broker/session/${sessionId}/request`)
      if (response.status === 404 || response.status === 204) return null
      if (!response.ok) throw new Error(`BrokerPresentationRequestFetchFailed:${response.status}`)
      const text = await response.text()
      if (!text.trim()) return null
      let body: unknown = text
      try {
        body = JSON.parse(text) as unknown
      } catch {
        // plain string body
      }
      return normalizeBrokerPresentationRequest(body)
    },
  }
}
```

Log only `sessionPrefix` / status codes via `logWalletStep('vp-broker', ...)`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/brokerSessionClient.ts src/services/vp/brokerSessionClient.test.ts
git commit -m "feat(vp): add wallet broker session client for My QR"
```

---

### Task 3: Expo push token cache for broker create

**Files:**
- Create: `src/services/notifications/expoPushTokenCache.ts`
- Create: `src/services/notifications/expoPushTokenCache.test.ts`
- Modify: `src/services/notifications/pushNotificationService.ts`

**Interfaces:**
- Produces: `setCachedExpoPushToken(token: string)`, `getCachedExpoPushToken(): string | null`
- Broker create uses cache; if null, call `Notifications.getExpoPushTokenAsync` once (same projectId helper as push service) or send empty string only if Broker allows nullable `deviceToken` (spec allows nullable in swagger — prefer real token when available).

- [ ] **Step 1: Write failing cache tests** (set/get/clear).

- [ ] **Step 2: Implement cache module; in `pushNotificationService` after successful `fetchExpoPushToken`, call `setCachedExpoPushToken(pushToken.data)`.

- [ ] **Step 3: Export `resolveDeviceTokenForBroker(): Promise<string>` that returns cache or fetches Expo token (catch → `''` + diagnostic log, do not block My QR if Broker accepts empty).

- [ ] **Step 4: Run `yarn test src/services/notifications/expoPushTokenCache.test.ts src/services/notifications/pushNotificationService.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(notifications): cache Expo push token for broker My QR sessions"
```

---

### Task 4: Refactor My QR hook to broker waiting_scan + poll

**Files:**
- Modify: `src/hooks/useWalletInitiatedVpQrSession.ts`
- Modify: `src/components/WalletInitiatedVpQrPanel.tsx`
- Create/Modify: `src/hooks/useWalletInitiatedVpQrSession.test.ts`
- Modify: `src/components/VpQrModal.test.tsx` if phase assertions break

**Interfaces:**
- Consumes: `createBrokerSessionClient`, `resolveDeviceTokenForBroker`, `useAuthStore` / session `walletId`, `Platform.OS`
- Produces updated hook API:

```typescript
export type WalletInitiatedVpQrPhase =
  | 'idle'
  | 'loading'
  | 'waiting_scan' // was 'ready' QR display — keep alias 'ready' === waiting_scan for panel compat OR rename panel
  | 'request_ready'
  | 'expired'
  | 'error'

// return also:
authorizationRequestUri: string | null
sessionId: string | null
```

**Behaviour change (critical):**

1. On start: **do not** call `createVpSession` / `buildWalletInitiatedVpToken` / `submitVpToSession`.  
2. `POST /broker/session` with `{ walletId, deviceToken, platform }`.  
3. Set `qrUrl = session.qr_payload`, `expiresAt = session.expires_at`, phase `waiting_scan`.  
4. Poll every 2s: `fetchPresentationRequestUri(session_id)` until non-null → phase `request_ready` + set `authorizationRequestUri`.  
5. TTL expiry → `expired` (stop poll).  
6. Remove Option A status poll (`verified` / `verify_failed` from gateway). Success/failure moves to disclosure flow (Task 5).

- [ ] **Step 1: Write failing hook tests** with mocked broker client (inject via optional `client` param for testability):

```typescript
type Options = {
  credential: VerifiableCredentialRecord | undefined
  active: boolean
  client?: BrokerSessionClient
  walletId?: string
  deviceToken?: string
  platform?: 'android' | 'ios'
}
```

Test: start → waiting_scan with qr_payload; after poll returns URI → request_ready.

- [ ] **Step 2: Implement hook refactor**

- [ ] **Step 3: Update panel** — `waiting_scan` / `ready` shows QR + “รอเครื่องสแกน…”; `request_ready` can show spinner “กำลังเปิดการสำแดง…” (parent will swap to disclosure).

- [ ] **Step 4: Run hook + panel + VpQrModal tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vp): My QR waits on broker scan instead of pre-uploading VP"
```

---

### Task 5: Shared OID4VP disclosure flow for My QR

**Files:**
- Create: `src/components/Oid4VpDisclosureFlow.tsx`
- Create: `src/components/Oid4VpDisclosureFlow.test.tsx`
- Modify: `app/(tabs)/qr.tsx`
- Modify: `src/components/VpQrModal.tsx`

**Interfaces:**
- Consumes: `resolvePresentationRequest`, `createApprovedPresentationResponse`, `submitPresentationResponse`, `TRUSTED_VERIFIERS`, existing panels (`FacePreparePanel`, `PresentationConsentPanel`, `PresentationInfoPanel`, `PresentationResultPanel`, `PresentationStepScaffold`)
- Produces: `<Oid4VpDisclosureFlow authorizationRequestUri={uri} credentials={...} onDone={...} onCancel={...} channel="wallet" />`

**Phase machine (mirror Scan):**  
`resolving` → `presentationFacePrepare` → `presentationConsent` → approve (`submitPresentationResponse`) → `presentationInfo` → `presentationSuccess` / `error`

History: on success use existing wallet-initiated history helper with `channel: 'wallet'` and verifier display name from resolved request. On failure use existing failure recorder. Decline → `presentation-declined` with `channel: 'wallet'`.

Biometric: same as Scan — skip app-level biometric when signed mode will Keychain-gate at sign time.

- [ ] **Step 1: Write a component test** that mocks `resolvePresentationRequest` → consent Accept → mocks `submitPresentationResponse` → success panel.

- [ ] **Step 2: Implement `Oid4VpDisclosureFlow`**

- [ ] **Step 3: Wire `app/(tabs)/qr.tsx`**

When hook `phase === 'request_ready' && authorizationRequestUri`, render:

```tsx
<Oid4VpDisclosureFlow
  authorizationRequestUri={authorizationRequestUri}
  credentials={credentials}
  onDone={() => { void startSession() /* or navigate home */ }}
  onCancel={() => { void startSession() }}
/>
```

Else keep existing `WalletInitiatedVpQrPanel`.

Same for `VpQrModal` (on success call `onClose`).

- [ ] **Step 4: Run**

`yarn test src/components/Oid4VpDisclosureFlow.test.tsx src/components/VpQrModal.test.tsx`  
`yarn tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vp): run My QR disclosure through shared OID4VP flow"
```

---

### Task 6: Push route for `presentation-request`

**Files:**
- Modify: `src/services/notifications/notificationRouter.ts`
- Modify/Create: `src/services/notifications/notificationRouter.test.ts`
- Modify: `src/store/notificationRouteStore.ts` only if new route shape needed

**Proposed event (until Broker confirms):**

```typescript
data: {
  event: 'presentation-request',
  session_id: string,
}
```

Route: `pathname: '/(tabs)/qr'` with optional `params: { brokerSessionId: session_id }`.

My QR screen / hook: if `brokerSessionId` param present while waiting, prefer that session’s poll (or restart is acceptable v1 if only one active session).

- [ ] **Step 1: Failing test** — `buildNotificationRoute` for `presentation-request` returns My QR tab route without requiring `credentialId`.

- [ ] **Step 2: Implement — extend `NotificationEvent` union; allow missing `credentialId` when event is `presentation-request` and `session_id` is present.

- [ ] **Step 3: Run notification router tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(notifications): route presentation-request push to My QR"
```

---

### Task 7: Docs cutover (ARCHITECTURE + TASKS)

**Files:**
- Modify: `docs/ARCHITECTURE.md` § Wallet-Initiated My QR
- Modify: `docs/TASKS.md` (session entry)
- Optionally mark superseded note on `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md` header Status line

- [ ] **Step 1: Replace ARCHITECTURE My QR diagram** with broker → scan → disclosure → `direct_post` (from 2026-07-16 spec). Point to new spec path. Note Option A superseded for production.

- [ ] **Step 2: Add TASKS.md session** summarizing broker My QR cutover + open items (GET body sample, push event confirm).

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: cut over My QR architecture to broker OID4VP path"
```

---

### Task 8: Verification gate

- [ ] **Step 1: Run focused suite**

```bash
yarn test src/services/vp/brokerBaseUrl.test.ts src/services/vp/brokerSessionClient.test.ts src/hooks/useWalletInitiatedVpQrSession.test.ts src/components/Oid4VpDisclosureFlow.test.tsx src/services/notifications/notificationRouter.test.ts
yarn tsc --noEmit
yarn lint
```

Expected: all pass (lint warnings only if pre-existing).

- [ ] **Step 2: Manual golden path checklist** (human on device)

1. Set `EXPO_PUBLIC_BROKER_BASE_URL=http://192.100.10.49` and Verifier trust for `.48`.  
2. Open My QR → QR shows `…/broker/session/{id}/request`.  
3. Checkpoint: `POST http://192.100.10.48/verifier/scan` with `scannedValue` = QR payload, `docType` = `IDCard`.  
4. Wallet polls/push → disclosure UI appears.  
5. Approve → one biometric → Verifier accepts `direct_post`.  
6. History shows wallet-channel success.

- [ ] **Step 3: If GET body shape differs from normalizer**, adjust `normalizeBrokerPresentationRequest` only — do not change disclosure path.

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| `EXPO_PUBLIC_BROKER_BASE_URL` | 1 |
| `POST /broker/session` + locked response fields | 2, 4 |
| QR = `qr_payload` verbatim | 4 |
| Poll `GET .../request` every 2s | 4 |
| Normalize to `resolvePresentationRequest` input | 2, 5 |
| Existing disclosure UI + `direct_post` | 5 |
| One sign-time biometric | 5 |
| Push `presentation-request` | 6 |
| Replace Option A default path | 4, 7 |
| ARCHITECTURE update | 7 |
| Acceptance tests + golden path | 8 |

**Open items left as runtime-adaptive (not blockers):** exact GET JSON shape (normalizer covers pending + common URI forms); push event name confirmed as `presentation-request` until Broker says otherwise.
