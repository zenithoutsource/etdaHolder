# OID4VP Production `did:web` Verifier Trust Plan

> **For agentic workers:** Implement task-by-task and run focused verification after each behavioral slice.

**Goal:** Ship production OID4VP verifier trust by allowing release builds to trust only env-configured `decentralized_identifier:did:web:` verifiers, while keeping the LAN `redirect_uri:` verifier in development builds only.

**Spec:** `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`

## Key Changes

- Gate `EXPO_PUBLIC_VERIFIER_API_BASE_URL` `redirect_uri:` entries behind `__DEV__`; production returns only valid `did:web` verifier entries or `[]`.
- Share one scheme-aware trusted-verifier matcher between JAR verification and presentation resolution.
- Reject untrusted `decentralized_identifier:did:web:` Request Objects before any unpinned DID document fetch.
- Add DID document fetch timeout and UTF-8 byte cap policy via `EXPO_PUBLIC_DID_WEB_FETCH_TIMEOUT_MS` and `EXPO_PUBLIC_DID_WEB_MAX_BYTES`.
- Keep `did:web` document URLs standards-only HTTPS; LAN HTTP testing must use pinned `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK`.

## Tasks

- [ ] Update `trustedVerifiers.ts` with injectable build flavor and `readTrustedVerifierBuildPolicy()`.
- [ ] Extract/export shared `findTrustedVerifier()` matcher and reuse it from `authorizationRequestJar.ts`.
- [ ] Add `didWebFetchPolicy.ts` and apply timeout/byte-cap hardening in `didWebResolver.ts`.
- [ ] Add focused tests for production gating, no-fetch-before-trust, timeout, oversize, and malformed DID behavior.
- [ ] Update `.env.example`, `.env.development.local.example`, architecture/spec-compliance docs, and `docs/TASKS.md`.

## Verification

- `yarn test src/config/trustedVerifiers.test.ts`
- `yarn test src/services/vp/didWebResolver.test.ts src/services/vp/authorizationRequestJar.test.ts src/services/vp/presentationService.test.ts`
- `yarn tsc --noEmit`
- `yarn lint`
