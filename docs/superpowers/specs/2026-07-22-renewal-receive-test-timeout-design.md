# Renewal Receive Test Timeout Design

Status: Approved design (2026-07-22)

## Problem

`src/screens/CredentialDetailRenewalReceive.test.tsx` contains one test that verifies two sequential asynchronous behaviors under Jest's default five-second per-test timeout:

1. focusing the detail screen refreshes renewal state without automatically claiming a ready renewal; and
2. pressing `Receive new document` claims the renewal and refreshes local credential state.

The test timed out twice on cold or resource-constrained runs without producing an assertion failure. The same unchanged behavior passed when the test was warm and when it was run alone with and without Jest's cache. This evidence identifies a timing-sensitive combined test, not a product-code hang.

## Goal

Make the renewal-receive suite deterministic under the existing global five-second test timeout while preserving the complete behavioral assertions.

## Non-goals

- Do not change credential-detail production code.
- Do not increase the global or file-level Jest timeout.
- Do not weaken assertions or remove coverage.
- Do not refactor unrelated renewal tests or mocks.
- Do not include this repair in the Galaxy A26 diagnostic branch until the repair has passed review independently.

## Selected approach

Split the combined test into two single-purpose tests:

### Passive focus test

- Configure a usable `readyOfferUri`.
- Render the credential detail screen.
- Wait for `refreshAndCompleteRenewals()` to run on focus.
- Assert that `claimReadyRenewal()` was not called.
- Assert that the explicit `Receive new document` button is visible.

### Explicit receive test

- Configure the same usable readiness marker.
- Render the screen and wait for the focus refresh to settle.
- Clear the earlier local-refresh mock so the final assertion cannot pass because of focus-time refresh activity.
- Press `Receive new document`.
- Wait for `claimReadyRenewal('credential-1')` and the subsequent local refresh.

The passive test remains first. It performs only the initial focus behavior during a cold run; the explicit receive behavior runs as a separate test with a fresh render and reset mocks.

## Alternatives rejected

### Increase the timeout

A per-test or file-level ten-second timeout would reduce failures but hide a slow or stuck interaction in the future. The existing five-second policy remains unchanged.

### Modify product code or asynchronous mocks

No evidence shows a product hang or incorrect renewal behavior. The other renewal tests pass, the failing test passes unchanged when isolated and warm, and no assertion reports an incorrect result. Product or mock changes would address an unproven cause.

## Files

- Modify only `src/screens/CredentialDetailRenewalReceive.test.tsx`.
- Record durable completion in `docs/TASKS.md` only after the isolated fix is integrated into `dev`; do not mix that task-record edit into the test-fix commit.

## Verification

1. Re-run the focused test file without cache and retain the default five-second timeout.
2. Re-run the focused test file normally.
3. Run the complete mobile Jest suite using the worktree-safe discovery pattern.
4. Run `yarn tsc --noEmit`, `yarn lint`, and `git diff --check` for the changed test.

Success requires both new tests and all existing tests in the file to pass without timeout overrides. The complete mobile suite must pass before the fix is integrated.
