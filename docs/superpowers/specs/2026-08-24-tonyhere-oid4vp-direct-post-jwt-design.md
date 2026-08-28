# Tonyhere OID4VP `direct_post.jwt` submit failure (`invalid_request`)

**Date:** 2026-08-24  
**Status:** Approved (2026-08-24) — Approach A (diagnosis harness + ranked fixes)  
**Related:** `docs/superpowers/specs/2026-08-21-oid4vp-direct-post-jwt-design.md`, `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md`, `docs/TASKS.md`

## Summary

Third-party **tonyhere** SD-JWT DCQL presentation (pid-age) resolves and signs successfully on-device, but `POST` to `response_uri` with `response_mode=direct_post.jwt` returns **`HTTP 400: invalid_request`** with no `error_description`. Wallet-side KB-JWT diagnostics report all gates passing (`aud=client_id`, nonce, `sd_hash`, ES256 self-verify, `cnf.jwk` match).

This spec defines a **wallet-only diagnosis harness** and a **ranked fix plan** for the submit boundary. No implementation until this spec is approved.

## Evidence (2026-08-24 device run)

| Stage | Result |
|---|---|
| QR classify | `openid4vp` presentation |
| Resolve | `protocolPath=oid4vc`, `response_mode=direct_post.jwt`, DCQL id `a6d72bee-617c-4670-8b18-3b015eb22088` |
| Match | `urn:tonyhere:demo:pid-age:1` credential, 2 DCQL claim disclosures |
| Sign | Hardware ES256 SD-JWT+KB (`sign-sd-jwt-kb-hardware-complete`) |
| Submit | `encryptedResponse=true`, `tokenShape=object_array`, `submissionPresent=false` |
| Verifier | `HTTP 400: invalid_request` (no description) |
| Local diagnostics | KB-JWT checks all `true`; `kb_aud_matches_response_uri=false` (expected for OID4VP 1.0) |

**Conclusion:** Failure is at the **Verifier HTTP boundary**, not resolve/consent/sign. Without Verifier logs, the wallet must narrow which layer the Verifier rejects: JWE transport, encrypted payload shape, or VP semantics.

## Success criteria

1. Tonyhere pid-age DCQL presentation completes with Verifier HTTP **2xx** (or a descriptive OAuth error the Holder can act on).
2. Existing zenithcomp `direct_post` / `direct_post.jwt` flows remain green (regression tests).
3. New diagnostics identify the failing layer in `__DEV__` without logging tokens, claims, or JWE plaintext.
4. No new biometric prompt; sign-time gate stays single-action.

## Non-goals

- Changing tonyhere Verifier or Issuer server code.
- `dc_api` / `dc_api.jwt` response modes.
- NFC / mdoc `DeviceResponse` builder (separate spec).
- Requiring Verifier `error_description` for production UX (nice-to-have only).

## Failure layer model

```text
[Holder sign] → [DCQL vp_token envelope] → [Authorization Response JSON]
      → [JWE encrypt] → [HTTP POST response=] → [Verifier decrypt + validate VP]
```

| Layer | Wallet owns? | Current state | Suspected? |
|---|---|---|---|
| L1 SD-JWT+KB content | Yes | Local diagnostics pass | Low |
| L2 DCQL `vp_token` envelope (`object_array` / `raw` / `object_string`) | Yes | Default `object_array` | **Medium** |
| L3 Authorization Response JSON (`vp_token`, `state`, optional `presentation_submission`) | Yes | `state` included; no submission for DCQL | Low–medium |
| L4 Compact JWE (ECDH-ES, `enc`, `epk`, segment layout) | Yes | Custom `jweEcdhEs.ts` | **Medium–high** |
| L5 HTTP form (`response=` only vs leaked plaintext fields) | Yes | `direct_post.jwt` posts `response` only | Low |
| L6 Verifier VP policy (status list, issuer trust, disclosure policy) | No | Opaque `invalid_request` | Medium |

## Approaches considered

### A. Diagnosis harness + ranked fixes (recommended)

Add submit-time dev diagnostics and a small interop matrix (`vp_token` shape, `enc` alg), then fix the first layer proven wrong by tests or device A/B.

**Pros:** Works with wallet-only logs; minimal risk; preserves production defaults until proven.  
**Cons:** May take 1–2 device iterations before the root fix lands.

### B. Replace custom JWE with a library implementation

Swap `encryptCompactJweEcdhEsP256` for a maintained JOSE/JWE dependency used by `@openid4vc` ecosystem.

**Pros:** Best long-term interop if custom JWE is wrong.  
**Cons:** Larger dependency/crypto surface; `@openid4vc/openid4vp` does not currently expose response encryption helpers in this repo.

### C. Force plaintext `direct_post` for third-party verifiers

Skip encryption when interop flag is on.

**Pros:** Fast A/B.  
**Cons:** Violates tonyhere request (`direct_post.jwt` is mandatory); not production-viable.

**Recommendation:** **A**, with a targeted JWE audit (B-lite: golden-vector tests against our implementation, not a dependency swap yet).

## Proposed design

### 1. Submit diagnostics extension (`presentationDiagnostics.ts` + submit path)

Add `describeEncryptedSubmitAttempt()` used only when submit fails or in `__DEV__`:

| Field | Purpose |
|---|---|
| `response_mode` | `direct_post` vs `direct_post.jwt` |
| `protocol_path` | `legacy` vs `oid4vc` |
| `jwe_segments` | Must be `5` for compact JWE |
| `jwe_alg` / `jwe_enc` / `jwe_kid` | From protected header (no `epk` coords) |
| `jwe_bytes` | Ciphertext size only |
| `auth_response_keys` | Top-level keys inside decrypted payload (`vp_token`, `state`, …) — from **test-only roundtrip** or header parse, never logged in production |
| `vp_token_json_type` | `object` / `string` / `array` after envelope formatting |
| `dcql_envelope_shape` | `object_array` / `object_string` / `raw` |
| `state_in_encrypted_payload` | boolean |
| `existing_kb_diagnostics` | Unchanged |

**Security:** Never log JWE plaintext, `vp_token` strings, disclosures, or claim values. `__DEV__` may log structural metadata only.

### 2. Unify submit transport (oid4vc adapter)

Today:

- `direct_post.jwt` → wallet `buildDirectPostFormBody` (custom JWE) regardless of `protocolPath`.
- `direct_post` + `oid4vc` → `submitOpenid4vpAuthorizationResponse` with `vp_token` as **string** (possibly double-encoded JSON for DCQL).

**Change:** Wallet-owned `buildDirectPostFormBody` becomes the **single** submit encoder for both `legacy` and `oid4vc` when `response_mode` is `direct_post` or `direct_post.jwt`.

- Plaintext `direct_post`: form fields `vp_token`, `state`, optional `presentation_submission`.
- `direct_post.jwt`: form field `response` only.
- For DCQL, pass **parsed** `vp_token` object into the encrypted payload (already done for jwt path; extend consistently for plaintext).

**Rationale:** Removes oid4vc/plaintext path inconsistency; tonyhere already uses jwt path but zenithcomp regressions are prevented.

### 3. Ranked fix candidates (implement in order after diagnostics)

#### Fix 1 — JWE golden vector + segment audit

- Add Jest vectors: encrypt → `decryptCompactJweEcdhEsP256ForTest` roundtrip with `vp_token` object envelope matching OID4VP spec example (`{"vp_token":{"example_jwt_vc":["…"]}}`).
- On submit failure, log `jwe_segments` and protected-header `alg`/`enc`/`kid`.
- If roundtrip fails in tests, fix `jweEcdhEs.ts` (KDF `OtherInfo`, IV/tag layout, `epk` in protected header).

#### Fix 2 — DCQL `vp_token` shape inside encrypted payload

OID4VP example uses object-keyed-by-query-id with array values. Tonyhere may expect:

| Shape | Encrypted `vp_token` value |
|---|---|
| `object_array` (current default) | `{ "<queryId>": ["<sd-jwt+kb>"] }` |
| `object_string` | `{ "<queryId>": "<sd-jwt+kb>" }` |
| `raw` | `"<sd-jwt+kb>"` (no DCQL envelope) |

**Device A/B** (dev env only, documented in `.env.example`):

```bash
EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE=raw   # then object_string
```

Record which shape (if any) changes Verifier HTTP status. If `raw` wins, update default for third-party profiles or document tonyhere-specific build profile.

#### Fix 3 — `enc` algorithm selection

`resolveOid4vpResponseEncryptionParams` picks `A128GCM` unless `encrypted_response_enc_values_supported` lists `A256GCM`. Add diagnostic field `jwe_enc_selected` and dev-only override `EXPO_PUBLIC_OID4VP_JWE_ENC` for one-shot A/B.

#### Fix 4 — Authorization Response payload completeness

Confirm encrypted JSON includes:

```json
{
  "vp_token": { "<dcql_query_id>": ["<presentation>"] },
  "state": "<request.state>"
}
```

No duplicate plaintext `vp_token`/`state` form fields when `direct_post.jwt`. Optional `presentation_submission` remains omitted for DCQL unless Verifier requests Presentation Exchange.

#### Fix 5 — VP semantic rejection (last resort)

If transport layers are verified and all shapes fail with `invalid_request`, capture:

- Issuer `status_list` idx in credential (present in logged JWT header region).
- Whether credential was issued before/after holder key rotation.

Document as **Verifier policy** follow-up (re-issue credential, status list, issuer trust). Wallet cannot fix without Verifier cooperation.

### 4. Error surfacing

Map opaque `invalid_request` to Holder copy:

- **Dev:** show diagnostic summary line (layer hints, not tokens).
- **Prod:** generic “Verifier could not validate presentation” + suggest re-issue if repeated.

Do not expose `invalid_request` OAuth code in UI (existing `presentationFailureUi` pattern).

## Testing plan

| Test | File area |
|---|---|
| JWE roundtrip with DCQL object envelope | `jweEcdhEs.test.ts` |
| `buildDirectPostFormBody` encrypted payload keys + `vp_token` type | `directPostFormBody.test.ts` |
| Unified submit uses parsed `vp_token` for oid4vc `direct_post` | `submitDirectPostViaOid4vc.test.ts` |
| Diagnostics include new fields without token leakage | `presentationDiagnostics.test.ts` |
| Regression: zenithcomp jwt + plaintext submit | `presentationService.test.ts` |

**Device matrix (tonyhere pid-age):**

1. Default (`object_array`, `A128GCM`, `aud=client_id`) — baseline (currently fails).
2. `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE=raw`.
3. `object_string`.
4. `EXPO_PUBLIC_OID4VP_JWE_ENC=A256GCM` if metadata supports it.

Record HTTP status + diagnostic line per run in `docs/TASKS.md` session note.

## Implementation map (post-approval)

| Area | File |
|---|---|
| Submit diagnostics | `src/services/vp/presentationDiagnostics.ts` |
| Unified submit | `src/services/vp/presentationService.ts`, `src/services/vp/oid4vc/submitDirectPostViaOid4vc.ts` |
| Encrypted body | `src/services/vp/directPostFormBody.ts` |
| JWE | `src/services/crypto/jweEcdhEs.ts` |
| Dev flags | `src/config/runtimeFlags.ts`, `.env.example` |
| Tests | files above `*.test.ts` |

## Open questions

1. Does tonyhere **require** `presentation_submission` for DCQL? (Current request has none; spec says DCQL-only.)
2. Is `EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER=true` in effect for this run? (Ephemeral verifier trust should not affect submit body.)
3. After shape A/B, if all fail, should we add a **verifier profile** config (host → preferred `vp_token` shape) for production, or keep env probes dev-only?

---

**Next step after approval:** invoke `writing-plans` for an implementation plan; no code until this spec is reviewed.
