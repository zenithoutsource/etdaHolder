# EUDI Alignment — Phase D: Deferred Capabilities

**Date:** 2026-08-26 (updated 2026-08-28 for eudi-dev v2.0.7)  
**Status:** Approved (brainstorming) — implement only when a target issuer/verifier requires it  
**Reference:** [eudi-dev v2.0.7](https://github.com/dominikschlosser/eudi-dev) (`C:\project\eudi-dev-2.0.7`) — `docs/spec-compliance.md`, `CHANGELOG.md` v2.0.0–2.0.7  
**Depends on:** Phase A–C as baseline  
**Related:** `src/services/vp/presentationService.ts`, `src/services/vci/exchangeService.ts`, `src/services/vp/oid4vpResponseEncryption.ts`

## Summary

Phase D tracks **lower-priority or issuer-driven** capabilities that eudi-dev v2.0.7 implements but no current P1–P6 journey or locked production verifier requires today. Each item is a **separate slice** triggered by a named partner in `docs/TASKS.md`.

**Rule:** Do not start Phase D without a named requirement in TASKS.

**Moved out of Phase D (now Phase B per 2.0.7):**

| Was | Now | eudi-dev version |
|-----|-----|------------------|
| D5 nested DCQL (cleartext parent only) | **Phase B7** | 2.0.6 |
| General nested path depth | D5 (remainder) | — |

## Items

### D1 — OID4VCI 1.1 Interactive Authorization (§6)

**eudi-dev v2.0.7:** Challenge endpoint loop; `auth_via_web`; presentation interaction `ia_post` / `ia_post.jwt`; explicit refusal of `presentation_during_issuance_session` community extension.

**Wallet today:** Redirect auth-code only (`authorizationCodeViaOid4vc.ts`).

**Trigger:** Issuer publishes `authorization_challenge_endpoint` and rejects redirect-only.

| Component | Notes |
|-----------|-------|
| `interactiveAuthorization.ts` | Challenge request/response |
| KB-JWT `aud` | `ia:<challenge-endpoint-origin>` per A.3.5 caveat |
| mdoc | `OpenID4VCIIAEHandover` for `ia_post.jwt` |
| Env | `EXPO_PUBLIC_OID4VCI_FEATURE_LEVEL=1.0\|1.1` |

### D2 — SIOPv2 self-issued `id_token`

**eudi-dev:** `response_type` `id_token` or `vp_token id_token`.

**Trigger:** Verifier requires SIOP alongside VP.

| File | Change |
|------|--------|
| `siopIdToken.ts` | `createSelfIssuedIdToken()` |
| `presentationService.ts` | Include `id_token` in submit body |

### D3 — `fragment` response mode

**eudi-dev:** Redirect URL with `vp_token`/`state` in fragment.

**Trigger:** Verifier uses `response_mode=fragment`.

**Risk:** Awkward on mobile; prefer `direct_post`.

### D4 — Additional client_id schemes

| Scheme | eudi-dev v2.0.7 | Wallet | Action |
|--------|-----------------|--------|--------|
| `verifier_attestation:` | Structure validated; JAR key from attestation `cnf` not read | Refused | Partner-driven only |
| `openid_federation:` | Refused (ADR-0013) | Refused | No action |
| `origin:` (signed VP) | Refused; DC API derives origin | Refused | No action |

### D5 — Extended DCQL claim paths (beyond B7)

**eudi-dev:** Full path support.

**Wallet today:** >1–2 segment paths rejected (`dcqlCredentialMatch.ts`). Phase B7 covers cleartext-parent nested claims only.

**Trigger:** Verifier DCQL uses deep paths not covered by B7.

### D6 — `transaction_data` (OID4VP §5)

**eudi-dev v2.0.7:** Strict rejects unsupported `transaction_data`; debug warns.

**Trigger:** Payment / QES verifier.

**Scope:** Reject in production strict with clear Holder message.

### D7 — Batch issuance / unlinkable re-presentation (eudi-dev 2.0.0+)

**eudi-dev:** Holds multiple copies per credential; presents least-used copy (ARF ISSU_52 method C); batch revoke/status index per copy.

**Wallet today:** One record per logical credential.

**Trigger:** Product requires unlinkable repeat presentation to same verifier.

**Scope:** Large — credential storage model, consent UI, revocation. Not protocol-only.

### D8 — RSA-OAEP VP response encryption only

If not done in Phase C6: encrypt to RSA verifier key when no EC enc key offered (eudi-dev 2.0.2).

**Trigger:** Verifier with RSA-only `client_metadata.jwks`.

## Non-goals (Phase D umbrella)

- NFC NDEF issuance (separate backlog).
- iOS Secure Enclave production signing.
- eudi-dev unauthenticated HTTP wallet API.
- Issuer display metadata / credential card UI (eudi-dev 2.0.0 redesign).

## Success criteria (per slice)

1. Named partner in TASKS with reproduced failure.
2. Spec appendix or spin-out design doc.
3. Unit + manual E2E.
4. Row in `docs/spec-compliance.md`.

## Priority within Phase D (updated 2026-08-28)

| Order | Item | Likelihood |
|-------|------|------------|
| 1 | D6 transaction_data | Medium |
| 2 | D5 extended nested paths | Medium (after B7) |
| 3 | D8 RSA-OAEP (if not C6) | Medium for some verifiers |
| 4 | D2 SIOP id_token | Low–medium |
| 5 | D1 OID4VCI 1.1 interactive | Low |
| 6 | D3 fragment | Low |
| 7 | D7 batch issuance | Product decision |

## Relationship to other specs

- **Phase B7** — cleartext-parent nested claims (do first).
- **Phase C6** — RSA-OAEP (prefer over D8 if scheduled in C).
- **DC API** — active parallel track.
- **My QR broker** — wallet-specific.
- **Proximity NFC** — ahead of eudi-dev (ADR 0003).
