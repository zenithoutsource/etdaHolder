# Remove Development Issuer and Verifier Proxy Implementation Plan

> **For agentic workers:** Execute this plan inline with verification checkpoints.

**Goal:** Remove the development-only Issuer/Verifier HTTP proxy path so the wallet uses public Issuer and Verifier URLs directly.

**Architecture:** Delete proxy URL rewriting from the mobile fetch adapter and OID4VCI exchange service. Remove the local Express proxy routers and their environment flags. Keep direct public endpoint configuration, the Wallet API, and unrelated presentation relay/gateway behavior.

**Tech Stack:** Expo/React Native, TypeScript, Express, Jest, Yarn.

## Global Constraints

- Respond and document in English.
- Do not add new legacy organization-name identifiers.
- Do not change credential protocol behavior beyond transport URL rewriting.
- Use the public Issuer/Verifier URLs embedded in QR requests or configured by the existing direct endpoint variables.
- Run focused tests, `yarn tsc --noEmit`, and `yarn lint` after edits.

---

### Task 1: Remove mobile Issuer/Verifier proxy rewriting

**Files:**
- Modify: `src/sdk/installWalletApiFetch.ts`
- Modify: `src/services/vci/exchangeService.ts`
- Modify: `src/sdk/installWalletApiFetch.test.ts`
- Modify: `src/services/vci/exchangeService.test.ts`

- [x] Remove `DevIssuerProxyConfig`, proxy environment readers, URL rewrite helpers, fetch options, and proxy-aware fetch branches.
- [x] Make OID4VCI metadata, token, credential, and authorization-server discovery requests use their original public URLs directly.
- [x] Delete tests that assert Issuer/Verifier proxy rewrites; retain direct URL and protocol-flow coverage.

### Task 2: Remove local server proxy routes and settings

**Files:**
- Delete: `server/src/routes/devIssuerProxy.ts`
- Modify: `server/src/testApp.ts`
- Modify: `server/src/testApp.test.ts`
- Modify: `server/.env`
- Modify: `server/.env.example`

- [x] Remove proxy router imports and `/dev-issuer-proxy` and `/dev-verifier-proxy` mounts.
- [x] Delete proxy forwarding tests and proxy-only environment variables.
- [x] Keep the normal Wallet API and presentation service routes intact.

### Task 3: Remove proxy environment documentation and update project status

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Modify: `server/README.md`
- Modify: `docs/API.md`
- Modify: `docs/ANDROID_NETWORK_TESTING.md`
- Modify: `docs/TASKS.md`

- [x] Remove development proxy setup/runbook sections and variables.
- [x] Document direct public Issuer/Verifier connectivity as the supported Android testing path.
- [x] Record completion in `docs/TASKS.md`.

### Verification

- [x] Run focused mobile and server tests for changed modules.
- [x] Run `yarn tsc --noEmit` (blocked by unrelated existing `WalletInitiatedVpQr` phase comparison errors).
- [x] Run `yarn lint`.
- [x] Run a repository search confirming no active proxy references remain in `src`, `server`, or environment files; historical task/spec records retain prior implementation history.
