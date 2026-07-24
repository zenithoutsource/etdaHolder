# Per-Credential Signing Keys (v2 Crypto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 single wallet `did:key` (ADR 0009) with `k_attest` + per-credential `k_cred` keys (Approach A: Keychain service per key), gated until Wallet Provider WUA/WIA is available via dev mock + client.

**Architecture:** New modules under `src/services/crypto/` (`walletAttestKey`, `credentialSigningKey`, `credentialKeyRegistry`, `walletAttestClient`). Issuance uses a **pending key** before `credentialId` exists, then binds after `saveCredentialRecord`. Presentation and renewal sign with `credentialId`-scoped keys. Dev `server/` exposes reference WP attest routes. v2 flag enables only after successful activation attest.

**Tech Stack:** Expo SDK 54, `react-native-keychain`, `@noble/ed25519`, encrypted MMKV, Jest, Express (dev WP mock).

**Spec:** `docs/superpowers/specs/2026-07-24-per-credential-signing-keys-design.md`

## Global Constraints

- Ed25519 / `alg: EdDSA` on the wire (ADR 0008 unchanged).
- Keychain-protected software seeds; biometric sign-time gate only — **one prompt per user action**.
- No secrets, seeds, WUA/WIA, or VC payloads in logs; raw diagnostic log before generic UI errors.
- Configurable TTLs via `process.env.EXPO_PUBLIC_<NAME>` with defaults in `.env.example` (unit + default + effect).
- NativeWind for any UI; no `StyleSheet` for new UI.
- Ship **k_attest + per-doc keys together**; `wallet.crypto.v2_enabled` false until WP attest succeeds.
- **Greenfield:** v1 single-key wallets show re-issue required — no in-place migration.
- Yarn only; run `yarn tsc --noEmit`, `yarn lint`, focused tests per task.
- Do not add customer org name to new identifiers (use `wallet`, `walletProvider`, neutral names).

---

## File map

| File | Action |
|------|--------|
| `docs/adr/0010-per-credential-signing-keys.md` | **Create** — supersedes ADR 0009 |
| `src/config/walletCryptoPolicy.ts` | **Create** — v2 flag key, pending key TTL env |
| `src/services/crypto/credentialKeyRegistry.ts` | **Create** — MMKV index |
| `src/services/crypto/credentialSigningKey.ts` | **Create** — per-cred key lifecycle |
| `src/services/crypto/walletAttestKey.ts` | **Create** — k_attest |
| `src/services/crypto/walletAttestClient.ts` | **Create** — WP HTTP client + types |
| `src/services/crypto/crypto.ts` | **Modify** — route to credential-scoped APIs; deprecate global holder DID for protocol |
| `src/services/crypto/walletKeyRotation.ts` | **Modify** — remove wallet-wide rotation; per-credential only |
| `src/services/vci/exchangeService.ts` | **Modify** — pending key + per-cred PoP + WUA/WIA on request |
| `src/services/vp/presentationApproval.ts` | **Modify** — sign with credential key |
| `src/services/vp/walletInitiatedPresentation.ts` | **Modify** — KB-JWT with credential key |
| `src/services/credentials/credentialKeyRenewal.ts` | **Modify** — new key on renewal; destroy old |
| `src/services/credentials/credentialLifecycle.ts` | **Modify** — P6 destroy key hook |
| `app/_layout.tsx` | **Modify** — activation attest after storage + v1 detection |
| `server/src/routes/walletProviderAttest.ts` | **Create** — dev mock WUA/WIA |
| `server/src/config.ts` | **Modify** — WP base URL, attest TTL |
| `server/src/testApp.ts` | **Modify** — mount mock route |
| `.env.example` | **Modify** — mobile WP URL, pending key TTL |
| `server/.env.example` | **Modify** — WP mock config |
| `docs/TASKS.md` | **Modify** — reference spec + plan |

---

### Task 1: ADR 0010 + policy config

**Files:**
- Create: `docs/adr/0010-per-credential-signing-keys.md`
- Create: `src/config/walletCryptoPolicy.ts`
- Test: `src/config/walletCryptoPolicy.test.ts`

**Interfaces:**
- Produces: `readIssuancePendingKeyTtlMs(): number`, `WALLET_CRYPTO_V2_META_KEY`, `WALLET_ATTEST_WUA_KEY`, `WALLET_ATTEST_WIA_KEY`

- [ ] **Step 1: Write failing test**

```typescript
import { readIssuancePendingKeyTtlMs, WALLET_CRYPTO_V2_META_KEY } from './walletCryptoPolicy'

test('readIssuancePendingKeyTtlMs defaults to 30 minutes', () => {
  delete process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS
  expect(readIssuancePendingKeyTtlMs()).toBe(1_800_000)
})

test('exports stable meta keys', () => {
  expect(WALLET_CRYPTO_V2_META_KEY).toBe('wallet.crypto.v2_enabled')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/config/walletCryptoPolicy.test.ts`

- [ ] **Step 3: Implement policy + ADR 0010**

`walletCryptoPolicy.ts`:

```typescript
export const WALLET_CRYPTO_V2_META_KEY = 'wallet.crypto.v2_enabled'
export const WALLET_ATTEST_WUA_KEY = 'wallet.attest.wua'
export const WALLET_ATTEST_WIA_KEY = 'wallet.attest.wia'

export function readIssuancePendingKeyTtlMs(): number {
  return Number(process.env.EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS) || 1_800_000
}
```

ADR 0010: copy decision summary from spec; mark ADR 0009 superseded.

- [ ] **Step 4: Document env in `.env.example`**

```bash
# ms, default 1800000 (30 min). GC orphan issuance pending keys older than this.
# EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS=1800000
```

- [ ] **Step 5: Run** `yarn test src/config/walletCryptoPolicy.test.ts && yarn tsc --noEmit`

---

### Task 2: Credential key registry (MMKV index)

**Files:**
- Create: `src/services/crypto/credentialKeyRegistry.ts`
- Test: `src/services/crypto/credentialKeyRegistry.test.ts`

**Interfaces:**
- Produces:

```typescript
export type CredentialKeyRecord = {
  credentialId: string
  holderDid: string
  keychainService: string
  credentialType: string
  createdAt: string
}

export function registerCredentialKey(record: CredentialKeyRecord): void
export function getCredentialKeyRecord(credentialId: string): CredentialKeyRecord | undefined
export function removeCredentialKeyRecord(credentialId: string): void
export function listCredentialKeyRecords(): CredentialKeyRecord[]
```

- [ ] **Step 1: Write failing tests** for register/get/remove/list (mock `getMetaStorage` like `crypto.test.ts`).
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** immutable read/write against meta MMKV prefix `wallet.credential_keys.`
- [ ] **Step 4: Run** `yarn test src/services/crypto/credentialKeyRegistry.test.ts`

---

### Task 3: Per-credential signing key (generate, sign, destroy, pending)

**Files:**
- Create: `src/services/crypto/credentialSigningKey.ts`
- Test: `src/services/crypto/credentialSigningKey.test.ts`
- Modify: `src/__mocks__/react-native-keychain.ts` if needed for multi-service

**Interfaces:**
- Consumes: `credentialKeyRegistry`, `crypto.ts` helpers (`ed25519PublicKeyToDidKey`, Keychain AC options)
- Produces:

```typescript
export function createPendingCredentialKey(): string // returns pendingId
export function bindPendingKeyToCredential(pendingId: string, credentialId: string, credentialType: string): CredentialKeyRecord
export function getCredentialHolderDid(credentialId: string): string
export async function signWithCredentialKey(credentialId: string, message: Uint8Array): Promise<Uint8Array>
export async function destroyCredentialKey(credentialId: string): Promise<void>
export function gcStalePendingKeys(now?: Date): number
```

Keychain service pattern: `wallet.ed25519_seed.cred.${id}` where `id` is pendingId then rebound to credentialId (delete pending service after bind).

- [ ] **Step 1: Test** `createPendingCredentialKey` returns unique id and stores retrievable seed.
- [ ] **Step 2: Test** `bindPendingKeyToCredential` moves key to credentialId service + registry entry with valid `did:key`.
- [ ] **Step 3: Test** `signWithCredentialKey` produces verifiable Ed25519 signature.
- [ ] **Step 4: Test** `destroyCredentialKey` removes Keychain + registry; subsequent sign throws.
- [ ] **Step 5: Test** `gcStalePendingKeys` removes pending older than TTL.
- [ ] **Step 6: Implement** minimal code to pass; reuse `assertEd25519SeedLength` patterns from `crypto.ts`.
- [ ] **Step 7: Run** `yarn test src/services/crypto/credentialSigningKey.test.ts`

---

### Task 4: Wallet attest key (`k_attest`)

**Files:**
- Create: `src/services/crypto/walletAttestKey.ts`
- Test: `src/services/crypto/walletAttestKey.test.ts`

**Interfaces:**
- Produces:

```typescript
export async function ensureWalletAttestKey(): Promise<{ holderDid: string; publicJwk: JsonWebKey }>
export function readWalletAttestPublicJwk(): JsonWebKey | undefined
export async function destroyWalletAttestKey(): Promise<void>
```

Keychain service: `wallet.ed25519_seed.attest` (separate from any `k_cred`).

- [ ] **Step 1–4:** TDD generate/read/destroy attest key; `did:key` from attest pubkey is **not** used for VC PoP — only `publicJwk` goes to WP.
- [ ] **Step 5: Run tests**

---

### Task 5: Wallet Provider client + dev mock server

**Files:**
- Create: `src/services/crypto/walletAttestClient.ts`
- Create: `server/src/routes/walletProviderAttest.ts`
- Modify: `server/src/testApp.ts`, `server/src/config.ts`, `server/.env.example`
- Test: `src/services/crypto/walletAttestClient.test.ts`, `server/src/routes/walletProviderAttest.test.ts`

**Interfaces:**
- Produces (mobile):

```typescript
export type WalletAttestation = { wua: string; wia: string; expiresAt: string }

export function createWalletAttestClient(baseUrl?: string): {
  requestAttestations(input: { pubKAttestJwk: JsonWebKey }): Promise<WalletAttestation>
}
```

Dev server route:

```
POST /v1/wallet-attestations
Body: { pubKAttestJwk: JsonWebKey }
Response 201: { wua, wia, expiresAt }
```

Mock WUA/WIA: signed opaque JWTs or base64url blobs with `typ: wallet-attestation+jwt` — **no real WP crypto in v1 mock**; include `sub` = thumbprint of `pubKAttestJwk` for contract tests.

- [ ] **Step 1: Server test** POST returns 201 + TTL from `WALLET_ATTEST_TTL_MS` env.
- [ ] **Step 2: Implement server route + config**
- [ ] **Step 3: Mobile client test** against `fetch` mock
- [ ] **Step 4: Implement client**; base URL from `EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL`
- [ ] **Step 5: Document env** in `.env.example` and `server/.env.example`
- [ ] **Step 6: Run** `cd server && yarn test walletProviderAttest` and `yarn test src/services/crypto/walletAttestClient.test.ts`

---

### Task 6: Activation gate (startup + v1 detection)

**Files:**
- Modify: `app/_layout.tsx`
- Create: `src/services/crypto/walletCryptoActivation.ts`
- Test: `src/services/crypto/walletCryptoActivation.test.ts`

**Interfaces:**
- Consumes: `ensureWalletAttestKey`, `createWalletAttestClient`, meta keys from `walletCryptoPolicy`
- Produces:

```typescript
export async function activateWalletCryptoV2(): Promise<void>
export function isWalletCryptoV2Enabled(): boolean
export function detectLegacySingleKeyWallet(): boolean
```

- [ ] **Step 1: Test** v2 disabled when attest fails; enabled when mock returns WUA/WIA.
- [ ] **Step 2: Test** `detectLegacySingleKeyWallet` true when old `etda.wallet.ed25519_seed` exists without v2 flag.
- [ ] **Step 3: Wire** after storage init in `_layout.tsx`: if legacy → block with re-issue screen; else if !v2 → `activateWalletCryptoV2()`.
- [ ] **Step 4: Run** focused tests + `yarn tsc --noEmit`

---

### Task 7: OID4VCI claim — per-credential PoP

**Files:**
- Modify: `src/services/vci/exchangeService.ts`
- Modify: `src/services/crypto/crypto.ts` (`signProof` accepts `credentialKeyId: string`)
- Test: extend `src/services/vci/exchangeService.test.ts`

**Interfaces:**
- Consumes: `createPendingCredentialKey`, `bindPendingKeyToCredential`, `signWithCredentialKey`, cached WUA/WIA from meta storage
- Produces: `claimCredential` binds key after save; PoP `iss`/`sub` = per-credential `did:key`

- [ ] **Step 1: Test** claim flow calls `createPendingCredentialKey` before `signProof`.
- [ ] **Step 2: Test** after save, registry contains credential's `did:key`.
- [ ] **Step 3: Test** PoP JWT payload `iss`/`sub` match bound `did:key` (not global).
- [ ] **Step 4: Implement**; attach WUA/WIA to credential request body when v2 enabled (field names per mock contract).
- [ ] **Step 5: Run** `yarn test src/services/vci/exchangeService.test.ts -t "per-credential"`

---

### Task 8: Presentation — credential-scoped signing

**Files:**
- Modify: `src/services/vp/presentationApproval.ts`
- Modify: `src/services/vp/walletInitiatedPresentation.ts`
- Modify: `src/services/crypto/crypto.ts` (`signSdJwtKbPresentationToken` takes `credentialId`)
- Test: `src/services/vp/presentationService.test.ts`, `walletInitiatedPresentation.test.ts`

- [ ] **Step 1: Test** KB-JWT verifies against credential's `cnf.jwk` / `did:key`, not wallet-global key.
- [ ] **Step 2: Implement** routing `credentialId` through presentation approval path.
- [ ] **Step 3: Run** focused VP tests

---

### Task 9: P3 renewal — new key, destroy old

**Files:**
- Modify: `src/services/credentials/credentialKeyRenewal.ts` (or `credentialRenewalService.ts`)
- Test: `src/services/credentials/credentialKeyRenewal.test.ts`

- [ ] **Step 1: Test** renewal claim creates new pending key; on success `destroyCredentialKey(oldId)` called.
- [ ] **Step 2: Remove** wallet-wide `rotateWalletKey` marking all credentials (deprecate export; keep no-op or delete per greenfield policy).
- [ ] **Step 3: Run** renewal tests

---

### Task 10: P6 — destroy document key

**Files:**
- Modify: `src/services/credentials/credentialLifecycle.ts`
- Test: `src/services/credentials/credentialLifecycle.test.ts`

- [ ] **Step 1: Test** `recordCredentialLifecycleAction('Revoke' | 'Delete' | 'Used')` calls `destroyCredentialKey`.
- [ ] **Step 2: Test** presentation filter still blocks destroyed credential.
- [ ] **Step 3: Implement** hook after issuer-confirmed paths (match existing lifecycle choke point).
- [ ] **Step 4: Run** lifecycle tests

---

### Task 11: Deprecate global holder DID + backend sync

**Files:**
- Modify: `src/services/vci/exchangeService.ts` (`syncCredentialToBackend`)
- Modify: `src/services/crypto/crypto.ts`
- Test: exchangeService sync test uses per-credential DID

- [ ] **Step 1: Test** `importCredential` payload `associated_did` = `getCredentialHolderDid(credentialId)`.
- [ ] **Step 2: Mark** `getHolderDid()` deprecated; internal callers migrated.
- [ ] **Step 3: Run** `yarn test src/services/vci/exchangeService.test.ts -t sync`

---

### Task 12: Docs + verification sweep

**Files:**
- Modify: `docs/TASKS.md`, `docs/adr/0009-wallet-level-holder-signing-key.md` (status → Superseded by 0010)
- Modify: `AGENTS.md` handoff if it references single-key (optional one-line)

- [ ] **Step 1: Update** `docs/TASKS.md` with v2 crypto backlog entry linking spec + plan.
- [ ] **Step 2: Run** `yarn test`, `yarn tsc --noEmit`, `yarn lint`
- [ ] **Step 3: Run** `cd server && yarn test && yarn tsc`

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| k_attest + WUA/WIA | 4, 5, 6 |
| Per-credential did:key | 3, 7 |
| Pending key before credentialId | 3, 7 |
| Presentation per cred | 8 |
| P3 destroy old key | 9 |
| P6 destroy key | 10 |
| Greenfield v1 detection | 6 |
| Ship together gate | 5, 6 (v2 flag off until attest) |
| One biometric per action | 3, 4 (reuse existing Keychain AC) |
| ADR supersede | 1, 12 |

No TBD placeholders in task list.

---

## Execution handoff

**Plan saved to** `docs/superpowers/plans/2026-07-24-per-credential-signing-keys.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach do you want?
