# P6 Wallet Gap Closure — Design Spec

> **Status:** Implemented — Slice 1 + Slice 2 (2026-07-13)  
> **Date:** 2026-07-13  
> **Scope:** Wallet-owned P6 sequence steps only. Peer lanes (Issuer, Verifier, VC Status Registry, Audit Trail) remain out of scope.

---

## 1. Problem

P6 audit (2026-07-13) scored Wallet steps at **3 Done / 5 Partial / 2 Missing** (80% Done+Partial). Two gaps are closable without ecosystem services or ADR 0009 changes:

| Slice | Steps | Gap |
|---|---|---|
| **Slice 1** | 23, 25 | Single-use credentials are not auto-marked `Used` after a successful presentation |
| **Slice 2** (deferred) | 7–8, 10–11 | Holder revoke has no Nonce + PoP JWT |

Steps **20** and **24** (per-credential key destruction) remain **accepted deviations** per ADR 0009.

---

## 2. Decision: Incremental delivery (Approach A)

Deliver **Slice 1** first, then **Slice 2** in a separate change set.

**Why not one PR:** Slice 1 is Wallet-only and low risk. Slice 2 changes auth UX (one biometric rule) and DEV Issuer routes. Independent test and rollback paths.

---

## 3. Slice 1 — Auto single-use consumption

### 3.1 Goal

After a **successful** presentation of a credential whose schema is flagged `singleUse`, the Wallet must:

1. Mark the credential `Used` via `recordCredentialLifecycleAction(credentialId, 'Used', 'system')`.
2. Block further presentation through existing `credentialGuard` / lifecycle filters.
3. Surface Holder-visible feedback on the success path (history + inactive badge; optional success-screen copy).

This matches P6 Case 3 steps **23** and **25** at the Wallet layer. Step **22** (Verifier ack) stays **Peer**. Step **24** (key destroy) stays **Missing** (ADR 0009).

### 3.2 Config

Add optional field to `CardSchemaConfig` in `src/config/cardSchemas.ts`:

```ts
/** When true, first successful presentation marks credential Used (P6 Case 3). */
singleUse?: boolean
```

**v1 defaults:**

| Schema type | `singleUse` | Rationale |
|---|---|---|
| `MedicalCertificate` (ใบรับรองแพทย์) | `true` | Only document type that consumes on first successful presentation (P6 Case 3) |
| `ThaiNationalID` | `false` | Reusable ID; `id_card/P6.md` omits Case 3 |
| `DLTDrivingLicence` | `false` | Reusable licence |
| `ChulalongkornUniversityTranscript` | `false` | Transcript is not single-use in product scope |

**Note:** `MedicalCertificate` schema added in Slice 1 with `singleUse: true` (minimal card config). Hook is active only for credentials stored with `type: MedicalCertificate`.

No `EXPO_PUBLIC_*` env var — this is document-type policy, not a timing window.

### 3.3 Trigger points

Invoke consumption **only after presentation is considered successful**:

| Channel | Success signal today | Hook location |
|---|---|---|
| OID4VP (Scan tab) | HTTP 2xx from `submitPresentationResponse` | After `recordSuccessfulPresentation` in `app/(tabs)/scan.tsx` **or** inside `recordSuccessfulPresentation` |
| Wallet-initiated My QR | Session status `consumed` | After `recordWalletInitiatedPresentationHistory` in `useWalletInitiatedVpQrSession.ts` **or** inside that helper |

**Recommended:** one shared function to avoid drift:

```ts
// src/services/credentials/singleUseCredentialConsumption.ts
export function maybeConsumeSingleUseCredential(input: {
  credentialId: string
  credentialType: string
}): { consumed: boolean }
```

Called from:

- `recordSuccessfulPresentation` (OID4VP)
- `recordWalletInitiatedPresentationHistory` (My QR)

### 3.4 Guards (idempotency)

Before writing `Used`:

- `getCardSchema(type).singleUse !== true` → no-op
- Existing lifecycle `revoked` / `deleted` / `used` → no-op (do not downgrade or duplicate history)
- Issuer suspension pending → still allow `Used` if presentation already succeeded (presentation succeeded implies credential was presentable at submit time; guard already blocked inactive credentials pre-present)

`recordCredentialLifecycleAction` already appends `credential-used` history and sets MMKV lifecycle key.

### 3.5 Holder notification (step 25)

Minimum (v1):

- Existing **inactive badge** (`used`) on Wallet home and credential detail via `credentialInactiveState`.
- Existing **history row** (`credential-used`).

Optional copy on success screens (same PR if small):

- Scan `presentationSuccess` / `presentationInfo` phase: one line when `consumed === true` (Thai: e.g. "เอกสารนี้ใช้สิทธิ์ครบแล้วและถูกปิดการใช้งาน").
- My QR `verified` phase: same message.

No modal, no push — YAGNI for Slice 1.

### 3.6 Error handling

- Consumption failure must **not** fail the presentation success path (presentation already succeeded to Verifier).
- Log raw error with tag `[single-use-consume]` before any UI mapping.
- If lifecycle write fails, Holder still sees presentation success; lifecycle can be repaired via DEV `mark-used` until retried.

### 3.7 Testing

| Test | File |
|---|---|
| `maybeConsumeSingleUseCredential` no-op when `singleUse` false | `singleUseCredentialConsumption.test.ts` |
| Marks `Used` + history when `singleUse` true | same |
| Idempotent when already `used` | same |
| `recordSuccessfulPresentation` does **not** consume Transcript / ThaiNationalID | extend `presentationHistory.test.ts` |
| `maybeConsumeSingleUseCredential` consumes when type is `MedicalCertificate` | `singleUseCredentialConsumption.test.ts` |
| `recordWalletInitiatedPresentationHistory` triggers consumption for medical type | extend wallet-initiated presentation tests |

### 3.8 Files touched (estimate)

- `src/config/cardSchemas.ts` — `singleUse` field; `MedicalCertificate` entry with `singleUse: true` (minimal schema when added)
- `src/services/credentials/singleUseCredentialConsumption.ts` — new
- `src/services/history/presentationHistory.ts` — call maybeConsume
- `src/services/vp/walletInitiatedPresentation.ts` — call maybeConsume
- `app/(tabs)/scan.tsx` — optional success copy (if not handled in service layer return)
- `docs/TASKS.md` — mark Slice 1 complete after implementation

---

## 4. Slice 2 — Holder revoke PoP (deferred)

**Not in Slice 1.** Documented here for sequencing only.

### 4.1 Goal

Match P6 holder-initiated steps **8, 10, 11** (Wallet) with DEV Issuer stand-in for steps **9, 12** (Peer verify, but DEV implements for local test).

### 4.2 Flow

1. Wallet `GET` or `POST` DEV nonce for `{ credentialId, holderDid }`.
2. Wallet signs nonce with wallet-level Ed25519 via existing `signProof` (biometric = **only** auth prompt — remove redundant PIN gate before revoke per one-prompt rule).
3. Wallet `POST` holder-revoke with `{ credentialId, holderDid, popJwt }`.
4. DEV Issuer verifies EdDSA PoP (nonce, aud, iss/sub = holder DID).
5. On `201`, existing `recordCredentialLifecycleAction('Revoke')` unchanged.

### 4.3 Out of scope for Slice 2

- Production Issuer contract (peer).
- Per-credential signing keys (ADR 0009).
- VC Status Registry / Audit Trail writes.

### 4.4 Prerequisite

Slice 1 merged and device-tested before starting Slice 2.

---

## 5. Success criteria

### Slice 1

- [ ] Present **MedicalCertificate** via OID4VP Scan → credential shows `used` badge; second presentation blocked.
- [ ] Present **MedicalCertificate** via My QR until Verifier consumes → same behavior.
- [ ] Present Transcript or ThaiNationalID → **not** auto-used.
- [ ] `yarn test` + `yarn tsc --noEmit` pass.

### Slice 2 (later)

- [ ] Revoke Transcript without prior PIN when PoP sign provides auth; Issuer DEV verifies PoP.
- [ ] Reject path unchanged (error UI).

---

## 6. Related documents

- `docs/User_Journey/transcript/P6.md` — Case 3
- `docs/adr/0009-wallet-level-holder-signing-key.md` — key destruction deferred
- `docs/TASKS.md` — User Journey Gap Backlog
- `docs/superpowers/specs/2026-06-25-p6-case2-issuer-suspension-design.md` — Case 2 (already shipped)
