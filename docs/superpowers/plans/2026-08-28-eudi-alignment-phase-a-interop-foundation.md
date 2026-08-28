# EUDI Alignment Phase A — Interop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production-grade `x509_*` OID4VP trust, metadata-driven OID4VCI DPoP, and a single VP submit orchestration path — aligned with eudi-dev v2.0.7 without demo-interop or trust-any in release builds.

**Architecture:** Roll out **A2 → A3 → A1**. A2 enables x509 schemes when an origin is allowlisted and JAR/crypto checks pass (hybrid C). A3 turns DPoP on from AS metadata. A1 routes Scan, deeplink, and My QR through one `submitPresentationResponse` core while keeping `@openid4vc/openid4vp` as an internal HTTP helper only.

**Tech Stack:** TypeScript, Jest, Expo SDK 54, `src/services/vp/*`, `src/services/vci/oid4vc/*`, `src/services/oid4vc/dpopIssuanceSession.ts`, NativeWind UI unchanged.

**Spec:** `docs/superpowers/specs/2026-08-26-eudi-alignment-phase-a-interop-foundation-design.md`

## Global Constraints

- Reference implementation: eudi-dev v2.0.7 (`C:\project\eudi-dev-2.0.7`).
- Production release builds: no `EXPO_PUBLIC_WALLET_DEMO_INTEROP`, no `trustAnyHttpsPeer` for x509.
- One biometric prompt per present/claim action — no extra consent in front of sign.
- No logging of VP tokens, JWE plaintext, claims, PII, or keys — use `logWalletStep` / scoped error logs only.
- NativeWind only for any touched UI; English-only file headers/comments.
- Run `yarn test <paths>`, `yarn tsc --noEmit`, `yarn lint` on touched areas before marking a task done.
- Update `docs/TASKS.md` when the full Phase A slice completes.

---

## File map

| File | Phase | Responsibility |
|------|-------|----------------|
| `src/services/vp/clientIdInteropPolicy.ts` | A2 | x509 schemes supported without demo gate |
| `src/services/vp/clientIdScheme.ts` | A2 | `x509_san_dns` §5.9.1 FQDN bind in `readResponseUriMatchesClientId` |
| `src/services/vp/trustedVerifierMatcher.ts` | A2 | Origin-only x509 trust |
| `src/config/trustedVerifiers.ts` | A2 | `EXPO_PUBLIC_VERIFIER_X509_*` env builders |
| `src/services/vp/authorizationRequestJar.ts` | A2 | Fail closed unsigned x509 JAR in production |
| `.env.example` | A2 | Document x509 origin + optional hash pin |
| `src/services/oid4vc/dpopIssuanceSession.ts` | A3 | `shouldUseDpopForIssuance(asMetadata)` |
| `src/services/vci/oid4vc/retrieveViaOid4vc.ts` | A3 | Metadata-driven DPoP on token/credential/deferred |
| `src/services/vci/exchangeService.ts` | A3 | Dual-format/deferred inherit DPoP decision |
| `src/services/vp/presentationService.ts` | A1 | `submitPresentationResponseCore()` single path |
| `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.ts` | A1 | Widen or internalize; deprecate env fork |
| `src/components/Oid4VpDisclosureFlow.tsx` | A1 | Uses unified submit (verify) |
| `docs/CODEMAPS/frontend.md` | A1 | If flow wiring comments change |

---

## Task 1 (A2): Production x509 client_id trust

### Task 1a: Scheme support without demo gate

**Files:**
- Modify: `src/services/vp/clientIdInteropPolicy.ts`
- Test: `src/services/vp/clientIdInteropPolicy.test.ts`

**Interfaces:**
- Produces: `isClientIdSchemeSupportedForTrust('x509_hash' | 'x509_san_dns', false) === true`

- [ ] **Step 1: Write failing test**

```typescript
test('x509_hash is supported without demo interop or trustAny', () => {
  delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
  expect(isClientIdSchemeSupportedForTrust('x509_hash', false)).toBe(true)
  expect(isClientIdSchemeSupportedForTrust('x509_san_dns', false)).toBe(true)
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/vp/clientIdInteropPolicy.test.ts -t "without demo"`

- [ ] **Step 3: Implement**

Remove `INTEROP_X509_CLIENT_ID_SCHEMES` demo gate — return `true` for x509 schemes after unsupported-prefix check.

- [ ] **Step 4: Run test — expect PASS**

---

### Task 1b: `x509_san_dns` response_uri FQDN bind

**Files:**
- Modify: `src/services/vp/clientIdScheme.ts`
- Test: `src/services/vp/clientIdScheme.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
test('x509_san_dns requires response_uri host to match client_id FQDN', () => {
  expect(
    readResponseUriMatchesClientId(
      'x509_san_dns:playground.animo.id',
      'https://playground.animo.id/oid4vp/callback',
    ),
  ).toBe(true)
  expect(
    readResponseUriMatchesClientId(
      'x509_san_dns:playground.animo.id',
      'https://evil.example/steal',
    ),
  ).toBe(false)
})

test('x509_hash does not bind response_uri host (crypto + allowlist only)', () => {
  expect(
    readResponseUriMatchesClientId(
      'x509_hash:abc',
      'https://other.example/cb',
    ),
  ).toBe(true)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** in `readResponseUriMatchesClientId` for `x509_san_dns` branch (compare `URL(responseUri).hostname` to SAN value case-insensitively per eudi-dev).

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 1c: Origin allowlist env + `findTrustedVerifier` origin-only x509

**Files:**
- Modify: `src/config/trustedVerifiers.ts`
- Modify: `src/services/vp/trustedVerifierMatcher.ts`
- Test: `src/services/vp/trustedVerifierMatcher.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // trustedVerifiers.ts
  export function buildX509OriginTrustedVerifiersFromEnv(env?: Env): TrustedVerifier[]
  // Entries: { clientId: 'x509_origin:<hostname>', name, allowedOrigins: [origin] }
  // Optional EXPO_PUBLIC_VERIFIER_X509_CLIENT_ID → exact x509_hash entry merged in buildTrustedVerifiersFromEnv
  ```

- [ ] **Step 1: Write failing test**

```typescript
test('trusts x509_hash from origin allowlist without demo interop', () => {
  delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
  const verifiers = buildTrustedVerifiersFromEnv({
  ...process.env,
  EXPO_PUBLIC_VERIFIER_X509_ALLOWED_ORIGINS: 'https://playground.animo.id',
  } as Env, false)

  const trusted = findTrustedVerifier(
    'x509_hash:Uvo3HtuIxuhC92rShpgqcT3YXwrqRxWEviRiA0OZszk',
    'https://playground.animo.id/oid4vp/session/1',
    verifiers,
    false,
  )
  expect(trusted?.allowedOrigins).toContain('https://playground.animo.id')
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

1. Parse `EXPO_PUBLIC_VERIFIER_X509_ALLOWED_ORIGINS` (comma-separated origins → hostname entries).
2. In `findTrustedVerifier`, after scheme check: if `isX509ClientIdScheme(scheme)`, allow match when `allowedOrigins` includes `responseOrigin` even if `client_id` differs (origin-only pin).
3. Optional `EXPO_PUBLIC_VERIFIER_X509_CLIENT_ID` adds exact-pin entry (existing line-47 equality path).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Document env in `.env.example`**

```bash
# Production x509 verifier trust (hybrid C): HTTPS origins allowed for x509_hash / x509_san_dns JAR requests.
# Unit: comma-separated origins. Crypto (JAR + x5c + hash/SAN) still required.
# EXPO_PUBLIC_VERIFIER_X509_ALLOWED_ORIGINS=https://playground.animo.id
# Optional exact client_id pin (in addition to origin list):
# EXPO_PUBLIC_VERIFIER_X509_CLIENT_ID=x509_hash:<base64url-sha256-of-leaf-cert>
```

---

### Task 1d: Production unsigned x509 JAR fail-closed

**Files:**
- Modify: `src/services/vp/authorizationRequestJar.ts`
- Test: `src/services/vp/authorizationRequestJar.test.ts`

- [ ] **Step 1: Test** — unsigned JAR + `x509_hash` in non-`__DEV__` build throws `PresentationRequestInvalid`.

- [ ] **Step 2: Implement** — ensure production path rejects before trust gate passes (may already exist; tighten if only demo path enforced).

- [ ] **Step 3: Run** `yarn test src/services/vp/authorizationRequestJar.test.ts`

---

## Task 2 (A3): Metadata-driven DPoP for OID4VCI

**Files:**
- Modify: `src/services/oid4vc/dpopIssuanceSession.ts`
- Modify: `src/services/vci/oid4vc/retrieveViaOid4vc.ts`
- Modify: `src/services/vci/exchangeService.ts` (if not already wired)
- Test: `src/services/oid4vc/dpopIssuanceSession.test.ts`, `src/services/vci/oid4vc/retrieveViaOid4vc.dpop.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export function shouldUseDpopForIssuance(input: {
    authorizationServerMetadata?: Record<string, unknown>
    env?: Record<string, string | undefined>
  }): boolean
  // true when metadata lists ES256 in dpop_signing_alg_values_supported
  // AND EXPO_PUBLIC_OID4VC_DPOP_ENABLED !== 'false'
  // false when env === 'false' (kill-switch)
  ```

- [ ] **Step 1: Write failing test**

```typescript
test('shouldUseDpopForIssuance is true from AS metadata without env opt-in', () => {
  delete process.env.EXPO_PUBLIC_OID4VC_DPOP_ENABLED
  expect(
    shouldUseDpopForIssuance({
      authorizationServerMetadata: {
        dpop_signing_alg_values_supported: ['ES256'],
      },
    }),
  ).toBe(true)
})

test('shouldUseDpopForIssuance respects kill-switch false', () => {
  process.env.EXPO_PUBLIC_OID4VC_DPOP_ENABLED = 'false'
  expect(
    shouldUseDpopForIssuance({
      authorizationServerMetadata: { dpop_signing_alg_values_supported: ['ES256'] },
    }),
  ).toBe(false)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Replace** `isDpopIssuanceEnabled()` call sites in issuance adapter with `shouldUseDpopForIssuance()`.

- [ ] **Step 4: Update `.env.example`** — document DPoP as metadata-driven; `EXPO_PUBLIC_OID4VC_DPOP_ENABLED=false` kill-switch only.

- [ ] **Step 5: Run** `yarn test src/services/oid4vc/dpopIssuanceSession.test.ts src/services/vci/oid4vc/retrieveViaOid4vc.dpop.test.ts`

---

## Task 3 (A1): Unified VP submit orchestration

### Task 3a: Extract submit core

**Files:**
- Modify: `src/services/vp/presentationService.ts`
- Test: `src/services/vp/presentationService.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export async function submitPresentationResponseCore(input: {
    request: ResolvedPresentationRequest
    approvedResponse: ApprovedPresentationResponse
    // shape cache + JWE + direct_post form — existing helpers
  }): Promise<SubmitPresentationResult>
  ```

- [ ] **Step 1: Identify** duplicate submit branches (`protocolPath === 'oid4vc'` vs legacy) — both must call shape resolver (`resolveDcqlVpTokenShapeForPresentation`), `formatVpTokenForResponse`, `buildDirectPostFormBody`, cache write on 2xx.

- [ ] **Step 2: Write test** — mock legacy + oid4vc paths; assert both invoke same core and write shape cache on 2xx.

- [ ] **Step 3: Extract** `submitPresentationResponseCore`; thin wrappers call it.

- [ ] **Step 4: Run** `yarn test src/services/vp/presentationService.test.ts`

---

### Task 3b: Widen adapter eligibility / deprecate env fork

**Files:**
- Modify: `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.ts`
- Modify: `src/config/runtimeFlags.ts` (if flag read centralized)
- Test: `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.test.ts`

- [ ] **Step 1: Decision in code** — either:
  - **Option A (recommended):** `shouldUseOid4vcVpAdapter` always `true` for in-scope requests (ignore `EXPO_PUBLIC_OID4VC_VP_ADAPTER`), **or**
  - Keep flag but default `true` in dev/preview and remove origin restriction (`my-qr`, `same-device` only).

- [ ] **Step 2: Update tests** for My QR flow origin (`presentationFlowOrigin: 'my-qr'` or actual enum value).

- [ ] **Step 3: Verify** dual-format, PEX, issuer-PID still **excluded** from adapter (wallet-owned paths) per existing guards.

- [ ] **Step 4: Mark** `EXPO_PUBLIC_OID4VC_VP_ADAPTER` deprecated in `.env.example`.

---

### Task 3c: Regression gate

- [ ] **Run** `yarn test src/services/vp/` (VP service tests)
- [ ] **Run** `yarn tsc --noEmit`
- [ ] **Run** `yarn lint` (fix only new issues in touched files)
- [ ] **Manual checklist** (device when available):
  1. zenithcomp / TonyHere `did:web` scan + deeplink — unchanged
  2. Animo with `EXPO_PUBLIC_VERIFIER_X509_ALLOWED_ORIGINS=https://playground.animo.id`, demo interop **off**, production profile — reaches submit (2xx or known shape error, not `VerifierUntrusted`)
  3. DPoP issuer claim without `EXPO_PUBLIC_OID4VC_DPOP_ENABLED=true`

---

## Task 4: Docs + TASKS closure

- [ ] Update `docs/TASKS.md` — Phase A slice status, env vars, manual results
- [ ] Update `docs/superpowers/specs/2026-08-26-eudi-alignment-phase-a-interop-foundation-design.md` status → Implemented (when done)
- [ ] Note in TASKS: full Animo DCQL match still needs **Phase B1**

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Hybrid C x509 trust | 1c |
| x509_san_dns FQDN bind | 1b |
| JAR + x5c production | 1d |
| DPoP metadata-driven | 2 |
| Unified submit + shape cache | 3a |
| Adapter as helper | 3b |
| No demo/trust-any in prod | 1a, 1c, Global Constraints |
| Regression verifiers | 3c |

---

## Execution handoff

**Plan saved to `docs/superpowers/plans/2026-08-28-eudi-alignment-phase-a-interop-foundation.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task (1a→1d, 2, 3a→3c, 4), review between tasks  
2. **Inline Execution** — implement in this session task-by-task with checkpoints

Which approach do you want?
