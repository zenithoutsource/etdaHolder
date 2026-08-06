# OID4VCI 1.0 / OID4VP 1.0 Spec Compliance Review (2026-06-16)

Snapshot of the current uncommitted working tree against OpenID for Verifiable Credential Issuance 1.0 (final) and OpenID for Verifiable Presentations 1.0 (final/draft 23+). Scope: `src/services/vci/exchangeService.ts`, `src/services/vp/presentationService.ts`, `src/services/crypto/crypto.ts`, `src/config/trustedVerifiers.ts`.

Each item is tagged `[BLOCKING]`, `[GAP]`, or `[OK]`. Items already tracked in `docs/TASKS.md` are cross-referenced instead of duplicated.

## OID4VCI 1.0 — Issuance

### [OK] EdDSA PoP signing
- `src/services/crypto/crypto.ts` now emits `alg: EdDSA` for OID4VCI PoP JWTs and signs with an Ed25519 seed stored in `react-native-keychain`.
- ADR 0008 supersedes the native AndroidKeyStore plan after target-device diagnostics showed AndroidKeyStore generated EC keys for Ed25519 requests.
- Protocol shape is now Ed25519-compatible (`did:key` Ed25519 Holder DID, OKP/Ed25519 public JWK, EdDSA signatures). The remaining risk is security posture, not OID4VC wire compatibility: the key is Keychain-protected software material rather than hardware-backed non-extractable material.

### [OK] Token endpoint discovery via `authorization_servers`
- `requestPreAuthorizedAccessToken()` (`exchangeService.ts`) now calls `discoverAuthorizationServerTokenEndpoint()` when `issuerMetadata.token_endpoint` is missing: it fetches `.well-known/oauth-authorization-server` then `.well-known/openid-configuration` for each entry in `authorization_servers` (routed through `resolveDevIssuerProxyUrl`) and reads `token_endpoint` from there, per OID4VCI 1.0 §11. The guessed `${issuer}/token` remains only the last-resort fallback for issuers that omit both. Additive change — the dev Issuer's existing `/token` fallback is unchanged and covered by existing tests; the new discovery path has its own test in `exchangeService.test.ts`.

### [GAP] `tx_code` sent under two parameter names
- `requestPreAuthorizedAccessToken()` sets both `tx_code` (OID4VCI 1.0 final) and `user_pin` (pre-final draft naming) in the token request body (`exchangeService.ts:682-685`).
- OID4VCI 1.0 final only defines `tx_code`. Sending `user_pin` alongside is harmless against spec-compliant ASes (unknown params ignored) but is not itself spec-conformant and should be removed once the target Issuer is confirmed to accept `tx_code` alone. Low priority — keep until the real the customer Issuer's AS behavior is confirmed, then drop `user_pin`.

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

### [OK] Signed Request Object (JAR) signature verification
- `authorizationRequestJar.ts` enforces `typ: oauth-authz-req+jwt`, requires EdDSA signatures for `decentralized_identifier` client IDs, optionally verifies signed `redirect_uri` requests when a pinned JWK is configured, and resolves trusted `did:web` verification keys from env pin or HTTPS `didWebResolver.ts`. Untrusted `did:web` request objects are rejected before DID document fetch. Covered by `authorizationRequestJar.test.ts`.

### [OK] `client_id_scheme` enforcement
- `clientIdScheme.ts` parses `redirect_uri`, `decentralized_identifier`, and legacy `pre_registered` IDs; `findTrustedVerifier()` matches by scheme with `readResponseUriMatchesClientId()` binding. `trustedVerifiers.ts` emits the LAN `redirect_uri` allowlist only in development builds and uses env-configured `decentralized_identifier:did:web:` entries for production.

### [OK] `presentation_definition_uri` fetch
- `presentationDefinitionResolver.ts` fetches PD after trust gate with timeout + max-bytes cap; PE/DCQL mutually exclusive. P5 birth-date scope unchanged.

### [OK] DCQL `credential_sets` (single-credential OR v1)
- `dcqlCredentialSetResolver.ts` + `dcqlCredentialMatch.ts` parse `credential_sets`, auto-select first satisfiable single-ID option, unify DCQL claim validation. Exact dual-format pairs short-circuit via `isExactDualFormatPair()`.

### [OK] `direct_post` response transport
- `submitPresentationResponse()` posts `vp_token` (+ `presentation_submission` for PE, + `state`) as `application/x-www-form-urlencoded` to `response_uri` — matches OID4VP 1.0 §6.2.

### [OK] DCQL `vp_token` response shape (production default)
- `formatVpTokenForResponse()` defaults to the spec-correct object-keyed-by-credential-query-id, array-valued shape for DCQL responses (`readVerifierDcqlVpTokenShape()` returns `'object_array'` outside `__DEV__` regardless of env). The alternate shapes (`object_string`, `raw`) are explicitly development-only compatibility probes — fine as is, but **must not be left enabled via env in any release build** (already enforced by the `isDevelopment` gate in `runtimeFlags.ts`).

### [OK] SD-JWT+KB presentation
- `signSdJwtKbPresentationToken()` builds `alg: EdDSA, typ: kb+jwt` with `nonce`, `aud`, `iat`, `sd_hash`, appended to the SD-JWT per SD-JWT VC / HAIP, and rejects credentials without `cnf.jwk`/`cnf.kid` holder binding (`assertSdJwtHolderBinding`).

### [OK] Presentation Exchange birth-date slice
- Scoped to a single supported claim path set (`BIRTH_DATE_PATHS`); anything else throws `PresentationRequestUnsupported`. Matches the documented P5 age-over-20 scope — intentional narrowing, not a gap.

## Suggested order if picking this up next

1. ~~Token endpoint discovery via `authorization_servers` (OID4VCI)~~ — done (2026-06-15).
2. ~~`c_nonce` refresh retry on `invalid_proof` (OID4VCI)~~ — done (2026-06-15).
3. ~~Signed Request Object verification + `client_id_scheme` handling (OID4VP)~~ — done (2026-07-08).
4. ~~`presentation_definition_uri` and DCQL `credential_sets`~~ — done (2026-07-08/09).
5. ~~Production `did:web` verifier trust policy (gate dev `redirect_uri` to `__DEV__`, DID fetch hardening)~~ — done (2026-07-09).
6. Deferred Credential Issuance — implement only if an Issuer starts returning `transaction_id`.

None of the above block the EdDSA protocol migration. The practical next step is reissuing test credentials under the new Ed25519 Holder DID, then re-running the OID4VCI/OID4VP golden path.
