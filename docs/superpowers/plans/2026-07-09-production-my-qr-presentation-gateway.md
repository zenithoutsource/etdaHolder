# Production My QR Presentation Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden dev VP relay into production `/v1` Presentation Gateway and decouple mobile from `/dev/*` via `PresentationGatewayClient`, while keeping dev LAN path working.

**Architecture:** Extract shared session + verify logic on server; mount both `/dev/*` (legacy) and `/v1/*` (production). Mobile ships `RelayPresentationGatewayAdapter` only; `useWalletInitiatedVpQrSession` calls the client interface. Issuer JWKS resolution on verify path reuses `resolveVpIssuerPublicKeyFromRawVc`.

**Tech Stack:** Express, Jest/supertest, React Native Expo SDK 54, existing `sdJwtVerifier`, `signSdJwtKbPresentationToken`, NativeWind.

**Spec:** `docs/superpowers/specs/2026-07-09-production-my-qr-presentation-gateway-design.md`

## Global constraints

- §2.1 crypto checklist unchanged from dev spec.
- One biometric per My QR action: sign-time Keychain gate only.
- ThaID (`ThaiNationalID`) only on gateway v1 policy.
- Dev `/dev/*` must keep working for LAN golden path.
- No VP/token/claim logging in production.
- Configurable TTLs via env with defaults documented in `.env.example`.
- NativeWind for any UI touch; run `yarn tsc --noEmit`, `yarn lint`, focused tests per task.

---

## File map

| File | Action |
|------|--------|
| `server/src/services/presentationSessionStore.ts` | **Create** — store interface + in-memory impl (extract from vpSessionStore) |
| `server/src/services/vpSessionStore.ts` | **Modify** — delegate to presentationSessionStore or re-export |
| `server/src/services/sdJwtVerifier.ts` | **Modify** — optional async issuer JWKS resolve per vpToken |
| `server/src/services/resolveVpIssuerKey.ts` | **Reuse** — JWKS fetch (already exists) |
| `server/src/routes/presentationGateway.ts` | **Create** — `/v1/presentation-sessions`, `/v1/present/verify` |
| `server/src/routes/vpSession.ts` | **Modify** — share handlers or delegate to shared service |
| `server/src/config.ts` | **Modify** — `presentationSessionTtlMs`, `presentationGatewayBaseUrl`, JWKS cache TTL |
| `server/.env.example` | **Modify** — new vars |
| `server/src/testApp.ts` | **Modify** — mount `presentationGatewayRouter` |
| `src/services/vp/presentationGatewayClient.ts` | **Create** — interface + types |
| `src/services/vp/relayPresentationGatewayAdapter.ts` | **Create** — HTTP adapter |
| `src/services/vp/presentationGatewayBaseUrl.ts` | **Create** — env resolution |
| `src/services/vp/walletInitiatedPresentation.ts` | **Modify** — use client |
| `src/hooks/useWalletInitiatedVpQrSession.ts` | **Modify** — inject client (default adapter) |
| `.env.example` | **Modify** — `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` |

---

### Task 1: Presentation session store interface

**Files:**
- Create: `server/src/services/presentationSessionStore.ts`
- Modify: `server/src/services/vpSessionStore.ts`
- Test: `server/src/services/presentationSessionStore.test.ts` (port existing vpSessionStore tests)

- [ ] **Step 1:** Define `PresentationSessionStore` interface matching spec session model + status helpers.
- [ ] **Step 2:** Move in-memory Map implementation from `vpSessionStore.ts`; keep `resetVpSessionStore()` for tests.
- [ ] **Step 3:** Make `vpSessionStore.ts` re-export in-memory singleton for `/dev` routes (no behaviour change).
- [ ] **Step 4:** Run `cd server && yarn test presentationSessionStore vpSession` — all pass.

---

### Task 2: Server config for v1 gateway

**Files:**
- Modify: `server/src/config.ts`, `server/.env.example`
- Test: `server/src/config.test.ts`

- [ ] **Step 1:** Add `presentationSessionTtlMs` (read `PRESENTATION_SESSION_TTL_MS`, default `300000`).
- [ ] **Step 2:** Add `presentationGatewayBaseUrl` (read `PRESENTATION_GATEWAY_BASE_URL`, default `VP_RELAY_BASE_URL` then `http://localhost:4000`).
- [ ] **Step 3:** Add `presentationIssuerJwksCacheMs` (default `3600000`).
- [ ] **Step 4:** Document all three in `server/.env.example` with unit, default, effect.
- [ ] **Step 5:** Run `cd server && yarn test config && yarn tsc`.

---

### Task 3: Shared presentation gateway service

**Files:**
- Create: `server/src/services/presentationGatewayService.ts`
- Test: `server/src/services/presentationGatewayService.test.ts`

- [ ] **Step 1:** Extract create/upload/status/verify orchestration from `vpSession.ts` into service functions accepting `PresentationSessionStore` + config.
- [ ] **Step 2:** Enforce `credentialType === 'ThaiNationalID'` on upload in v1 (return 400 otherwise).
- [ ] **Step 3:** Build `verifyUrl` from `presentationGatewayBaseUrl` + `/v1/present/verify?s=`.
- [ ] **Step 4:** Unit test create → upload → ready → verify consumed path.

---

### Task 4: Issuer JWKS on verify path

**Files:**
- Modify: `server/src/services/sdJwtVerifier.ts`
- Modify: `server/src/services/presentationGatewayService.ts`
- Test: `server/src/services/sdJwtVerifier.test.ts`

- [ ] **Step 1:** Add `verifySdJwtKbPresentationAsync(vpToken, context)` that resolves issuer JWK via `resolveVpIssuerPublicKeyFromRawVc(vpToken)` when env pin absent.
- [ ] **Step 2:** Keep sync path with pinned `issuerPublicKeyJwk` for tests/dev speed.
- [ ] **Step 3:** Add test with mocked JWKS resolution (do not hit network in CI).
- [ ] **Step 4:** Run `cd server && yarn test sdJwtVerifier`.

---

### Task 5: `/v1` HTTP routes

**Files:**
- Create: `server/src/routes/presentationGateway.ts`
- Modify: `server/src/routes/vpSession.ts` (delegate to shared service)
- Modify: `server/src/testApp.ts`
- Test: `server/src/routes/presentationGateway.test.ts`

- [ ] **Step 1:** Implement `POST /v1/presentation-sessions`, `PUT /v1/presentation-sessions/:id`, `GET /v1/presentation-sessions/:id/status`, `GET /v1/present/verify`.
- [ ] **Step 2:** Reuse `vpSessionHtml.ts` templates; charset utf-8 on HTML.
- [ ] **Step 3:** Mount router on test app; supertest golden path (create → put → verify success).
- [ ] **Step 4:** Assert `/dev/*` tests still pass unchanged.
- [ ] **Step 5:** Run `cd server && yarn test vpSession presentationGateway`.

---

### Task 6: Mobile `PresentationGatewayClient`

**Files:**
- Create: `src/services/vp/presentationGatewayClient.ts`
- Create: `src/services/vp/relayPresentationGatewayAdapter.ts`
- Create: `src/services/vp/presentationGatewayBaseUrl.ts`
- Test: `src/services/vp/relayPresentationGatewayAdapter.test.ts`

- [ ] **Step 1:** Define types + `PresentationGatewayClient` interface per spec.
- [ ] **Step 2:** Implement `resolvePresentationGatewayBaseUrl()` — prefer `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL`, fallback `EXPO_PUBLIC_VP_RELAY_BASE_URL`, then existing `resolveVpRelayBaseUrl()` logic.
- [ ] **Step 3:** Implement adapter mapping to `/v1/presentation-sessions` endpoints; map HTTP errors to existing wallet error tokens (`VpSessionCreateFailed`, etc.).
- [ ] **Step 4:** Jest tests with `fetch` mock for create/upload/status.
- [ ] **Step 5:** Run `yarn test relayPresentationGatewayAdapter presentationGatewayBaseUrl`.

---

### Task 7: Wire wallet to client

**Files:**
- Modify: `src/services/vp/walletInitiatedPresentation.ts`
- Modify: `src/hooks/useWalletInitiatedVpQrSession.ts`
- Test: `src/services/vp/walletInitiatedPresentation.test.ts`, `src/components/VpQrModal.test.tsx`

- [ ] **Step 1:** Replace direct `fetch` in `walletInitiatedPresentation.ts` with `PresentationGatewayClient` (default: `createRelayPresentationGatewayAdapter()`).
- [ ] **Step 2:** `buildQrUrl` uses `verifyUrl` from create response (remove client-side URL assembly when server provides it).
- [ ] **Step 3:** `useWalletInitiatedVpQrSession` passes through; no UI changes required.
- [ ] **Step 4:** Update unit tests to mock client instead of fetch.
- [ ] **Step 5:** Run `yarn test walletInitiatedPresentation VpQrModal`.

---

### Task 8: Env and docs

**Files:**
- Modify: `.env.example`, `server/.env.example`, `docs/TASKS.md`

- [ ] **Step 1:** Add `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` to root `.env.example` with comment (unit: URL, default: falls back to VP relay / wallet-api origin).
- [ ] **Step 2:** Add server `PRESENTATION_GATEWAY_BASE_URL`, `PRESENTATION_SESSION_TTL_MS`, `PRESENTATION_ISSUER_JWKS_CACHE_MS`.
- [ ] **Step 3:** Add TASKS.md backlog entry referencing spec + plan; note dev `/dev/*` retained.
- [ ] **Step 4:** Run full `yarn tsc --noEmit && yarn lint` (root + server).

---

### Task 9: Manual golden path

- [ ] **Step 1:** Set `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` to LAN server; set `PRESENTATION_GATEWAY_BASE_URL` on server.
- [ ] **Step 2:** My QR on A36 → scan with Honeywell → `/v1/present/verify` success HTML.
- [ ] **Step 3:** Confirm wallet shows ตรวจสอบสำเร็จ after `consumed`.
- [ ] **Step 4:** Confirm dev `/dev/vp-verify` still works when v1 env unset (backward compat).

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| PresentationGatewayClient | Task 6–7 |
| /v1 API | Task 5 |
| §2.1 verify | Task 4–5 |
| ThaID only v1 | Task 3 |
| JWKS production | Task 4 |
| Dev /dev retained | Task 5 step 4 |
| Extension hooks documented only | Spec (no task) |
| Persistent store prod note | Spec deployment; in-memory OK for reference v1 |

No TBD placeholders in task steps.

## Execution handoff

**Plan saved to:** `docs/superpowers/plans/2026-07-09-production-my-qr-presentation-gateway.md`

**Two execution options:**

1. **Subagent-driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline execution** — implement tasks in this session with checkpoints

Which approach do you want?
