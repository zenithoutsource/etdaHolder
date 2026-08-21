# Defer First-Install Keychain Biometric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop blank cold-start Keychain biometric prompts; every new-credential claim uses one biometric bind write while keeping lasting credential seeds biometric-bound.

**Architecture:** Skip wallet-seed/`k_attest` create on cold start. Add `withIssuanceKeySession` that keeps the pending seed in memory through PoP, activates v2 with attest reuse, then performs one biometric Keychain write at bind to `cred.{credentialId}`. Push registers under the first credential Holder DID after claim (or on startup when a credential DID already exists).

**Tech Stack:** Expo/React Native, `react-native-keychain`, existing OID4VCI claim path (`exchangeService`, `dualFormatIssuance`), Jest.

## Global Constraints

- Do not use the customer org name "ETDA" in new identifiers.
- One biometric prompt per user action; no app-level gate in front of the bind Keychain write.
- Lasting bound credential seed must use `BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM`.
- `k_attest` write is device-bound (no biometric prompt); reuse cached JWK / existing key; never overwrite on retry.
- Cold start never calls `ensureWalletAttestKey` / `activateWalletCryptoV2` / `generateWalletKeyIfNeeded` for greenfield.
- No secrets/PII in logs; update `docs/TASKS.md` when the slice ships.
- Spec: `docs/superpowers/specs/2026-08-07-defer-first-install-keychain-biometric-design.md`

## File map

| File | Responsibility |
|---|---|
| `src/services/crypto/walletAttestKey.ts` | Device-bound attest write; cache-first ensure that never overwrites |
| `src/services/crypto/issuanceKeySession.ts` | `withIssuanceKeySession` + in-memory proof/bind session |
| `src/services/crypto/issuanceKeySession.test.ts` | Session unit tests |
| `src/services/crypto/walletAttestKey.test.ts` | Attest reuse / no-overwrite tests |
| `src/services/crypto/credentialSigningKey.ts` | Export helpers needed for in-memory bind (or keep bind logic in session via existing `bindPendingKeyWithSeed` patterns) |
| `src/services/vci/exchangeService.ts` | Enter issuance session when no proof session supplied |
| `src/services/credentials/dualFormatIssuance.ts` | Same for dual-format entry |
| `app/_layout.tsx` | Defer key create/activate/push DID |
| `src/services/notifications/*` or claim callers | Push after first credential DID |
| `docs/TASKS.md` | Handoff note |

---

### Task 1: Device-bound attest key with cache-first reuse

**Files:**
- Modify: `src/services/crypto/walletAttestKey.ts`
- Test: `src/services/crypto/walletAttestKey.test.ts`

**Interfaces:**
- Produces: `ensureWalletAttestKey()` returns cached JWK without Keychain get when cache exists; creates with device-bound options only when absent; never overwrites existing Keychain/cache

- [ ] **Step 1:** Add failing tests for cache hit (no `getGenericPassword`/`setGenericPassword`), create-when-missing (device-bound set options, no `BIOMETRY_*`), and no-overwrite when cache exists.
- [ ] **Step 2:** Implement: if `readCachedAttestPublicJwk()` present → return without Keychain I/O; else create seed, write with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (no biometric access control), cache JWK.
- [ ] **Step 3:** Run `yarn test src/services/crypto/walletAttestKey.test.ts` — PASS
- [ ] **Step 4:** Commit

### Task 2: Issuance key session

**Files:**
- Create: `src/services/crypto/issuanceKeySession.ts`
- Create: `src/services/crypto/issuanceKeySession.test.ts`
- Modify: `src/services/crypto/credentialSigningKey.ts` as needed to support memory-seed bind

**Interfaces:**
- Produces:
```ts
withIssuanceKeySession<T>(run: (session: IssuanceKeySession) => Promise<T>): Promise<T>
type IssuanceKeySession = {
  pendingCredentialKeyId: string
  proofSession: ProofSigningSession
  activateV2IfNeeded: () => Promise<void>
}
```
- `proofSession.signProof` uses in-memory seed (no Keychain get)
- `proofSession.bindCredentialKey` performs the single biometric `setGenericPassword` to `wallet.ed25519_seed.cred.{credentialId}`, registers registry row, clears pending meta
- `activateV2IfNeeded` no-ops if v2 enabled; else `ensureWalletAttestKey` + WUA/WIA + set v2 flag

- [ ] **Step 1:** Failing tests: one Keychain biometric set at bind only; PoP does not get; activate reuses attest; cancel/wipe clears memory; no pending Keychain seed written before bind
- [ ] **Step 2:** Implement session module
- [ ] **Step 3:** Tests PASS
- [ ] **Step 4:** Commit

### Task 3: Wire claim paths

**Files:**
- Modify: `src/services/vci/exchangeService.ts`
- Modify: `src/services/credentials/dualFormatIssuance.ts`
- Test: existing per-credential / dual-format tests + focused additions

**Interfaces:**
- Consumes: `withIssuanceKeySession`
- When caller omits `proofSession` / `pendingCredentialKeyId`, wrap claim in session + `activateV2IfNeeded` before v2 branches

- [ ] **Step 1:** Failing/adjusted tests for first claim without pre-enabled v2
- [ ] **Step 2:** Wire wrap; ensure no double `createPendingCredentialKey` / `createProofSigningSession`
- [ ] **Step 3:** On bind cancel after MMKV save, roll back credential record
- [ ] **Step 4:** Tests PASS
- [ ] **Step 5:** Commit

### Task 4: Cold start + push DID

**Files:**
- Modify: `app/_layout.tsx`
- Modify: push registration helper as needed
- Test: startup-focused unit tests if present; otherwise manual checklist in TASKS

- [ ] **Step 1:** Remove eager `generateWalletKeyIfNeeded` / `activateWalletCryptoV2` from greenfield cold start; keep legacy detection without creating keys
- [ ] **Step 2:** Push: on startup only if a credential Holder DID exists; after first successful claim register that DID
- [ ] **Step 3:** Commit

### Task 5: Docs + verification

- [ ] Update `docs/TASKS.md` handoff
- [ ] Run `yarn test` (focused suites) + `yarn tsc --noEmit`
- [ ] Commit

## Spec coverage check

| Spec requirement | Task |
|---|---|
| No cold-start create/retrieve | 4 |
| Device-bound attest + reuse | 1 |
| Memory pending + one biometric bind | 2–3 |
| activateV2 before claim v2 branches | 3 |
| Later new-credential claims same session | 3 |
| Push first credential DID | 4 |
| Presentation unchanged | N/A (no present path change) |
