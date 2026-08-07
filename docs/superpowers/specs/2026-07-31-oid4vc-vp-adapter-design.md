# OID4VC VP Adapter — `@openid4vc/openid4vp` Phase 1

**Superseded (VCI):** VCI now uses `@openid4vc/openid4vci` only (2026-08-06).

**Date:** 2026-07-31 (review patch 2026-08-05, round 4)  
**Status:** Approved for implementation planning  
**Related:** `docs/TASKS.md` (OID4VP local service boundary note), `docs/ARCHITECTURE.md` §3, `src/services/vp/presentationService.ts`, `src/services/vp/authorizationRequestJar.ts`, `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`

## Summary

Introduce a **replaceable OID4VP protocol adapter** using `@openid4vc/openid4vp` (OpenWallet Foundation `oid4vc-ts`) behind a feature flag. Phase 1 migrates **protocol plumbing only** (authorization request fetch/parse and `direct_post` submission) for **Scan tab DCQL** and **same-device deeplink** flows. Wallet orchestration (trusted verifier checks, DCQL credential matching, disclosures, KB-JWT signing via Keychain, redirect handling) stays in `presentationService.ts` and existing VP modules.

This is **Phase 1 of a 3-phase initiative** to align with the OWF stack and eventually replace the legacy VCI protocol client in Phase 2 and remove legacy VCI packages in Phase 3.

## Goals

1. **Reduce maintenance** of hand-written OID4VP protocol code (`authorizationRequestJar`, fetch/submit HTTP details).
2. **Ecosystem alignment** — same library family used by Credo (DCQL via `dcql-ts`).
3. **Safe rollout** — `EXPO_PUBLIC_OID4VC_VP_ADAPTER` is a **build-time kill switch** (embedded at Expo bundle time); legacy path remains default until a new build enables the flag.
4. **Replaceable boundary** — fulfills the `docs/TASKS.md` note that `src/services/vp/` was designed to swap when a confirmed library exists.

## Non-goals (Phase 1)

- My QR broker OID4VP (`brokerSessionClient.ts`).
- Issuer OID4VP (renewal silent presentation, P2 PID auth via `EXPO_PUBLIC_ISSUER_OID4VP_*`).
- Dual-format VP (`dc+sd-jwt` + `mso_mdoc` in one `vp_token`).
- Presentation Exchange (`presentation_definition`) flows — **legacy parse/submit only**; adapter is not invoked for PEX until Phase 1.5.
- `direct_post.jwt`, JARM, `dc_api` response modes.
- Phase 2 VCI migration (`exchangeService.ts` → `@openid4vc/openid4vci`).
- Removing legacy VCI client packages.
- UI changes beyond existing Scan error surfacing.

## Background

| Layer | Today | Phase 1 target |
|-------|-------|----------------|
| VCI | `@openid4vc/openid4vci` + `exchangeService.ts` | **No change** (Phase 2/3 complete) |
| VP parse/submit | Custom `authorizationRequestJar.ts` + inline fetch/POST in `presentationService.ts` | `@openid4vc/openid4vp` adapter when flag on **and** request is in-scope |
| VP orchestration | `presentationService.ts` (~1k lines) | **No change** |
| Signing | Keychain Ed25519 via `crypto.ts` | **No change** — adapter does not sign VP tokens |

`docs/TASKS.md` records that a third-party OID4VP package was not available at implementation time; the local `src/services/vp/` boundary was intentionally narrow and replaceable.

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Primary goals | Reduce protocol maintenance (A) + OWF ecosystem alignment (B) |
| Overall plan | 3 phases: VP adapter → VCI migration → remove legacy VCI client |
| Phase 1 flows | Scan tab `openid4vp://` DCQL QR + same-device `walletapp://callback` VP deeplink |
| Rollout | Build-time flag `EXPO_PUBLIC_OID4VC_VP_ADAPTER`, default `false` — toggling requires a new dev/staging/production build (not a runtime remote config) |
| Success criteria | Automated tests pass + manual E2E on dev verifier (not production `did:web` gate) |
| Flow origin | Callers pass explicit `presentationFlowOrigin`; only `scan` and `same-device` may select the adapter in Phase 1 |
| Origin persistence | Scan handoff and `walletapp://callback` both land on `PresentationRequestScreen` via `deeplinkStore` URI only today — store origin alongside pending VP URI (not inferred from URI shape) |
| Protocol path persistence | `ResolvedPresentationRequest.protocolPath` (`legacy` \| `oid4vc`) chosen at resolve time; submit reuses the same path (no re-classification) |
| Adapter context | When `protocolPath === 'oid4vc'`, store opaque `Oid4vcAdapterContext` including the library's original `authorizationRequestPayload` for submit |
| Adapter placement | Dedicated module `src/services/vp/oid4vc/` (not inline-only in `presentationService.ts`) |
| `vp_token` assembly | Wallet-owned — `presentationTokenBuilders/`, `sdJwtSelectiveDisclosure.ts`, `crypto.ts` |
| DCQL matching | Wallet-owned — `dcqlCredentialMatch.ts`, `presentationCredentialMatch.ts` (not delegated to lib in Phase 1) |
| DCQL `vp_token` shape env | Wallet-owned — `formatVpTokenForResponse()` + `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` |
| Error prefixes | Preserve existing (`PresentationRequestInvalid`, `VerifierUntrusted`, etc.) for `scanFriendlyErrors.ts` |
| Logging | `logWalletStep` / `logWalletError` with `oid4vp` scope; no vp_token, claims, or key material |
| Flag routing | Adapter used only when build flag is on, `presentationFlowOrigin` is in-scope, **and** fetched/parsed authorization request passes in-scope DCQL + `direct_post` checks |
| Trust before network | Adapter must not fetch `did.json` or verify JAR signatures for untrusted `client_id` + `response_uri` pairs — trust gate runs before expensive network crypto (same invariant as `authorizationRequestJar.ts`) |
| Single-fetch invariant | Stage 1 performs the only `request_uri` HTTP GET; Stage 3 adapter + legacy parse the captured material |
| Dev verifier schemes | Phase 1 E2E requires `redirect_uri:` unsigned/signed JAR parity, not production `did:web` only |

## Approaches considered

| Approach | Pros | Cons | Choice |
|----------|------|------|--------|
| **A. Inline flag branches in `presentationService.ts`** | Smallest diff | File already large; blurry boundaries | Rejected |
| **B. Adapter module + flag at boundary** | Clear replaceable boundary; Phase 2 reuses callbacks | New files | **Chosen** |
| **C. Parallel `presentationServiceOid4vc.ts`** | Legacy untouched | Duplicate orchestration | Rejected |
| **Big-bang VP + VCI together** | Single dependency cut | High regression risk on P1/P2 issuance | Rejected — phased instead |

## Architecture

### Phase roadmap

```text
Phase 0 spike (pre-implementation): validate @openid4vc/openid4vp holder-side APIs on Hermes
  — parse dev-verifier fixture + mock direct_post submit; pin exact npm version; abort/pivot if API misfit
Phase 0 (within Phase 1 slice): oid4vcCallbacks.ts — RN/Hermes crypto + fetch callbacks
Phase 1: VP protocol adapter — Scan + deeplink DCQL direct_post
Phase 1.5 (defer): broker, issuer OID4VP, dual-format, PEX
Phase 2: VCI protocol layer → @openid4vc/openid4vci (replace legacy client in exchangeService)
Phase 3: Remove legacy VCI client packages
```

### Data flow (Phase 1)

```text
openid4vp:// or walletapp://callback
        │
        ▼
resolvePresentationRequest(raw, credentials, {
  trustedVerifiers,
  presentationFlowOrigin,   ← required: scan | same-device | my-qr | issuer-renewal
})
        │
        ├─ Stage 1: fetch raw authorization material (single fetch)
        │    • produce `AuthorizationRequestMaterial` { rawBody?, byValueParams?, requestUri? }
        │    • by-value URI → params or inline body (no network)
        │    • request_uri only QR → **one** HTTP GET (Accept: application/json, application/oauth-authz-req+jwt)
        │    • minimal unsigned JWT payload read allowed ONLY for routing/classification
        │      (same schemes legacy allows before verify)
        │    • normalize routing fields (see DCQL normalization below)
        │
        ├─ Stage 2: classify protocol path
        │    shouldUseOid4vcVpAdapter({ flag, presentationFlowOrigin, normalizedAuthorizationRequest })
        │    • flow origin must be scan | same-device (Phase 1 adapter-eligible origins)
        │    • my-qr | issuer-renewal → legacy always
        │    • after fetch: must be DCQL + direct_post, not PEX/dual-format/issuer OID4VP
        │    • persist result on ResolvedPresentationRequest.protocolPath
        │
        ├─ Stage 3a (protocolPath === 'oid4vc'): adapter parse/verify
        │    parseAuthorizationRequestViaOid4vc(material)  ← NO second fetch
        │    • verify/parse the **exact bytes** captured in Stage 1
        │    • trust gate BEFORE did.json / JAR verify (inject findTrustedVerifier)
        │    • store Oid4vcAdapterContext.authorizationRequestPayload (opaque lib payload)
        │
        ├─ Stage 3b (protocolPath === 'legacy'): legacy parse/verify
        │    authorizationRequestJar + legacy parsers on the **same Stage 1 material** (NO second fetch)
        │
        ├─ findTrustedVerifier()          (wallet — post-parse sanity)
        ├─ readOptionalDcqlQuery()        (wallet)
        ├─ DCQL match + disclosures       (wallet)
        └─ ResolvedPresentationRequest { protocolPath, oid4vcContext? }
        │
        ▼
UI consent → build vp_token (wallet sign)
        │
        ▼
submitPresentationResponse(request, { vpToken })
        │
        ├─ formatVpTokenForResponse()     (wallet)
        ├─ route by request.protocolPath  (NOT a second shouldUseOid4vcVpAdapter call)
        │    ├─ legacy: URLSearchParams + fetch
        │    └─ oid4vc: submitDirectPostViaOid4vc(request.oid4vcContext, ...)
        │         • pass stored authorizationRequestPayload + formatted vp_token + state
        │         • no presentation_submission for Phase 1 DCQL flows
        └─ readVerifierReturnUrl()        (wallet)
```

**Routing note:** Primary Scan QR uses `request_uri` with DCQL inside the fetched object — classification **cannot** run before Stage 1 fetch. Never call `shouldUseOid4vcVpAdapter()` from the raw URI alone.

**Single-fetch invariant:** Stage 3 (adapter and legacy) must consume the Stage 1 `AuthorizationRequestMaterial` only. Do **not** re-fetch `request_uri` in `authorizationRequestJar`, legacy helpers, or the lib wrapper — one-time or mutable verifier endpoints could return different payloads between classification and verification.

### Presentation flow origin

Explicit caller-provided origin gates adapter eligibility **before** DCQL details are known (except `request_uri` fetch still required for classification fields):

| `presentationFlowOrigin` | Phase 1 adapter eligible? | Typical caller |
|--------------------------|---------------------------|----------------|
| `scan` | Yes (if flag + in-scope request) | Scan tab / `Oid4VpDisclosureFlow` with `presentationOrigin: 'scanned-verifier-qr'` |
| `same-device` | Yes (if flag + in-scope request) | `walletapp://callback` → presentation route; **also** direct `Linking.useURL()` / `getInitialURL()` VP requests on `PresentationRequestScreen` |
| `my-qr` | **No — legacy always** | My QR broker → `Oid4VpDisclosureFlow` with `presentationOrigin: 'wallet-generated-qr'` |
| `issuer-renewal` | **No — legacy always** | `renewalOid4VpPresentation.ts` silent presentation |

**Direct Linking path (locked):** When `PresentationRequestScreen` accepts a VP URI from `Linking.useURL()` or `Linking.getInitialURL()` without going through `deeplinkStore` (e.g. cold-start `walletapp://callback`), treat `presentationFlowOrigin` as **`same-device`** — same adapter eligibility as callback-routed VP. Do not default to `scan`. Add tests for both store-backed and direct-Linking entry paths.

Extend `ResolvePresentationRequestOptions` with required `presentationFlowOrigin`. Map at call sites — **do not infer origin from URI shape alone** (broker requests can satisfy DCQL + `direct_post` checks).

#### Origin persistence (Scan vs same-device deeplink)

Today both paths converge on `PresentationRequestScreen`, which reads only `pendingUri` from `deeplinkStore` and hardcodes `presentationOrigin="scanned-verifier-qr"`. That loses `same-device` for `walletapp://callback` VP returns.

Phase 1 must persist origin when enqueueing a pending VP request:

| Entry | Set origin | Files |
|-------|------------|-------|
| Scan tab QR handoff | `scan` | `app/(tabs)/scan.tsx` |
| Same-device callback VP | `same-device` | `app/callback.tsx` |
| My QR broker | `my-qr` | `app/(tabs)/qr.tsx` (direct `Oid4VpDisclosureFlow`; no deeplink store) |
| Issuer renewal silent VP | `issuer-renewal` | `renewalOid4VpPresentation.ts` |

**Store shape (recommended):** extend `deeplinkStore` with `pendingPresentationFlowOrigin: PresentationFlowOrigin | null`, set atomically with `setPendingDeeplinkUri` for VP URIs (or a dedicated `setPendingPresentationRequest({ uri, origin })` helper). `PresentationRequestScreen` reads origin and passes `presentationFlowOrigin` into `resolvePresentationRequest` (and maps to existing `presentationOrigin` UI prop where needed).

Add/update tests: `deeplinkStore.test.ts`, `PresentationRequestScreen.test.tsx` (callback VP → `same-device`; scan handoff → `scan`; direct Linking cold-start VP → `same-device`).

#### DCQL normalization before routing

By-value authorization requests often carry `dcql_query` as a **JSON string**; fetched `request_uri` bodies provide an **object**. Wallet helpers such as `isDualFormatDcqlRequest()` expect a parsed `DcqlQuery` (camelCase credential sets).

Stage 1 (or a shared pre-routing normalizer used by Stage 2) must apply the same parsing rules as `readOptionalDcqlQuery()` **before** `shouldUseOid4vcVpAdapter()` runs — otherwise dual-format DCQL requests can be misrouted to the adapter when flag is on.

Unit test: by-value string `dcql_query` fixture where legacy would classify dual-format → assert `protocolPath: 'legacy'`.

### Resolved model extensions

Add to `ResolvedPresentationRequest`:

```typescript
protocolPath: 'legacy' | 'oid4vc'
oid4vcContext?: Oid4vcAdapterContext

type Oid4vcAdapterContext = {
  /** Opaque payload returned by @openid4vc request resolution — required for library submit API */
  authorizationRequestPayload: Record<string, unknown>
  /** Present when lib submit API also requires the resolved authorization-response envelope */
  authorizationResponsePayload?: Record<string, unknown>
}
```

Submit must read `request.protocolPath` and `request.oid4vcContext` — do not re-run classification or drop the original authorization payload.

**Phase 0 spike fallback:** If library submit requires fields the wallet cannot preserve cleanly, document spike outcome: **parse via lib + wallet-owned `URLSearchParams` submit** for Phase 1 (adapter context optional). Default design remains parse **and** submit through the lib when spike confirms API fit.

### New modules

| File | Responsibility |
|------|----------------|
| `src/services/vp/oid4vc/oid4vcCallbacks.ts` | Complete `@openid4vc/openid4vp` / `@openid4vc/oauth2` `CallbackContext` for RN/Hermes |
| `src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.ts` | Read build-time `EXPO_PUBLIC_OID4VC_VP_ADAPTER` |
| `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.ts` | Flag + `presentationFlowOrigin` + **post-fetch** authorization request in-scope checks |
| `src/services/vp/oid4vc/fetchAuthorizationRequestMaterial.ts` | Stage 1 **single** fetch / by-value extraction → `AuthorizationRequestMaterial` (raw bytes + routing fields) |
| `src/services/vp/oid4vc/parseAuthorizationRequest.ts` | Stage 3a: parse/verify Stage 1 material via lib → normalized `JsonRecord` + `Oid4vcAdapterContext` |
| `src/services/vp/oid4vc/submitDirectPostResponse.ts` | Stage submit: lib submit using stored `authorizationRequestPayload` + wallet-formatted `vp_token` |
| `src/services/vp/oid4vc/types.ts` | `AuthorizationRequestMaterial`, `Oid4vcAdapterContext`, `PresentationFlowOrigin`, `ProtocolPath` |
| `src/services/vp/oid4vc/*.test.ts` | Unit + parity + routing tests |

### Modified modules

| File | Change |
|------|--------|
| `src/services/vp/presentationService.ts` | Stage 1–3 routing; DCQL pre-routing normalization; extend `ResolvedPresentationRequest`; route submit by `protocolPath` |
| `src/store/deeplinkStore.ts` | Persist `pendingPresentationFlowOrigin` with pending VP URI |
| `src/screens/PresentationRequestScreen.tsx` | Read stored origin; direct Linking VP → `same-device`; pass `presentationFlowOrigin` into resolve |
| `app/(tabs)/scan.tsx` | Set origin `scan` on VP handoff |
| `app/callback.tsx` | Set origin `same-device` on VP callback route |
| `src/components/Oid4VpDisclosureFlow.tsx` | Accept `presentationFlowOrigin` prop → resolve options |
| `src/services/credentials/renewalOid4VpPresentation.ts` | Pass `issuer-renewal` (legacy path even when flag on) |
| `.env.example` | Document `EXPO_PUBLIC_OID4VC_VP_ADAPTER` (boolean, default false, build-time) |
| `docs/TASKS.md` | Track migration status |

### Dependencies (Phase 1 add)

Pin an **exact** npm version after Phase 0 spike (OWF labs releases break frequently). Example shape:

```json
"@openid4vc/openid4vp": "<exact-version-from-spike>"
```

Add `dcql-ts` only if required by `@openid4vc/openid4vp` peer dependency or adapter normalization — not for wallet DCQL matching in Phase 1.

If Phase 0 spike shows `@openid4vc/openid4vp` lacks holder-side parse/submit APIs, pivot to `@pagopa/io-wallet-oid4vp` for protocol plumbing only; keep this spec's adapter boundary unchanged.

Legacy VCI client packages removed in Phase 3 (complete).

### Adapter scope (protocol plumbing)

**In scope:**

- By-value `openid4vp://` authorization requests with inline `dcql_query`
- `request_uri` fetch (`Accept: application/json, application/oauth-authz-req+jwt`)
- Request Object JWT (`typ: oauth-authz-req+jwt`) for supported `client_id` schemes:
  - **`redirect_uri:`** — unsigned allowed (dev Verifier API golden path); optional signed JWT when key available
  - **`decentralized_identifier:did:web:`** — signed JAR required (production path)
  - **`pre_registered`** bare `did:web:...` — parity with legacy allowlist entries when env emits them
- Reject unsupported `client_id` schemes matching legacy (`verifier_attestation`, `x509_*`, `origin`, `openid_federation`)
- `direct_post` only (`response_mode` must be `direct_post`)
- Submit body: `vp_token`, optional `state` — **no** `presentation_submission` for Phase 1 DCQL flows

**Out of scope (wallet retains — use legacy parse/submit even when flag is `true`):**

- Presentation Exchange (`presentation_definition` / `_uri`)
- Dual-format DCQL (`dc+sd-jwt` + `mso_mdoc` in one response)
- Issuer OID4VP (`EXPO_PUBLIC_ISSUER_OID4VP_*`, renewal silent presentation)
- My QR broker deposit path

**Wallet-owned in all paths:**

- Trusted verifier policy (`trustedVerifiers.ts`, `trustedVerifierMatcher.ts`)
- DCQL credential matching and credential-set OR selection
- Disclosure labels (`cardSchemas.ts`, `claimDisclosurePolicy.ts`)
- KB-JWT / VP JWT signing (`crypto.ts`, per-credential keys)
- `formatVpTokenForResponse` and dev shape probes
- Holder portal `redirect_uri` return URL policy (`readVerifierReturnUrl`)

### Flag routing (`shouldUseOid4vcVpAdapter`)

Input: `{ flagEnabled, presentationFlowOrigin, normalizedAuthorizationRequest }` where `normalizedAuthorizationRequest` is available **after Stage 1 fetch + DCQL normalization** (or by-value params normalized for inline DCQL).

Return `true` only when **all** hold:

1. `EXPO_PUBLIC_OID4VC_VP_ADAPTER === 'true'` (build-time)
2. `presentationFlowOrigin` is `scan` or `same-device`
3. Request is DCQL (`dcql_query` present; no `presentation_definition` / `_uri`)
4. `response_mode === 'direct_post'`
5. Not a dual-format DCQL request (`isDualFormatDcqlRequest`)
6. Not issuer OID4VP (`isIssuerOid4VpClientId` / issuer response URI)

Otherwise select `protocolPath: 'legacy'`.

**Never** infer adapter eligibility from URI shape alone. **Never** enable adapter for `my-qr` or `issuer-renewal` in Phase 1 even when conditions 3–6 pass.

### Trust-before-network (adapter contract)

Adapter parse must preserve the legacy security order from `authorizationRequestJar.ts`:

1. Obtain minimal `client_id` + `response_uri` from by-value params or JWT payload (unsigned payload read is allowed only when legacy allows it for the scheme).
2. Call wallet `findTrustedVerifier(clientId, responseUri, trustedVerifiers)` **before** any `did.json` fetch or signature verification that hits the network.
3. If untrusted for schemes that require trust before key resolution, throw `PresentationRequestInvalid: verifier is not trusted` (same message family as legacy) — do not fetch DID documents for unknown verifiers.
4. Only then resolve verification JWK (pinned env JWK or `resolveDidWebVerificationJwk`) and verify JAR signature when required.

Inject `trustedVerifiers` and `findTrustedVerifier` into the adapter; do not reimplement trust policy inside the lib wrapper.

### Parity rule

For the same fixture input, adapter parse output must produce a `JsonRecord` with equivalent fields for downstream code: `client_id`, `response_uri`, `response_mode`, `nonce`, `dcql_query`, optional `state`. Field names and values used by `resolvePresentationRequest` must match legacy behavior.

**Required parity fixtures** (from existing tests):

- `redirect_uri:` + `request_uri` unsigned/signed JWT + DCQL (dev Verifier API)
- `decentralized_identifier:did:web:` signed JAR + DCQL (production-style)
- By-value `openid4vp://` inline `dcql_query`

### Error mapping

Adapter and lib failures map to existing error prefixes:

| Condition | Throw |
|-----------|-------|
| `request_uri` fetch failure | `PresentationRequestFetchFailed` |
| Malformed request | `PresentationRequestInvalid` |
| Unsupported scheme / response_mode | `PresentationRequestUnsupported` |
| JAR verification failure | `PresentationRequestInvalid` |
| Submit HTTP non-success | `PresentationSubmissionFailed` (or `:issuer:` suffix when issuer URI/client) |

Always `logWalletError` with raw diagnostic before mapped throw.

### Callbacks (`oid4vcCallbacks.ts`)

**Phase 0 spike decision (locked for Phase 1):** Prefer **functional resolver/submit APIs** exported by `@openid4vc/openid4vp` (e.g. authorization-request resolution + authorization-response submission helpers confirmed in spike) over instantiating `Openid4vpClient` if the class constructor requires holder signing/encryption callbacks (`signJwt`, `encryptJwe`, etc.) not used in Phase 1.

If the spike selects `Openid4vpClient`, implement the **full** client callback contract with fail-closed stubs for unused paths:

| Callback | Phase 1 implementation |
|----------|------------------------|
| `fetch` | Injectable (MSW / tests); default `global.fetch` |
| `hash` | `react-native-quick-crypto` |
| `verifyJwt` | Delegate to existing `verifyEdDsaCompactJwt`; resolve verification keys via wallet `findTrustedVerifier` + pinned JWK + `resolveDidWebVerificationJwk` (trust-before-network) |
| `decryptJwe` | **Fail closed** — throw `PresentationRequestUnsupported` |
| `getX509CertificateMetadata` | **Fail closed** — throw `PresentationRequestUnsupported` |
| `signJwt` | **Fail closed** if required by client ctor — VP token signing stays wallet-owned (`crypto.ts`), not lib client |
| `encryptJwe` | **Fail closed** if required by client ctor — JARM/JWE out of scope Phase 1 |

Document the chosen API surface (functional vs client class) in the Phase 0 spike notes appended to the implementation plan.

If the library exposes separate **`WalletVerificationOptions.resolveVerificationMaterial`** (or equivalent) for `decentralized_identifier:did:web:`, implement it by calling wallet trust + `resolveDidWebVerificationJwk` — do not let the lib fetch DID documents before `findTrustedVerifier` succeeds.

Design the callback module for Phase 2 VCI reuse (add PoP `sign` / `randomBytes` hooks later without restructuring).

## Testing

### Unit tests

1. **Phase 0 spike** — Hermes smoke: install pinned `@openid4vc/openid4vp`, callbacks wired, one dev-verifier parse + mock submit; document chosen version in spec/plan.
2. **Adapter tests** — Stage 1 single-fetch (`request_uri` fetched once); Stage 3 asserts no second network GET; DCQL string normalization before routing; routing (`my-qr` → legacy with flag on); parse by-value; `redirect_uri` unsigned JAR; signed `did:web` JAR; reject bad schemes; submit with preserved `authorizationRequestPayload`; trust-before-fetch (untrusted → no DID fetch mock call).
3. **Parity tests** — shared fixtures: legacy vs adapter normalized output equivalence (include `redirect_uri` dev fixture).
4. **Flag integration** — subset of `presentationService.test.ts` runs with flag on and off:
   - `resolves request_uri JWT ... DCQL` with `presentationFlowOrigin: 'scan'`
   - `resolves DCQL dc+sd-jwt ... vct_values`
   - `submits vp_token ... direct_post` asserts `protocolPath` preserved
   - `rejects untrusted Verifier requests`
   - PEX / issuer / dual-format / my-qr: legacy path only — with flag `true`, assert `protocolPath === 'legacy'`

**Jest flag pattern:** set `process.env.EXPO_PUBLIC_OID4VC_VP_ADAPTER` before importing modules under test (or pass an explicit `useOid4vcAdapter` inject param on testable helpers) so flag-on/off cases do not require global module cache hacks.

### Regression gate

```bash
yarn test src/services/vp/
yarn tsc --noEmit
yarn lint
yarn scan:bundle-leaks
```

### Manual E2E checklist (required for Phase 1 done)

Setup: `EXPO_PUBLIC_OID4VC_VP_ADAPTER=true` + existing dev verifier env.

| # | Step | Expected |
|---|------|----------|
| 1 | Scan `openid4vp://` DCQL QR (`request_uri`) | Consent screen, correct disclosures |
| 2 | Approve + biometric | Submit succeeds, success UI |
| 3 | VP deeplink `walletapp://callback` | Routes to presentation flow like Scan |
| 4 | Flag `false` | Legacy path still works |
| 5 | Untrusted verifier | Friendly error, no submit |

Run on Hermes dev build (Android device), not Jest-only.

Verifier: dev host (`verifier.zenithcomp.co.th` or local `/dev/vp-*`). Production `EXPO_PUBLIC_VERIFIER_DID_WEB_*` E2E is a separate release gate.

## Rollout

`EXPO_PUBLIC_*` values are embedded at **Expo bundle time**. Enabling or disabling the adapter requires a **new build** (dev client, staging, or production) — not an in-app or remote toggle.

1. Ship adapter + flag default `false` in all build profiles.
2. Internal QA: rebuild with flag `true` + E2E checklist.
3. Enable in dev/staging **build env** (`.env`, EAS env) and distribute new builds.
4. Production enable after soak — separate production build with flag `true`; rollback = ship a build with flag `false`.
5. Remove legacy parse/submit paths after production adapter builds are stable — **defer past Phase 1**.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Hermes bundle / polyfill issues | `yarn scan:bundle-leaks` + device smoke |
| Lib errors break `scanFriendlyErrors` | Adapter wrap layer with stable prefixes |
| JAR `did:web` parity drift | Parity tests + fixtures from `authorizationRequestJar.test.ts` |
| Tests never exercise adapter path | CI runs flag-on subset |
| Dual dependency (legacy VCI client + @openid4vc) | Accepted until Phase 3; document in TASKS |
| `request_uri` QR mis-routed before fetch | Mandatory Stage 1 fetch → classify; unit test `request_uri`-only input |
| My QR incorrectly uses adapter | Require `presentationFlowOrigin`; broker/my-qr tests assert `protocolPath: 'legacy'` |
| Lost authorization payload breaks lib submit | Persist `Oid4vcAdapterContext`; submit test asserts payload round-trip |
| Build-time flag mistaken for runtime toggle | Document in `.env.example` + rollout section |
| Same-device deeplink mislabeled as scan | Persist `pendingPresentationFlowOrigin`; callback route sets `same-device` |
| Dual-format misrouted from string `dcql_query` | Normalize DCQL before `shouldUseOid4vcVpAdapter`; unit test string fixture |
| Openid4vpClient ctor requires sign/encrypt callbacks | Spike locks functional APIs or fail-closed `signJwt` / `encryptJwe` |
| Double fetch of `request_uri` | Single-fetch invariant; mock fetch count test |
| Direct Linking VP mislabeled as scan | `PresentationRequestScreen` maps Linking entry to `same-device` |

## Phase 1 definition of done

- [ ] Phase 0 spike complete; exact `@openid4vc/openid4vp` version pinned in `package.json`; submit API fit documented (lib submit vs wallet-owned submit fallback)
- [ ] `src/services/vp/oid4vc/` adapter + callbacks + `shouldUseOid4vcVpAdapter` + Stage 1 fetch shipped
- [ ] `ResolvedPresentationRequest.protocolPath` + `oid4vcContext` wired through resolve → submit
- [ ] Call sites pass `presentationFlowOrigin`; deeplink store persists origin for Scan vs callback VP (`deeplinkStore` + `PresentationRequestScreen` tests)
- [ ] DCQL normalized before adapter routing (string `dcql_query` fixture covered)
- [ ] `EXPO_PUBLIC_OID4VC_VP_ADAPTER` in `.env.example` (boolean, default false, **build-time** documented)
- [ ] Adapter unit + parity + routing tests pass (including `redirect_uri` dev fixture + my-qr legacy-with-flag-on)
- [ ] Flag-on subset of `presentationService.test.ts` passes
- [ ] Stage 1 single-fetch invariant enforced (no second `request_uri` GET in Stage 3)
- [ ] `yarn lint` passes after VP/oid4vc edits
- [ ] Manual E2E checklist passes on device (dev `redirect_uri` verifier, **new build** with flag `true`)
- [ ] `docs/TASKS.md` updated under OID4VP / library migration backlog

## Future phases (not implemented here)

| Phase | Scope |
|-------|-------|
| 1.5 | Broker My QR, issuer OID4VP, dual-format VP, PEX |
| 2 | `@openid4vc/openid4vci` replaces legacy VCI client in `exchangeService.ts`; reuse `oid4vcCallbacks.ts` — **complete** (see Phase 2 VCI design spec) |
| 3 | Remove legacy VCI client packages (complete) |
