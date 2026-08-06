# Diagnose: deleting old credential after renewal requires pressing confirm twice

## Context

Bug report: after receiving a renewed credential, deleting the old one requires the delete action twice — first tap opens the confirm dialog and pressing "ยืนยัน" (confirm) runs, but the old document does not disappear; a second attempt is needed.

### What static investigation found

Traced the full delete chain:
- CTA + guard: `app/(tabs)/credential/[id].tsx:191-214` (`showOldCredentialCleanupDialog`) — guard (`isRenewalAwaitingHolderCleanup(renewalStatus)`) and the CTA's visibility (`showRenewalCleanupCta`, line 124) use the *same* `renewalStatus` value computed once per render, so they can't disagree within one render — ruling out a stale-closure guard mismatch as the cause. User confirmed the dialog itself opens fine on the first tap, consistent with this.
- Confirm action (`[id].tsx:205-210`) synchronously calls `confirmOldCredentialCleanup(credential.id)` (`src/services/credentials/credentialRenewalService.ts:365-393`), which synchronously calls `removeStoredCredential` (`src/services/credentials/storedCredentials.ts:45-58`, plain synchronous MMKV read/delete, no caching layer) and `clearCredentialRenewal` for both the old and replacement credential IDs, then `notifyCredentialsChanged()`.
- Subscribers: `app/(tabs)/index.tsx:200-202` subscribes `syncLocalCredentialStatuses` via `subscribeCredentialsChange`, and `src/hooks/useStoredCredentials.ts:44-47` does the same — both should receive the synchronous notification and re-read fresh storage (`findCleanupPendingForCredentialType` and `pickPreferredHomeCredential`, `src/services/credentials/renewalCleanupNotification.ts:79-98` / `src/services/credentials/credentialGuard.ts:101-125`, both take fresh `readStoredCredentials()` reads by default, not cached).

Nothing in this chain is provably broken from static reading — the storage mutation is synchronous and correct, and the re-render triggers look wired up correctly. Critically, none of this delete path (`confirmOldCredentialCleanup`, `removeStoredCredential`, `clearCredentialRenewal`) had any `logWalletStep`/`logWalletError` instrumentation, unlike the rest of the app's lifecycle steps (CLAUDE.md requires operational debug logging for major wallet lifecycle steps, explicitly including storage operations).

### Step 1 (done): diagnostic logging added

- `confirmOldCredentialCleanup` (`credentialRenewalService.ts:365`) — logs `credentials/confirm-old-cleanup-start` (with `credentialId`, `replacementCredentialId`, `oldRenewalState`) and `credentials/confirm-old-cleanup-complete` (with `stillPresentAfterRemoval`, `remainingCredentialCount`).
- `removeStoredCredential` (`storedCredentials.ts:45`) — logs `credentials/remove-stored-credential-start` (`credentialId`, `foundInIndex`, `indexSize`) and `credentials/remove-stored-credential-complete` (`credentialId`, `listenerCount` — number of subscribed listeners at that instant).
- `useStoredCredentials`'s `refresh` (`useStoredCredentials.ts:26-42`) — logs `credentials/use-stored-credentials-refresh` (`credentialCount`).
- `app/(tabs)/index.tsx`'s `syncLocalCredentialStatuses` (`index.tsx:169-178`) — logs `wallet-home/sync-local-credential-statuses` (`credentialCount`).

All wired via the app's existing `logWalletStep`/`logWalletError` central logger. `yarn tsc --noEmit` and the affected test suites (`credentialRenewalService.test.ts`, `storedCredentials.test.ts`, `useStoredCredentials.test.tsx`) pass with these changes — logging only, no behavior change.

### New repro detail (this round) — narrows the hypothesis

Exact 9-step repro:
1. Tap "new document" push notification
2. PIN → fingerprint unlock
3. Land on Wallet home
4. Document tile shows "received new document already" (renewed-active badge)
5. Tap into the OLD document (via home screen's `onViewOldCredential` link, `app/(tabs)/index.tsx:442-453`)
6. Tap delete, confirm
7. Back on Wallet home: the "Inactive" badge on the tile is gone
8. But the "(เอกสารเดิม)" old-document sub-link (`oldCredentialLabel`/`onViewOldCredential`, `index.tsx:436-454`, driven by `findCleanupPendingForCredentialType`) is still shown
9. Tapping into it and deleting again finally makes it disappear

Ruled out via a second read-only investigation: `getCredentialStorage()` is a true singleton once initialized (`src/services/storage/storage.ts:466-469`), never returns a partial/read-only object, and every credential-service function (`storedCredentials.ts`, `credentialKeyRenewal.ts`, `credentialLifecycle.ts`) calls it fresh per invocation — no stale cached storage reference explains a split "renewal flag cleared but credential not removed."

**Leading hypothesis:** `confirmOldCredentialCleanup` does `clearCredentialRenewal(credentialId)` (explains the badge disappearing) before `removeStoredCredential(credentialId)` (which should also make `findCleanupPendingForCredentialType` return `undefined` on next read, since it filters `credentials.find(...)` from a fresh `readStoredCredentials()`). Since storage itself is verified consistent/synchronous, the button staying visible after the first return is most likely a **stale render on the home screen** — i.e. `syncLocalCredentialStatuses` not actually re-running (or running before the delete's writes are reflected) at the exact moment the user navigates back via `router.replace("/(tabs)")` (`[id].tsx:209`). Not yet confirmed — needs the real log sequence.

## Next step (blocking — no more code changes until this exists)

Reproduce this exact 9-step flow on-device with dev logs streaming, and capture the log output covering step 6 (tap delete + confirm) through step 8 (back on home, button still visible). Look specifically for:
- `[credentials] confirm-old-cleanup-start` / `confirm-old-cleanup-complete` — does `stillPresentAfterRemoval` say `false` (confirms storage-level success)?
- `[credentials] remove-stored-credential-start` / `-complete` — does `foundInIndex` say `true`, and what does `listenerCount` say (is the home screen's listener even registered at that moment)?
- `[wallet-home] sync-local-credential-statuses` — does it fire at all after the delete, and what `credentialCount` does it report?

Once we have this, the exact failing layer will be obvious and a real (not guessed) fix can be written.

## Verification (once fixed)

- Reproduce the original 9-step flow and confirm a single confirm-tap removes the old document immediately, both visible effects: badge disappearing AND the old-document sub-link disappearing, in the same pass.
- `yarn test src/services/credentials src/hooks` — no regressions.
