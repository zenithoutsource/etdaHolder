# Manual Renewal Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit user action before a ready replacement credential is claimed, while allowing required Wallet PIN/biometric unlock to happen first.

**Architecture:** Separate passive renewal-status synchronization from the existing claim operation. Status refresh records that an offer is ready; a shared explicit receive handler resolves and claims the offer from Home or Detail. Notification routing and Wallet unlock remain navigation/access gates only.

**Tech Stack:** Expo Router, React Native, TypeScript, Zustand-backed encrypted storage, Jest/React Native Testing Library, existing Keychain biometric signing gate.

## Global Constraints

- No notification tap, screen focus, polling, or passive status refresh may claim a credential or trigger biometric authentication.
- If the Wallet is locked, PIN/biometric unlock may happen before the detail screen is shown, but unlock is not consent to receive.
- The receive button is the only action that starts the renewal claim/signing flow.
- Use the existing encrypted storage, EdDSA Keychain signer, redacting wallet logger, and renewal in-flight guard.
- Keep Home and Detail UI thin and reuse the existing `WalletDocumentMenuItem` and renewal service boundaries.
- Preserve the existing request/reissue action and old-credential cleanup action.
- Do not add new dependencies or direct backend/database access.

---

## File map

- Modify `src/services/credentials/credentialRenewalService.ts`: make passive status refresh non-claiming and expose an explicit claim operation for one credential.
- Test `src/services/credentials/credentialRenewalService.test.ts`: cover passive refresh, explicit claim, duplicate/in-flight behavior, and failures.
- Modify `app/(tabs)/credential/[id].tsx`: show a receive action for a ready renewal and invoke the explicit claim operation only on press.
- Modify `app/(tabs)/index.tsx`: show the same receive action in the expanded renewal panel and use the explicit claim operation.
- Modify `src/components/WalletDocumentMenuItem.tsx` only if a separate receive CTA prop is needed; retain the existing request CTA semantics.
- Test `src/components/WalletDocumentMenuItem.test.tsx` and relevant screen tests: verify CTA visibility and callback behavior.
- Modify `docs/TASKS.md`: record implementation and verification results.

## Task 1: Split passive renewal refresh from claiming

**Files:**
- Modify `src/services/credentials/credentialRenewalService.ts`
- Test `src/services/credentials/credentialRenewalService.test.ts`

**Interfaces:**
- Keep `refreshAndCompleteRenewals()` as the compatibility entry point, but make it refresh server status without calling `completeRenewalClaim()`.
- Add `claimReadyRenewal(credentialId: string, dependencies?: Partial<RenewalServiceDependencies>): Promise<void>`.
- `claimReadyRenewal` finds the local `renewal-processing` record, refreshes the server status, selects the matching `offer-ready` offer, then calls the existing claim pipeline.

- [ ] Write a failing test proving an `offer-ready` response does not call `resolveOffer` or `claimCredential` during passive refresh.
- [ ] Run `yarn test src/services/credentials/credentialRenewalService.test.ts --runInBand` and confirm the new test fails against the current auto-claim behavior.
- [ ] Write a failing test proving `claimReadyRenewal` resolves the offer, claims the replacement, and writes `cleanup-pending` plus `renewed-active` states.
- [ ] Implement the smallest service change: keep status parsing/revocation/orphan repair in passive refresh, move the offer-resolution/claim call behind `claimReadyRenewal`, and preserve existing logging/error mapping.
- [ ] Add a processing guard around the explicit operation so repeated button presses share the existing in-flight protection and do not claim twice.
- [ ] Run the focused renewal service tests and confirm all pass.

## Task 2: Add explicit receive action to Wallet Home

**Files:**
- Modify `app/(tabs)/index.tsx`
- Modify `src/components/WalletDocumentMenuItem.tsx` only if needed
- Test `src/components/WalletDocumentMenuItem.test.tsx`

**Interfaces:**
- Home calls `claimReadyRenewal(credential.id)` only from the receive button callback.
- The receive CTA is visible only when the local renewal state is `renewal-processing` and passive refresh has confirmed an offer-ready replacement.
- Existing `requestCredential` remains mapped to `submitRenewalRequest`; it must not be replaced by the receive action.

- [ ] Add a component test for a visible receive CTA that invokes its callback exactly once.
- [ ] Add a component test proving the receive CTA is absent when the renewal is not ready.
- [ ] Update Home state/callback wiring to distinguish “request document” from “receive new document”.
- [ ] Show a processing state while the explicit claim is running, log failures with the existing scoped logger, refresh credentials/renewal statuses after success, and leave cleanup available.
- [ ] Run the component and Home-focused tests.

## Task 3: Add explicit receive action to Credential Detail and preserve locked routing

**Files:**
- Modify `app/(tabs)/credential/[id].tsx`
- Test the existing credential detail/screen test location or add a focused test beside the screen if the current harness supports it

**Interfaces:**
- Detail calls the same `claimReadyRenewal(credential.id)` operation only from the receive CTA.
- `pollRenewalFromServer` may refresh status but must never claim.
- `notificationEvent=renewal-ready` remains a display/navigation hint; it must not invoke the claim operation.

- [ ] Add a regression test or service-level screen harness assertion proving focus after a `renewal-ready` route does not call `claimReadyRenewal`.
- [ ] Add a failing UI assertion for a receive button on a ready renewal detail screen.
- [ ] Render the receive CTA alongside the existing renewal/reissue controls, with a clear loading state and error dialog using existing copy/logging patterns.
- [ ] Confirm the existing startup PIN lock route can unlock first and return to the detail route without automatically invoking the receive callback.
- [ ] Run the focused detail and notification tests.

## Task 4: Documentation and verification

**Files:**
- Modify `docs/TASKS.md`

- [ ] Add a concise session entry describing the notification auto-claim fix, explicit receive actions, and PIN/biometric ordering.
- [ ] Run `yarn test src/services/credentials/credentialRenewalService.test.ts src/services/notifications/notificationRouter.test.ts src/services/notifications/pushNotificationService.test.ts --runInBand`.
- [ ] Run `yarn tsc --noEmit`.
- [ ] Run `yarn lint`.
- [ ] Run `git diff --check` and review that unrelated existing worktree changes remain untouched.

## Self-review

- Spec coverage: explicit receive from Home and Detail is covered by Tasks 2 and 3; passive no-claim behavior and one biometric boundary are covered by Task 1; locked-unlock ordering is covered by Task 3; logging, duplicate protection, and verification are covered across Tasks 1–4.
- No placeholders or unresolved decisions remain.
- The service interface is consistent: both screens call `claimReadyRenewal(credentialId)`, while only passive refresh calls the non-claiming status refresh.
