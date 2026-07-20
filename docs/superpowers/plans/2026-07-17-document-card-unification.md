# Document Card Unification Implementation Plan

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Driving License, ID Card, and Transcript use one consistent full-width document-card visual system, restore Revoke/Delete visibility, and keep receive flows aligned.

**Architecture:** Extract reusable card geometry for the banner, hero, two-column detail grid, divider, and typography. Keep document-specific data/configuration in focused presenters: Driving License uses the approved fixed sample, while ID Card and Transcript continue using dynamic claims/profile values. Preserve existing shell overlays, action rows, lifecycle behavior, callbacks, and protocol/storage boundaries.

**Tech Stack:** React Native, Expo, NativeWind, TypeScript, Jest/@testing-library/react-native.

## Global Constraints

- Respond in English only.
- Do not add customer-specific organization names to new identifiers, files, docs, comments, or specs.
- Use React Native primitives and NativeWind; no image mockup replacement.
- Driving License keeps its fixed approved sample values and assets/images/user_profile.png.
- ID Card and Transcript retain dynamic values and existing credential types.
- Existing DocumentCardShell, lifecycle overlays, QR/NFC action row, Revoke/Delete callbacks, and receive callbacks must remain functional.
- Do not modify OID4VCI/OID4VP protocol, storage, SDK, or native NFC behavior.
- Verify focused tests, yarn tsc --noEmit, and yarn lint; record results in docs/TASKS.md.

---

## File Map

- Create or modify: src/components/DocumentCardLayout.tsx — shared full-width banner, hero, and two-column layout primitives.
- Modify: src/components/DrivingLicenceDocumentCard.tsx — use full-width banner/layout and preserve fixed content.
- Modify: src/components/CredentialDocumentDetailCard.tsx — render ID, Transcript, and Driving through the shared layout while preserving shell/action wrappers.
- Modify: src/components/CredentialDocumentDetailCard.test.tsx — regression coverage for all three detail cards and action callbacks.
- Modify: src/components/ThaiIdReceivePanel.tsx — use the shared ID Card visual presentation.
- Modify: src/components/ThaiIdSuccessConfirmationPanel.tsx — align the actual ID Card VC preview confirmation surface.
- Modify: src/components/TranscriptPreviewPanel.tsx — use the shared Transcript visual presentation.
- Modify: src/components/DrivingLicencePreviewPanel.tsx — use the same shared Driving presentation if needed.
- Modify: src/screens/CredentialOfferClaimScreen.tsx — preserve/select the three receive presenters.
- Modify: src/services/credentials/credentialRenewalPresentation.ts — stop hiding Revoke/Delete solely because any renewal record exists.
- Modify: src/services/credentials/credentialRenewalPresentation.test.ts — policy regression tests.
- Modify: docs/TASKS.md — record implementation and verification.

---

### Task 1: Extract shared document-card layout

Files: create src/components/DocumentCardLayout.tsx and src/components/DocumentCardLayout.test.tsx.

Interface: DocumentCardLayout accepts title, primaryColor, optional secondaryColor, image, imageAccessibilityLabel, hero, and columns render content. It exposes stable IDs document-card-layout, document-card-banner, document-card-hero, document-card-left-column, document-card-divider, document-card-right-column.

- [ ] Write failing layout tests for banner, hero, two columns, divider, and full-width flex structure.
- [ ] Run yarn.cmd test DocumentCardLayout.test.tsx --runInBand; expect failure because the module is absent.
- [ ] Implement the white rounded shell, full-width banner row, hero row, and lower two-column row. Use normal flex children rather than absolute positioning for the secondary banner color.
- [ ] Run the same focused test; expect pass.
- [ ] Attempt commit: git add src/components/DocumentCardLayout.tsx src/components/DocumentCardLayout.test.tsx; git commit -m "feat: add shared document card layout". Record the known index-lock permission error if it recurs.

### Task 2: Align wallet detail cards

Files: modify src/components/DrivingLicenceDocumentCard.tsx, src/components/CredentialDocumentDetailCard.tsx, src/components/DrivingLicenceDocumentCard.test.tsx, and src/components/CredentialDocumentDetailCard.test.tsx.

- [ ] Add failing assertions for all three detail types: full-width banner marker, shared hero/columns/divider markers, title, portrait, and document-specific values. Assert Driving keeps fixed sample and ID/Transcript keep dynamic fixture values.
- [ ] Run yarn.cmd test DrivingLicenceDocumentCard.test.tsx CredentialDocumentDetailCard.test.tsx --runInBand; expect failure for the new shared-layout markers.
- [ ] Refactor the three presenters to compose DocumentCardLayout, using document-specific field rows only. Keep DocumentCardShell and DocumentActionRow outside the visual component.
- [ ] Run the focused detail command; expect pass including existing lifecycle/action tests.
- [ ] Attempt a scoped commit with message feat: align wallet document cards.

### Task 3: Align VC receive previews

Files: modify src/components/ThaiIdReceivePanel.tsx, src/components/TranscriptPreviewPanel.tsx, src/components/DrivingLicencePreviewPanel.tsx, src/screens/CredentialOfferClaimScreen.tsx, and focused receive tests.

- [ ] Add failing receive tests for ID and Transcript shared markers, exact dynamic values, accept/confirm callbacks, and Driving fixed/shared rendering.
- [ ] Run yarn.cmd test ThaiIdReceivePanel.test.tsx TranscriptPreviewPanel.test.tsx DrivingLicencePreviewPanel.test.tsx CredentialOfferClaimScreen.test.tsx --runInBand; expect failure for missing shared markers/branches.
- [ ] Refactor receive panels to use DocumentCardLayout while preserving field extraction and callbacks; keep receive buttons below the card.
- [ ] Run the same focused receive command; expect pass.
- [ ] Attempt a scoped commit with message feat: align credential receive cards.

### Task 4: Restore Revoke/Delete action visibility

Files: modify src/services/credentials/credentialRenewalPresentation.ts and its test; modify app/(tabs)/credential/[id].tsx only if a focused screen regression requires it.

Interface: shouldHideCredentialActionMenu(renewalStatus?, context?) keeps its current signature. It returns true for wallet key rotation or an active renewal/inactive ribbon context, and false for an otherwise active credential even when a stale/non-blocking renewal record exists.

- [ ] Add failing policy tests for undefined status, active credential with a renewal record, visible renewal ribbon, and wallet key rotation.
- [ ] Run yarn.cmd test credentialRenewalPresentation.test.ts --runInBand; expect failure for active credential plus renewal record.
- [ ] Remove only the blanket if (renewalStatus) return true behavior, retaining rotation/ribbon gates.
- [ ] Run the focused policy test; expect pass.
- [ ] Attempt a scoped commit with message fix: restore credential action menu.

### Task 5: Documentation and verification

Files: modify docs/TASKS.md.

- [ ] Record the full-width banner fix, unified detail/receive cards, restored Revoke/Delete behavior, and verification outcomes.
- [ ] Run focused verification: yarn.cmd test DocumentCardLayout.test.tsx DrivingLicenceDocumentCard.test.tsx CredentialDocumentDetailCard.test.tsx ThaiIdReceivePanel.test.tsx TranscriptPreviewPanel.test.tsx DrivingLicencePreviewPanel.test.tsx CredentialOfferClaimScreen.test.tsx credentialRenewalPresentation.test.ts --runInBand.
- [ ] Run yarn.cmd tsc --noEmit; report pre-existing failures separately if present.
- [ ] Run yarn.cmd lint; report warnings separately.
- [ ] Attempt a scoped documentation commit with message docs: record document card unification.

---

## Plan Self-Review

- Spec coverage: full-width banner, shared visual structure, dynamic ID/Transcript values, fixed Driving values, receive previews, action-menu policy, tests, and TASKS verification are covered by Tasks 1–5.
- Placeholder scan: no TBD/TODO/implement later instructions.
- Type consistency: DocumentCardLayout, existing detail/receive props, and shouldHideCredentialActionMenu signature stay consistent.
- Scope: no protocol, storage, SDK, or native NFC changes.
