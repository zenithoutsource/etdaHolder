# OID4VP `presentation_definition_uri` Fetch (v1)

**Date:** 2026-07-08  
**Status:** Approved for implementation planning  
**Related:** `docs/TASKS.md` (OID4VP remaining), P5 age-over-20 Presentation Exchange slice, `src/services/vp/presentationService.ts`, `docs/oid 1.0/VP/openid-4-verifiable-presentations-1_0.md`

## Summary

Enable OID4VP Authorization Requests that reference a Presentation Definition by URL (`presentation_definition_uri`) instead of an inline `presentation_definition` JSON string. v1 fetches the definition only after Verifier trust is established, parses it with existing Presentation Exchange helpers, and keeps the current **P5 narrow scope** (ThaiNationalID birth-date disclosure only).

## Goals

1. **Spec compliance** — Stop throwing `PresentationRequestUnsupported` when a trusted Verifier sends `presentation_definition_uri`.
2. **Security** — No presentation-definition fetch before `findTrustedVerifier()`; URI origin must match the trusted Verifier `allowedOrigins`.
3. **Reuse** — Same `PresentationDefinition` parsers and `assertSupportedBirthDateRequest()` as inline PD today.

## Non-goals (v1)

- Broader Presentation Exchange claim paths beyond P5 birth-date disclosure.
- DCQL `credential_sets` (separate spec).
- Caching or ETag revalidation of fetched presentation definitions.
- DID/JWKS resolution for PD hosting on third-party origins outside the Verifier allowlist.
- `presentation_definition_uri` over non-HTTP(S) schemes.

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Fetch timing | **After** `findTrustedVerifier()` succeeds |
| Trust gate | `new URL(uri).origin` must be in `verifier.allowedOrigins` |
| Transport | `GET` with `Accept: application/json` via caller `fetchImpl` (wallet API adapter + dev verifier proxy) |
| HTTPS policy | HTTPS required outside `__DEV__`; `http:` allowed in `__DEV__` for LAN verifier testing |
| Inline vs URI | **Reject** requests that include both `presentation_definition` and `presentation_definition_uri` |
| PE vs DCQL | **Reject** any Presentation Exchange parameter (`presentation_definition` or `presentation_definition_uri`) combined with `dcql_query` — v1 treats query languages as mutually exclusive until a separate design defines mixed semantics |
| Fetch timeout | `AbortController` abort after `EXPO_PUBLIC_PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS` (default 15_000 ms) |
| Max response size | Reject bodies larger than `EXPO_PUBLIC_PRESENTATION_DEFINITION_MAX_BYTES` (default 65_536 bytes) before JSON parse |
| Post-fetch policy | Run existing `assertSupportedBirthDateRequest()` — P5 scope unchanged |
| Logging | `logWalletStep` with host + HTTP status only; no PD body or claim values |

## Architecture

### New module: `src/services/vp/presentationDefinitionResolver.ts`

Responsibilities:

- `fetchPresentationDefinition(uri, { allowedOrigins, fetchImpl })` → `PresentationDefinition`
- Origin validation + HTTPS policy
- Malformed URI syntax check (`new URL(uri)`) before network I/O
- HTTP `GET` with `Accept: application/json`, `AbortController` timeout, and max-bytes read cap
- Map fetch/timeout/oversize failures to `PresentationDefinitionFetchFailed`
- Delegate shape validation to exported `parsePresentationDefinitionJson()` from `presentationService.ts`

### Modified: `src/services/vp/presentationService.ts`

Reorder `resolvePresentationRequest()`:

1. `readAuthorizationRequest()` — unchanged (JAR path already verified when `request_uri` JWT).
2. Read `client_id`, `response_uri`, `response_mode`, `nonce`.
3. **Query-language gates (before trust or fetch):**
   - Reject both `presentation_definition` and `presentation_definition_uri`.
   - Reject any PE parameter combined with `dcql_query`.
4. `findTrustedVerifier()` — unchanged.
5. **`resolvePresentationDefinition(authorizationRequest, verifier)`** — new orchestrator (after trust):
   - If `presentation_definition` present → parse inline (current behavior).
   - Else if `presentation_definition_uri` present → `fetchPresentationDefinition(uri, { allowedOrigins: verifier.allowedOrigins, fetchImpl })`.
   - Else if DCQL only → skip (unchanged).
   - Else → `PresentationRequestInvalid`.
6. Credential match + disclosures — unchanged (PE-only or DCQL-only; never mixed).

Remove the throw in `readOptionalPresentationDefinition()` for `presentation_definition_uri`; that function becomes inline-only or is inlined into the orchestrator.

## Error mapping

| Condition | Error |
|-----------|-------|
| Both inline PD and URI | `PresentationRequestInvalid: presentation_definition and presentation_definition_uri are mutually exclusive` |
| PE parameter + `dcql_query` | `PresentationRequestInvalid: Presentation Exchange and dcql_query are mutually exclusive` |
| Malformed `presentation_definition_uri` | `PresentationRequestInvalid: presentation_definition_uri is not a valid URL` |
| URI origin not allowlisted | `PresentationDefinitionUntrusted: URI origin is not allowlisted` |
| Non-HTTPS in production | `PresentationDefinitionUntrusted: presentation definition URI must use HTTPS` |
| HTTP non-success status | `PresentationDefinitionFetchFailed: HTTP <status>` |
| Fetch timeout (`AbortError`) | `PresentationDefinitionFetchFailed: request timed out` |
| Response exceeds max bytes | `PresentationDefinitionFetchFailed: response exceeds maximum size` |
| Network / platform fetch throw | `PresentationDefinitionFetchFailed: network error` |
| Invalid JSON / shape | `PresentationRequestInvalid: Presentation Exchange definition is required` |
| Unsupported claim paths (post-fetch) | `PresentationRequestUnsupported: only ThaiNationalID birth date disclosure is supported` (existing) |

## Testing

### `presentationDefinitionResolver.test.ts`

- Fetches valid PD from allowlisted HTTPS origin (mock `fetchImpl`).
- Rejects off-origin URI.
- Rejects non-HTTPS URI when `__DEV__` is false (mock `__DEV__` or test the policy helper directly).
- Rejects malformed JSON and PD missing `input_descriptors`.
- Maps fetch timeout to `PresentationDefinitionFetchFailed: request timed out`.
- Maps oversize body to `PresentationDefinitionFetchFailed: response exceeds maximum size`.
- Maps malformed URI syntax to `PresentationRequestInvalid: presentation_definition_uri is not a valid URL`.
- Maps network fetch throw to `PresentationDefinitionFetchFailed: network error`.

### `presentationService.test.ts`

- Resolves `request_uri` JWT whose payload uses `presentation_definition_uri` instead of inline PD.
- Asserts `fetchImpl` called with URI + `Accept: application/json`.
- Asserts matched credential + birth-date disclosure unchanged from inline PD test.
- Rejects `presentation_definition` + `dcql_query` and `presentation_definition_uri` + `dcql_query`.

## Documentation

- Update `docs/TASKS.md` OID4VP checkbox when implemented.
- Document `EXPO_PUBLIC_PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS` and `EXPO_PUBLIC_PRESENTATION_DEFINITION_MAX_BYTES` in `.env.development.local.example`.

## Verification (Definition of Done)

- `yarn tsc --noEmit` passes.
- `yarn test --runInBand` focused VP suites pass.
- `yarn lint` passes or only pre-existing warnings.
