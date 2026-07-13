# Wallet-Initiated VP Verify Outcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the My QR Wallet poll receive explicit `verified` or `verify_failed` terminal statuses after Verifier §2.1 crypto, closing P5 Wallet steps #16 and #18.

**Architecture:** Extend `presentationSessionStore` with `verificationOutcome` + `finalizeVerification()`; call finalize on both verify success and failure in `verifyPresentationSession`. Wallet client parses new status enum + optional `reason`, maps to hook phase and History Log (`presentation-success` / `presentation-failed`).

**Tech Stack:** Node/Express reference verifier (`server/`), React Native Wallet (`src/`), Jest, existing `sdJwtVerifier.ts` fixtures.

**Spec:** `docs/superpowers/specs/2026-07-13-wallet-initiated-vp-verify-outcome-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `server/src/services/presentationSessionStore.ts` | Outcome fields, `finalizeVerification`, status resolver |
| `server/src/services/vpSessionStore.ts` | Thin export of `finalizeVerification` |
| `server/src/services/presentationGatewayService.ts` | Finalize on fail; `VerifyPresentationOutcome` uses terminal statuses |
| `server/src/routes/presentationGateway.ts` | Status JSON + `reason`; verify HTML idempotency |
| `server/src/routes/vpSession.ts` | Dev route parity for status + verify |
| `src/services/vp/presentationGatewayClient.ts` | `PresentationSessionStatus` + `PresentationSessionStatusResponse` |
| `src/services/vp/verifierPresentationAdapter.ts` | Parse `{ status, reason?, expiresAt? }` |
| `src/services/vp/walletInitiatedPresentation.ts` | Status wrapper + failure history recorder |
| `src/services/history/walletHistoryRecording.ts` | `mapVerifierReasonToHistory`, `recordWalletInitiatedPresentationFailure` |
| `src/hooks/useWalletInitiatedVpQrSession.ts` | Poll `verified` / `verify_failed` |
| `src/components/WalletInitiatedVpQrPanel.tsx` | `verify_failed` UI |
| `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md` | Status table update |

---

### Task 1: Session store — terminal verification outcomes

**Files:**
- Modify: `server/src/services/presentationSessionStore.ts`
- Modify: `server/src/services/vpSessionStore.ts`
- Modify: `server/src/services/presentationSessionStore.test.ts`
- Modify: `server/src/services/vpSessionStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Add to `server/src/services/presentationSessionStore.test.ts`:

```typescript
test('finalizeVerification sets verified status', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  expect(store.finalizeVerification(session.sessionId, { outcome: 'verified' })).toBe('ok')
  expect(store.resolveStatus(session.sessionId)).toBe('verified')
})

test('finalizeVerification sets verify_failed status with reason', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  expect(
    store.finalizeVerification(session.sessionId, {
      outcome: 'verify_failed',
      reason: 'kb-nonce-mismatch',
    }),
  ).toBe('ok')
  expect(store.resolveStatus(session.sessionId)).toBe('verify_failed')
  expect(store.getSession(session.sessionId)?.verificationReason).toBe('kb-nonce-mismatch')
})

test('finalizeVerification is idempotent', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  store.finalizeVerification(session.sessionId, { outcome: 'verified' })
  expect(store.finalizeVerification(session.sessionId, { outcome: 'verify_failed', reason: 'x' })).toBe(
    'already-finalized',
  )
  expect(store.resolveStatus(session.sessionId)).toBe('verified')
})

test('resolveStatus returns verify_failed before expired when outcome set', () => {
  const session = store.createSession(60_000)
  store.setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  store.finalizeVerification(session.sessionId, { outcome: 'verify_failed', reason: 'issuer-signature-invalid' })
  session.expiresAt = new Date(Date.now() - 1_000).toISOString()
  expect(store.resolveStatus(session.sessionId)).toBe('verify_failed')
})
```

Update existing test `resolveStatus reports ready then consumed and expired` to expect `verified` instead of `consumed`, and use `finalizeVerification` instead of `consumeSession`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && yarn test src/services/presentationSessionStore.test.ts --runInBand`

Expected: FAIL — `finalizeVerification` is not a function; status `consumed` assertions fail.

- [ ] **Step 3: Implement store changes**

In `presentationSessionStore.ts`:

```typescript
export type PresentationSessionStatus =
  | 'pending'
  | 'ready'
  | 'verified'
  | 'verify_failed'
  | 'expired'

export type VerificationOutcome = 'pending' | 'verified' | 'verify_failed'

export type PresentationSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  vpToken: string | null
  consumed: boolean
  credentialType: string
  verificationOutcome: VerificationOutcome
  verificationReason?: string
}

export type FinalizeVerificationOutcome = 'ok' | 'not-found' | 'expired' | 'no-vp' | 'already-finalized'
```

On `createSession`, set `verificationOutcome: 'pending'`.

Replace `consumeSession` usage in public API with:

```typescript
finalizeVerification(
  sessionId: string,
  input: { outcome: 'verified' } | { outcome: 'verify_failed'; reason: string },
): FinalizeVerificationOutcome {
  const session = sessions.get(sessionId)
  if (!session) return 'not-found'
  if (isExpiredAt(session.expiresAt)) return 'expired'
  if (!session.vpToken) return 'no-vp'
  if (session.verificationOutcome !== 'pending') return 'already-finalized'
  session.verificationOutcome = input.outcome
  session.consumed = true
  if (input.outcome === 'verify_failed') {
    session.verificationReason = input.reason
  }
  return 'ok'
}
```

Update `resolveStatus`:

```typescript
if (session.verificationOutcome === 'verified') return 'verified'
if (session.verificationOutcome === 'verify_failed') return 'verify_failed'
```

Remove `if (session.consumed) return 'consumed'` branch.

Keep `setVpToken` returning `'consumed'` when `session.consumed` is true (upload after finalize).

Deprecate `consumeSession` — implement as alias:

```typescript
consumeSession(sessionId: string): PresentationSession | undefined {
  const outcome = this.finalizeVerification(sessionId, { outcome: 'verified' })
  if (outcome !== 'ok' && outcome !== 'already-finalized') return undefined
  return sessions.get(sessionId)
}
```

Export `finalizeVerification` from `vpSessionStore.ts`:

```typescript
export function finalizeVpVerification(
  sessionId: string,
  input: { outcome: 'verified' } | { outcome: 'verify_failed'; reason: string },
): FinalizeVerificationOutcome {
  return store.finalizeVerification(sessionId, input)
}
```

- [ ] **Step 4: Run store tests**

Run: `cd server && yarn test src/services/presentationSessionStore.test.ts src/services/vpSessionStore.test.ts --runInBand`

Expected: PASS

---

### Task 2: Gateway service — finalize on verify failure

**Files:**
- Modify: `server/src/services/presentationGatewayService.ts`
- Modify: `server/src/services/presentationGatewayService.test.ts`

- [ ] **Step 1: Write failing gateway tests**

Replace assertion in existing success test:

```typescript
expect(store.resolveStatus(created.sessionId)).toBe('verified')
```

Add new test:

```typescript
test('verify failure finalizes session as verify_failed', async () => {
  const store = createInMemoryPresentationSessionStore()
  const created = createPresentationSession(store, baseConfig)
  const vpToken = buildFixtureVp({ nonce: 'wrong-nonce', aud: baseConfig.verifierPresentationBaseUrl })
  uploadPresentation(store, created.sessionId, vpToken, V1_GATEWAY_CREDENTIAL_TYPE)

  const outcome = await verifyPresentationSession(store, created.sessionId, baseConfig)
  expect(outcome.kind).toBe('verify-failed')
  expect(store.resolveStatus(created.sessionId)).toBe('verify_failed')
  expect(store.getSession(created.sessionId)?.verificationReason).toBe('kb-nonce-mismatch')
})
```

Update `verifyPresentationSession` early-return for re-scan: when `session.verificationOutcome === 'verified'`, return `{ kind: 'consumed' }` (HTML 409 path unchanged). When `verify_failed`, return `{ kind: 'verify-failed', reason: session.verificationReason ?? 'unknown', ... }` without re-running crypto.

- [ ] **Step 2: Run test to verify failure**

Run: `cd server && yarn test src/services/presentationGatewayService.test.ts --runInBand`

Expected: FAIL on `verify_failed` status assertion.

- [ ] **Step 3: Implement gateway changes**

In `verifyPresentationSession`:

```typescript
if (session.verificationOutcome === 'verified') return { kind: 'consumed' }
if (session.verificationOutcome === 'verify_failed') {
  return {
    kind: 'verify-failed',
    reason: session.verificationReason ?? 'unknown',
    credentialType: session.credentialType,
    vpBytes: session.vpToken?.length ?? 0,
  }
}
```

On verify success:

```typescript
store.finalizeVerification(sessionId, { outcome: 'verified' })
```

On verify failure (replace early return without finalize):

```typescript
store.finalizeVerification(sessionId, { outcome: 'verify_failed', reason: verified.reason })
return { kind: 'verify-failed', reason: verified.reason, credentialType: session.credentialType, vpBytes: session.vpToken.length }
```

Remove `store.consumeSession(sessionId)` call on success path.

- [ ] **Step 4: Run gateway tests**

Run: `cd server && yarn test src/services/presentationGatewayService.test.ts --runInBand`

Expected: PASS

---

### Task 3: HTTP routes — status JSON with reason

**Files:**
- Modify: `server/src/routes/presentationGateway.ts`
- Modify: `server/src/routes/vpSession.ts`
- Modify: `server/src/routes/presentationGateway.test.ts`
- Modify: `server/src/routes/vpSession.test.ts`

- [ ] **Step 1: Write failing route tests**

In `server/src/routes/presentationGateway.test.ts` (or extend existing), add:

```typescript
test('GET /v1/presentation-sessions/:id/status returns verify_failed with reason', async () => {
  // create session, upload vp, call verify endpoint with bad token, then:
  const statusRes = await request(app).get(`/v1/presentation-sessions/${sessionId}/status`)
  expect(statusRes.status).toBe(200)
  expect(statusRes.body).toEqual({
    status: 'verify_failed',
    expiresAt: expect.any(String),
    reason: expect.any(String),
  })
})
```

Mirror for `/dev/vp-session/:id/status` in `vpSession.test.ts`.

- [ ] **Step 2: Run route tests — expect FAIL**

Run: `cd server && yarn test src/routes/presentationGateway.test.ts src/routes/vpSession.test.ts --runInBand`

- [ ] **Step 3: Implement status handlers**

Both status routes:

```typescript
const session = store.getSession(req.params.sessionId)
const body: Record<string, string> = {
  status,
  expiresAt: session?.expiresAt ?? '',
}
if (status === 'verify_failed' && session?.verificationReason) {
  body.reason = session.verificationReason
}
res.status(200).json(body)
```

- [ ] **Step 4: Run route tests — expect PASS**

---

### Task 4: Mobile client — status types and adapter

**Files:**
- Modify: `src/services/vp/presentationGatewayClient.ts`
- Modify: `src/services/vp/verifierPresentationAdapter.ts`
- Modify: `src/services/vp/walletInitiatedPresentation.ts`
- Modify: `src/services/vp/walletInitiatedPresentation.test.ts`
- Modify: `src/services/vp/verifierPresentationAdapter.test.ts`

- [ ] **Step 1: Write failing client tests**

In `walletInitiatedPresentation.test.ts`:

```typescript
test('fetchVpSessionStatus returns verified outcome', async () => {
  const client = {
    fetchSessionStatus: jest.fn().mockResolvedValue({ status: 'verified' }),
  } as unknown as PresentationGatewayClient
  await expect(fetchVpSessionStatus('session-1', client)).resolves.toEqual({ status: 'verified' })
})

test('fetchVpSessionStatus returns verify_failed with reason', async () => {
  const client = {
    fetchSessionStatus: jest.fn().mockResolvedValue({
      status: 'verify_failed',
      reason: 'issuer-signature-invalid',
    }),
  } as unknown as PresentationGatewayClient
  await expect(fetchVpSessionStatus('session-1', client)).resolves.toEqual({
    status: 'verify_failed',
    reason: 'issuer-signature-invalid',
  })
})
```

In `verifierPresentationAdapter.test.ts`, mock fetch JSON body and assert parsed shape.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test src/services/vp/walletInitiatedPresentation.test.ts src/services/vp/verifierPresentationAdapter.test.ts --runInBand`

- [ ] **Step 3: Implement client types**

`presentationGatewayClient.ts`:

```typescript
export type PresentationSessionStatus =
  | 'pending'
  | 'ready'
  | 'verified'
  | 'verify_failed'
  | 'expired'

export type PresentationSessionStatusResponse = {
  status: PresentationSessionStatus
  reason?: string
}

export interface PresentationGatewayClient {
  // ...
  fetchSessionStatus(sessionId: string): Promise<PresentationSessionStatusResponse>
}
```

`verifierPresentationAdapter.ts` `fetchSessionStatus`:

```typescript
const body = (await response.json()) as {
  status: PresentationSessionStatus | 'not-found'
  reason?: string
}
if (body.status === 'not-found') throw new Error('VpSessionNotFound')
return { status: body.status, ...(body.reason ? { reason: body.reason } : {}) }
```

`walletInitiatedPresentation.ts`:

```typescript
export type VpSessionStatusResponse = PresentationSessionStatusResponse

export async function fetchVpSessionStatus(
  sessionId: string,
  client: PresentationGatewayClient = getDefaultVerifierPresentationClient(),
): Promise<VpSessionStatusResponse> {
  return client.fetchSessionStatus(sessionId)
}
```

- [ ] **Step 4: Run client tests — expect PASS**

---

### Task 5: History — wallet-initiated presentation failure

**Files:**
- Modify: `src/services/history/walletHistoryRecording.ts`
- Create: `src/services/history/walletHistoryRecording.walletInitiated.test.ts`
- Modify: `src/services/vp/walletInitiatedPresentation.ts`

- [ ] **Step 1: Write failing history tests**

```typescript
import { mapVerifierReasonToHistory, recordWalletInitiatedPresentationFailure } from './walletHistoryRecording'

test('mapVerifierReasonToHistory maps issuer signature', () => {
  expect(mapVerifierReasonToHistory('issuer-signature-invalid')).toBe('signature-invalid')
})

test('mapVerifierReasonToHistory maps kb binding issues', () => {
  expect(mapVerifierReasonToHistory('cnf-missing')).toBe('holder-binding-mismatch')
})

test('recordWalletInitiatedPresentationFailure appends presentation-failed', () => {
  // use createTestMmkv pattern from walletHistoryRecording.verifyFailed.test.ts
  recordWalletInitiatedPresentationFailure({
    record: { id: 'c1', type: 'ThaiNationalID', claims: { givenName: 'Ada' } } as VerifiableCredentialRecord,
    verifierReason: 'kb-nonce-mismatch',
  })
  const events = readWalletHistoryEvents()
  expect(events[0]?.kind).toBe('presentation-failed')
  expect(events[0]?.channel).toBe('wallet')
  expect(events[0]?.reasonCode).toBe('verifier-rejected')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/history/walletHistoryRecording.walletInitiated.test.ts --runInBand`

- [ ] **Step 3: Implement helpers**

In `walletHistoryRecording.ts`:

```typescript
export function mapVerifierReasonToHistory(reason: string | undefined): WalletHistoryFailureReason {
  if (!reason) return 'verifier-rejected'
  if (reason === 'issuer-signature-invalid') return 'signature-invalid'
  if (reason === 'cnf-missing' || reason === 'kb-signature-invalid' || reason.includes('holder-binding')) {
    return 'holder-binding-mismatch'
  }
  return 'verifier-rejected'
}

export function recordWalletInitiatedPresentationFailure(input: {
  record: VerifiableCredentialRecord
  verifierReason?: string
}): void {
  const schema = getCardSchema(input.record.type)
  appendWalletHistoryEvent({
    kind: 'presentation-failed',
    credentialId: input.record.id,
    documentType: schema.title,
    partyName: 'Verifier',
    disclosedClaims: readWalletInitiatedClaimLabels(input.record),
    channel: 'wallet',
    reasonCode: mapVerifierReasonToHistory(input.verifierReason),
  })
}
```

Import `readWalletInitiatedClaimLabels` from `../vp/walletInitiatedPresentation` — if circular, inline the same label logic or move shared helper to a tiny `walletInitiatedHistory.ts`.

- [ ] **Step 4: Run history tests — expect PASS**

---

### Task 6: Hook and UI — verify_failed phase

**Files:**
- Modify: `src/hooks/useWalletInitiatedVpQrSession.ts`
- Modify: `src/components/WalletInitiatedVpQrPanel.tsx`
- Modify: `src/components/VpQrModal.test.tsx`

- [ ] **Step 1: Write failing UI/hook tests**

Update `VpQrModal.test.tsx`:

- Replace `'consumed'` mock with `{ status: 'verified' }`
- Replace `'awaiting-scan'` with `{ status: 'ready' }`
- Add test:

```typescript
test('shows verify failed and records presentation-failed history', async () => {
  const mockRecordFailure = jest.fn()
  jest.mock('../services/history/walletHistoryRecording', () => ({
    recordWalletInitiatedPresentationFailure: (...args: unknown[]) => mockRecordFailure(...args),
  }))
  mockFetchVpSessionStatus.mockResolvedValueOnce({ status: 'ready' }).mockResolvedValueOnce({
    status: 'verify_failed',
    reason: 'issuer-signature-invalid',
  })
  // render, advance timers, expect screen.getByText('ไม่ผ่านการตรวจสอบ')
  // expect(mockRecordFailure).toHaveBeenCalledTimes(1)
})
```

Prefer testing hook via modal integration already in file; mock `recordWalletInitiatedPresentationFailure` through `walletInitiatedPresentation` export if cleaner.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test src/components/VpQrModal.test.tsx --runInBand`

- [ ] **Step 3: Implement hook**

`useWalletInitiatedVpQrSession.ts`:

```typescript
export type WalletInitiatedVpQrPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'verified'
  | 'verify_failed'
  | 'expired'
  | 'error'
```

Poll handler:

```typescript
const outcome = await fetchVpSessionStatus(sessionId)
if (outcome.status === 'verified') {
  recordWalletInitiatedPresentationHistory(credential)
  setHistoryRecorded(true)
  setQrUrl(null)
  setPhase('verified')
  logWalletStep('vp-relay', 'verifier-verified', { sessionPrefix: sessionId.slice(0, 8) })
  return
}
if (outcome.status === 'verify_failed') {
  recordWalletInitiatedPresentationFailure({
    record: credential,
    verifierReason: outcome.reason,
  })
  setHistoryRecorded(true)
  setQrUrl(null)
  setPhase('verify_failed')
  logWalletStep('vp-relay', 'verifier-verify-failed', {
    sessionPrefix: sessionId.slice(0, 8),
    reason: outcome.reason ?? 'unknown',
  })
  return
}
```

`WalletInitiatedVpQrPanel.tsx` — add before `expired` branch:

```tsx
if (phase === 'verify_failed') {
  return (
    <View className="items-center gap-4 py-4">
      <Text className="text-center text-base font-semibold text-danger-dark">ไม่ผ่านการตรวจสอบ</Text>
      <AppButton
        variant="solid-block"
        label="สร้างใหม่"
        onPress={onRetry}
        className="w-full max-w-[220px] rounded-xl py-3"
        textClassName="text-center text-sm font-bold"
      />
    </View>
  )
}
```

- [ ] **Step 4: Run UI tests — expect PASS**

---

### Task 7: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Update verifier-owned spec status table**

Replace poll row:

```markdown
| `GET` | `/v1/presentation-sessions/{id}/status` | Poll `pending` / `ready` / `verified` / `verify_failed` / `expired` |
```

Update wallet flow step 6: poll until `verified` or `verify_failed`.

- [ ] **Step 2: Add TASKS.md session note**

Under active session notes, add checkbox:

```markdown
[x] My QR wallet-initiated VP verify outcome: gateway `verified`/`verify_failed` status + Wallet poll/UI/history (P5 #16/#18 Wallet scope). Spec: docs/superpowers/specs/2026-07-13-wallet-initiated-vp-verify-outcome-design.md
```

(Mark `[x]` only after implementation complete.)

---

### Task 8: Full verification

- [ ] **Step 1: Server test suite**

Run: `cd server && yarn test --runInBand`

Expected: PASS

- [ ] **Step 2: Mobile test suite (focused)**

Run: `yarn test src/services/vp/ src/components/VpQrModal.test.tsx src/services/history/walletHistoryRecording.walletInitiated.test.ts --runInBand`

Expected: PASS

- [ ] **Step 3: Typecheck and lint**

Run: `yarn tsc --noEmit && yarn lint`

Expected: PASS (or record blockers in `docs/TASKS.md`)

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Replace `consumed` with `verified` / `verify_failed` | 1, 2, 4 |
| Finalize on verify failure | 2 |
| Status API `reason` on fail | 3 |
| Dev `/dev/*` parity | 3 |
| Wallet poll + phases | 4, 6 |
| `presentation-failed` history | 5, 6 |
| Generic UI (no raw reason) | 6 |
| No OID4VP Scan changes | — (out of scope) |
| Update verifier-owned design doc | 7 |

## P5 outcome (Wallet lens)

After Tasks 1–8: steps **#16** and **#18** move from Partial → **Done** for My QR path.
