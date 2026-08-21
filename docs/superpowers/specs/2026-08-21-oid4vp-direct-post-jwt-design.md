# OID4VP `direct_post.jwt` encrypted authorization response

Status: Approved (implementation 2026-08-21)  
Date: 2026-08-21

## Summary

Extend OID4VP online presentation so the Wallet accepts `response_mode=direct_post.jwt`, encrypts the Authorization Response as an unsigned compact JWE, and POSTs `response=<compact JWE>` to `response_uri`. Plaintext `direct_post` remains supported.

## Locked decisions

| Decision | Choice |
|---|---|
| Profile | OID4VP 1.0 encrypted unsigned JWE (not signed JARM) |
| Scope | All submit paths: Scan, same-device, My QR, Issuer renewal/PID |
| Key source | Inline `client_metadata.jwks.keys` only (no `jwks_uri` fetch in v1) |
| Key agreement | ECDH-ES, ephemeral P-256, recipient EC P-256 `use: enc` or omitted |
| Content encryption | A128GCM (default), A256GCM when listed in `encrypted_response_enc_values_supported` |
| Plaintext `direct_post` | Never encrypted even when `jwks` present |
| Failure | Missing enc key at resolve → `PresentationRequestUnsupported`; encrypt failure at submit → `PresentationSubmissionFailed` |

## Out of scope (v1)

- `dc_api` / `dc_api.jwt`, query/fragment modes
- RSA-OAEP, X25519, OKP curves, nested sign-then-encrypt
- JAR/DID JWKS for response encryption (`verifierJwks.ts` stays request-signature only)
- Consent UI changes

## Implementation map

| Area | File |
|---|---|
| Key selection | `src/services/vp/oid4vpResponseEncryption.ts` |
| Compact JWE | `src/services/crypto/jweEcdhEs.ts` |
| Resolve/submit | `src/services/vp/presentationService.ts` |
| Adapter gate/parse/submit | `src/services/vp/oid4vc/shouldUseOid4vcVpAdapter.ts`, `parseAuthorizationRequestViaOid4vc.ts`, `submitDirectPostViaOid4vc.ts` |

## P4 alignment

Holder consent, single biometric sign-time gate, and Verifier VP verification are unchanged. Only HTTP body encoding differs when the Verifier requests encryption.
