# OID4VCI 1.0 / OID4VP 1.0 Spec Compliance Review (2026-06-15)

Snapshot of the current uncommitted working tree against OpenID for Verifiable Credential Issuance 1.0 (final) and OpenID for Verifiable Presentations 1.0 (final/draft 23+). Scope: `src/services/vci/exchangeService.ts`, `src/services/vp/presentationService.ts`, `src/services/crypto/crypto.ts`, `src/config/trustedVerifiers.ts`.

Each item is tagged `[BLOCKING]`, `[GAP]`, or `[OK]`. Items already tracked in `docs/TASKS.md` are cross-referenced instead of duplicated.

## OID4VCI 1.0 — Issuance

### [BLOCKING] Native EdDSA target-device validation pending
- `src/services/crypto/crypto.ts` now emits `alg: EdDSA` for OID4VCI PoP JWTs and signs through `src/services/crypto/nativeEddsaSigner.ts` / the local Android Expo module `modules/etda-wallet-eddsa`.
- The former software EdDSA signing flag/path has been removed from app code.
- Remaining blocker: the actual Phase 4 Android target devices must still prove AndroidKeyStore Ed25519 key generation works and reports TEE or StrongBox backing. iOS Ed25519 remains deferred under ADR 0007.

### [OK] Token endpoint discovery via `authorization_servers`
- `requestPreAuthorizedAccessToken()` (`exchangeService.ts`) now calls `discoverAuthorizationServerTokenEndpoint()` when `issuerMetadata.token_endpoint` is missing: it fetches `.well-known/oauth-authorization-server` then `.well-known/openid-configuration` for each entry in `authorization_servers` (routed through `resolveDevIssuerProxyUrl`) and reads `token_endpoint` from there, per OID4VCI 1.0 §11. The guessed `${issuer}/token` remains only the last-resort fallback for issuers that omit both. Additive change — the dev Issuer's existing `/token` fallback is unchanged and covered by existing tests; the new discovery path has its own test in `exchangeService.test.ts`.

### [GAP] `tx_code` sent under two parameter names
- `requestPreAuthorizedAccessToken()` sets both `tx_code` (OID4VCI 1.0 final) and `user_pin` (pre-final draft naming) in the token request body (`exchangeService.ts:682-685`).
- OID4VCI 1.0 final only defines `tx_code`. Sending `user_pin` alongside is harmless against spec-compliant ASes (unknown params ignored) but is not itself spec-conformant and should be removed once the target Issuer is confirmed to accept `tx_code` alone. Low priority — keep until the real ETDA Issuer's AS behavior is confirmed, then drop `user_pin`.

### [OK] `c_nonce` refresh retry on `invalid_proof`
- `acquireCredentialRecord()` (`exchangeService.ts`) signs the proof once with the `c_nonce` from the token response and sends the Credential Request. If the Credential Endpoint rejects with `invalid_proof` and a fresh `c_nonce` (OID4VCI 1.0 §8.3.3), `assertCredentialEndpointSuccess()` now throws the new exported `InvalidProofError` (carrying the fresh `c_nonce`), and `acquireCredentialRecord()` re-signs the proof with it and retries the Credential Request exactly once before giving up. Covered by a new test in `exchangeService.test.ts`.

### [GAP] Deferred Credential Issuance not implemented
- `readCompactCredentialFromResponse()` only accepts an immediate compact credential in the Credential Response. A response containing `transaction_id` (deferred issuance, OID4VCI 1.0 §8.4) is not recognized and falls into `CredentialResponseUnsupported`.
- `rewriteIssuerMetadataForTransport()` already rewrites `deferred_credential_endpoint` for the dev proxy, but nothing calls it — dead plumbing until deferred issuance is implemented. Not currently required by any P1–P6 user journey; flag as future work only if an Issuer starts returning `transaction_id`.

### [OK] Pre-Authorized Code flow shape
- Grant type `urn:ietf:params:oauth:grant-type:pre-authorized_code`, `pre-authorized_code` param, optional `tx_code`, `credential_configuration_id` / `credential_identifier` selection, and `proof_type: jwt` Credential Request all match OID4VCI 1.0 §6 / §8.2. Per Phase 2.3 decision, Authorization Code flow is intentionally out of scope.

### [OK] `credential_offer_uri` resolution
- `resolveCredentialOfferUriForTransport()` fetches `credential_offer_uri` and inlines the returned `credential_offer` object — matches OID4VCI 1.0 §4.1.2 for the by-reference offer form.

## OID4VP 1.0 — Presentation

### [GAP] Signed Request Object (JAR) signature not verified
- `parseAuthorizationRequestBody()` (`presentationService.ts:344-351`) falls back to `decodeJwtPayload(text)` when the `request_uri` response isn't plain JSON — it decodes the JWT payload but never checks `alg`/signature or resolves a verification key.
- OID4VP 1.0 §5.10 requires the Wallet to verify the signed Request Object per the `client_id_scheme` (e.g., resolve `did:web` DID document for `did:` scheme, or the registered key for `verifier_attestation:`). Today trust is established only by the post-hoc `client_id` + `response_uri` origin allowlist check (`findTrustedVerifier`), and TLS on the `request_uri` fetch — the JWS itself is decorative.
- Priority: medium for the current single-allowlisted-dev-Verifier setup (TLS + origin allowlist already constrains the attack surface), but **must be closed before onboarding additional Verifiers** or moving the `redirect_uri:` allowlist entry to a real `did:web` entry (see next item).

### [GAP] `client_id_scheme` is not read or enforced
- `trustedVerifiers.ts` hardcodes the dev Verifier as `redirect_uri:<base>/openid4vc/verify` (legacy unsigned-request scheme). `findTrustedVerifier()` does a literal-prefix match against this string; it does not branch on `client_id_scheme` to apply scheme-specific validation (`did`, `x509_san_dns`, `verifier_attestation`, `redirect_uri`).
- This is the same gap already tracked as "Replace development `redirect_uri:` Verifier with registered production `did:web` Verifier entries" (`docs/TASKS.md` OID4VP Remaining). New detail to fold in when that work starts: the replacement needs scheme-aware request validation (previous item), not just a different allowlist string.

### [GAP] `presentation_definition_uri` unsupported
- `readOptionalPresentationDefinition()` throws `PresentationRequestUnsupported: presentation_definition_uri is not supported yet` (`presentationService.ts:356-358`).
- OID4VP 1.0 §5.1 allows `presentation_definition_uri` as an alternative to inline `presentation_definition`. Currently a hard error if a Verifier uses it. Add fetch-and-parse support if/when a Verifier requires it; no current journey needs it.

### [GAP] DCQL `credential_sets` not handled
- `readOptionalDcqlQuery()` reads `dcql_query.credentials` only; `dcql_query.credential_sets` (optional grouping for "present one of these alternatives", DCQL §6.1) is ignored.
- Low priority while every DCQL request in use has exactly one required credential entry per type. Needed before supporting "any of credential A or credential B" Verifier requests.

### [OK] `direct_post` response transport
- `submitPresentationResponse()` posts `vp_token` (+ `presentation_submission` for PE, + `state`) as `application/x-www-form-urlencoded` to `response_uri` — matches OID4VP 1.0 §6.2.

### [OK] DCQL `vp_token` response shape (production default)
- `formatVpTokenForResponse()` defaults to the spec-correct object-keyed-by-credential-query-id, array-valued shape for DCQL responses (`readVerifierDcqlVpTokenShape()` returns `'object_array'` outside `__DEV__` regardless of env). The alternate shapes (`object_string`, `raw`) are explicitly development-only compatibility probes — fine as is, but **must not be left enabled via env in any release build** (already enforced by the `isDevelopment` gate in `runtimeFlags.ts`).

### [OK] SD-JWT+KB presentation
- `signSdJwtKbPresentationToken()` builds `alg: ES256, typ: kb+jwt` with `nonce`, `aud`, `iat`, `sd_hash`, appended to the SD-JWT per SD-JWT VC / HAIP, and rejects credentials without `cnf.jwk`/`cnf.kid` holder binding (`assertSdJwtHolderBinding`). Same EdDSA migration applies here as for PoP (tracked, see Issuance section).

### [OK] Presentation Exchange birth-date slice
- Scoped to a single supported claim path set (`BIRTH_DATE_PATHS`); anything else throws `PresentationRequestUnsupported`. Matches the documented P5 age-over-20 scope — intentional narrowing, not a gap.

## Suggested order if picking this up next

1. ~~Token endpoint discovery via `authorization_servers` (OID4VCI)~~ — done (2026-06-15).
2. ~~`c_nonce` refresh retry on `invalid_proof` (OID4VCI)~~ — done (2026-06-15).
3. Signed Request Object verification + `client_id_scheme` handling (OID4VP) — do together with the `did:web` Verifier migration already on the OID4VP backlog, since both touch `findTrustedVerifier`/`readAuthorizationRequest`.
4. `presentation_definition_uri` and DCQL `credential_sets` — implement opportunistically when a Verifier actually requires them.
5. Deferred Credential Issuance — implement only if an Issuer starts returning `transaction_id`.

None of the above block the current Immediate Next Task (native Ed25519/EdDSA signer migration), which remains the highest-priority gap overall.
