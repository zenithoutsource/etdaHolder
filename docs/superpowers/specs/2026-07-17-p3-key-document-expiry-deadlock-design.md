# P3 Key + Document Expiry Deadlock — Design Spec

> **Status:** Approved (design-level, 2026-07-17)
> **Date:** 2026-07-17
> **Author:** Brainstorming session
> **Parent:** `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md`
> **Journey:** `docs/User_Journey/id_card/P3.md` steps 2–4 (create `did:key`, then request with old VC)

---

## 1. Problem

When wallet `did:key` TTL and stored documents expire (or renewals are already outstanding) at the same time, the Wallet can present competing first actions:

1. **Create key** — `WalletKeyExpiredModal` / P3-1.
2. **Request / renew documents** — document-expired “ขอเอกสารใหม่”, PID gate, or pending `renewal-required`.

Separately, if `wallet.key_rotation` already exists, a second rotate throws `WalletKeyRotationBlockedPendingRenewals` (“finish renewing documents first”) while the UI may still push create-key because the *current* key TTL has elapsed again. That is a circular gate (deadlock A + B).

This contradicts the P3 sequence: **rotate / generate new `did:key` first**, then **holder requests documents** with the old VC.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Scope | Wallet orchestration / UX only (Approach 1: ordered gate + steer UX) |
| Sequence | Step 2–3: create new `did:key` when no rotation record; then holder **taps ขอเอกสาร** and continues existing P3 renewal (OID4VP old VC → claim with new key) |
| Second rotate while renewals pending | **Still blocked** (one previous Keychain seed). UX must **steer** to finish renewals/cleanup — never a create-key ↔ renew loop |
| Auto-submit renewals | **No** — holder tap required |
| Multi-generation previous keys | **Out of scope** |
| Issuer / registries / Audit Trail | Peer / unchanged |

---

## 3. Ordering rules

**Invariant:** Never present create-key and request-documents as competing primary actions.

| Wallet state | Lane | Holder sees | Allowed action |
|---|---|---|---|
| Key TTL expired **and** no `wallet.key_rotation` | `create-key` | P3-1 only: **สร้างกุญแจใหม่** | `rotateWalletKey()` → new `did:key` + rotation record → mark bound creds `renewal-required` |
| `wallet.key_rotation` present (any renewal/cleanup outstanding) | `finish-renewals` | Pending-renewal guidance (**not** create-key) | Open first actionable credential; **ขอเอกสาร** / cleanup. Second rotate hard-blocked |
| Key TTL expired **and** docs `document-expired`, but no rotation yet | `create-key` | Still P3-1 first | Defer document “ขอเอกสารใหม่” / competing PID pressure until after rotate |
| Rotation done, creds `renewal-required` | (idle for key modal) | Home/detail P3 CTAs | Holder taps **ขอเอกสาร**; existing silent OID4VP + poll/claim |
| Otherwise | `idle` | Unchanged | — |

**Hard guard unchanged:** `rotateWalletKey()` throws `WalletKeyRotationBlockedPendingRenewals` if `readWalletKeyRotationRecord()` is set.

---

## 4. UX surfaces

Priority (highest first):

1. **`create-key`** — blocking `WalletKeyExpiredModal`. Suppress or disable competing document-expired primary CTAs / full-screen gates until rotate succeeds.
2. **`finish-renewals`** — pending-renewal surface (proactive, not only after failed rotate):
   - Copy tone aligned with `walletKeyRotationBlocked*` (renewals outstanding; finish documents first).
   - Primary CTA: navigate to first actionable credential (`renewal-required` → detail **ขอเอกสาร**, or `cleanup-pending` → cleanup).
   - Do **not** show P3-1 create-key modal in this lane, even if current key TTL has elapsed.
   - Home renewal badges remain.
3. **After rotate** — no forced document modal; holder uses existing **ขอเอกสาร**.
4. **Document-expired alone** (key not expired, no rotation) — unchanged badge + **ขอเอกสารใหม่**.

**Blocked-rotate dialog:** if `rotateWalletKey()` still throws, primary action is **ไปต่ออายุเอกสาร** (deep-link to first pending credential), not only Cancel / “try create key again”.

---

## 5. Architecture

### 5.1 Lane selector (pure function)

New small module (suggested path: `src/services/crypto/walletKeyExpiryLane.ts`):

```ts
type WalletKeyExpiryLane = 'create-key' | 'finish-renewals' | 'idle'

function readWalletKeyExpiryLane(input: {
  keyExpired: boolean
  hasRotationRecord: boolean
  // optional: hasPendingRenewalWork for clarity / tests
}): WalletKeyExpiryLane
```

Rules:

- `hasRotationRecord` → `finish-renewals` (wins over `keyExpired`)
- else `keyExpired` → `create-key`
- else → `idle`

### 5.2 Call sites

- `WalletKeyExpiryHost` / `shouldShowWalletKeyExpiredModal` — show create-key modal only when lane is `create-key`.
- Same host (or sibling) — when lane is `finish-renewals`, show pending-renewal modal/banner with renew CTA.
- Home / detail document-expired primary CTAs that would compete with P3-1 — gated off while lane is `create-key`.
- `readWalletKeyRotationFailureDialog` — add renew deep-link action when blocked.

### 5.3 Unchanged crypto / renewal

- Single previous Keychain seed; one `wallet.key_rotation` at a time.
- Dual-key + `renewalOid4VpPresentation` on holder **ขอเอกสาร**.
- `clearWalletKeyRotationRecord` / previous-seed wipe after cleanup when no pending renewal work.

---

## 6. Error handling

| Case | Behavior |
|---|---|
| Rotate while record exists | Throw `WalletKeyRotationBlockedPendingRenewals`; dialog steers to finish renewals |
| Biometric cancel on rotate | Propagate; stay on create-key lane |
| Renewal submit failure | Stay `renewal-required`; retry via **ขอเอกสาร** (existing) |

Log with scoped tags (e.g. `wallet-key-expiry`) before mapping to UI copy; no secrets/PII.

---

## 7. Testing

- Unit: lane selector — key+doc expired → `create-key`; rotation outstanding + key TTL again → `finish-renewals`; neither → `idle`.
- Host: modal visibility follows lane; blocked dialog offers renew CTA.
- Regression: `rotateWalletKey` still rejects second rotate; happy-path rotate → `renewal-required` unchanged.

---

## 8. Out of scope

- Allowing a second rotation that overwrites the previous seed while renewals are outstanding.
- Auto-queue / auto-submit renewals after rotate.
- Changing Issuer renewal protocol, Trust/Schema/Status registries, or external Audit Trail.
- Fresh-only OID4VCI path as replacement for P3 renewal after rotate (holder still uses sequence **ขอเอกสาร** with old VC).

---

## 9. Relationship to parent spec

This document **amends Wallet UX ordering** around P3-1 and pending rotation. It does not replace the canonical renewal state machine, async submit/claim, or OID4VP old-VC auth in `2026-06-25-p3-wallet-key-renewal-design.md`. Implementers must treat that file as SoT for renewal mechanics and this file as SoT for the deadlock / lane behavior.
