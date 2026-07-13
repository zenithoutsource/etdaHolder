# P3 Wallet `did:key` Expiry & Credential Renewal — Design Spec

> **Status:** Approved (canonical — merged 2026-06-26)
> **Initial date:** 2026-06-25
> **Last updated:** 2026-06-26
> **Author:** Brainstorming sessions (2026-06-25, 2026-06-26)

This document is the **single source of truth** for P3 wallet key expiry and credential renewal. It merges the 2026-06-26 async-flow and UX-flow design drafts (removed after merge).

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-25 | Initial spec: key rotation, renewal storage, dev issuer loop, P3-1–P3-6 screens |
| 2026-06-26 | **Async flow:** split submit vs claim; poll on focus; auto-claim on `offer-ready`; P3-4 removed from happy path |
| 2026-06-26 | **UX flow:** separate inactive/active ribbon assets; no auto P3-6 dialog; **ดูเอกสาร (เอกสารเดิม)** on home while waiting |
| 2026-06-26 | **Implementation refinements:** realtime key-expiry modal (`WalletKeyExpiryHost` + `useWalletKeyExpired`); Active ribbon/badge only while old VC cleanup is pending (`shouldShowRenewedActiveBadge`); hide revoke/delete menu during rotation flow (`shouldHideCredentialActionMenu`); `confirmOldCredentialCleanup` clears `renewed-active` on replacement; home dismissible banner removed (cleanup CTA on old VC detail only) |
| 2026-07-13 | **OID4VP old-VC auth (sequence steps 5–6):** dual-key retention — `forceRotateWalletKey` keeps previous Ed25519 seed in a second Keychain slot; `submitRenewalRequest` receives Issuer OID4VP `authorizationRequest`, silently presents the renewing old VC with previous-key PoP (`renewalOid4VpPresentation`), then polls/`offer-ready` auto-claim with **new** did:key PoP. Dev Issuer: `POST /wallet/renewal-vp/response` gates `offer-ready`. Previous seed wiped via `clearWalletKeyRotationRecord` / `clearPreviousWalletKey` when renewal work completes. |

---

## 1. Context and Scope

This spec defines **P3: VC Holding & Lifecycle Management** for the mobile wallet when the **Holder `did:key` expires** and credentials bound to the previous DID must be renewed.

Source journeys (identical flow across document types):

- `docs/User_Journey/id_card/P3.md`
- `docs/User_Journey/transcript/P3.md`
- `docs/User_Journey/ใบขับขี่/P3.md`

UI reference: `docs/ui-reference/P3/`

| Screen | Meaning |
|---|---|
| P3-1 | Wallet key expired modal → **สร้างกุญแจใหม่** |
| P3-2 | Old VC detail: grey ribbon + **Inactive** pill |
| P3-3 | Old VC while issuer verifies: grey ribbon, Inactive, no repeat request |
| P3-4 | Modal **ถูกเพิกถอนแล้ว** — **not on happy path** (type retained for migration) |
| P3-5 | New VC: green ribbon + **Active** pill **only while old VC cleanup is still owed** |
| P3-6 | Old VC: confirm delete → remove old VC + clear rotation metadata when all clean |

### Locked decisions

| Topic | Decision |
|---|---|
| Expiry meaning | **Wallet `did:key` expired** (device-level), not document `expiresAt` alone |
| v1 approach | Real key rotation + dev issuer renewal loop (reuse OID4VCI claim path) |
| Document scope | All stored credential types in v1 (`ThaiNationalID`, `DLTDrivingLicence`, `BangkokUniversityTranscript`) |
| Signing model | One Keychain-protected Ed25519 wallet key (ADR 0008); rotation changes Holder DID globally |
| Submit vs claim | **Async:** `submitRenewalRequest` on holder tap; **auto-claim** on focus poll when server is `offer-ready` |
| One-shot submit | Applies after issuer **HTTP 201** only; network failure before 201 → stay `renewal-required`, retry allowed |
| P3-4 happy path | **Removed** — revocation implied when moving to `cleanup-pending` after auto-claim |
| Active decoration | Green ribbon + **Active** only while an **old VC of the same type** is still `cleanup-pending` / `old-revoked` |
| After cleanup | New VC is a **normal** credential — no Active badge, no ribbon, renewal metadata cleared |
| Action menu | Hide **Revoke / ลบเอกสารนี้** (⋮) while `wallet.key_rotation` exists or credential has any renewal record |
| Key expiry modal | Realtime via scheduled timeout + `AppState` resume (`useWalletKeyExpired` in tab layout) |

### Architecture constraints (unchanged)

- OID4VCI runs on-device via `@sphereon/oid4vci-client`; no mobile `/exchange/*` calls.
- Company backend sync stays on generated SDK path when applicable.
- Credential UI remains config-driven (`cardSchemas.ts`, generic components).
- P6 lifecycle/suspension states remain separate; P3 adds parallel renewal state.

---

## 2. Holder Journey

### 2.1 Wallet key expiry (global)

1. Wallet detects `did:key` TTL exceeded from `wallet.key_registered_at` (realtime timer + foreground recheck).
2. Tab shell shows P3-1 modal (`WalletKeyExpiryHost`) on any tab when expired.
3. Holder taps **สร้างกุญแจใหม่** → biometric gate → `rotateWalletKey()`.
4. New Ed25519 seed and new Holder `did:key` are active; `wallet.key_rotation` metadata persisted.
5. All credentials bound to the **previous** Holder DID enter `renewal-required`.

### 2.2 Per-credential renewal (async)

1. Holder opens inactive credential detail or taps **ขอเอกสาร** on wallet home (when `renewal-required` and PID gate allows).
2. `submitRenewalRequest(credentialId)` POSTs old VC + old/new Holder DID to dev issuer.
   - **HTTP 201** → `renewal-processing` (one-shot locked).
   - **Failure** → stay `renewal-required`; generic error; holder may retry.
3. While `renewal-processing`: old VC shows grey ribbon + Inactive; holder may leave app; home shows **ดูเอกสาร (เอกสารเดิม)** link to old detail.
4. On wallet home or credential detail **focus** (and interval while any `renewal-processing` exists): `refreshAndCompleteRenewals()` polls dev server.
5. When server reports `offer-ready`: wallet auto-runs `resolveOffer()` + `claimCredential()` with new Holder DID PoP.
   - **New** VC stored → renewal record `renewed-active`.
   - **Old** VC renewal record → `cleanup-pending` with `replacementCredentialId`.
6. New VC shows green ribbon + **Active** on home and detail **only while** old VC cleanup is still pending.
7. Holder opens **old** VC detail → P3-6 cleanup CTA or **ลบเอกสารนี้** from menu (routes to same confirm dialog).
8. `confirmOldCredentialCleanup(oldCredentialId)`:
   - Removes old VC from storage.
   - Clears renewal on old id and **`renewed-active` on replacement**.
   - Clears lifecycle marker on old id if present.
   - Clears `wallet.key_rotation` when no pending renewal work remains.
9. New VC returns to normal presentation (no Active badge/ribbon); ⋮ menu returns when rotation metadata cleared.

Renewal is **per credential** and may complete in any order after one wallet rotation.

### 2.3 Coexistence with P6

- P6 holder revoke/delete and issuer suspension use `credentialLifecycle` + `issuerSuspension`.
- P3 renewal uses `credentialKeyRenewal` — separate storage and state machine.
- Badge precedence on home rows: P6 inactive → P3 renewal inactive → `shouldShowRenewedActiveBadge` → verified → new.

### 2.4 PID gate (ThaiNationalID)

- Other document types require a usable `ThaiNationalID` (`renewed-active` or no renewal record) before issuance/renewal.
- When ThaID not ready: notification dialog only (no **ขอเอกสาร** shortcut on gate).

---

## 3. State Machine

```
renewal-required
  │  submitRenewalRequest() → HTTP 201
  ▼
renewal-processing          ← one-shot; no "ขอเอกสาร"
  │  refreshAndCompleteRenewals() → offer-ready → auto-claim OK
  ▼
  ├─ [new VC]  renewed-active
  └─ [old VC]  cleanup-pending

  submit fails before 201     → renewal-required (retry)
  auto-claim fails on poll    → renewal-processing (retry on next poll)
```

| State | Credential | UI |
|---|---|---|
| `renewal-required` | Old VC | Grey ribbon (`ribbon_badge_inactive.png`), Inactive, **ขอเอกสาร** |
| `renewal-processing` | Old VC | Grey ribbon, Inactive, issuer-wait copy, no request CTA |
| `renewed-active` | **New** VC | Green ribbon (`ribbon_badge.png`, no tint) + **Active** **only if** same-type cleanup still pending |
| `cleanup-pending` | Old VC | Grey ribbon, Inactive, P3-6 cleanup CTA |
| `old-revoked` | Old VC | Treated like `cleanup-pending` for cleanup CTA (migration) |

After `confirmOldCredentialCleanup`: new VC has **no** renewal record; old VC removed.

---

## 4. UX and Visual Rules

### 4.1 Ribbon assets

| Asset | When |
|---|---|
| `assets/images/ribbon_badge_inactive.png` | `renewal-required`, `renewal-processing`, `cleanup-pending`, `old-revoked` on **old** VC |
| `assets/images/ribbon_badge.png` | **New** VC with `renewed-active` **and** `shouldShowRenewedActiveBadge()` true — **no `tintColor`** |

### 4.2 Badges and menus

- Home row: green **Active** only when `shouldShowRenewedActiveBadge(credentialType, renewalStatus)`.
- Detail overlay: same rule via `CredentialRenewalOverlay` + `renewalState`.
- **⋮ menu hidden** when `shouldHideCredentialActionMenu(renewalStatus)` (rotation record or any renewal metadata on credential).
- Present / My QR hidden when `isRenewalBlocked` on detail.

### 4.3 Explicit cleanup (no auto dialog)

- **No** automatic P3-6 dialog on focus.
- **No** auto-navigation to new VC after claim.
- Cleanup CTA on **old** VC detail only (`renewalCleanupCta` copy).
- Home: **ดูเอกสาร (เอกสารเดิม)** link while old VC awaits cleanup (reads storage directly for freshness).
- Home row has **no** delete button for old VC (delete on old detail only).

### 4.4 Presentation safety

Exclude from OID4VP matching when:

- P6 lifecycle revoked/deleted, or issuer suspension active, or
- P3 renewal record blocks presentation (`blocksCredentialPresentation` — `renewed-active` on **new** VC is presentable).

---

## 5. Architecture

### 5.1 Wallet key expiry detection

```
isWalletKeyExpired(now) =
  registeredAt exists AND now > registeredAt + WALLET_KEY_TTL_MS
```

- `registeredAt` from `wallet.key_registered_at` (meta MMKV).
- Legacy Keychain key without `registeredAt` → **not expired** until timestamp recorded.
- `WALLET_KEY_TTL_MS` in `src/config/walletKeyPolicy.ts` — 180 days prod, 5 minutes `__DEV__`.
- `useWalletKeyExpired` schedules timeout at expiry + rechecks on `AppState` active and key registration change.

### 5.2 Key rotation

`rotateWalletKey()`:

1. Keychain biometric gate via reading the current seed (single prompt for rotation).
2. Retain current seed in previous Keychain slot (`wallet.ed25519_seed.previous`) for old-VC OID4VP PoP.
3. New 32-byte Ed25519 seed → active Keychain.
4. Update cached public key and `wallet.key_registered_at`; notify `walletKeyExpiryWatch`.
5. Persist `WalletKeyRotationRecord` in meta storage (includes `previousHolderDid`).
6. For each stored credential bound to previous DID → `renewal-required`.

Previous seed is wiped by `clearPreviousWalletKey()` when `clearWalletKeyRotationRecord()` runs after all renewal cleanup completes.

### 5.3 Holder binding

`credentialHolderBinding.ts` — parse `cnf.kid` / `cnf.jwk` from `rawVc`; generic across VC types.

### 5.4 Renewal storage

**Key:** `credential:renewal:<credentialId>` (credential MMKV)

```ts
type CredentialRenewalState =
  | 'renewal-required'
  | 'renewal-processing'
  | 'old-revoked'
  | 'renewed-active'
  | 'cleanup-pending'

type CredentialRenewalRecord = {
  credentialId: string
  state: CredentialRenewalState
  previousHolderDid: string
  replacementCredentialId?: string
  revokedAt?: string
  renewedAt?: string
  updatedAt: string
}
```

### 5.5 Renewal orchestration (`credentialRenewalService.ts`)

| Function | Responsibility |
|---|---|
| `submitRenewalRequest(credentialId)` | POST renewal-request → silent OID4VP of old VC with previous-key PoP → on success `renewal-processing` |
| `presentOldCredentialForRenewal(...)` | Resolve Issuer OID4VP, build VP with previous seed, `direct_post` submit (no consent UI) |
| `refreshAndCompleteRenewals()` | Poll; auto-claim on `offer-ready` |
| `completeRenewalClaim(...)` | Internal: resolve + claim + write states |
| `confirmOldCredentialCleanup(credentialId)` | Remove old VC; clear old + replacement renewal; clear lifecycle; maybe `clearWalletKeyRotationRecord()` (async; also clears previous seed) |
| `repairInconsistentRenewalPairs()` | Poll-only repair; not during cleanup |
| `requestCredentialRenewal` | **Deprecated** — sync submit+claim |

### 5.6 Presentation helpers (`credentialRenewalPresentation.ts`)

| Function | Responsibility |
|---|---|
| `shouldShowRenewedActiveBadge(type, renewalStatus)` | `renewed-active` AND `findCleanupPendingForCredentialType(type)` |
| `shouldHideCredentialActionMenu(renewalStatus)` | `readWalletKeyRotationRecord()` OR any `renewalStatus` |

### 5.7 Polling triggers

- `app/(tabs)/index.tsx` — focus + 4s interval while any `renewal-processing`
- `app/(tabs)/credential/[id].tsx` — focus when `renewal-processing` on route id
- Scan tab: `submitRenewalRequest` only on `?renew=`; no poll

### 5.8 Dev server (`server/src/routes/devWallet.ts`)

**`POST /wallet/renewal-request`**

- Input: `{ credentialId, credentialType, oldHolderDid, newHolderDid, rawVc }`
- Creates Issuer credential-offer (proxy) and an OID4VP Authorization Request for the old VC
- Persists `state: 'requested'`, `vpAccepted: false`
- Response: `201 { accepted: true, authorizationRequest }` — Wallet must silent-present before offer becomes ready

**`POST /wallet/renewal-vp/response`**

- `application/x-www-form-urlencoded` `vp_token` + `state` (= credentialId)
- Dev-level VP shape check; on success sets `vpAccepted: true` and schedules `offer-ready`

**`GET /wallet/renewal-status`**

```ts
type DevRenewalStatusItem = {
  credentialId: string
  state: 'requested' | 'offer-ready' | 'revoked'
  offerUri?: string
  revokedAt?: string
}
```

- `requested` → `offer-ready` only after VP accepted and `DEV_RENEWAL_DELAY_MS` (default 8000) from that acceptance.

### 5.9 Home credential selection

`pickPreferredHomeCredential()` — prefer `renewed-active`, then normal (no renewal), then waiting states, then `cleanup-pending`.

---

## 6. UI Components and Screen Wiring

| Component / file | Role |
|---|---|
| `WalletKeyExpiryHost` | Tab layout; P3-1 modal + rotation handler |
| `useWalletKeyExpired` | Realtime expiry detection |
| `WalletKeyExpiredModal` | P3-1 UI |
| `CredentialRenewalOverlay` | Grey vs green ribbon + status pill on detail card |
| `CredentialDocumentDetailCard` | Passes `inactiveState`, `renewalBadgeLabel`, `renewalState` |
| `credentialInactiveState.ts` | P3 + P6 inactive derivation |
| `walletHomeCopy.ts` | Thai strings |
| `pidGateDialog.ts` | PID gate dialogs on home / scan |
| `app/(tabs)/index.tsx` | Renewal badges, expanded inactive row, **ดูเอกสารเดิม**, PID gate |
| `app/(tabs)/credential/[id].tsx` | Renewal CTA, cleanup dialog, hidden ⋮ during flow |
| `app/(tabs)/scan.tsx` | `?renew=` submit-only deep link |

All styling via NativeWind (`className`).

---

## 7. File Map

| File | Role |
|---|---|
| `src/config/walletKeyPolicy.ts` | TTL constants |
| `src/services/crypto/walletKeyRotation.ts` | Rotation record |
| `src/services/crypto/walletKeyExpiryWatch.ts` | Registration change listeners |
| `src/services/crypto/crypto.ts` | `forceRotateWalletKey`, `getWalletKeyRegisteredAt` |
| `src/hooks/useWalletKeyExpired.ts` | Expiry timer hook |
| `src/components/WalletKeyExpiryHost.tsx` | Tab-level expiry modal |
| `src/services/credentials/credentialHolderBinding.ts` | Holder DID from VC |
| `src/services/credentials/credentialKeyRenewal.ts` | Renewal storage + states |
| `src/services/credentials/credentialRenewalService.ts` | Orchestration |
| `src/services/credentials/credentialRenewalPresentation.ts` | Active badge + menu visibility |
| `src/services/credentials/renewalCleanupNotification.ts` | Cleanup-pending helpers |
| `src/services/credentials/credentialInactiveState.ts` | Inactive UI states |
| `src/services/credentials/credentialLifecycle.ts` | Lifecycle + `clearCredentialLifecycleStatus` |
| `src/services/credentials/credentialGuard.ts` | PID gate, home pick, submit guards |
| `src/services/credentials/pidGateDialog.ts` | PID gate copy + actions |
| `src/components/CredentialRenewalOverlay.tsx` | Ribbon + pill overlay |
| `src/components/CredentialDocumentDetailCard.tsx` | Detail card shell |
| `app/(tabs)/_layout.tsx` | `WalletKeyExpiryHost` |
| `app/(tabs)/index.tsx` | Wallet home renewal UX |
| `app/(tabs)/credential/[id].tsx` | Credential detail renewal UX |
| `server/src/routes/devWallet.ts` | Dev renewal endpoints |
| `server/src/services/devRenewalOffer.ts` | Offer simulation |

---

## 8. Error Handling and Edge Cases

| Case | Behavior |
|---|---|
| Submit network / HTTP error | Stay `renewal-required`; log; generic UI; retry allowed |
| Poll network error | No state change; retry next focus |
| Auto-claim failure | Stay `renewal-processing`; retry on next poll |
| Duplicate submit while processing | UI hidden; service throws `CredentialRenewalAlreadySubmitted` |
| Keychain key without `registeredAt` | Not expired until TTL baseline exists |
| Credential issued after rotation | No renewal record; bound to current DID → active |
| User dismisses P3-1 without rotating | Modal reappears when still expired (realtime hook) |
| P6 suspended + P3 renewal-required | P6 precedence for badge; both block presentation |
| Menu Delete on cleanup-pending old VC | Routes to P3-6 confirm dialog (not lifecycle-only delete) |
| Stuck `renewal-processing` after upgrade | `refreshAndCompleteRenewals` completes if server has `offer-ready` |
| `old-revoked` migration | Treated as cleanup-awaiting when `replacementCredentialId` set |

---

## 9. Test Plan

### Unit

- `walletKeyPolicy` / `isWalletKeyExpired` / `readMsUntilWalletKeyExpiry`
- `useWalletKeyExpired` (timer + registration listener) — manual/device
- `rotateWalletKey` + renewal records on bound credentials
- `submitRenewalRequest` does not call `claimCredential`
- `refreshAndCompleteRenewals` auto-claim path
- `confirmOldCredentialCleanup` removes old VC and clears replacement `renewed-active`
- `shouldShowRenewedActiveBadge` / `shouldHideCredentialActionMenu`
- `credentialInactiveState` P3 + P6 precedence
- `pickPreferredHomeCredential` / PID gate helpers

### Integration

- Rotate key → submit → poll → Active on new VC while old pending → cleanup once → normal VC, rotation cleared
- Failed POST → retry → success
- Realtime expiry modal without user action

### Server

- `renewal-request` returns 201 `{ accepted: true }`
- `renewal-status` `requested` → `offer-ready` after delay

---

## 10. Out of Scope (v1)

- Production issuer renewal API and VC Status Registry integration
- Per-credential Ed25519 keys (contradicts ADR 0008)
- Push notifications (poll-on-focus only)
- P3-4 modal on happy path
- Home dismissible “ได้รับเอกสารใหม่แล้ว” banner (removed — detail/home link only)
- NFC-based renewal
- Backend `importCredential` sync for renewal

---

## 11. Implementation Notes

- Preserve biometric sign-time gate on rotation and claim PoP.
- Every caught error: raw diagnostic log with scoped tag before generic UI message.
- Update `docs/TASKS.md` after each implementation slice.
- Run `yarn tsc --noEmit`, `yarn test`, `yarn lint`, `cd server && yarn test` before merge.
