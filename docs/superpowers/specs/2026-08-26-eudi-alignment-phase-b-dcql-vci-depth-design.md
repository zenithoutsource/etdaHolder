# EUDI Alignment — Phase B: DCQL & VCI Depth

**Date:** 2026-08-26 (updated 2026-08-28 for eudi-dev v2.0.7)  
**Status:** Approved (brainstorming)  
**Reference:** [eudi-dev v2.0.7](https://github.com/dominikschlosser/eudi-dev) (`C:\project\eudi-dev-2.0.7`) — `internal/credtype/`, `internal/wallet/dcql.go`, `internal/wallet/issuance.go`, `internal/sdjwt/`, `CHANGELOG.md` v2.0.5–2.0.7. Supersedes comparisons against v1.26.2.  
**Depends on:** `docs/superpowers/specs/2026-08-26-eudi-alignment-phase-a-interop-foundation-design.md`  
**Related:** `src/services/vp/dcqlCredentialMatch.ts`, `src/services/vci/oid4vc/retrieveViaOid4vc.ts`, `src/services/vci/exchangeService.ts`, `src/services/crypto/crypto.ts`, `docs/SPEC_COMPLIANCE_OID4VC.md`

## Summary

Phase B deepens **holder-side DCQL matching**, **SD-JWT presentation correctness**, and **OID4VCI lifecycle completeness** to match eudi-dev v2.0.7. Seven capability areas:

1. **Type inheritance** (`aka_vcts`, extending `vct` rules)
2. **Nonce Endpoint** as authoritative `c_nonce` source + 2.0.7 logging/failure handling
3. **Notification Endpoint** (`credential_accepted`)
4. **Credential response encryption** (decrypt issuer JWE responses)
5. **JWT key proof `iss`** when the wallet is an identified OAuth client (2.0.5)
6. **KB-JWT `sd_hash` from credential `_sd_alg`** (2.0.6 — not always SHA-256)
7. **Nested SD-JWT disclosure** under cleartext parent objects (2.0.6)

## Problem

| Gap | eudi-dev v2.0.7 | Wallet today |
|-----|-----------------|--------------|
| DCQL `vct_values` | `credtype.Chain` — domestic PID extends `urn:eudi:pid:1`; reads `aka_vcts` | Exact `vct_values` match + Thai heuristics; no `aka_vcts` |
| `c_nonce` / Nonce Endpoint | Strict: Nonce Endpoint only; 2.0.7 logs nonce fetch; strict refuses empty response; debug GET fallback on 405 | Fetches nonce when token omits it; accepts token `c_nonce`; no activity-log parity |
| Notification Endpoint | `credential_accepted` when issuer publishes endpoint + `notification_id` | Not implemented |
| Credential response encryption | Request + decrypt JWE when required | Not implemented |
| Key proof `iss` (Appendix F.1) | `iss` = `client_id` for auth-code or authenticated pre-auth; omitted for anonymous pre-auth | Proof payload `{ aud, iat, nonce }` only — no `iss` |
| KB-JWT `sd_hash` | Hashes with credential `_sd_alg` (SHA-384/512 when declared) | Always SHA-256 (`crypto.ts`) |
| Nested claim paths | Presents claims nested under cleartext parent (e.g. `address.street_address`) | Rejects paths >1–2 segments; no cleartext-parent walk |
| `token_type` on token response | Strict refuses missing/invalid; debug warns (2.0.6, RFC 6749 + DPoP) | Not explicitly validated |

Device evidence (2026-08-26): Animo requests `urn:eudi:pid:1` while wallet holds ThaiNationalID / dev credentials — type inheritance is required for EUDI-stack interop beyond shape-cache fixes.

## eudi-dev v2.0.7 delta (relevant to Phase B)

| Change | Version | Phase B item |
|--------|---------|--------------|
| Nonce endpoint request/response in activity log; strict refuses empty `c_nonce`; debug GET on 405 | 2.0.7 | B2 |
| JWT key proof names `iss` when identified client | 2.0.5 | B5 |
| `sd_hash` uses `_sd_alg` not hardcoded SHA-256 | 2.0.6 | B6 |
| Nested SD-JWT claims under cleartext parent | 2.0.6 | B7 |
| `token_type` REQUIRED validation (Bearer vs DPoP) | 2.0.6 | B2 extension |
| Demo issuer `trusted_authorities` (aki) during issuance presentation | 2.0.6 | Phase C (C1) — cross-ref |
| Batch issuance / partial batch / per-copy binding keys | 2.0.0+ | Out of scope v1 (see Non-goals) |
| Issuer display metadata on credential cards | 2.0.0+ | UI slice — not Phase B protocol |

## Goals

1. **`vct_values` inheritance** — Match via exact `vct`, `aka_vcts`, or extending type (PID_14).
2. **Layered matching** — Generic inheritance before Thai schema heuristics.
3. **Strict nonce policy (production)** — Nonce Endpoint authoritative when published; 2.0.7 failure semantics.
4. **Notification Endpoint** — Post `credential_accepted` after successful import.
5. **Credential response encryption** — Request + decrypt when issuer requires.
6. **Proof `iss` when identified** — Append F.1 `iss` for auth-code and client-authenticated pre-auth only.
7. **`sd_hash` algorithm alignment** — Read `_sd_alg` from presented SD-JWT VC.
8. **Cleartext-parent claim selection** — Walk nested paths for selective disclosure.

## Non-goals

- Type Metadata `extends` URL retrieval (eudi-dev also defers).
- mDoc doctype inheritance (ISO exact match).
- Batch multi-copy issuance / ARF ISSU_52 unlinkable re-presentation (eudi-dev 2.0.0) — separate product decision.
- `trusted_authorities` DCQL filter — Phase C.
- HAIP enforcement — Phase C.
- Issuer display image fetch/cache on cards — UI/product slice.

## Success criteria

1. Unit: `urn:eudi:pid:de:1` matches `vct_values: [urn:eudi:pid:1]`; reverse fails.
2. Unit: `aka_vcts` match path.
3. Production: always hits nonce endpoint when published, even if token returns `c_nonce`.
4. Integration: notification POST mocked on import success.
5. Integration: credential JWE decrypt when metadata requires.
6. Unit: proof JWT includes `iss` for auth-code fixture; omits for anonymous pre-auth.
7. Unit: `sd_hash` with SHA-384 credential uses SHA-384.
8. Unit: `address.street_address` disclosed when parent `address` is cleartext object.

## Architecture

### B1 — Type inheritance module

**New module:** `src/services/vp/credentialTypeInheritance.ts` (or `src/services/credentials/credentialTypeChain.ts`)

**Rules (mirror eudi-dev `internal/credtype/`):**

| Rule | Example |
|------|---------|
| Exact `vct` match | `urn:eudi:pid:de:1` requests `de:1` |
| `aka_vcts` claim | Credential lists additional types it satisfies |
| PID domestic extends base | Country/region segment after `urn:eudi:pid:` extends `urn:eudi:pid:1` |
| One-way only | Domestic request does not match base-only credential |
| Not a trust decision | SD-JWT VC §6.6 |

**Integration:** `dcqlCredentialMatch.ts`, `dcqlCredentialSetResolver.ts`, `presentationCredentialMatch.ts`, `credentialFormatUtils.ts` (`readAkaVcts`).

**Glossary note:** Update `CONTEXT.md` `Verifiable Credential Type (vct)` — currently says DCQL `vct_values` must **exactly** match; after B1 it matches via inheritance too.

### B2 — Nonce Endpoint strictness (incl. 2.0.7)

**Policy env:**

```
EXPO_PUBLIC_OID4VCI_STRICT_NONCE_ENDPOINT=true   # default true in production profile
```

| Mode | Behavior (aligned with eudi-dev 2.0.7) |
|------|----------------------------------------|
| Strict (production) | If `nonce_endpoint` published, always POST; ignore token `c_nonce`; refuse if response has no `c_nonce` (name endpoint in error) |
| Debug | Log nonce fetch in wallet logger (`[oid4vci-nonce]`); warn on token `c_nonce` (legacy issuer); on POST 405, retry GET with warning (§7.1 deviation) |

**Also (2.0.6):** Validate `token_type` on token response — strict refuses missing or non-Bearer/non-DPoP when DPoP proof was sent.

| File | Change |
|------|--------|
| `src/services/vci/oid4vc/retrieveViaOid4vc.ts` | `resolveCredentialNonce()`, token response validation |
| `src/services/vci/exchangeService.ts` | `InvalidProofError` retry uses endpoint nonce |

### B3 — Notification Endpoint

```text
notification_id in credential response
  AND issuer metadata.notification_endpoint
  → POST { notification_id, event: credential_accepted }
  → Bearer (+ DPoP if session active)
  → any 2xx = success; failure = warning, credential kept
```

**New:** `src/services/vci/oid4vc/notificationViaOid4vc.ts`

### B4 — Credential response encryption

Reuse `jweEcdhEs.ts` where possible. Only send `credential_response_encryption` when request itself is encryptable (§8.2).

**New:** `src/services/vci/oid4vc/credentialResponseEncryption.ts`

### B5 — Key proof `iss` (OID4VCI Appendix F.1, eudi-dev 2.0.5)

```text
if issuance used identified client (auth-code OR pre-auth with client auth):
  proof JWT payload.iss = oauth client_id
else (anonymous pre-auth):
  omit iss
```

| File | Change |
|------|--------|
| `src/services/crypto/crypto.ts` / `signProofForClaim` | Add optional `iss` to proof payload |
| `src/services/vci/exchangeService.ts` | Pass client_id when known |

**Why:** Issuers binding access token to registered client reject proofs without matching `iss` (#13 in eudi-dev changelog).

### B6 — KB-JWT `sd_hash` and `_sd_alg` (eudi-dev 2.0.6)

RFC 9901 §4.3: hash algorithm follows credential `_sd_alg` (default SHA-256).

| File | Change |
|------|--------|
| `src/services/crypto/crypto.ts` | `signSdJwtKbPresentationToken()` — read `_sd_alg`, select hash |
| `src/services/crypto/hardwareJwtSigner.ts` | Same for hardware path |

### B7 — Nested SD-JWT claims (eudi-dev 2.0.6)

When DCQL requests `parent.child` and `parent` is a cleartext object with selectively disclosable children, walk from payload root — do not only look at top-level `_sd`.

| File | Change |
|------|--------|
| `src/services/vp/sdJwtSelectiveDisclosure.ts` | Cleartext-parent path walk |
| `src/services/vp/dcqlCredentialMatch.ts` | Relax path depth limit where B7 applies |

**Relationship to Phase D5:** D5 defers deep nested paths until a partner requires them; B7 covers the eudi-dev 2.0.6 cleartext-parent case specifically.

## Error handling

| Failure | Behavior |
|---------|----------|
| No credential after inheritance | `PresentationCredentialMismatch` |
| Nonce endpoint empty (strict) | Issuance fails naming endpoint |
| Notification POST fails | Warning log; credential kept |
| JWE decrypt fails | `CredentialResponseUnsupported` |
| Proof rejected for missing `iss` | Should not occur after B5 for identified clients |

## Testing

### Unit

- `credentialTypeInheritance.test.ts`
- `dcqlCredentialMatch.test.ts` — Animo `urn:eudi:pid:1`
- `retrieveViaOid4vc.clientAuth.test.ts` — strict nonce, token_type
- `notificationViaOid4vc.test.ts`
- `credentialResponseEncryption.test.ts`
- `crypto.test.ts` / `hardwareJwtSigner.test.ts` — `sd_hash` + `_sd_alg`
- `sdJwtSelectiveDisclosure.test.ts` — cleartext parent path

### Manual

1. Animo VP after Phase A + B1.
2. eudi-dev issuer VCI with DPoP + identified client — proof accepted.
3. Credential with non-SHA-256 `_sd_alg` presentation to compatible verifier.

## Dependencies

- **Requires:** Phase A (x509 production minimum for Animo VP).
- **Parallel OK:** Verifier submit Tier 2 (RSA-OAEP JWE — eudi-dev 2.0.2, Phase A stretch).

## Rollout order (within Phase B)

1. B1 type inheritance
2. B5 proof `iss` (unblocks eudi-dev issuer interop)
3. B6 `sd_hash` / B7 nested claims (presentation correctness)
4. B2 strict nonce + token_type
5. B3 notification
6. B4 credential response encryption
