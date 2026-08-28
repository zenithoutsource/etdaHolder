# Verifier Submit Interop — DCQL `vp_token` Shape Profile (Tier 1)

**Date:** 2026-08-26  
**Status:** Implemented (2026-08-26) — Tier 1 plan: `docs/superpowers/plans/2026-08-26-verifier-submit-interop-tier1.md`  
**Related:** `docs/superpowers/specs/2026-08-25-demo-interop-vp-submit-design.md`, `docs/superpowers/specs/2026-08-24-tonyhere-oid4vp-direct-post-jwt-design.md`, `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md`, `src/services/vp/verifierDcqlSubmitNegotiation.ts`, `src/services/vp/presentationService.ts`, `docs/TASKS.md`

## Summary

Brainstorming confirmed the primary interop pain is **submit-time HTTP/JWE/session failures** (`HTTP 400 invalid_request`) after DCQL match and sign succeed — not DCQL query matching. Adopting `dcql-ts` does **not** address this layer.

**Tier 1 (this spec):** Wire the existing but unused `verifierDcqlSubmitNegotiation.ts` helpers into the production submit path so each Verifier host + `client_id` scheme gets a **persisted successful DCQL `vp_token` envelope shape** (`object_array`, `object_string`, or `raw`). Replace the current hardcoded `object_array` default and reduce manual `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` device A/B.

**Tier 2 (future spec):** Extend the profile to JWE `enc` / `apv` and session-safe transport retry — only if Tier 1 device evidence shows shape alone is insufficient.

## Problem

| Stage | Today |
|---|---|
| Match + sign | Succeeds for third-party Verifiers |
| Submit | Opaque `HTTP 400 invalid_request` at `response_uri` |
| Mitigation | Manual env probes (`EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE`), rebuild, device A/B matrix documented in `docs/TASKS.md` |
| Code gap | `resolveDcqlVpTokenShapeForSubmit()`, cache read/write, and tests exist in `verifierDcqlSubmitNegotiation.ts` but **`presentationService.ts` ignores them** and always uses `object_array` for DCQL (except dev env override) |

**Relationship to demo interop (2026-08-25):** `docs/TASKS.md` and `docs/superpowers/specs/2026-08-25-demo-interop-vp-submit-design.md` describe per-verifier shape cache and Animo `object_string` hints, but the submit path was never wired. Demo interop (`EXPO_PUBLIC_WALLET_DEMO_INTEROP`) covers trust policy and JWK coordinate padding — **separate from this slice**. Tier 1 wires shape cache for **all builds** (production included) without requiring the demo interop flag.

## Goals

1. **Per-verifier shape memory** — After a successful DCQL submit, cache the winning `vp_token` envelope shape keyed by `response_uri` origin + parsed `client_id` scheme.
2. **Warm-path interop** — Second and later presentations to the same Verifier start with the cached shape instead of the global default.
3. **Preserve dev probes** — `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` remains a build-time override in development; production behavior unchanged except cache reads/writes.
4. **No new biometric prompt** — Single sign per user action; no re-sign between shape selection and submit.
5. **Minimal diff** — Reuse existing module and tests; no `dcql-ts` dependency.

## Non-goals (Tier 1)

- In-session multi-POST shape retry (many Verifiers invalidate session after first POST; see `resolveDcqlVpTokenShapeForSubmit` comment).
- JWE `enc`, `apv`, or KB-JWT `aud` profile fields (Tier 2).
- Replacing custom DCQL matching with `dcql-ts`.
- Changing Verifier server code or trusted-verifier policy.
- Dual-format, PEX, issuer OID4VP, or `dc_api` flows beyond unchanged behavior.

## Success criteria

1. DCQL submit uses `resolveDcqlVpTokenShapeForSubmit()` instead of hardcoded `object_array`.
2. Successful DCQL submit calls `writeCachedVerifierDcqlVpTokenShape()` with the shape used.
3. Regression tests pass: `verifierDcqlSubmitNegotiation.test.ts`, `presentationService.test.ts` (submit paths).
4. Existing zenithcomp / Verifier API golden-path tests remain green.
5. Logs include `interopCacheKey` and `tokenShape` source (`env` | `cached` | `default`) without token contents.

## Architecture

### Scope boundary

```text
[unchanged: resolve → match → consent → sign]
  → resolveDcqlVpTokenShapeForSubmit(cacheKey)   ← Tier 1
  → formatVpTokenForResponse(shape)
  → submit (legacy or oid4vc adapter)
  → on 2xx: writeCachedVerifierDcqlVpTokenShape   ← Tier 1
```

### Components

| File | Change |
|---|---|
| `src/services/vp/presentationService.ts` | Replace `resolveDcqlVpTokenShapeForRequest()` body; call cache write on successful DCQL submit (legacy + oid4vc paths). |
| `src/services/vp/verifierDcqlSubmitNegotiation.ts` | Optional: export helper `readDcqlVpTokenShapeResolution()` returning `{ shape, source }` for logging; no behavior change required if wiring is inline. |
| `src/services/vp/presentationService.test.ts` | Assert cache read on submit start and cache write on 2xx. |
| `docs/TASKS.md` | Track Tier 1 implementation and manual device verification. |
| `.env.example` | Clarify that `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` seeds dev probes; production learns shape via cache after first success. |

### Shape resolution order (unchanged from module)

1. Dev env override (`readVerifierDcqlVpTokenShapeEnvOverride`) — single shape, no cache override in `__DEV__` when set.
2. Cached shape for `buildVerifierInteropCacheKey(clientId, responseUri)`.
3. Static verifier hint map (`VERIFIER_DCQL_VP_TOKEN_SHAPE_HINTS`) — empty today; optional seed for known hosts.
4. Default order: `object_array` → `object_string` → `raw` (omit `raw` when DCQL credential count > 1).

**Important:** Tier 1 picks **one** shape per submit (first in resolved order). It does **not** loop attempts in-session.

### Cache key

Reuse `buildVerifierInteropCacheKey(clientId, responseUri)` → `"<hostname>|<client_id_scheme>"`.

Storage: existing MMKV meta prefix `verifier-dcql-vp-shape:` via `getMetaStorage()`.

### When to write cache

Write only when **all** hold:

- Request includes `dcqlQuery`.
- Submit returns HTTP 2xx (legacy fetch or oid4vc adapter).
- Shape was not forced solely by dev env override (optional: still write in dev when env unset so device runs populate cache).

Do **not** write cache on retryable 400 — Tier 1 has no in-session retry; failed submits leave cache unchanged.

## Error handling & Holder UX

| Outcome | Behavior |
|---|---|
| Submit 2xx | Cache shape; existing success UI unchanged. |
| Submit 400 (opaque) | Existing `PresentationSubmissionFailed` mapping; diagnostics unchanged. Tier 1 does not add new Holder strings. |
| Cached shape wrong (Verifier policy changed) | Holder may still see 400 until cache cleared or Tier 2 adds invalidation; document `clearMetaStorage` / reinstall as escape hatch in TASKS manual steps only. |

## Testing

### Unit

- `resolveDcqlVpTokenShapeForSubmit` — already covered; keep green.
- New `presentationService` tests:
  - Given cached `object_string`, DCQL submit formats envelope with `object_string`.
  - Given successful mock submit, cache write invoked with correct key + shape.
  - Env override in dev wins over cache.

### Manual (device)

1. Verifier A: first presentation with default shape — if 2xx, re-scan same QR/session path and confirm logs show `shapeSource=cached`.
2. Verifier B (known shape-sensitive): set dev env to winning shape once, succeed, remove env, confirm second run uses cache without env.
3. Regression: zenithcomp / local Verifier API DCQL flow still 2xx.

## Tier 2 preview (out of scope here)

If Tier 1 does not reduce third-party 400 rate (e.g. tonyhere `direct_post.jwt` with correct shape still fails):

- Extend profile record: `{ shape, jweEnc, jweApv, kbAudience }`.
- Session-safe single retry without re-sign when Verifier documents session tolerance.
- Submit failure classification (`session-expired` vs `transport-rejected`).

Separate spec: `docs/superpowers/specs/YYYY-MM-DD-verifier-submit-interop-tier2-design.md`.

## Explicitly not adopting

**`dcql-ts`** — addresses query parse/match/validate, not L2–L5 submit transport. Defer unless DCQL query scope expands beyond v1 or spec drift becomes the dominant maintenance cost.

## Open questions

None for Tier 1 implementation. Tier 2 requires device evidence from Tier 1 rollout.
