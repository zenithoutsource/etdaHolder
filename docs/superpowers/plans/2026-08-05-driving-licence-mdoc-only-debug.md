# Driving Licence mDOC-Only Debug Slice — Implementation Plan

> **Status:** Implemented 2026-08-05

**Goal:** Unblock driving-licence OID4VCI on device by acquiring `mso_mdoc` only via existing VCI exchange path.

**Spec:** `docs/superpowers/specs/2026-08-05-driving-licence-mdoc-only-debug-design.md`

## Completed tasks

- [x] `isDrivingLicenceDualFormatOffer()` in `logicalCredentialGrouping.ts`
- [x] `acquireDrivingLicenceMdocOnlyForPreview()` in `dualFormatIssuance.ts`
- [x] mDOC-only finalize branch in `finalizeDualFormatCredential` (placeholder record)
- [x] Claim screen routing in `CredentialOfferClaimScreen.tsx`
- [x] Unit tests (grouping, issuance, claim screen)
- [x] `docs/TASKS.md` session note

## Manual E2E (remaining)

1. Dev build on Samsung A26 + Metro
2. Request driving licence via portal until `walletapp://callback`
3. Confirm Metro shows single `driving-licence-mdoc-only-preview-start` / one `mso_mdoc` acquire
4. Success → mDOC stored; failure → raw mDOC error in UI (not `DualFormatClaimFailed`)

## Removal

Delete debug branch when dual-format DL issuance passes E2E; restore `acquireDualFormatForPreview` for driving licence offers.
