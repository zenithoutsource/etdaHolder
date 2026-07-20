# OID4VP Production `did:web` Verifier Trust (v1)

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Related:** `docs/TASKS.md` (OID4VP Remaining — replace dev `redirect_uri` Verifier), `docs/SPEC_COMPLIANCE_OID4VC.md`, `src/config/trustedVerifiers.ts`, `src/services/vp/authorizationRequestJar.ts`, `src/services/vp/clientIdScheme.ts`, `src/services/vp/didWebResolver.ts`, `docs/ARCHITECTURE.md` §3

## Summary

Close the gap between **development** OID4VP trust (`redirect_uri:` + LAN Verifier API) and **production** trust (`decentralized_identifier:did:web:` + signed Request Objects). v1 does **not** add a remote Trust Registry — it hardens env-driven `did:web` verifier configuration, gates dev `redirect_uri` trust to development builds, and adds fetch policy to `did:web` DID document resolution.

**Precondition (already implemented):** JAR signature verification, `client_id_scheme` parsing, scheme-aware `findTrustedVerifier()`, optional `EXPO_PUBLIC_VERIFIER_DID_WEB_*` env entries, and `resolveDidWebVerificationJwk()` for unpinned keys.

## Goals

1. **Production-default trust** — Release builds trust **`decentralized_identifier:did:web:`** verifiers configured via env, not the dev `redirect_uri:` Verifier API entry.
2. **Keep dev path** — When `EXPO_PUBLIC_VERIFIER_API_BASE_URL` is set in `__DEV__`, the existing `redirect_uri:` allowlist remains available for LAN Verifier API testing.
3. **Signed Request Objects** — Production `did:web` verifiers always require EdDSA JAR verification (already enforced by `clientIdRequiresSignedRequestObject('decentralized_identifier')`).
4. **Observable failure** — Clear wallet errors when no production verifier is configured or when DID document fetch fails.
5. **Minimal diff** — Extend `trustedVerifiers.ts`, `authorizationRequestJar.ts`, and `didWebResolver.ts`; no UI changes beyond existing Scan error surfacing.

## Non-goals (v1)

- Remote Trust Registry / dynamic verifier onboarding.
- Multiple verifiers via JSON trust-list file (defer until the customer publishes >1 production verifier).
- `verifier_attestation`, `x509_*`, `openid_federation` client_id schemes.
- Replacing company-backend verifier registration APIs.
- Changing Holder consent UI or `direct_post` transport.

## Background

| Layer | Development today | Production target |
|-------|-------------------|-------------------|
| `client_id` | `redirect_uri:http://verifier.zenithcomp.co.th:455/openid4vc/verify/...` | `decentralized_identifier:did:web:<verifier-host>` |
| Request Object | Unsigned JWT accepted (`redirect_uri` scheme) | EdDSA-signed JAR required |
| Trust source | Env `EXPO_PUBLIC_VERIFIER_API_BASE_URL` → auto `redirect_uri` entry | Env `EXPO_PUBLIC_VERIFIER_DID_WEB_*` → `decentralized_identifier` entry |
| Key resolution | N/A (unsigned) | Pinned `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK` **or** `did.json` fetch via `didWebResolver.ts` |
| `response_uri` binding | Exact match (`redirect_uri` prefix) | `did:web` HTTPS origin match (`readResponseUriMatchesClientId`) |

`buildTrustedVerifiersFromEnv()` already emits both entry types when env is set. The remaining work is **policy** (which entries are valid in which build flavor) and **DID fetch hardening** (timeout/size/HTTPS).

## Approaches considered

| Approach | Pros | Cons | v1 choice |
|----------|------|------|-----------|
| **A. Env single `did:web` verifier + dev gate** | Matches current `trustedVerifiers.ts`; minimal code | One verifier per build | **Recommended** |
| **B. JSON trust list env** | Multiple verifiers without code change | Parsing/validation surface; no customer requirement yet | Defer |
| **C. Remote Trust Registry** | Production-grade onboarding | Blocked — no registry API | Defer |

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Dev `redirect_uri` entry | Emit **only when** `__DEV__` **and** `EXPO_PUBLIC_VERIFIER_API_BASE_URL` is set. Never emit in production/release builds even if the env var is accidentally present in EAS secrets. |
| Production minimum trust | When `!__DEV__`, `buildTrustedVerifiersFromEnv()` **must** return at least one `decentralized_identifier:did:web:` verifier or the wallet has **zero** trusted verifiers (Scan fails with existing `VerifierUntrusted` path). |
| `did:web` env shape | Keep existing vars: `EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID` (bare `did:web:...` or full `decentralized_identifier:...`), `EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN`, optional `EXPO_PUBLIC_VERIFIER_DID_WEB_NAME`, optional `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK` (pinned Ed25519 public JWK). |
| JWK resolution order | **Unchanged:** pinned env JWK first (`verificationJwk` on `TrustedVerifier`), else `resolveDidWebVerificationJwk(did, kid, fetchImpl)` from `did.json`. |
| DID document fetch policy | Add configurable timeout + max-bytes. `did:web` document resolution always uses the standard HTTPS URL derived from the DID. LAN testing that needs `http:` must use a pinned `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK`; do not add a non-standard HTTP DID document URL override in v1. |
| `pre_registered` legacy entries | Keep `findTrustedVerifier()` support for legacy bare `did:web:...` allowlist strings in `TrustedVerifier.clientId` — do not remove in v1. New env entries use `decentralized_identifier:` prefix. |
| Logging | `logWalletStep` for trust build summary (verifier count + scheme names only); no JWK material, DID document bodies, or `client_id` path segments beyond host. |

## Architecture

### Modified: `src/config/trustedVerifiers.ts`

- Gate `redirect_uri` Verifier API entry behind `__DEV__`.
- In `!__DEV__`, require successful parse of `EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID` + `EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN` for any trusted verifier; otherwise return `[]`.
- Export `readTrustedVerifierBuildPolicy()` helper for tests: `{ includesRedirectUri: boolean, includesDidWeb: boolean }`.
- Accept an optional `isDevelopment = __DEV__` parameter in testable helpers instead of requiring tests to monkey-patch the global — concretely, `buildTrustedVerifiersFromEnv(env = process.env, isDevelopment = __DEV__)`, so the module-level `TRUSTED_VERIFIERS` constant stays default-driven and tests inject both arguments.

### Modified: `src/services/vp/authorizationRequestJar.ts`

- Before resolving an unpinned `did:web` key from the network, require an exact scheme-aware match in `trustedVerifiers`.
- If no trusted verifier matches the `decentralized_identifier:did:web:...` client ID, fail before any DID document fetch.
- **Reuse, don't duplicate:** the trust gate must call the existing scheme-aware `findTrustedVerifier()` from `presentationService.ts` (export or inject it), not introduce a second matcher. `readPinnedVerificationJwk()` already near-duplicates that matching logic — fold the pinned-JWK lookup into the same `findTrustedVerifier()` match result so one matcher serves both the gate and key pinning.
- Keep the existing resolution order for trusted verifiers: pinned `TrustedVerifier.verificationJwk` first, else HTTPS `did.json` resolution.

### New: `src/config/didWebFetchPolicy.ts`

Mirror `presentationDefinitionFetchPolicy.ts`:

| Env var | Default | Effect |
|---------|---------|--------|
| `EXPO_PUBLIC_DID_WEB_FETCH_TIMEOUT_MS` | `15000` | AbortController timeout for `did.json` fetch |
| `EXPO_PUBLIC_DID_WEB_MAX_BYTES` | `65536` | Max DID document UTF-8 byte size before JSON parse |

### Modified: `src/services/vp/didWebResolver.ts`

- Apply timeout + byte cap from `didWebFetchPolicy.ts`.
- Read the DID document as bytes (`arrayBuffer()` or equivalent), reject when `byteLength > EXPO_PUBLIC_DID_WEB_MAX_BYTES`, then decode and parse JSON. Note: Expo/Hermes fetch has no streaming — the full body downloads before the check, so the cap protects JSON parsing, not bandwidth.
- Keep `readDidWebDocumentUrl()` standards-only: `https://<host>/.well-known/did.json` or `https://<host>/<path>/did.json`.
- Map failures to stable errors, keeping the two existing error families: `DidWebInvalid: ...` for malformed input (bad `did:web` identifier, missing host — already thrown by `readDidWebDocumentUrl()`), `DidWebResolveFailed: ...` for resolution failures (timeout, oversize, HTTP status, malformed document). Do not rename `DidWebInvalid`.

### Unchanged (verify only)

| Module | Role |
|--------|------|
| `clientIdScheme.ts` | Scheme parse + `response_uri` / `did:web` origin binding |
| `presentationService.ts` | `findTrustedVerifier()` after JAR parse |
| `app/(tabs)/scan.tsx` | Passes `TRUSTED_VERIFIERS` into `resolvePresentationRequest()` |

## Error mapping

| Condition | Error |
|-----------|-------|
| Production build, no `did:web` env configured | `VerifierUntrusted` or `PresentationRequestInvalid: verifier is not trusted` before DID document fetch (empty allowlist) |
| Untrusted `did:web` client ID before key resolution | `VerifierUntrusted` or `PresentationRequestInvalid: verifier is not trusted` before DID document fetch |
| `did:web` DID document fetch timeout | `DidWebResolveFailed: fetch timed out` — propagates raw from the resolver (no wrapping; the required-signed path in `authorizationRequestJar.ts` lets resolver errors surface as-is for diagnostics) |
| DID document oversize | `DidWebResolveFailed: response exceeds max bytes` |
| Malformed DID / malformed DID document URL | `DidWebInvalid: ...` (existing error family in `readDidWebDocumentUrl()` — unchanged) |
| JAR signature fails after key resolution | `PresentationRequestInvalid: request object signature verification failed` (existing) |
| `response_uri` origin mismatch for `did:web` | `VerifierUntrusted` (existing `readResponseUriMatchesClientId` gate) |

## User interface (v1)

No new screens. Scan tab continues to show mapped errors from `resolvePresentationRequest()` failures. Production misconfiguration (`TRUSTED_VERIFIERS` empty) surfaces through the existing untrusted-verifier/request-invalid error path - acceptable until company ops documents EAS env setup.

## Testing

### `trustedVerifiers.test.ts`

- `__DEV__` + `VERIFIER_API_BASE_URL` → includes `redirect_uri` entry.
- `!__DEV__` (mock) + `VERIFIER_API_BASE_URL` → **no** `redirect_uri` entry.
- `!__DEV__` + `VERIFIER_DID_WEB_*` → single `decentralized_identifier` entry with pinned JWK.
- `!__DEV__` + missing did:web env → `[]`.

### `didWebResolver.test.ts`

- Timeout abort → `DidWebResolveFailed`.
- Oversize UTF-8 byte body → `DidWebResolveFailed`.
- Malformed percent-encoding or invalid `did:web` identifier produces `DidWebInvalid` (existing behavior, unchanged).
- Standard document URL derivation always returns HTTPS.

### `presentationService.test.ts` (integration)

- Resolve trusted `decentralized_identifier:did:web:` request with signed JAR (existing `authorizationRequestJar` fixtures extended).
- Untrusted `decentralized_identifier:did:web:` signed JAR does not call `fetchImpl` for DID document resolution.
- Production-trust fixture: unsigned `redirect_uri` request rejected when dev entry absent from `trustedVerifiers`.

## Documentation

- Update **both** `.env.example` (required by the CLAUDE.md configurable time/duration rule) and `.env.development.local.example` with `EXPO_PUBLIC_DID_WEB_*` and fetch policy vars (comments: unit, default, effect).
- Update `docs/ARCHITECTURE.md` §3 OID4VP bullet to reference production env vars.
- Update `docs/SPEC_COMPLIANCE_OID4VC.md` — mark JAR + `client_id_scheme` + `presentation_definition_uri` + `credential_sets` as `[OK]`; leave this item open until production gate ships.
- Update `docs/TASKS.md` checkbox when implemented.

## Verification (Definition of Done)

- `yarn tsc --noEmit` passes.
- Focused tests pass: `trustedVerifiers.test.ts`, `didWebResolver.test.ts`, `authorizationRequestJar.test.ts`, `presentationService.test.ts`.
- Manual (when production `did:web` Verifier available): configure EAS `EXPO_PUBLIC_VERIFIER_DID_WEB_*`, scan production QR, approve, `direct_post` succeeds.

## Future work

| Item | Trigger |
|------|---------|
| JSON / remote trust list | the customer publishes Trust Registry API or >1 production verifier |
| `verifier_attestation` scheme | Verifier requires VA-JWT `client_id` |
| Certificate-pinning for `did.json` fetch | Security review requires TOFU hardening beyond HTTPS |
| `did.json` response caching (avoid refetch per scan for unpinned verifiers) | Production telemetry shows repeated scans against the same unpinned `did:web` verifier |
