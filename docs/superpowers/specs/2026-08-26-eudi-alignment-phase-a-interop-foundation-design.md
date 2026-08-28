# EUDI Alignment — Phase A: Interop Foundation

**Date:** 2026-08-26 (updated 2026-08-28 for eudi-dev v2.0.7)  
**Status:** Approved — decisions locked 2026-08-28 (hybrid C x509 trust, adapter-as-helper, rollout A2→A3→A1)  
**Supersedes:** `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md` Phase 1 scope (VP flag fork); consolidation is A1 below.  
**Implementation plan:** `docs/superpowers/plans/2026-08-28-eudi-alignment-phase-a-interop-foundation.md`
**Reference:** [eudi-dev v2.0.7](https://github.com/dominikschlosser/eudi-dev) (trial at `C:\project\eudi-dev-2.0.7`) — `internal/wallet/`, `docs/spec-compliance.md`, ADR-0012 (every entry point runs the same flow). Supersedes comparisons against v1.26.2.  
**Related:** `docs/superpowers/specs/2026-08-25-demo-interop-vp-submit-design.md`, `docs/superpowers/specs/2026-08-26-verifier-submit-interop-design.md`, `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md`, `src/services/vp/presentationService.ts`, `src/services/vp/clientIdInteropPolicy.ts`, `src/services/oid4vc/dpopIssuanceSession.ts`, `docs/TASKS.md`

## Summary

Phase A closes the three highest-impact gaps between this wallet and eudi-dev **protocol behavior** without weakening production security. It delivers: (1) a **single OID4VP orchestration path** for all entry points, (2) **production-grade `x509_hash` / `x509_san_dns` client_id** handling with JAR verification (not demo-interop-only), and (3) **metadata-driven DPoP** for OID4VCI (negotiated from issuer AS metadata, not a global env opt-in).

Demo interop (`EXPO_PUBLIC_WALLET_DEMO_INTEROP`) remains a separate trust-relaxation profile. Phase A moves wire-format and scheme support into the default production path while keeping allowlist / `did:web` pin policies intact.

## Problem

| Gap | eudi-dev (correct) | Wallet today |
|-----|-------------------|--------------|
| VP entry points | One flow: CLI, scan, HTTP `/authorize`, DC API | Split: legacy `presentationService.ts` vs `@openid4vc` adapter (`EXPO_PUBLIC_OID4VC_VP_ADAPTER`); My QR, PEX, dual-format, issuer-PID stay legacy-only |
| `x509_hash` client_id | Supported; HAIP requires it; JAR verified against leaf `x5c` | Supported only when `readWalletDemoInteropEnabled()` or `trustAnyHttpsPeer` (`clientIdInteropPolicy.ts`) |
| DPoP (VCI) | Negotiated when AS metadata advertises DPoP + ES256 | Global opt-in: `EXPO_PUBLIC_OID4VC_DPOP_ENABLED=true` (`dpopIssuanceSession.ts`) |

Active device work (Animo `x509_hash`, `urn:eudi:pid:1`, Tier 1 shape cache) proves third-party verifier interop is the near-term goal. Phase A removes the structural blockers that force demo flags and dual code paths.

## Goals

1. **ADR-0012 parity** — Scan, same-device deeplink, My QR broker, and DC API presentation all call the same resolve → match → consent → sign → submit pipeline. Protocol fetch/parse/submit may delegate to `@openid4vc/openid4vp` internally, but orchestration is not duplicated.
2. **Production `x509_*` client_id** — `x509_hash` and `x509_san_dns` work when the verifier passes the existing trust gate (`findTrustedVerifier()`), without `EXPO_PUBLIC_WALLET_DEMO_INTEROP`.
3. **JAR + x5c for x509 client_id** — Request Object signature verified against leaf certificate in `x5c`; `x509_hash` value must match SHA-256 of that leaf cert (eudi-dev `clientid.go` behavior).
4. **Metadata-driven DPoP (VCI)** — When authorization server metadata lists DPoP with ES256, token/credential/deferred requests use DPoP automatically. Env flag becomes override-only (`EXPO_PUBLIC_OID4VC_DPOP_ENABLED=false` to force-disable in dev). Notification endpoint reuses the same DPoP session when Phase B3 lands.
5. **No regression** — zenithcomp dev verifier, TonyHere `did:web`, ThaiNationalID DCQL, dual-format DLT, PEX birth-date slice, and Tier 1 shape cache remain green.

## Non-goals (Phase A)

- DCQL type inheritance (`aka_vcts`) — Phase B.
- Notification Endpoint, credential response encryption, strict Nonce Endpoint policy — Phase B.
- HAIP profile enforcement — Phase C.
- OID4VCI 1.1 Interactive Authorization — Phase D.
- Replacing wallet-owned DCQL matching or VP token assembly with library code.
- Trust-any-verifier in production builds (demo interop profile unchanged).
- `verifier_attestation:`, `openid_federation:`, bare `did:` client_id (eudi-dev also refuses federation/origin misuse).

## Success criteria

1. `shouldUseOid4vcVpAdapter()` gating is removed or reduced to a single internal implementation choice; all `PresentationFlowOrigin` values share one submit path.
2. `isClientIdSchemeSupportedForTrust('x509_hash', false)` returns true when verifier is trusted via allowlist (not only demo interop).
3. Unit tests: x509 JAR verification, hash mismatch rejection, production trust without demo flag.
4. DPoP activates on mock AS metadata with `dpop_signing_alg_values_supported: ['ES256']` without `EXPO_PUBLIC_OID4VC_DPOP_ENABLED=true`.
5. **Manual A2:** Animo VP — production profile, demo interop off, origin allowlisted — trust + JAR + submit reach HTTP response (credential match may still require Phase B1).
6. **Manual A1:** Scan, My QR, and deeplink share the same submit core (unit-tested); DC API when that slice lands.

## Locked decisions (2026-08-28)

### x509 production trust — hybrid C

| Layer | Rule |
|-------|------|
| **Origin allowlist** | `EXPO_PUBLIC_VERIFIER_X509_ALLOWED_ORIGINS` (comma-separated HTTPS origins). Entry trusts any `x509_hash` / `x509_san_dns` request whose `response_uri` origin is listed. |
| **Crypto (always)** | Signed JAR + leaf `x5c`; `x509_hash` SHA-256 match; `x509_san_dns` SAN + §5.9.1 FQDN bind. |
| **Optional hash pin** | `EXPO_PUBLIC_VERIFIER_X509_CLIENT_ID` — full `x509_hash:<sha256>`; when set, also added to `trustedVerifiers` for exact `client_id` match. |
| **Never in production** | `trustAnyHttpsPeer` / demo interop solely to enable x509. |

`findTrustedVerifier()` gains **origin-only** match for x509 when `allowedOrigins` hits and scheme is supported — without requiring exact `client_id` in the static allowlist.

### VP adapter — HTTP helper only

- `@openid4vc/openid4vp` remains an **internal** parse/submit helper behind one orchestration path.
- Wallet keeps DCQL match, consent, sign, `formatVpTokenForResponse`, shape cache, JWE.
- `EXPO_PUBLIC_OID4VC_VP_ADAPTER` deprecated after A1 parity tests; not a Holder-facing fork.

## Architecture

### A1 — Unified VP orchestration

**Target shape** (eudi-dev ADR-0012):

```text
Entry (scan | deeplink | my-qr | dc-api)
  → parseAuthorizationRequest (single module)
  → findTrustedVerifier (single policy)
  → matchCredentials (DCQL / PEX / dual-format routers — unchanged ownership)
  → consent UI
  → createApprovedPresentationResponse (sign once)
  → submitPresentationResponse (single function)
       ├─ legacy direct_post form + JWE (wallet-owned)
       └─ optional @openid4vc submit helper (implementation detail, not a fork)
```

**Migration approach (recommended):**

| Step | Action |
|------|--------|
| 1 | Extract `resolvePresentationRequestCore()` and `submitPresentationResponseCore()` if not already isolated; both legacy and adapter call into them. |
| 2 | Widen adapter eligibility: remove `presentationFlowOrigin !== 'scan' && !== 'same-device'` block in `shouldUseOid4vcVpAdapter.ts` **or** delete the flag and always use adapter for HTTP parse/submit while wallet keeps match/sign. |
| 3 | Wire My QR (`Oid4VpDisclosureFlow`) and DC API (`dcApiPresentationService`) through the same `submitPresentationResponseCore()` used by Scan. |
| 4 | Keep `protocolPath` on `ResolvedPresentationRequest` for logging only; eliminate divergent submit branches that skip shape cache / encryption helpers. |
| 5 | Deprecate `EXPO_PUBLIC_OID4VC_VP_ADAPTER` as user-facing toggle; replace with internal constant or remove after parity tests pass. |

**Flows that stay wallet-specialized (not duplicated, but routed through core):**

- Dual-format DCQL (`dualFormatVpToken.ts`)
- PEX (`presentationDefinitionResolver.ts`)
- Issuer renewal OID4VP (`trustedVerifiers` issuer client_id)

### A2 — Production x509 client_id

**Trust model (production-first):**

```text
parseClientId → scheme x509_hash | x509_san_dns
  → isClientIdSchemeSupportedForTrust(scheme, trustAny=false) === true   [Phase A change]
  → findTrustedVerifier() must still match (allowlist / did:web pin / response_uri binding)
  → verifyRequestObjectSignature() using x5c leaf
  → x509_hash: SHA-256(leaf DER) === prefix value
  → x509_san_dns: SAN dnsName === prefix value
  → x509_san_dns: response_uri hostname MUST match client_id FQDN (OID4VP §5.9.1, eudi-dev 2.0.6+)
```

**eudi-dev 2.0.7 delta (vs 1.26.2) affecting Phase A:**

| Change | Version | Phase A action |
|--------|---------|----------------|
| `x509_san_dns` binds `response_uri` host to `client_id` FQDN | 2.0.6 | **Add to A2** — `readResponseUriMatchesClientId()` currently returns `true` for all x509 schemes without host check |
| RSA-OAEP JWE for `direct_post.jwt` when verifier publishes RSA enc key | 2.0.2 | **Stretch / Tier 2** — not blocking Animo (`x509_hash` + ECDH-ES); document in verifier-submit Tier 2 |
| Nonce endpoint logging + strict empty-response handling | 2.0.7 | Phase B (B2) — note for cross-reference |
| JWT key proof `iss` = client_id when identified client | 2.0.5 | Phase B (VCI) — not Phase A |
| KB-JWT `sd_hash` uses credential `_sd_alg` not always SHA-256 | 2.0.6 | Phase B presentation depth — wallet hardcodes SHA-256 today |
| Nested SD-JWT claims under cleartext parent | 2.0.6 | Phase B DCQL disclosure — not Phase A |

**Changes:**

| File | Change |
|------|--------|
| `src/services/vp/clientIdInteropPolicy.ts` | Move `x509_hash` / `x509_san_dns` out of `INTEROP_X509_CLIENT_ID_SCHEMES` demo gate; keep them in supported set when verifier is trusted. Demo interop still enables `trustAnyHttpsPeer` shortcut only. |
| `src/services/vp/clientIdScheme.ts` | For `x509_san_dns`: `readResponseUriMatchesClientId()` must require `response_uri` hostname === SAN in `client_id` (OID4VP §5.9.1, eudi-dev 2.0.6 `verifyX509SAN`). For `x509_hash`: crypto binding only (hash matches leaf `x5c`); host binding is via trust allowlist, not cert hash. |
| `src/services/vp/x509Certificate.ts` | Ensure hash/SAN checks run for all trusted x509 verifiers (already partially implemented). |
| `src/services/vp/authorizationRequestJar.ts` | Require signed JAR with `x5c` for x509 schemes in production (fail closed). |
| `src/config/trustedVerifiers.ts` | `buildX509OriginTrustedVerifiersFromEnv()` from `EXPO_PUBLIC_VERIFIER_X509_ALLOWED_ORIGINS`; optional exact pin from `EXPO_PUBLIC_VERIFIER_X509_CLIENT_ID`. |
| `src/services/vp/trustedVerifierMatcher.ts` | Origin-only trust for `x509_hash` / `x509_san_dns` when response origin is allowlisted. |
| `.env.example` | Add `EXPO_PUBLIC_VERIFIER_X509_*` examples if new pins needed. |

**Security gate:** Production never enables trust-any solely for x509. Allowlist or explicit env pin required — stricter than eudi-dev debug mode, aligned with `docs/SECURITY.md`.

### A3 — Metadata-driven DPoP (OID4VCI)

**eudi-dev behavior:** `usesDPoP()` reads AS metadata; ephemeral ES256 DPoP key per issuance session; `DPoP-Nonce` retry once.

**Target:**

```text
discoverAuthorizationServer / read AS metadata
  → if dpop_signing_alg_values_supported includes ES256
       AND EXPO_PUBLIC_OID4VC_DPOP_ENABLED !== 'false'
    → createDpopIssuanceSession() for this issuance
  → token, credential, deferred endpoints: postFormWithDPoP pattern
```

| File | Change |
|------|--------|
| `src/services/oid4vc/dpopIssuanceSession.ts` | Replace `isDpopIssuanceEnabled()` with `shouldUseDpopForIssuance(asMetadata, envOverride)`. Default on when metadata supports ES256. |
| `src/services/vci/oid4vc/retrieveViaOid4vc.ts` | Pass metadata-derived DPoP decision into token/credential/deferred calls. |
| `src/services/vci/exchangeService.ts` | Dual-format and deferred paths inherit same decision. |
| `.env.example` | Document `EXPO_PUBLIC_OID4VC_DPOP_ENABLED=false` as dev kill-switch only. |

**Non-goals:** DPoP on OID4VP presentation (not in eudi-dev HTTP wallet holder path for standard direct_post).

## Error handling

| Failure | Holder UX | Log tag |
|---------|-----------|---------|
| x509_hash mismatch | `PresentationRequestInvalid` — generic untrusted/invalid request | `[oid4vp-x509]` |
| Unsigned JAR for x509 in production | Same | `[oid4vp-jar]` |
| DPoP nonce retry exhausted | Issuance failed — retry offer | `[oid4vci-dpop]` |
| Unified path regression (wrong shape) | Existing submit failure mapping; shape cache unchanged | `[oid4vp-submit]` |

## Testing

### Unit

- `clientIdInteropPolicy.test.ts` — x509 supported without demo flag when trusted.
- `authorizationRequestJar.test.ts` — x509_hash happy path + mismatch; x509_san_dns rejects `response_uri` host ≠ client_id FQDN.
- `dpopIssuanceSession.test.ts` — metadata-on default; env `false` kill-switch.
- `retrieveViaOid4vc.dpop.test.ts` — extend for metadata-driven activation.
- `presentationService.test.ts` — My QR and scan share submit core (mock).

### Manual (device)

1. Animo VP: production profile, allowlisted host, `x509_hash` — full flow 2xx without demo interop.
2. zenithcomp / TonyHere: regression scan + deeplink.
3. Issuer with DPoP-advertising AS: claim credential without setting `EXPO_PUBLIC_OID4VC_DPOP_ENABLED=true`.

## Dependencies

- **Before:** Tier 1 verifier submit shape cache (implemented 2026-08-26).
- **Parallel OK:** DC API slice (`2026-08-25-oid4vp-dc-api-design.md`) — Phase A submit core should be shared when DC API matures.
- **Blocks:** Phase B type inheritance (easier to test on unified VP path).

## Rollout

1. Land A2 (x509 production) first — smallest diff, unblocks Animo without demo flag.
2. Land A3 (DPoP default) — issuer-facing; feature-flag kill-switch retained.
3. Land A1 (unified VP) — largest refactor; do last in Phase A with full regression suite.

## Resolved (2026-08-28)

1. **Adapter:** Keep `@openid4vc/openid4vp` as HTTP parse/submit helper; single orchestration in `presentationService.ts`.
2. **x509 trust:** Hybrid C — origin allowlist + mandatory JAR/crypto; optional full `x509_hash` env pin.
