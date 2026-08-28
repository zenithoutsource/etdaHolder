# EUDI Alignment — Phase C: EUDI-Stack Readiness

**Date:** 2026-08-26 (updated 2026-08-28 for eudi-dev v2.0.7)  
**Status:** Approved (brainstorming)  
**Reference:** [eudi-dev v2.0.7](https://github.com/dominikschlosser/eudi-dev) (`C:\project\eudi-dev-2.0.7`) — `docs/spec-compliance.md`, `internal/wallet/haip.go`, `internal/wallet/dcql.go`, `scripts/oidf-wallet-conformance.sh`, `scripts/oidf_wallet_conformance.py`, ADR-0010  
**Depends on:** Phase A + Phase B specs (2026-08-26)  
**Related:** `docs/SPEC_COMPLIANCE_OID4VC.md`, `src/config/runtimeFlags.ts`, `src/services/vp/oid4vpResponseEncryption.ts`

## Summary

Phase C makes the wallet **verifiable against the EUDI / HAIP profile** and **maintainable as specs evolve**: (1) DCQL **`trusted_authorities`**, (2) **HAIP validation profile**, (3) **OIDF wallet conformance** in CI, (4) **living spec-compliance doc**, and (5) optional **debug vs strict** validation modes.

## Problem

| Gap | eudi-dev v2.0.7 | Wallet today |
|-----|-----------------|--------------|
| `trusted_authorities` in DCQL | `etsi_tl` + `aki` filter (demo issuer uses `aki` during issuance presentation, 2.0.6) | Not implemented |
| HAIP 1.0 | `--haip` enforces VP/VCI MUSTs; `validate --haip` checks SD-JWT, mdoc, **and JWT** credentials (2.0.6) | No HAIP mode |
| Response encryption | ECDH-ES P-256 preferred; RSA-OAEP when verifier offers RSA only (2.0.2); HAIP allows only ECDH-ES P-256 | ECDH-ES only; RSA-OAEP not implemented |
| Conformance testing | `oidf-wallet-conformance.sh` + Python harness | Ad-hoc device tests; stale `docs/SPEC_COMPLIANCE_OID4VC.md` |
| Validation modes | `debug` vs `strict` (ADR-0001) | Fail-closed trust only |

## eudi-dev v2.0.7 delta (relevant to Phase C)

| Change | Version | Phase C action |
|--------|---------|----------------|
| `validate --haip` on mdoc + JWT credentials, not only SD-JWT | 2.0.6 | C2 HAIP credential validation scope |
| HAIP self-signed leaf cert detection fixed | 2.0.6 | C2 test fixture |
| RSA-OAEP `direct_post.jwt` / `dc_api.jwt` when RSA enc key only | 2.0.2 | C6 or verifier Tier 2 — document in compliance matrix as Partial until implemented |
| Under HAIP, only ECDH-ES P-256 for response encryption | spec | C2 refuses RSA when HAIP on |
| Demo issuer `trusted_authorities` aki during issuance | 2.0.6 | C1 reference scenario |
| OIDF conformance scripts in repo | 2.0.7 | C3 mirror runbook |

## Goals

1. **`trusted_authorities`** — Filter credentials by ETSI trust list or AKI when DCQL requests it.
2. **HAIP profile flag** — `EXPO_PUBLIC_OID4VC_HAIP_ENABLED=true` (dev/preview only by default).
3. **OIDF conformance hook** — CI + runbook; fixture subset first.
4. **Living compliance doc** — `docs/spec-compliance.md` replacing June 2026 snapshot.
5. **Debug vs strict** — Optional `EXPO_PUBLIC_OID4VC_VALIDATION_MODE`.

## Non-goals

- OpenID Federation trust chains.
- Production HAIP flag (unless product decides).
- OIDF on every PR in v1.
- Replacing P1–P6 journey tests.
- eudi-dev batch issuance / credential card UI.

## HAIP subset (wallet holder role)

Mirror eudi-dev `ValidateHAIPCompliance` / `ValidateHAIPIssuanceCompliance` (v2.0.7):

### OID4VP (when HAIP enabled)

| Check | Action |
|-------|--------|
| `response_type` = `vp_token` | Reject |
| `response_mode` only `direct_post.jwt` or `dc_api.jwt` | Reject |
| Signed requests: `client_id` prefix `x509_hash` only | Reject `x509_san_dns`, `redirect_uri`, `did` |
| JAR required for non-DC-API | Reject inline unsigned |
| DCQL required; formats `dc+sd-jwt` or `mso_mdoc` only | Reject |
| Verifier enc metadata lists A128GCM **and** A256GCM | Reject |
| Request Object `alg` ES256 | Reject |
| Response encryption | ECDH-ES P-256 only (reject RSA enc key under HAIP) |

### OID4VCI (when HAIP enabled)

| Check | Action |
|-------|--------|
| Auth-code: PAR + PKCE S256 + DPoP ES256 when metadata advertises | Reject |
| Pre-authorized | HTTPS only |
| Encrypted credential responses | Required when advertised |

### Credential validation under HAIP (`validate --haip` parity, 2.0.6)

When HAIP flag on and validating stored credentials (detail screen / dev tools):

| Format | HAIP checks |
|--------|-------------|
| SD-JWT VC | Chain, self-signed leaf, `_sd_alg`, typ `dc+sd-jwt` |
| mdoc | MSO validity, self-signed leaf in chain |
| JWT VC | Signature, self-signed leaf |

## Architecture

### C1 — `trusted_authorities`

**New:** `src/services/vp/dcqlTrustedAuthorities.ts`, `src/services/trust/etsiTrustList.ts`

```text
DCQL trusted_authorities[]
  → etsi_tl: issuer chain vs configured TL JWT(s)
  → aki: Authority Key Identifier match
  → filter before claim-level DCQL match
```

**Reference scenario (eudi-dev 2.0.6):** Demo issuer OID4VP during issuance names issuer CA as `aki` trusted authority so wallet presents only PID chaining to that CA.

```
EXPO_PUBLIC_ETSI_TRUST_LIST_URLS=https://...
EXPO_PUBLIC_ETSI_TRUST_LIST_FETCH_TIMEOUT_MS=10000
```

### C2 — HAIP validation profile

**New:** `src/services/oid4vc/haipValidation.ts`

| File | Change |
|------|--------|
| `presentationService.ts` | `validateHaipPresentationRequest()` |
| `exchangeService.ts` | `validateHaipIssuanceOffer()` |
| `runtimeFlags.ts` | `readHaipValidationEnabled()` — false in production release |

HAIP violations are errors whenever HAIP flag is on (both strict and debug — eudi-dev rule).

### C3 — OIDF conformance in CI

| Artifact | Purpose |
|----------|---------|
| `scripts/oidf-wallet-conformance.sh` | Wrapper (study eudi-dev 2.0.7 scripts) |
| `.github/workflows/oidf-conformance.yml` | Scheduled + `workflow_dispatch` |
| `docs/conformance.md` | Runbook |

**v1:** Protocol fixture tests (JAR, DCQL, VP shape) without full device OIDF UI. Stretch: side-by-side with eudi-dev proxy.

### C4 — Living spec compliance doc

**Replace** `docs/SPEC_COMPLIANCE_OID4VC.md` with `docs/spec-compliance.md` structured like eudi-dev 2.0.7:

- OID4VP 1.0, OID4VCI 1.0, HAIP, SD-JWT VC, mdoc
- Per row: Status, Notes, code pointer, Phase A/B/C/D link if planned
- Mark implemented since June 2026: deferred issuance, auth-code, JAR, direct_post.jwt, shape cache
- New rows from 2.0.7: proof `iss`, `_sd_alg` sd_hash, x509_san_dns FQDN bind, RSA-OAEP (Partial/Refused)

### C5 — Debug vs strict validation

```
EXPO_PUBLIC_OID4VC_VALIDATION_MODE=strict|debug
```

| Mode | Behavior |
|------|----------|
| `strict` | MUST violations reject flow |
| `debug` | Collect findings; warn; continue per eudi-dev ADR-0001 |

**v1 scope:** VP request validation (`transaction_data`, missing nonce, request object `typ`, etc.).

### C6 — RSA-OAEP response encryption (eudi-dev 2.0.2, optional)

When verifier `client_metadata.jwks` has RSA enc key only (no EC P-256), encrypt `direct_post.jwt` with RSA-OAEP.

| File | Change |
|------|--------|
| `oid4vpResponseEncryption.ts` / `jweEcdhEs.ts` | RSA branch |
| HAIP | Reject RSA when HAIP on |

**Trigger:** Verifier-submit Tier 2 or partner requiring RSA-only JWE. Not blocking Animo (ECDH-ES).

## Success criteria

1. `trusted_authorities` unit test filters by AKI.
2. HAIP flag rejects `redirect_uri:` client_id.
3. `docs/spec-compliance.md` exists; references eudi-dev 2.0.7 baseline.
4. CI fixture suite green on `main`.
5. Compliance doc rows for 2.0.7 deltas marked Partial or Implemented.

## Dependencies

- Phase A: x509 production, optional unified submit
- Phase B: type inheritance, proof `iss`, sd_hash
- DC API: `dc_api.jwt` under HAIP when DC API spec completes

## Rollout

1. C4 compliance doc (documentation-first)
2. C2 HAIP module
3. C1 trusted_authorities
4. C5 debug/strict (VP validation)
5. C3 CI harness
6. C6 RSA-OAEP (when partner evidence)
