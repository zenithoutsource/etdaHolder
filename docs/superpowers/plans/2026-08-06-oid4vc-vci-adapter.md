# OID4VC VCI Adapter (`@openid4vc/openid4vci`) — Implementation Plan

> **Status:** Phase 2/2.5/3 **complete** (2026-08-06). Legacy VCI client packages removed; oid4vc is the only VCI path.

**Goal:** ~~Ship a feature-flagged~~ Ship the OID4VCI protocol adapter for Pre-Authorized Code + Authorization Code + dual-format issuance via `@openid4vc/openid4vci`; wallet-owned PoP signing, issuer verify, storage, and orchestration stay in `exchangeService.ts`.

**Architecture:** `src/services/vci/oid4vc/` → always-on oid4vc path → `ResolvedCredentialOffer.protocolPath: 'oid4vc'` with `oid4vcContext` required through claim.

**Tech Stack:** Expo SDK 54, Hermes, Jest, `@openid4vc/openid4vci@0.5.4`, existing `exchangeService.ts`.

**Spec:** `docs/superpowers/specs/2026-08-06-oid4vc-vci-adapter-design.md`

## Global Constraints

- ~~`EXPO_PUBLIC_OID4VC_VCI_ADAPTER`~~ **Removed** — oid4vc always on (Phase 3).
- Pre-Authorized Code, Authorization Code, and dual-format offers via oid4vc.
- Preserve existing error prefixes.
- One biometric per claim (proof signing session only).
- ~~Do not remove legacy VCI client packages (Phase 3).~~ **Done** — legacy protocol client packages removed from `package.json`.
- Do not commit unless user explicitly requests.

---

## Spike outcome

**Version:** `@openid4vc/openid4vci@0.5.4` (matches `@openid4vc/openid4vp@0.5.4`)

**API surface:** `Openid4vciClient` class with:
- `resolveCredentialOffer(uri)`
- `resolveIssuerMetadata(issuer)`
- `retrievePreAuthorizedCodeAccessTokenFromOffer({ credentialOffer, issuerMetadata, txCode? })`
- `retrieveCredentials({ issuerMetadata, accessToken, credentialConfigurationId, proof })`

**Hermes smoke:** PASS — inline `openid-credential-offer://` pre-auth offer parses under Jest/Hermes (`oid4vciHermesSmoke.test.ts`).

**PoP strategy:** Wallet-owned `signProof()`; adapter passes JWT proof to `retrieveCredentials`. Lib `createCredentialRequestJwtProof` not used in first slice.

**Bundle leaks:** Not run this session — run `yarn scan:bundle-leaks` before device QA.

---

## File map

| File | Action | Status |
|------|--------|--------|
| `src/services/oid4vc/oid4vcCallbacks.ts` | Create (shared VP+VCI) | Done |
| `src/services/vp/oid4vc/oid4vcCallbacks.ts` | Modify (re-export) | Done |
| `src/services/vci/oid4vc/types.ts` | Create | Done |
| `src/services/vci/oid4vc/isOid4vcVciAdapterEnabled.ts` | Create | Done |
| `src/services/vci/oid4vc/shouldUseOid4vcVciAdapter.ts` | Create | Done |
| `src/services/vci/oid4vc/createOid4vcVciClient.ts` | Create | Done |
| `src/services/vci/oid4vc/parseCredentialOfferViaOid4vc.ts` | Create | Done |
| `src/services/vci/oid4vc/mapOid4vcOfferToWalletShape.ts` | Create | Done |
| `src/services/vci/oid4vc/retrieveViaOid4vc.ts` | Create | Done |
| `src/services/vci/oid4vc/oid4vciHermesSmoke.test.ts` | Create | Done |
| `src/services/vci/oid4vc/*.test.ts` | Create | Done (flag + routing) |
| `src/services/vci/exchangeService.ts` | Modify | Done (first slice) |
| `.env.example` | Modify | Done |
| `docs/TASKS.md` | Modify | Done |
| `package.json` | Modify | Done |
| `docs/superpowers/specs/2026-08-06-oid4vc-vci-adapter-design.md` | Create | Done |

---

### Task 0: Phase 0 spike — validate lib on Hermes

- [x] **Step 1:** `yarn add @openid4vc/openid4vci@0.5.4`
- [x] **Step 2:** Hermes smoke test (`oid4vciHermesSmoke.test.ts`)
- [x] **Step 3:** Document API choice in plan spike outcome
- [ ] **Step 4:** Run `yarn scan:bundle-leaks` (requires build output path — defer to device QA)

---

### Task 1: Core types + flag reader

- [x] `types.ts`, `isOid4vcVciAdapterEnabled.ts`, test

---

### Task 2: Adapter routing selector

- [x] `shouldUseOid4vcVciAdapter.ts`, test (pre-auth, auth-code, v2 crypto guard)

---

### Task 3: Shared callbacks refactor

- [x] Move to `src/services/oid4vc/oid4vcCallbacks.ts`
- [x] VP re-export unchanged behavior (`mode: 'vp'`, signJwt fail-closed)
- [x] VCI client factory accepts optional `signJwtImpl`
- [ ] Add VCI `signJwt` wiring test when DPoP path lands

---

### Task 4: Offer parse + shape mapping

- [x] `parseCredentialOfferViaOid4vc.ts`
- [x] `resolveIssuerMetadataViaOid4vc()`
- [x] `mapCredentialOfferObjectToWalletOffer.ts`
- [x] Parity test: adapter vs legacy normalized offer fields (`exchangeService.oid4vcAdapter.test.ts`)

---

### Task 5: Token + credential retrieve

- [x] `retrieveViaOid4vc.ts` — pre-auth token + credential request
- [x] MSW/harness tests for token + credential HTTP mapping (`exchangeService.oid4vcAdapter.test.ts`)

---

### Task 6: Boundary integration in `exchangeService.ts`

- [x] Extend `ResolvedCredentialOffer` with `protocolPath`, `oid4vcContext`
- [x] `resolveOffer()` flag routing
- [x] `createDefaultClaimCredentialDependencies()` oid4vc branches
- [ ] Export `readCredentialIdentifierFromTokenResponse` consumers documented
- [x] Flag-on integration tests in `exchangeService.oid4vcAdapter.test.ts`

---

### Task 7: Env docs + TASKS backlog

- [x] `.env.example` — `EXPO_PUBLIC_OID4VC_VCI_ADAPTER`
- [x] `docs/TASKS.md` — Phase 1 VP E2E complete; Phase 2 in progress

---

### Task 8: Final verification gate

- [x] `yarn test src/services/vci/` — 87 tests PASS
- [x] `yarn tsc --noEmit` — PASS
- [x] `yarn lint` — 0 errors (pre-existing warnings only)
- [ ] Manual E2E checklist (design spec) — **your turn on device**

---

## Remaining work (next session)

1. `.env.example` + `docs/TASKS.md` updates
2. Flag-on `exchangeService.test.ts` integration cases
3. Offer parse parity fixtures (legacy vs adapter)
4. `yarn scan:bundle-leaks` on device QA path
5. Manual E2E: pre-auth QR with flag-on dev build
6. Phase 2.6: v2 WUA/WIA on adapter path; wire `signJwtImpl` if issuers require DPoP
7. Phase 3: remove legacy VCI client packages (complete)

---

## Plan self-review

| Spec requirement | Task | Status |
|------------------|------|--------|
| Phase 0 spike + pin version | Task 0 | Done |
| Build-time flag default false | Task 1, 7 | Partial |
| `protocolPath` + `oid4vcContext` | Task 1, 6 | Done |
| Pre-auth scope only | Task 2 | Done |
| Shared callbacks | Task 3 | Done |
| Wallet PoP unchanged | Task 5, 6 | Done |
| Legacy fallback | Task 2, 6 | Done |
| Legacy client removal | — | N/A (complete) |
