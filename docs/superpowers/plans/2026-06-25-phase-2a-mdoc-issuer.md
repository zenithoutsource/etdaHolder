# Phase 2A Test mDOC Issuer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone development mDOC issuer under `server/mdoc-issuer/` that exposes a pre-authorized OID4VCI flow and returns a signed sample `mso_mdoc` credential for local wallet and proximity-development testing.

**Architecture:** Keep the Wallet Backend boundary intact by implementing the issuer as a separate Express app under `server/mdoc-issuer/`, not as extra `/wallet-api/*` routes. Use in-memory pre-authorized offer/token state, static dev certificate fixtures, and a deterministic CBOR/COSE builder so tests can assert exact structure without external services.

**Tech Stack:** Node.js, Express, TypeScript, Jest, `cbor`, Node `crypto`

---

### Task 1: Add failing tests for the standalone issuer contract

**Files:**
- Create: `server/mdoc-issuer/app.test.ts`
- Create: `server/mdoc-issuer/app.ts`
- Modify: `server/jest.config.cjs`
- Modify: `server/tsconfig.json`

- [ ] **Step 1: Write failing endpoint tests**
- [ ] **Step 2: Run `cd server && yarn test --runInBand mdoc-issuer/app.test.ts` and verify RED**
- [ ] **Step 3: Implement the minimal app with health, metadata, token, and credential routes**
- [ ] **Step 4: Re-run the targeted test and verify GREEN**

### Task 2: Add CBOR/COSE mDOC generation with deterministic fixtures

**Files:**
- Create: `server/mdoc-issuer/documentBuilder.ts`
- Create: `server/mdoc-issuer/documentBuilder.test.ts`
- Create: `server/mdoc-issuer/fixtures.ts`

- [ ] **Step 1: Write failing builder tests for issuer-signed item digests, MSO payload, and COSE signature envelope**
- [ ] **Step 2: Run `cd server && yarn test --runInBand mdoc-issuer/documentBuilder.test.ts` and verify RED**
- [ ] **Step 3: Implement deterministic issuer-signed item encoding, Mobile Security Object creation, and COSE_Sign1 signing**
- [ ] **Step 4: Re-run the targeted test and verify GREEN**

### Task 3: Wire scripts, docs, and validation

**Files:**
- Create: `server/mdoc-issuer/server.ts`
- Create: `server/mdoc-issuer/README.md`
- Modify: `server/package.json`
- Modify: `server/README.md`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Add scripts/dependencies and a runnable standalone server entrypoint**
- [ ] **Step 2: Document how to launch the issuer and retrieve a sample offer URI**
- [ ] **Step 3: Run `cd server && yarn tsc`**
- [ ] **Step 4: Run `cd server && yarn test`**
- [ ] **Step 5: Run root `yarn tsc --noEmit` and `yarn lint` if any shared files changed**
