# OID4VC VP Adapter (`@openid4vc/openid4vp`) Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a feature-flagged OID4VP protocol adapter for Scan DCQL + same-device deeplink flows — single-fetch parse/verify and `direct_post` submit via `@openid4vc/openid4vp`, while wallet-owned trust, DCQL matching, signing, and disclosures stay in `presentationService.ts`.

**Architecture:** Add `src/services/vp/oid4vc/` with Stage 1 material fetch → post-fetch routing (`shouldUseOid4vcVpAdapter`) → Stage 3a adapter or Stage 3b legacy parse on the **same bytes** → resolve orchestration unchanged → submit routed by `ResolvedPresentationRequest.protocolPath`. Persist `presentationFlowOrigin` in `deeplinkStore` so Scan vs callback VP are not mislabeled.

**Tech Stack:** Expo SDK 54, Hermes, Jest, `@openid4vc/openid4vp` (exact version from Phase 0 spike), existing `authorizationRequestJar.ts`, `presentationService.ts`, NativeWind UI unchanged.

**Spec:** `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md`

## Global Constraints

- `EXPO_PUBLIC_OID4VC_VP_ADAPTER` — boolean, default `false`, **build-time** (Expo bundle); toggling requires a new build.
- Adapter eligible origins: **`scan`** and **`same-device` only**; `my-qr` and `issuer-renewal` → `protocolPath: 'legacy'` always when flag is on.
- **Single-fetch invariant:** one HTTP GET for `request_uri` in Stage 1; Stage 3 must not re-fetch.
- **Trust before network:** `findTrustedVerifier()` before `did.json` / JAR verify network crypto.
- Preserve existing error prefixes for `scanFriendlyErrors.ts`.
- No logging of vp_token, claims, VC payloads, or key material.
- NativeWind only; no new UI screens.
- Do not remove legacy VCI client packages in this plan (Phase 3 — complete in separate slice).
- Run `yarn tsc --noEmit`, `yarn lint`, focused tests after each task; update `docs/TASKS.md` when complete.
- Do not commit unless the user explicitly requests.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/vp/oid4vc/types.ts` | Create | `PresentationFlowOrigin`, `ProtocolPath`, `AuthorizationRequestMaterial`, `Oid4vcAdapterContext` |
| `src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.ts` | Create | Read build-time flag |
| `src/services/vp/oid4vc/normalizeAuthorizationRequestForRouting.ts` | Create | DCQL string→object normalization before routing |
| `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.ts` | Create | Post-fetch + origin routing |
| `src/services/vp/oid4vc/oid4vcCallbacks.ts` | Create | `@openid4vc` `CallbackContext` for RN/Hermes |
| `src/services/vp/oid4vc/fetchAuthorizationRequestMaterial.ts` | Create | Stage 1 single fetch / by-value extraction |
| `src/services/vp/oid4vc/parseAuthorizationRequestViaOid4vc.ts` | Create | Stage 3a lib parse on Stage 1 material |
| `src/services/vp/oid4vc/submitDirectPostViaOid4vc.ts` | Create | Adapter submit using stored lib payload |
| `src/services/vp/oid4vc/*.test.ts` | Create | Unit, routing, parity, single-fetch tests |
| `src/services/vp/presentationService.ts` | Modify | Stage routing; extend `ResolvedPresentationRequest`; legacy parse from material |
| `src/store/deeplinkStore.ts` | Modify | `pendingPresentationFlowOrigin` + setter helper |
| `src/screens/PresentationRequestScreen.tsx` | Modify | Origin from store or direct Linking → `same-device` |
| `src/components/Oid4VpDisclosureFlow.tsx` | Modify | Pass `presentationFlowOrigin` into resolve |
| `app/(tabs)/scan.tsx` | Modify | Set origin `scan` on VP handoff |
| `app/callback.tsx` | Modify | Set origin `same-device` on VP callback |
| `app/(tabs)/qr.tsx` | Modify | Pass `presentationFlowOrigin: 'my-qr'` |
| `src/services/credentials/renewalOid4VpPresentation.ts` | Modify | Pass `issuer-renewal` |
| `.env.example` | Modify | Document `EXPO_PUBLIC_OID4VC_VP_ADAPTER` |
| `docs/TASKS.md` | Modify | Track migration slice |
| `package.json` | Modify | Pin exact `@openid4vc/openid4vp` (+ peers from spike) |

---

### Task 0: Phase 0 spike — validate lib on Hermes

**Files:**
- Modify: `package.json`
- Create: `docs/superpowers/plans/2026-08-05-oid4vc-vp-adapter-spike-notes.md` (spike output only — reference in TASKS, do not commit unless user asks)

**Interfaces:**
- Produces: pinned package version, chosen API surface (`functional` vs `Openid4vpClient`), submit payload shape (`authorizationRequestPayload` ± `authorizationResponsePayload`)

- [ ] **Step 1:** `yarn add @openid4vc/openid4vp@<version>` (pin exact version from npm; record in spike notes).
- [ ] **Step 2:** Add minimal Hermes smoke script or dev-only test that wires `oid4vcCallbacks` stubs and resolves one dev-verifier fixture (`redirect_uri` + `request_uri` JWT + DCQL).
- [ ] **Step 3:** Confirm submit API — if lib submit is awkward, lock **parse-via-lib + wallet-owned URLSearchParams submit** fallback in spike notes.
- [ ] **Step 4:** Run `yarn scan:bundle-leaks` after dependency add; note any polyfill issues.
- [ ] **Step 5:** Record spike outcome at top of this plan file under `## Spike outcome` (version, API choice, submit strategy).

**Spike outcome:** `@openid4vc/openid4vp@0.5.4` — functional APIs (`parseOpenid4vpAuthorizationRequest`, `resolveOpenid4vpAuthorizationRequest`, `submitOpenid4vpAuthorizationResponse`); lib submit with stored `authorizationRequestPayload`. Details: `docs/superpowers/plans/2026-08-05-oid4vc-vp-adapter-spike-notes.md`.

---

### Task 1: Core types + flag reader

**Files:**
- Create: `src/services/vp/oid4vc/types.ts`
- Create: `src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.ts`
- Create: `src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.test.ts`

**Interfaces:**
- Produces:
  - `export type PresentationFlowOrigin = 'scan' | 'same-device' | 'my-qr' | 'issuer-renewal'`
  - `export type ProtocolPath = 'legacy' | 'oid4vc'`
  - `export type AuthorizationRequestMaterial = { rawBody?: string; byValueParams?: Record<string, string>; requestUri?: string }`
  - `export type Oid4vcAdapterContext = { authorizationRequestPayload: Record<string, unknown>; authorizationResponsePayload?: Record<string, unknown> }`
  - `export function isOid4vcVpAdapterEnabled(env?: NodeJS.ProcessEnv): boolean`

- [ ] **Step 1: Write failing test**

```typescript
// src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.test.ts
import { isOid4vcVpAdapterEnabled } from './isOid4vcVpAdapterEnabled'

describe('isOid4vcVpAdapterEnabled', () => {
  it('returns false by default', () => {
    expect(isOid4vcVpAdapterEnabled({})).toBe(false)
  })

  it('returns true only when EXPO_PUBLIC_OID4VC_VP_ADAPTER is true', () => {
    expect(isOid4vcVpAdapterEnabled({ EXPO_PUBLIC_OID4VC_VP_ADAPTER: 'true' })).toBe(true)
    expect(isOid4vcVpAdapterEnabled({ EXPO_PUBLIC_OID4VC_VP_ADAPTER: '1' })).toBe(false)
  })
})
```

- [ ] **Step 2:** Run `yarn test src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.test.ts` — expect FAIL.

- [ ] **Step 3:** Implement `types.ts` and `isOid4vcVpAdapterEnabled.ts`:

```typescript
// isOid4vcVpAdapterEnabled.ts
export function isOid4vcVpAdapterEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.EXPO_PUBLIC_OID4VC_VP_ADAPTER === 'true'
}
```

- [ ] **Step 4:** Run test — expect PASS.

---

### Task 2: DCQL normalization + adapter routing selector

**Files:**
- Create: `src/services/vp/oid4vc/normalizeAuthorizationRequestForRouting.ts`
- Create: `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.ts`
- Create: `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.test.ts`

**Interfaces:**
- Consumes: `PresentationFlowOrigin`, `isOid4vcVpAdapterEnabled`, `isDualFormatDcqlRequest`, `isIssuerOid4VpClientId`, `isIssuerOid4VpResponseUri`, `readOptionalDcqlQuery` (export or duplicate minimal parse from `presentationService` — prefer importing shared normalizer used by both)
- Produces:
  - `export function normalizeAuthorizationRequestForRouting(raw: Record<string, unknown>): Record<string, unknown>`
  - `export function shouldUseOid4vcVpAdapter(input: { flagEnabled: boolean; presentationFlowOrigin: PresentationFlowOrigin; authorizationRequest: Record<string, unknown> }): boolean`

- [ ] **Step 1: Write failing tests** covering:
  - `my-qr` + flag on → `false`
  - `scan` + flag off → `false`
  - `scan` + flag on + DCQL + `direct_post` → `true`
  - string `dcql_query` dual-format fixture → `false` after normalization
  - PEX (`presentation_definition`) → `false`
  - issuer OID4VP client/URI → `false`

- [ ] **Step 2:** Run tests — expect FAIL.

- [ ] **Step 3:** Implement normalization (parse string `dcql_query` via same rules as `readOptionalDcqlQuery`) then routing checks per spec § Flag routing.

- [ ] **Step 4:** Run `yarn test src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.test.ts` — expect PASS.

---

### Task 3: `@openid4vc` callbacks

**Files:**
- Create: `src/services/vp/oid4vc/oid4vcCallbacks.ts`
- Create: `src/services/vp/oid4vc/oid4vcCallbacks.test.ts`

**Interfaces:**
- Produces: `export function createOid4vcCallbacks(options?: { fetchImpl?: typeof fetch }): CallbackContext` (type from spike — `@openid4vc/oauth2` or package export)
- `verifyJwt` → `verifyEdDsaCompactJwt` + wallet JWK resolution hooks
- `decryptJwe`, `getX509CertificateMetadata`, optional `signJwt`/`encryptJwe` → throw `PresentationRequestUnsupported`

- [ ] **Step 1:** Write test asserting `decryptJwe` and `getX509CertificateMetadata` throw mapped prefix.

- [ ] **Step 2:** Implement callbacks per spec; inject `fetchImpl` for tests.

- [ ] **Step 3:** Run `yarn test src/services/vp/oid4vc/oid4vcCallbacks.test.ts` — PASS.

---

### Task 4: Stage 1 — `fetchAuthorizationRequestMaterial` (single fetch)

**Files:**
- Create: `src/services/vp/oid4vc/fetchAuthorizationRequestMaterial.ts`
- Create: `src/services/vp/oid4vc/fetchAuthorizationRequestMaterial.test.ts`

**Interfaces:**
- Consumes: `fetchImpl`, `parseUrl` / existing URI helpers from presentationService (extract shared helper if needed)
- Produces:
  - `export async function fetchAuthorizationRequestMaterial(rawRequestUri: string, options: { fetchImpl?: typeof fetch }): Promise<AuthorizationRequestMaterial>`

- [ ] **Step 1:** Write tests:
  - by-value `openid4vp://` → `byValueParams`, no fetch call
  - `request_uri` QR → exactly **one** `fetchImpl` call; `rawBody` populated
  - fetch failure → throws `PresentationRequestFetchFailed`

- [ ] **Step 2:** Implement — move network fetch logic out of `readAuthorizationRequest` / `fetchAuthorizationRequestObject` into this module without changing behavior yet.

- [ ] **Step 3:** Run tests — PASS.

---

### Task 5: Stage 3a — parse via adapter + adapter context

**Files:**
- Create: `src/services/vp/oid4vc/parseAuthorizationRequestViaOid4vc.ts`
- Create: `src/services/vp/oid4vc/parseAuthorizationRequestViaOid4vc.test.ts`

**Interfaces:**
- Consumes: `AuthorizationRequestMaterial`, `createOid4vcCallbacks`, `findTrustedVerifier`, `trustedVerifiers`, spike-chosen lib resolve API
- Produces:
  - `export async function parseAuthorizationRequestViaOid4vc(material: AuthorizationRequestMaterial, options: { trustedVerifiers: TrustedVerifier[]; fetchImpl?: typeof fetch }): Promise<{ authorizationRequest: Record<string, unknown>; oid4vcContext: Oid4vcAdapterContext }>`

- [ ] **Step 1:** Parity test — dev `redirect_uri` + JWT fixture: adapter output fields match legacy `parseAuthorizationRequestBody` for `client_id`, `response_uri`, `response_mode`, `nonce`, `dcql_query`, `state`.

- [ ] **Step 2:** Trust-before-fetch test — untrusted verifier → no `did.json` fetch mock invoked; throws `PresentationRequestInvalid`.

- [ ] **Step 3:** Single-fetch test — provide `rawBody` material; assert **zero** additional fetch calls during parse.

- [ ] **Step 4:** Implement wrapper mapping lib errors to spec prefixes.

- [ ] **Step 5:** Run tests — PASS.

---

### Task 6: Adapter submit path

**Files:**
- Create: `src/services/vp/oid4vc/submitDirectPostViaOid4vc.ts`
- Create: `src/services/vp/oid4vc/submitDirectPostViaOid4vc.test.ts`

**Interfaces:**
- Consumes: `Oid4vcAdapterContext`, formatted `vpToken`, `state?`, `responseUri`, spike submit API **or** wallet-owned POST fallback from Task 0
- Produces:
  - `export async function submitDirectPostViaOid4vc(input: { oid4vcContext: Oid4vcAdapterContext; responseUri: string; vpToken: string; state?: string; fetchImpl?: typeof fetch }): Promise<{ ok: boolean; status: number; parsedBody: unknown }>`

- [ ] **Step 1:** Test success + HTTP error mapping to `PresentationSubmissionFailed`.

- [ ] **Step 2:** Test uses stored `authorizationRequestPayload` (round-trip from parse fixture).

- [ ] **Step 3:** Implement per spike strategy.

- [ ] **Step 4:** Run tests — PASS.

---

### Task 7: `deeplinkStore` origin persistence

**Files:**
- Modify: `src/store/deeplinkStore.ts`
- Modify: `src/store/deeplinkStore.test.ts`

**Interfaces:**
- Produces:
  - `pendingPresentationFlowOrigin: PresentationFlowOrigin | null`
  - `setPendingPresentationRequest({ uri, origin }: { uri: string; origin: PresentationFlowOrigin })` (or extend existing setter)
  - Clear origin when VP pending consumed / dismissed

- [ ] **Step 1:** Test scan handoff stores `scan`; callback stores `same-device`; consume clears origin.

- [ ] **Step 2:** Implement store changes; keep credential-offer paths unaffected.

- [ ] **Step 3:** Run `yarn test src/store/deeplinkStore.test.ts` — PASS.

---

### Task 8: Integrate Stage 1–3 + submit into `presentationService`

**Files:**
- Modify: `src/services/vp/presentationService.ts`
- Modify: `src/services/vp/presentationService.test.ts`

**Interfaces:**
- Extend:
  - `ResolvePresentationRequestOptions` → add required `presentationFlowOrigin: PresentationFlowOrigin`
  - `ResolvedPresentationRequest` → add `protocolPath: ProtocolPath`, optional `oid4vcContext`
- Refactor `readAuthorizationRequest` to:
  1. `fetchAuthorizationRequestMaterial`
  2. `normalizeAuthorizationRequestForRouting`
  3. `shouldUseOid4vcVpAdapter` → set `protocolPath`
  4. branch parse: `parseAuthorizationRequestViaOid4vc` vs legacy `parseAuthorizationRequestBody` on same material (**no second fetch**)
- Refactor `submitPresentationResponse` to branch on `request.protocolPath`

- [ ] **Step 1:** Update existing tests to pass `presentationFlowOrigin: 'scan'` (default for verifier API fixtures).

- [ ] **Step 2:** Add flag-on integration tests (spec subset):
  - `resolves request_uri JWT ... DCQL`
  - `submits vp_token ... direct_post` preserves `protocolPath`
  - my-qr / dual-format / PEX with flag on → `protocolPath === 'legacy'`

- [ ] **Step 3:** Add single-fetch test on `presentationService` — mock fetch count === 1 for `request_uri` resolve.

- [ ] **Step 4:** Implement integration; export `readOptionalDcqlQuery` or shared normalizer if Task 2 imports it.

- [ ] **Step 5:** Run `yarn test src/services/vp/presentationService.test.ts` — PASS.

---

### Task 9: Call sites — flow origin wiring

**Files:**
- Modify: `src/components/Oid4VpDisclosureFlow.tsx`
- Modify: `app/(tabs)/scan.tsx`
- Modify: `app/callback.tsx`
- Modify: `app/(tabs)/qr.tsx`
- Modify: `src/services/credentials/renewalOid4VpPresentation.ts`
- Modify: `src/screens/PresentationRequestScreen.tsx`
- Modify: `src/screens/PresentationRequestScreen.test.tsx`
- Modify: `src/components/Oid4VpDisclosureFlow.test.tsx`

**Interfaces:**
- Consumes: `presentationFlowOrigin` prop on `Oid4VpDisclosureFlow`; `setPendingPresentationRequest` from deeplink store

- [ ] **Step 1:** `scan.tsx` — replace bare `setPendingDeeplinkUri` for VP with `setPendingPresentationRequest({ uri, origin: 'scan' })`.

- [ ] **Step 2:** `callback.tsx` — VP route sets origin `same-device`.

- [ ] **Step 3:** `qr.tsx` — pass `presentationFlowOrigin="my-qr"` into `Oid4VpDisclosureFlow`.

- [ ] **Step 4:** `renewalOid4VpPresentation.ts` — pass `issuer-renewal`.

- [ ] **Step 5:** `PresentationRequestScreen` — read `pendingPresentationFlowOrigin`; for direct `Linking.useURL()` / `getInitialURL()` VP without store entry use **`same-device`**; stop hardcoding `presentationOrigin="scanned-verifier-qr"` when origin is callback.

- [ ] **Step 6:** `Oid4VpDisclosureFlow` — add optional `presentationFlowOrigin` prop; forward to `resolvePresentationRequest`.

- [ ] **Step 7:** Update component tests/mocks for new required option.

- [ ] **Step 8:** Run affected tests — PASS.

---

### Task 10: Env docs + TASKS backlog

**Files:**
- Modify: `.env.example`
- Modify: `docs/TASKS.md`

- [ ] **Step 1:** Add to `.env.example`:

```bash
# Build-time OID4VP adapter toggle (requires rebuild). Default false.
# true = use @openid4vc/openid4vp for in-scope Scan/same-device DCQL direct_post parse+submit.
# EXPO_PUBLIC_OID4VC_VP_ADAPTER=false
```

- [ ] **Step 2:** Add TASKS entry under OID4VP — Phase 1 adapter shipped behind flag; link spec + plan; note manual E2E pending.

---

### Task 11: Final verification gate

- [ ] **Step 1:** `yarn test src/services/vp/ src/store/deeplinkStore.test.ts src/screens/PresentationRequestScreen.test.tsx src/components/Oid4VpDisclosureFlow.test.tsx`

- [ ] **Step 2:** `yarn tsc --noEmit`

- [ ] **Step 3:** `yarn lint`

- [ ] **Step 4:** `yarn scan:bundle-leaks`

- [ ] **Step 5:** Manual E2E (dev build with `EXPO_PUBLIC_OID4VC_VP_ADAPTER=true`):
  1. Scan `openid4vp://` DCQL QR (`request_uri`)
  2. Approve + biometric → success
  3. VP deeplink `walletapp://callback`
  4. Rebuild with flag `false` → legacy still works
  5. Untrusted verifier → friendly error

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Phase 0 spike + pin version | Task 0 |
| Build-time flag default false | Task 1, 10 |
| Stage 1 single fetch | Task 4, 8 |
| Post-fetch routing + origins | Task 2, 7, 9 |
| `protocolPath` + `oid4vcContext` | Task 1, 5, 6, 8 |
| Trust before network | Task 5 |
| Legacy fallback my-qr/issuer/PEX/dual-format | Task 2, 8 |
| Callback contract | Task 3 |
| Parity + integration tests | Task 5, 8 |
| `yarn lint` in gate | Task 11 |
| `.env.example` + TASKS | Task 10 |
| Legacy VCI client removal | Out of scope (Phase 3 complete separately) |

**Placeholder scan:** none — spike outcome section filled during Task 0.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-oid4vc-vp-adapter.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach?
