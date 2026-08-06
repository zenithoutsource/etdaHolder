# P3 Async Renewal Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor P3 credential renewal so **ขอเอกสาร** submits once to the issuer, wallet polls on focus while waiting, auto-claims when ready, then shows green ribbon + Active before holder confirms old VC deletion.

**Architecture:** Split `credentialRenewalService` into `submitRenewalRequest` (POST only) and `refreshAndCompleteRenewals` (poll + auto-claim). Dev server exposes `requested` → `offer-ready` states. UI hides request CTA after successful submit; home prefers `renewed-active` credential per type.

**Tech Stack:** Expo SDK 54, React Native, NativeWind, Jest, Express (`server/`), `@sphereon/oid4vci-client` via `exchangeService`

## Global Constraints

- OID4VCI runs on-device only; no mobile `/exchange/*` calls.
- Token values stay inside `exchangeService`; callers get stored `VerifiableCredentialRecord` only.
- Every caught error: raw diagnostic log with scoped tag before generic UI message; no secrets/PII in logs.
- Styling: NativeWind `className` only (no new `StyleSheet`).
- Ribbon badge asset: `assets/images/ribbon_badge.png` with grey/green `tintColor`.
- One-shot submit: lock only after HTTP 201 from renewal-request; network failure keeps `renewal-required`.
- P3-4 modal removed from happy path; go straight to P3-5 (Active on new VC) then P3-6 (delete old VC).
- Run `yarn tsc --noEmit`, `yarn test`, `yarn lint`, and `cd server && yarn test` before merge; update `docs/TASKS.md` after each slice.

**Spec:** `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md` (canonical; includes async flow)

---

## File map

| File | Responsibility |
|---|---|
| `server/src/routes/devWallet.ts` | Async renewal states; POST returns `{ accepted: true }`; GET returns `offer-ready` + `offerUri` |
| `src/services/credentials/credentialRenewalService.ts` | `submitRenewalRequest`, `refreshAndCompleteRenewals`, rename/split claim path |
| `src/services/credentials/credentialRenewalService.test.ts` | **new** — submit/poll/claim unit tests |
| `src/services/credentials/credentialInactiveState.ts` | Issuer-wait copy for `renewal-processing` |
| `src/services/credentials/walletHomeCopy.ts` | Panel messages if needed |
| `app/(tabs)/index.tsx` | One-shot CTA guard; call `refreshAndCompleteRenewals` on focus |
| `app/(tabs)/credential/[id].tsx` | Poll on focus; P3-6 on `cleanup-pending`; remove P3-4 chain |
| `app/(tabs)/scan.tsx` | `submitRenewalRequest` only; navigate to old credential id |
| `server/src/testApp.test.ts` | Async server state integration tests |
| `docs/TASKS.md` | Session notes |

---

### Task 1: Dev server async renewal states

**Files:**
- Modify: `server/src/routes/devWallet.ts`
- Modify: `server/src/testApp.test.ts`

**Interfaces:**
- Produces: `POST /wallet-api/dev/wallet/renewal-request` → `201 { accepted: true }`
- Produces: `GET /wallet-api/dev/wallet/renewal-status` → `{ renewals: [{ credentialId, state: 'requested' | 'offer-ready' | 'revoked', offerUri?, revokedAt? }] }`

- [ ] **Step 1: Write the failing test**

Add to `server/src/testApp.test.ts` (replace expectations in existing renewal test):

```typescript
test('renewal-request accepts without returning offer; status transitions to offer-ready', async () => {
  process.env.ISSUER_PROXY_TARGET = 'https://issuer.office.example'
  const issuerOfferUri =
    'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.office.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Drenewal-1'
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/credential-offer')) {
      return new Response(JSON.stringify({ offerUri: issuerOfferUri }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
  const app = createTestApp()

  const created = await request(app).post('/wallet-api/dev/wallet/renewal-request').send({
    credentialId: 'thai-id-1',
    credentialType: 'ThaiNationalID',
    oldHolderDid: 'did:key:old',
    newHolderDid: 'did:key:new',
    rawVc: 'eyJhbGciOiJFZERTQSJ9.payload.signature',
  })

  expect(created.status).toBe(201)
  expect(created.body).toEqual({ accepted: true })

  const statusRequested = await request(app).get('/wallet-api/dev/wallet/renewal-status')
  expect(statusRequested.body.renewals[0].state).toBe('requested')
  expect(statusRequested.body.renewals[0].offerUri).toBeUndefined()

  const statusReady = await request(app).get('/wallet-api/dev/wallet/renewal-status')
  expect(statusReady.body.renewals[0].state).toBe('offer-ready')
  expect(statusReady.body.renewals[0].offerUri).toBe(issuerOfferUri)
  expect(isParseableCredentialOfferUri(statusReady.body.renewals[0].offerUri)).toBe(true)

  fetchMock.mockRestore()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server; yarn test server/src/testApp.test.ts -t "renewal-request accepts"`
Expected: FAIL — body still has `offerUri`, state still `revoked` immediately

- [ ] **Step 3: Implement dev server async states**

In `server/src/routes/devWallet.ts`:

1. Change `DevWalletRenewalRecord.state` to `'requested' | 'offer-ready' | 'revoked'`.
2. On `POST /wallet/renewal-request`: call `requestIssuerRenewalOffer`, store record with `state: 'requested'`, save `offerUri` internally (not in response). Respond `201 { accepted: true }`.
3. On `GET /wallet/renewal-status`: for each `requested` record, lazily transition to `offer-ready` (first poll simulates issuer verification complete). Return `offerUri` only when `offer-ready` or `revoked`.

```typescript
type DevWalletRenewalRecord = {
  credentialId: string
  credentialType: string
  oldHolderDid: string
  newHolderDid: string
  state: 'requested' | 'offer-ready' | 'revoked'
  rawVc: string
  offerUri: string
  revokedAt?: string
  updatedAt: string
}

// Inside GET /wallet/renewal-status handler, before mapping response:
for (const record of renewals.values()) {
  if (record.state === 'requested') {
    record.state = 'offer-ready'
    record.updatedAt = new Date().toISOString()
    renewals.set(record.credentialId, record)
  }
}

// Response mapping:
renewals: Array.from(renewals.values()).map((record) => ({
  credentialId: record.credentialId,
  state: record.state,
  offerUri: record.state === 'offer-ready' ? record.offerUri : undefined,
  revokedAt: record.revokedAt,
}))
```

- [ ] **Step 4: Run server tests**

Run: `cd server; yarn test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/devWallet.ts server/src/testApp.test.ts
git commit -m "feat(server): async renewal states requested → offer-ready"
```

---

### Task 2: Split renewal service — submit vs poll/claim

**Files:**
- Modify: `src/services/credentials/credentialRenewalService.ts`
- Create: `src/services/credentials/credentialRenewalService.test.ts`

**Interfaces:**
- Consumes: dev endpoints from Task 1
- Produces:
  - `submitRenewalRequest(credentialId: string): Promise<void>`
  - `refreshAndCompleteRenewals(fetchImpl?: typeof fetch): Promise<void>`
  - `requestCredentialRenewal` — **remove** or make thin alias throwing deprecation (grep callers and update in Task 4)

- [ ] **Step 1: Write failing tests**

Create `src/services/credentials/credentialRenewalService.test.ts`:

```typescript
import {
  submitRenewalRequest,
  refreshAndCompleteRenewals,
} from './credentialRenewalService'
import { readCredentialRenewal, writeCredentialRenewal } from './credentialKeyRenewal'
import { readStoredCredentials } from './storedCredentials'

jest.mock('../storage/storage', () => require('../storage/__mocks__/storage'))
jest.mock('./storedCredentials')
jest.mock('./credentialHolderBinding', () => ({
  readCredentialHolderDid: () => 'did:key:old',
}))
jest.mock('../crypto/crypto', () => ({
  getHolderDid: () => 'did:key:new',
}))
jest.mock('../debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

const mockCredential = {
  id: 'urn:uuid:old',
  type: 'ThaiNationalID',
  rawVc: 'eyJ.test',
  issuer: 'did:issuer',
  issuedAt: '2026-01-01T00:00:00.000Z',
}

describe('submitRenewalRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(readStoredCredentials as jest.Mock).mockReturnValue([mockCredential])
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })
  })

  test('sets renewal-processing on HTTP 201 and does not claim', async () => {
    const claimMock = jest.fn()
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ accepted: true }),
    })

    await submitRenewalRequest(mockCredential.id, {
      fetchImpl: fetchMock,
      claimCredential: claimMock,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(claimMock).not.toHaveBeenCalled()
    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-processing')
  })

  test('stays renewal-required on network failure', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 502 })

    await expect(
      submitRenewalRequest(mockCredential.id, { fetchImpl: fetchMock }),
    ).rejects.toThrow()

    expect(readCredentialRenewal(mockCredential.id)?.state).toBe('renewal-required')
  })

  test('throws when already submitted', async () => {
    writeCredentialRenewal({
      credentialId: mockCredential.id,
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: new Date().toISOString(),
    })

    await expect(submitRenewalRequest(mockCredential.id)).rejects.toThrow(
      'CredentialRenewalAlreadySubmitted',
    )
  })
})

describe('refreshAndCompleteRenewals', () => {
  test('auto-claims when offer-ready and sets renewed-active + cleanup-pending', async () => {
  // setup renewal-processing + mock status + mock resolve/claim
  // assert new record renewed-active, old cleanup-pending with replacementCredentialId
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/services/credentials/credentialRenewalService.test.ts`
Expected: FAIL — `submitRenewalRequest` not exported

- [ ] **Step 3: Refactor `credentialRenewalService.ts`**

Key changes:

```typescript
export async function submitRenewalRequest(
  credentialId: string,
  dependencies: Partial<SubmitDependencies> = {},
): Promise<void> {
  const record = readCredentialRenewal(credentialId)
  if (record && record.state !== 'renewal-required') {
    throw new Error('CredentialRenewalAlreadySubmitted')
  }
  // ... validate credential, POST renewal-request
  // expect 201 { accepted: true }
  // upsert state: renewal-processing
  // on error: revert/stay renewal-required (do NOT set processing)
}

export async function refreshAndCompleteRenewals(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(DEV_RENEWAL_STATUS_ENDPOINT)
  if (!response.ok) return
  const payload = await response.json()
  for (const item of payload.renewals ?? []) {
    if (item.state !== 'offer-ready' || !item.offerUri) continue
    const current = readCredentialRenewal(item.credentialId)
    if (!current || current.state !== 'renewal-processing') continue
    await completeRenewalClaim(item.credentialId, item.offerUri)
  }
}

async function completeRenewalClaim(credentialId: string, offerUri: string): Promise<void> {
  const offer = await resolveOffer(offerUri)
  const replacement = await claimCredential(offer)
  writeCredentialRenewal({
    credentialId,
    previousHolderDid: current.previousHolderDid,
    replacementCredentialId: replacement.id,
    state: 'cleanup-pending',
    updatedAt: new Date().toISOString(),
  })
  upsertCredentialRenewal(replacement.id, {
    previousHolderDid: current.previousHolderDid,
    state: 'renewed-active',
    replacementCredentialId: replacement.id,
    renewedAt: new Date().toISOString(),
  })
}
```

Remove inline claim from old `requestCredentialRenewal` body. Update `refreshCredentialRenewalStatuses` to delegate to `refreshAndCompleteRenewals` or merge logic (single poll entry point).

On submit failure catch block: **do not** set `renewal-processing`; leave `renewal-required`.

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/credentialRenewalService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/credentialRenewalService.ts src/services/credentials/credentialRenewalService.test.ts
git commit -m "feat(renewal): split submit from poll/auto-claim"
```

---

### Task 3: Inactive state copy and one-shot UI guards

**Files:**
- Modify: `src/services/credentials/credentialInactiveState.ts`
- Modify: `src/services/credentials/walletHomeCopy.ts` (if panel copy moved to centralized strings)

**Interfaces:**
- Consumes: `renewal-processing` state from Task 2
- Produces: updated `panelMessage` for issuer-wait state

- [ ] **Step 1: Update `renewal-processing` message**

In `credentialInactiveState.ts`:

```typescript
if (renewalStatus?.state === 'renewal-processing') {
  return {
    kind: 'renewal-processing',
    badgeLabel: 'Inactive',
    badgeClassName: 'bg-[#7a7a7a]',
    panelMessage: 'ส่งคำขอต่ออายุเอกสารแล้ว กำลังรอผู้ออกเอกสารตรวจสอบ',
  }
}
```

Add `cleanup-pending` panel message prompting delete if not already clear.

- [ ] **Step 2: Run inactive state tests**

Run: `yarn test src/services/credentials/credentialInactiveState.test.ts`
Expected: PASS (update expectations if test exists)

- [ ] **Step 3: Commit**

```bash
git add src/services/credentials/credentialInactiveState.ts src/services/credentials/walletHomeCopy.ts
git commit -m "fix(copy): issuer-wait message for renewal-processing"
```

---

### Task 4: Wire wallet screens

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/credential/[id].tsx`
- Modify: `app/(tabs)/scan.tsx`

**Interfaces:**
- Consumes: `submitRenewalRequest`, `refreshAndCompleteRenewals` from Task 2

- [ ] **Step 1: Update `scan.tsx`**

Replace `requestCredentialRenewal` import with `submitRenewalRequest`.

After success, navigate to **old** credential id (already fixed in prior session — verify still correct):

```typescript
await submitRenewalRequest(renewCredentialId)
router.replace({
  pathname: '/(tabs)/credential/[id]',
  params: { id: renewCredentialId },
})
```

- [ ] **Step 2: Update `index.tsx`**

1. In `refreshCredentialStatuses`, call `refreshAndCompleteRenewals()` instead of/in addition to old `refreshCredentialRenewalStatuses`.
2. Expanded panel: show **ขอเอกสาร** only when `inactiveState.kind === 'renewal-required'` (remove `renewal-processing` from CTA condition).
3. `routeRenewalRequest` unchanged (pushes scan with `?renew=`).

- [ ] **Step 3: Update `credential/[id].tsx`**

1. Replace `requestCredentialRenewal` with `submitRenewalRequest` in `beginRenewalRequest`; on success `setPhase({ tag: 'detail' })` only (no navigation to new id).
2. Add `useFocusEffect` calling `refreshAndCompleteRenewals()` then re-read renewal state (trigger re-render via stored credentials hook or local refresh flag).
3. **Remove** P3-4 `old-revoked` dialog chain.
4. Show P3-6 dialog when `renewalStatus?.state === 'cleanup-pending'` on old credential:

```typescript
if (renewalStatus?.state === 'cleanup-pending') {
  showDialog({
    title: WALLET_HOME_COPY.renewalDeleteTitle,
    message: WALLET_HOME_COPY.renewalDeleteMessage,
    icon: 'danger',
    dismissible: false,
    actions: [
      { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
      {
        label: WALLET_HOME_COPY.confirmDelete,
        variant: 'danger',
        onPress: () => {
          confirmOldCredentialCleanup(credential.id)
          const replacementId = renewalStatus.replacementCredentialId
          if (replacementId) {
            router.replace({ pathname: '/(tabs)/credential/[id]', params: { id: replacementId } })
          } else {
            router.replace('/(tabs)')
          }
        },
      },
    ],
  })
}
```

5. Renewal CTA button: only when `inactiveState.kind === 'renewal-required'`.

- [ ] **Step 4: Manual smoke checklist**

1. Rotate key → inactive grey ribbon
2. Tap ขอเอกสาร → returns to detail, no claim yet, CTA hidden
3. Leave and refocus home → poll → auto-claim → home shows Active on new cred type row
4. Open old cred → P3-6 delete → lands on new cred with green ribbon

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx app/(tabs)/credential/[id].tsx app/(tabs)/scan.tsx
git commit -m "feat(ui): async renewal flow with poll-on-focus and cleanup dialog"
```

---

### Task 5: Verification and docs

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Run full verification**

```bash
yarn tsc --noEmit
yarn test
yarn lint
cd server; yarn tsc; yarn test
```

Expected: all pass

- [ ] **Step 2: Update `docs/TASKS.md`**

Add session note: async renewal flow implemented per `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record P3 async renewal implementation"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| One-shot after HTTP 201 | Task 2 `submitRenewalRequest` guard + Task 4 UI hide CTA |
| Retry on submit failure | Task 2 test + catch leaves `renewal-required` |
| Poll on focus | Task 4 index + credential detail |
| Auto-claim on offer-ready | Task 2 `refreshAndCompleteRenewals` |
| Green ribbon + Active on new VC | Existing overlay + Task 2 `renewed-active` on replacement |
| P3-6 delete old VC | Task 4 credential detail dialog |
| Clear rotation after cleanup | Existing `confirmOldCredentialCleanup` |
| Dev server async states | Task 1 |
| Remove P3-4 happy path | Task 4 |
| `ribbon_badge.png` | Already implemented — no change |

No placeholders remain. Type names consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-p3-renewal-async-flow.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
