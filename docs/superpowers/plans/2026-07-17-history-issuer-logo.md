# History Issuer Logo Implementation Plan

> **For agentic workers:** This plan is being executed inline in the current session.

**Goal:** Render configured issuer logos while displaying the issuer name received from OID4VCI metadata in History Log entries.

**Architecture:** Keep document identity, logo selection, and temporary issuer names for the three supported credential types in the existing card-schema registry. Unknown credential types may use captured issuer metadata or JWT `iss`. Unsupported document types continue using the current generic icon.

**Tech Stack:** React Native, Expo static image assets, TypeScript, NativeWind, Jest, React Native Testing Library.

## Global Constraints

- Keep screen files thin and reusable UI in `src/components/`.
- Use config-driven mappings rather than issuer-specific components.
- Preserve persisted history event shapes and unknown-type fallback behavior.
- Do not use card-schema issuer names for new issuance history records.
- Do not add new dependencies.

### Task 1: Add schema logo metadata

**Files:**
- Modify: `src/config/cardSchemas.ts`
- Test: `src/config/cardSchemas.test.ts`

- [x] Extend the schema image-key union with issuer logo keys and add the supported logo keys to the three existing schemas.
- [x] Run the focused schema tests.

### Task 2: Render issuer logos in HistoryItem

**Files:**
- Modify: `src/components/HistoryItem.tsx`
- Create: `src/components/HistoryItem.test.tsx`

- [x] Add a resolver from `item.documentType` to the configured schema logo.
- [x] Render a React Native `Image` for configured logos and preserve the existing Material icon fallback.
- [x] Add focused tests for Thai ID, driving licence, academic transcript, and unknown document type.
- [x] Run the focused HistoryItem tests.

### Task 3: Record and verify the slice

**Files:**
- Modify: `docs/TASKS.md`

- [x] Add the completed History Log issuer-logo slice to the current session handoff.
- [x] Run `yarn tsc --noEmit`, `yarn lint`, and the focused tests.

### Task 4: Preserve issuer name from issuer data

**Files:**
- Create: `src/services/credentials/credentialIssuer.ts`
- Test: `src/services/credentials/credentialIssuer.test.ts`
- Modify: `src/services/vci/exchangeService.ts`
- Modify: `src/services/history/walletEventLog.ts`
- Modify: `src/services/history/walletHistoryRecording.ts`

- [x] Add a failing test for metadata `display.name`, JWT `iss` fallback, and empty-name fallback.
- [x] Add optional `issuerName` to `VerifiableCredentialRecord` and capture metadata name during normalization.
- [x] Use the shared issuer-name resolver for save history, backfilled history, and issuer verification/renewal history.
- [x] Verify the issuer-name propagation and existing logo tests.
