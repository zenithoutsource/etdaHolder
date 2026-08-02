# OID4VC VP Adapter — `@openid4vc/openid4vp` Phase 1

**Date:** 2026-07-31  
**Status:** Approved for implementation planning  
**Related:** `docs/TASKS.md` (OID4VP local service boundary note), `docs/ARCHITECTURE.md` §3, `src/services/vp/presentationService.ts`, `src/services/vp/authorizationRequestJar.ts`, `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`

## Summary

Introduce a **replaceable OID4VP protocol adapter** using `@openid4vc/openid4vp` (OpenWallet Foundation `oid4vc-ts`) behind a feature flag. Phase 1 migrates **protocol plumbing only** (authorization request fetch/parse and `direct_post` submission) for **Scan tab DCQL** and **same-device deeplink** flows. Wallet orchestration (trusted verifier checks, DCQL credential matching, disclosures, KB-JWT signing via Keychain, redirect handling) stays in `presentationService.ts` and existing VP modules.

This is **Phase 1 of a 3-phase initiative** to align with the OWF stack and eventually replace `@sphereon/oid4vci-client` in Phase 2 and remove `@sphereon/*` in Phase 3.

## Goals

1. **Reduce maintenance** of hand-written OID4VP protocol code (`authorizationRequestJar`, fetch/submit HTTP details).
2. **Ecosystem alignment** — same library family used by Credo and adopted by Sphereon VP (DCQL via `dcql-ts`).
3. **Safe rollout** — `EXPO_PUBLIC_OID4VC_VP_ADAPTER` flag; legacy path remains default until E2E validation.
4. **Replaceable boundary** — fulfills the `docs/TASKS.md` note that `src/services/vp/` was designed to swap when a confirmed library exists.

## Non-goals (Phase 1)

- My QR broker OID4VP (`brokerSessionClient.ts`).
- Issuer OID4VP (renewal silent presentation, P2 PID auth via `EXPO_PUBLIC_ISSUER_OID4VP_*`).
- Dual-format VP (`dc+sd-jwt` + `mso_mdoc` in one `vp_token`).
- Presentation Exchange (`presentation_definition`) flows — legacy path only when flag is on.
- `direct_post.jwt`, JARM, `dc_api` response modes.
- Phase 2 VCI migration (`exchangeService.ts` → `@openid4vc/openid4vci`).
- Removing `@sphereon/*` dependencies.
- UI changes beyond existing Scan error surfacing.

## Background

| Layer | Today | Phase 1 target |
|-------|-------|----------------|
| VCI | `@sphereon/oid4vci-client` + `exchangeService.ts` | **No change** |
| VP parse/submit | Custom `authorizationRequestJar.ts` + inline fetch/POST in `presentationService.ts` | `@openid4vc/openid4vp` adapter when flag on |
| VP orchestration | `presentationService.ts` (~1k lines) | **No change** |
| Signing | Keychain Ed25519 via `crypto.ts` | **No change** — adapter does not sign VP tokens |

`docs/TASKS.md` records that a Sphereon OID4VP package was not available at implementation time; the local `src/services/vp/` boundary was intentionally narrow and replaceable.

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Primary goals | Reduce protocol maintenance (A) + OWF ecosystem alignment (B) |
| Overall plan | 3 phases: VP adapter → VCI migration → remove Sphereon |
| Phase 1 flows | Scan tab `openid4vp://` DCQL QR + same-device `walletapp://callback` VP deeplink |
| Rollout | Feature flag `EXPO_PUBLIC_OID4VC_VP_ADAPTER`, default `false` |
| Success criteria | Automated tests pass + manual E2E on dev verifier (not production `did:web` gate) |
| Adapter placement | Dedicated module `src/services/vp/oid4vc/` (not inline-only in `presentationService.ts`) |
| `vp_token` assembly | Wallet-owned — `presentationTokenBuilders/`, `sdJwtSelectiveDisclosure.ts`, `crypto.ts` |
| DCQL matching | Wallet-owned — `dcqlCredentialMatch.ts`, `presentationCredentialMatch.ts` (not delegated to lib in Phase 1) |
| DCQL `vp_token` shape env | Wallet-owned — `formatVpTokenForResponse()` + `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` |
| Error prefixes | Preserve existing (`PresentationRequestInvalid`, `VerifierUntrusted`, etc.) for `scanFriendlyErrors.ts` |
| Logging | `logWalletStep` / `logWalletError` with `oid4vp` scope; no vp_token, claims, or key material |

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
Phase 0 (within Phase 1 slice): oid4vcCallbacks.ts — RN/Hermes crypto + fetch callbacks
Phase 1: VP protocol adapter — Scan + deeplink DCQL direct_post
Phase 1.5 (defer): broker, issuer OID4VP, dual-format, PEX
Phase 2: VCI protocol layer → @openid4vc/openid4vci (replace Sphereon in exchangeService)
Phase 3: Remove @sphereon/* packages
```

### Data flow (Phase 1)

```text
openid4vp:// or walletapp://callback
        │
        ▼
resolvePresentationRequest()
        │
        ├─ readAuthorizationRequest()  ← FLAG
        │    ├─ legacy: parseUrl + fetch + authorizationRequestJar
        │    └─ adapter: parseAuthorizationRequestViaOid4vc()
        │
        ├─ findTrustedVerifier()          (wallet)
        ├─ readOptionalDcqlQuery()        (wallet)
        ├─ DCQL match + disclosures       (wallet)
        └─ ResolvedPresentationRequest
        │
        ▼
UI consent → build vp_token (wallet sign)
        │
        ▼
submitPresentationResponse()
        │
        ├─ formatVpTokenForResponse()     (wallet)
        ├─ submit HTTP  ← FLAG
        │    ├─ legacy: URLSearchParams + fetch
        │    └─ adapter: submitDirectPostViaOid4vc()
        └─ readVerifierReturnUrl()        (wallet)
```

### New modules

| File | Responsibility |
|------|----------------|
| `src/services/vp/oid4vc/oid4vcCallbacks.ts` | Injectable `fetch`, hash, randomBytes; EdDSA verify for JAR via existing `verifyEdDsaCompactJwt` |
| `src/services/vp/oid4vc/isOid4vcVpAdapterEnabled.ts` | Read `EXPO_PUBLIC_OID4VC_VP_ADAPTER` |
| `src/services/vp/oid4vc/parseAuthorizationRequest.ts` | URI / `request_uri` → `JsonRecord` semantically equivalent to legacy |
| `src/services/vp/oid4vc/submitDirectPostResponse.ts` | POST `application/x-www-form-urlencoded` `vp_token` + optional `state` |
| `src/services/vp/oid4vc/*.test.ts` | Unit + parity tests |

### Modified modules

| File | Change |
|------|--------|
| `src/services/vp/presentationService.ts` | Branch `readAuthorizationRequest` and HTTP submit on flag |
| `.env.example` | Document `EXPO_PUBLIC_OID4VC_VP_ADAPTER` (boolean, default false) |
| `docs/TASKS.md` | Track migration status |

### Dependencies (Phase 1 add)

```json
"@openid4vc/openid4vp"
```

Add `dcql-ts` only if required by `@openid4vc/openid4vp` peer dependency or adapter normalization — not for wallet DCQL matching in Phase 1.

Retain all `@sphereon/*` until Phase 3.

### Adapter scope (protocol plumbing)

**In scope:**

- By-value `openid4vp://` authorization requests with inline `dcql_query`
- `request_uri` fetch (`Accept: application/json, application/oauth-authz-req+jwt`)
- Signed JAR (`typ: oauth-authz-req+jwt`) with `did:web` client binding
- Reject unsupported `client_id` schemes matching legacy (`verifier_attestation`, `x509_*`, `origin`, `openid_federation`)
- `direct_post` only (`response_mode` must be `direct_post`)

**Out of scope (wallet retains):**

- Trusted verifier policy (`trustedVerifiers.ts`, `trustedVerifierMatcher.ts`)
- DCQL credential matching and credential-set OR selection
- Disclosure labels (`cardSchemas.ts`, `claimDisclosurePolicy.ts`)
- KB-JWT / VP JWT signing (`crypto.ts`, per-credential keys)
- `formatVpTokenForResponse` and dev shape probes
- Holder portal `redirect_uri` return URL policy (`readVerifierReturnUrl`)

### Parity rule

For the same fixture input, adapter parse output must produce a `JsonRecord` with equivalent fields for downstream code: `client_id`, `response_uri`, `response_mode`, `nonce`, `dcql_query`, optional `state`. Field names and values used by `resolvePresentationRequest` must match legacy behavior.

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

| Callback | Implementation |
|----------|----------------|
| `fetch` | Injectable (MSW / tests) |
| `hash` / `randomBytes` | `react-native-quick-crypto` |
| EdDSA verify (JAR) | Existing `verifyEdDsaCompactJwt` |
| EdDSA sign | **Not used in Phase 1** — signing stays in `crypto.ts` |

Design callbacks for Phase 2 VCI reuse (add PoP sign hook later without restructuring).

## Testing

### Unit tests

1. **Adapter tests** — parse by-value, fetch `request_uri` (JSON + JWT), signed JAR, reject bad schemes, submit success/failure.
2. **Parity tests** — shared fixtures: legacy vs adapter parse output equivalence.
3. **Flag integration** — subset of `presentationService.test.ts` runs with flag on and off:
   - `resolves request_uri JWT ... DCQL`
   - `resolves DCQL dc+sd-jwt ... vct_values`
   - `submits vp_token ... direct_post`
   - `rejects untrusted Verifier requests`
   - PEX / issuer / dual-format tests: legacy path only (flag off or skipped when flag on)

### Regression gate

```bash
yarn test src/services/vp/
yarn tsc --noEmit
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

1. Ship adapter + flag default `false`.
2. Internal QA with flag `true` + E2E checklist.
3. Enable in dev/staging env files.
4. Production enable after soak — not required for Phase 1 merge.
5. Remove legacy parse/submit paths after production flag is stable — **defer past Phase 1**.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Hermes bundle / polyfill issues | `yarn scan:bundle-leaks` + device smoke |
| Lib errors break `scanFriendlyErrors` | Adapter wrap layer with stable prefixes |
| JAR `did:web` parity drift | Parity tests + fixtures from `authorizationRequestJar.test.ts` |
| Tests never exercise adapter path | CI runs flag-on subset |
| Dual dependency (@sphereon + @openid4vc) | Accepted until Phase 3; document in TASKS |

## Phase 1 definition of done

- [ ] `src/services/vp/oid4vc/` adapter + callbacks shipped
- [ ] `EXPO_PUBLIC_OID4VC_VP_ADAPTER` in `.env.example` (default false)
- [ ] Adapter unit + parity tests pass
- [ ] Flag-on subset of `presentationService.test.ts` passes
- [ ] Manual E2E checklist passes on device
- [ ] `docs/TASKS.md` updated

## Future phases (not implemented here)

| Phase | Scope |
|-------|-------|
| 1.5 | Broker My QR, issuer OID4VP, dual-format VP, PEX |
| 2 | `@openid4vc/openid4vci` replaces Sphereon in `exchangeService.ts`; reuse `oid4vcCallbacks.ts` |
| 3 | Remove `@sphereon/oid4vci-client` and `@sphereon/oid4vci-common` (e.g. `claimDisclosurePolicy.ts` types) |
