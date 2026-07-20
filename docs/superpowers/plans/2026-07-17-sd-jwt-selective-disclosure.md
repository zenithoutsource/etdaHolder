# SD-JWT Selective Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ensure OID4VP SD-JWT presentations contain only the disclosures requested by the Verifier while preserving valid KB-JWT binding.

**Architecture:** Add a pure helper that filters compact SD-JWT disclosure segments by claim key. Apply it at the presentation-token boundary for standard DCQL and dual-format DCQL flows; the signing service then hashes the filtered SD-JWT. JWT VC and mDOC behavior remain unchanged because they require different selective-presentation mechanisms.

**Tech Stack:** TypeScript, Jest, compact SD-JWT, existing EdDSA KB-JWT signer.

## Global Constraints

- Never log raw credentials, disclosures, claims, tokens, or PII.
- Keep `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` limited to response-envelope formatting.
- Keep `EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING=false` for normal presentation validation.
- Do not modify generated SDK files or unrelated working-tree changes.

### Task 1: Add and test the disclosure filter

**Files:**
- Create: `src/services/vp/sdJwtSelectiveDisclosure.ts`
- Test: `src/services/vp/sdJwtSelectiveDisclosure.test.ts`

- [ ] Write tests for retaining requested disclosures, removing unrequested disclosures, preserving an unchanged token when no claim filter is supplied, and rejecting malformed disclosure segments.
- [ ] Run the focused test and confirm it fails before implementation.
- [ ] Implement the pure filter with base64url JSON decoding and normalized claim-key matching.
- [ ] Run the focused test and confirm it passes.

### Task 2: Apply filtering to OID4VP token builders

**Files:**
- Modify: `src/services/vp/presentationTokenBuilders/builders.ts`
- Modify: `src/services/vp/dualFormatVpToken.ts`
- Test: `src/services/vp/presentationApproval.test.ts`
- Test: `src/services/vp/dualFormatVpToken.test.ts`

- [ ] Add failing assertions that the token signer receives a filtered SD-JWT for standard and dual-format DCQL requests.
- [ ] Filter with the requested disclosure keys already resolved in `ResolvedPresentationRequest.disclosures`.
- [ ] For dual-format requests, filter per DCQL credential query before signing each SD-JWT entry.
- [ ] Run focused tests and confirm they pass.

### Task 3: Verify and update task tracking

**Files:**
- Modify: `docs/TASKS.md`

- [ ] Run focused VP tests, `yarn tsc --noEmit`, and `yarn lint`.
- [ ] Record the implementation and verification result in `docs/TASKS.md`.

