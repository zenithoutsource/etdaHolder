# P3 Wallet Key Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` when implementing this plan.

**Goal:** Implement wallet key expiry detection, holder DID rotation, per-credential renewal state, and the first end-to-end development renewal loop defined in `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md`.

**Architecture:** Keep wallet key expiry policy in `src/config/`, key rotation in `src/services/crypto/`, holder-binding + renewal state in `src/services/credentials/`, and reuse the existing OID4VCI claim/save flow plus presentable-credential filtering. P6 revoked/deleted/suspension behavior keeps precedence over P3 renewal state.

**Tech Stack:** Expo SDK 54, React Native, NativeWind, Jest, Express test app

---

### Task 1: Key expiry and rotation primitives

**Files:**
- Create: `src/config/walletKeyPolicy.ts`
- Create: `src/services/crypto/walletKeyRotation.ts`
- Modify: `src/services/crypto/crypto.ts`

- [ ] Add wallet key TTL policy and expiry helper
- [ ] Add forced Ed25519 key rotation with updated registration timestamp
- [ ] Persist wallet rotation metadata for the previous Holder DID

### Task 2: Credential holder binding and renewal state

**Files:**
- Create: `src/services/credentials/credentialHolderBinding.ts`
- Create: `src/services/credentials/credentialKeyRenewal.ts`
- Modify: `src/services/credentials/credentialInactiveState.ts`
- Modify: `src/services/credentials/credentialLifecycle.ts`
- Modify: `src/services/credentials/storedCredentials.ts`

- [ ] Parse `cnf.kid` / `cnf.jwk` holder binding from stored credentials
- [ ] Track `renewal-required` through `cleanup-pending` records in storage
- [ ] Block presentation for renewal-state credentials and merge renewal into inactive/badge derivation

### Task 3: Renewal orchestration and dev server

**Files:**
- Create: `src/services/credentials/credentialRenewalService.ts`
- Modify: `server/src/routes/devWallet.ts`

- [ ] Request renewal offers from the dev wallet API
- [ ] Reuse `resolveOffer()` + `claimCredential()` for reissuance
- [ ] Confirm old-credential cleanup and expose dev renewal polling endpoints

### Task 4: Wallet UI wiring

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/credential/[id].tsx`
- Modify: `app/(tabs)/scan.tsx`
- Modify: `src/components/CredentialDocumentDetailCard.tsx`
- Modify or create small copy/helpers/components as needed

- [ ] Show wallet key expiry prompt and rotate once per expiry event
- [ ] Surface renewal-required / renewed-active states in home and detail
- [ ] Route renewal CTA through scan/detail flow and cleanup acknowledgement

### Task 5: Tests, docs, and verification

**Files:**
- Modify: `src/services/crypto/crypto.test.ts`
- Create/modify: renewal-focused Jest tests under `src/services/credentials/`
- Modify: `server/src/testApp.test.ts`
- Modify: `docs/TASKS.md`

- [ ] Cover expiry detection, rotation, holder binding, renewal state, and presentable filtering
- [ ] Cover dev renewal request/status endpoints
- [ ] Run `yarn tsc --noEmit`, `yarn lint`, and focused `yarn test`
