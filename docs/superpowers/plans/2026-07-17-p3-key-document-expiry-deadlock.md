# P3 Key + Document Expiry Deadlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the create-key ↔ renew-documents deadlock so Wallet follows the P3 sequence: new `did:key` first when no rotation is outstanding, then holder taps **ขอเอกสาร**; while `wallet.key_rotation` exists, steer to finish renewals (never show competing create-key).

**Architecture:** Add a pure `readWalletKeyExpiryLane` selector. `WalletKeyExpiryHost` shows P3-1 only for `create-key`, shows a pending-renewal dialog for `finish-renewals`, and keeps `rotateWalletKey` hard-blocked on a second rotate. Document-expired reissue CTAs stay deferred while lane is `create-key`.

**Tech Stack:** Expo Router, existing `AppDialog` / `WalletKeyExpiredModal`, MMKV meta `wallet.key_rotation`, Jest.

**Spec:** `docs/superpowers/specs/2026-07-17-p3-key-document-expiry-deadlock-design.md`  
**Parent:** `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md`

## Global Constraints

- English-only code/docs comments; Thai UX copy via `WALLET_HOME_COPY`.
- No customer org name "ETDA" in new identifiers.
- One biometric per user action; rotation biometric remains Keychain read inside `forceRotateWalletKey`.
- Do not allow a second previous Keychain seed; do not auto-submit renewals.
- NativeWind for any new UI; reuse `AppDialog` / existing modal patterns before inventing a third modal system.
- Log with `wallet-key-expiry` tag; no secrets/PII.

## File map

| File | Responsibility |
|---|---|
| `src/services/crypto/walletKeyExpiryLane.ts` | Pure lane selector |
| `src/services/crypto/walletKeyExpiryLane.test.ts` | Lane unit tests |
| `src/services/credentials/pendingRenewalNavigation.ts` | First actionable renewal credential id |
| `src/services/credentials/pendingRenewalNavigation.test.ts` | Navigation target tests |
| `src/services/credentials/walletHomeCopy.ts` | Pending-renewal + “ไปต่ออายุเอกสาร” copy |
| `src/components/WalletKeyExpiryHost.tsx` | Lane-driven modal / blocked dialog CTA |
| `src/components/WalletKeyExpiryHost.test.ts` | Visibility + dialog action tests |
| `src/components/WalletKeyExpiredModal.tsx` | Unchanged (still create-key only) |
| `app/(tabs)/index.tsx` (and detail if needed) | Gate document-reissue CTA when lane is `create-key` |
| `docs/TASKS.md` | Checklist + session note |

---

### Task 1: Lane selector + first pending credential

**Files:**
- Create: `src/services/crypto/walletKeyExpiryLane.ts`
- Create: `src/services/crypto/walletKeyExpiryLane.test.ts`
- Create: `src/services/credentials/pendingRenewalNavigation.ts`
- Create: `src/services/credentials/pendingRenewalNavigation.test.ts`
- Modify: `src/services/credentials/walletHomeCopy.ts`
- Modify: `src/services/credentials/walletHomeCopy.test.ts`

**Interfaces:**
- Produces:
  - `export type WalletKeyExpiryLane = 'create-key' | 'finish-renewals' | 'idle'`
  - `export function readWalletKeyExpiryLane(input: { keyExpired: boolean; hasRotationRecord: boolean }): WalletKeyExpiryLane`
  - `export function readFirstPendingRenewalCredentialId(credentials?: VerifiableCredentialRecord[]): string | undefined`
  - Copy keys: `walletKeyPendingRenewalsTitle`, `walletKeyPendingRenewalsMessage`, `goFinishRenewals`

- [ ] **Step 1: Write failing lane tests**

```ts
import { readWalletKeyExpiryLane } from './walletKeyExpiryLane'

describe('readWalletKeyExpiryLane', () => {
  test('rotation record wins over key expired → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: true, hasRotationRecord: true }),
    ).toBe('finish-renewals')
  })

  test('key expired without rotation → create-key', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: true, hasRotationRecord: false }),
    ).toBe('create-key')
  })

  test('neither → idle', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: false, hasRotationRecord: false }),
    ).toBe('idle')
  })

  test('rotation record with non-expired key → finish-renewals', () => {
    expect(
      readWalletKeyExpiryLane({ keyExpired: false, hasRotationRecord: true }),
    ).toBe('finish-renewals')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `yarn test src/services/crypto/walletKeyExpiryLane.test.ts`

- [ ] **Step 3: Implement lane selector**

```ts
export type WalletKeyExpiryLane = 'create-key' | 'finish-renewals' | 'idle'

export function readWalletKeyExpiryLane(input: {
  keyExpired: boolean
  hasRotationRecord: boolean
}): WalletKeyExpiryLane {
  if (input.hasRotationRecord) return 'finish-renewals'
  if (input.keyExpired) return 'create-key'
  return 'idle'
}
```

- [ ] **Step 4: Write failing pending-navigation tests**

Prefer `renewal-required`, then `renewal-processing`, then cleanup-awaiting (`cleanup-pending` / `old-revoked` via `isRenewalAwaitingHolderCleanup`). Scan `readStoredCredentials()` in stable list order; return first match id.

- [ ] **Step 5: Implement `readFirstPendingRenewalCredentialId`**

Use `readCredentialRenewal` + `isRenewalAwaitingHolderCleanup` from existing modules. Do not invent a second renewal state list.

- [ ] **Step 6: Add Thai copy**

```ts
walletKeyPendingRenewalsTitle: 'ยังมีเอกสารที่ต้องต่ออายุ',
walletKeyPendingRenewalsMessage:
  'กรุณาต่ออายุหรือลบเอกสารที่ค้างอยู่ให้เสร็จก่อน จึงจะสร้างกุญแจใหม่ได้อีกครั้ง',
goFinishRenewals: 'ไปต่ออายุเอกสาร',
```

Extend `walletHomeCopy.test.ts` assertions for the new keys.

- [ ] **Step 7: Run focused tests — expect PASS**

Run: `yarn test src/services/crypto/walletKeyExpiryLane.test.ts src/services/credentials/pendingRenewalNavigation.test.ts src/services/credentials/walletHomeCopy.test.ts`

- [ ] **Step 8: Commit**

```bash
git add src/services/crypto/walletKeyExpiryLane.ts src/services/crypto/walletKeyExpiryLane.test.ts \
  src/services/credentials/pendingRenewalNavigation.ts src/services/credentials/pendingRenewalNavigation.test.ts \
  src/services/credentials/walletHomeCopy.ts src/services/credentials/walletHomeCopy.test.ts
git commit -m "$(cat <<'EOF'
feat(p3): add wallet key expiry lane selector

Order create-key vs finish-renewals so key and document expiry cannot compete as first actions.
EOF
)"
```

---

### Task 2: Wire `WalletKeyExpiryHost` to the lane

**Files:**
- Modify: `src/components/WalletKeyExpiryHost.tsx`
- Modify: `src/components/WalletKeyExpiryHost.test.ts`
- Consumes: `readWalletKeyExpiryLane`, `readWalletKeyRotationRecord`, `readFirstPendingRenewalCredentialId`, new copy keys
- Produces: updated `shouldShowWalletKeyExpiredModal`; pending-renewal dialog via `AppDialog` when lane is `finish-renewals`

- [ ] **Step 1: Update visibility helper tests**

```ts
test('hides create-key modal when lane is finish-renewals', () => {
  expect(
    shouldShowWalletKeyExpiredModal({
      lane: 'finish-renewals',
      isRotatingWalletKey: false,
    }),
  ).toBe(false)
})

test('shows create-key modal only for create-key lane when idle', () => {
  expect(
    shouldShowWalletKeyExpiredModal({
      lane: 'create-key',
      isRotatingWalletKey: false,
    }),
  ).toBe(true)
})
```

Change signature to take `lane: WalletKeyExpiryLane` instead of raw `isExpired` (or derive lane inside and keep both — prefer explicit `lane` so tests match the selector).

- [ ] **Step 2: Extend `readWalletKeyRotationFailureDialog` tests**

Blocked branch must still return blocked title/message. Host wiring (not the pure dialog reader) adds the **ไปต่ออายุเอกสาร** action that navigates to `/(tabs)/credential/${id}` when `readFirstPendingRenewalCredentialId()` returns an id.

Optionally extend the pure helper to return suggested action labels; keep navigation in the host.

- [ ] **Step 3: Implement host behavior**

```ts
const lane = readWalletKeyExpiryLane({
  keyExpired: isExpired,
  hasRotationRecord: Boolean(readWalletKeyRotationRecord()),
})

// Create-key modal
visible={shouldShowWalletKeyExpiredModal({ lane, isRotatingWalletKey })}

// When lane === 'finish-renewals', on mount / when lane becomes finish-renewals:
// showDialog({
//   title: WALLET_HOME_COPY.walletKeyPendingRenewalsTitle,
//   message: WALLET_HOME_COPY.walletKeyPendingRenewalsMessage,
//   icon: 'warning',
//   actions: [
//     { label: WALLET_HOME_COPY.goFinishRenewals, onPress: () => router.push(...) },
//     { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
//   ],
// })
```

Avoid dialog spam: show pending dialog once per lane entry (ref flag reset when lane leaves `finish-renewals`), or only when previously would have shown create-key (keyExpired && hasRotationRecord). Prefer: show when `lane === 'finish-renewals' && isExpired` so a quiet mid-renewal without a new TTL alarm does not nag; still steers when the deadlock case (TTL again) hits.

On blocked rotate failure, same primary CTA as pending dialog.

Use `expo-router` `router.push(\`/(tabs)/credential/${id}\`)` — match existing credential detail routes in `app/(tabs)/credential/[id].tsx`.

- [ ] **Step 4: Run host tests**

Run: `yarn test src/components/WalletKeyExpiryHost.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/WalletKeyExpiryHost.tsx src/components/WalletKeyExpiryHost.test.ts
git commit -m "$(cat <<'EOF'
fix(p3): steer key-expiry UI by lane

Show create-key only when idle of rotation; pending renewals get finish CTA instead of a circular create-key prompt.
EOF
)"
```

---

### Task 3: Defer document-expired reissue while `create-key`

**Files:**
- Modify: `app/(tabs)/index.tsx` (and credential detail if it exposes the same reissue CTA)
- Modify / add focused test for the gate helper if extracted

**Interfaces:**
- Produces: `export function shouldOfferDocumentReissueCta(input: { lane: WalletKeyExpiryLane; documentExpired: boolean }): boolean` — `true` only when `documentExpired && lane !== 'create-key'` (and existing inactive-state rules still apply at call site).

- [ ] **Step 1: Write failing helper test**

```ts
expect(
  shouldOfferDocumentReissueCta({ lane: 'create-key', documentExpired: true }),
).toBe(false)
expect(
  shouldOfferDocumentReissueCta({ lane: 'idle', documentExpired: true }),
).toBe(true)
expect(
  shouldOfferDocumentReissueCta({ lane: 'finish-renewals', documentExpired: true }),
).toBe(true) // renewal CTAs / cleanup own the flow; reissue may still show if product already did — prefer false if row is in P3 renewal; call site already prefers renewal UI
```

Prefer: when credential has any P3 renewal record, existing renewal UI wins (already true today). Gate only the pure `document-expired` reissue path with `lane !== 'create-key'`.

- [ ] **Step 2: Implement helper + wire home/detail**

Where `showDocumentReissueCta` / `onDocumentReissue` is set, also require `readWalletKeyExpiryLane(...) !== 'create-key'`.

- [ ] **Step 3: Run focused tests + `yarn tsc --noEmit`**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(p3): defer document reissue until key rotate

When wallet key expiry requires create-key first, hide competing ขอเอกสารใหม่ CTAs.
EOF
)"
```

---

### Task 4: Docs + regression verification

**Files:**
- Modify: `docs/TASKS.md` §3.5 checklist + session note

- [ ] **Step 1: Mark checklist items**

Add under §3.5:

```md
[x] Key+document expiry deadlock lane (`walletKeyExpiryLane`) — create-key first, then holder ขอเอกสาร; finish-renewals steers while rotation record exists (spec 2026-07-17)
```

Session note summarizing the fix.

- [ ] **Step 2: Full focused verification**

Run:

```bash
yarn test src/services/crypto/walletKeyExpiryLane.test.ts \
  src/services/credentials/pendingRenewalNavigation.test.ts \
  src/components/WalletKeyExpiryHost.test.ts \
  src/services/crypto/walletKeyRotation.test.ts \
  src/services/credentials/walletHomeCopy.test.ts
yarn tsc --noEmit
```

Expected: all PASS; tsc clean for touched files.

- [ ] **Step 3: Commit docs**

```bash
git add docs/TASKS.md
git commit -m "$(cat <<'EOF'
docs(tasks): record P3 key/document expiry deadlock lane
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Lane ordering create-key / finish-renewals / idle | Task 1 |
| P3-1 only when create-key | Task 2 |
| Pending renewals guidance + CTA | Task 2 |
| Blocked rotate steers to renewals | Task 2 |
| Defer document-expired reissue during create-key | Task 3 |
| Hard block second rotate unchanged | Task 2 regression via `walletKeyRotation.test.ts` in Task 4 |
| No auto-submit / no second previous seed | Explicit non-goals; no code path added |
| TASKS update | Task 4 |
