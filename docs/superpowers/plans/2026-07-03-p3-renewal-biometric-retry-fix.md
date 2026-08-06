# Fix: renewal claim silently re-triggers biometric prompt after cancel

## Context

User reports P3 renewal claim flow is weird: tap "renew" → fingerprint prompt shows → user swipes it away (cancels) → error logged → a few seconds later the fingerprint prompt reappears **without the user tapping anything** → user scans → credential issues instantly.

Root cause (confirmed by tracing `completeRenewalClaim`): when the Keychain Ed25519 sign throws `E_CRYPTO_FAILED` (user-cancelled biometric), the renewal record's state is **never downgraded** from `renewal-processing`. The screen's 4-second poll interval (`app/(tabs)/credential/[id].tsx:226-234`, gated only by `hasRenewalProcessing`) keeps firing, calls `refreshAndCompleteRenewals` → `completeRenewalClaim` again, which re-resolves the offer and re-signs — silently reopening the OS biometric prompt with no new user action. This violates the project's "one biometric prompt per user action" rule (CLAUDE.md) and is confusing/unsafe UX (an unattended device would keep popping fingerprint prompts).

Secondary symptom: because `completeRenewalClaim` doesn't clean up the old credential on success (that's deferred to explicit `confirmOldCredentialCleanup` after a user dialog — by design, not a bug), both old (`cleanup-pending`) and new (`renewed-active`) credentials exist simultaneously and both get expiry-notifications scheduled. This part is working as designed and is out of scope.

## Root cause locations

- `src/services/credentials/credentialRenewalService.ts:243-245` — `completeRenewalClaim` catch block logs `claim-failed` and re-throws, but does not touch renewal state.
- `src/services/credentials/credentialRenewalService.ts:302-304` — `refreshAndCompleteRenewals` swallows the re-thrown error in an empty `catch {}` with comment "Keep renewal-processing; retry on next focus poll" — this is the intentional-looking code that causes the silent retry loop.
- `app/(tabs)/credential/[id].tsx:226-234` — 4s `setInterval` keeps calling `pollRenewalFromServer` as long as `hasRenewalProcessing` is true, with no distinction between "waiting on server" and "local claim just failed."

## Fix

In `completeRenewalClaim`'s catch block (`credentialRenewalService.ts:243-245`), before re-throwing, downgrade the renewal record's state back to `renewal-required` via the existing `upsertCredentialRenewal(credentialId, { previousHolderDid: current.previousHolderDid, state: 'renewal-required' }, now)` helper (same pattern already used in `recoverOrphanedRenewalProcessing` at line 259-266). This:
- Stops the 4s interval from retrying (`hasRenewalProcessing` becomes false once `renewalStatus?.state` updates to `renewal-required`), since polling only re-fires `completeRenewalClaim` while state is `renewal-processing`.
- Puts the credential back into the state the UI already understands as "needs user to tap renew again" (existing `renewal-required` UI treatment — no new UI state needed).

No changes needed to `refreshAndCompleteRenewals`'s `catch {}` at line 302-304 — its comment becomes accurate again once the inner function itself resets state on failure, so it can stay as a safety net for state-file races.

No changes to `crypto.ts` — the sign failure and its logging are already correct; the bug is entirely in how the renewal service reacts to that failure.

## Files to modify

- `src/services/credentials/credentialRenewalService.ts` — add state downgrade in `completeRenewalClaim` catch block (~line 243).

## Verification

1. `yarn tsc --noEmit` — confirm no type errors.
2. `yarn test` — run existing renewal service tests (check `credentialRenewalService.test.ts` if present) to confirm no regression; add/adjust a test asserting that on `claimCredential` rejection, the renewal record ends up `renewal-required` (not stuck at `renewal-processing`).
3. Manual device test: trigger renewal, cancel the fingerprint prompt, confirm the prompt does NOT reappear automatically, and the credential detail screen shows the "renewal required / tap to retry" state instead of silently retrying. Tap renew again, complete the scan, confirm claim succeeds normally.
