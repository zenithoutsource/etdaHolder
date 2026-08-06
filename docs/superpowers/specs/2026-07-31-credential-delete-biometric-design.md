# Credential Delete Biometric Design

**Date:** 2026-07-31  
**Status:** Approved for implementation  
**Scope:** Add the existing OS biometric alternative to the credential Delete PIN screen.

## Context

Deleting a credential is a protected, non-signing action. The credential
detail screen currently routes Delete through the shared PIN entry surface,
but it does not enable the fingerprint keypad control. It also contains a
development-only fingerprint bypass instead of the production biometric gate
used by the other PIN screens.

The deletion itself performs no cryptographic signing, so one app-level
biometric prompt is permitted by the project's one-authentication-per-action
rule.

## User Experience

- The fingerprint keypad control appears only while verifying an existing
  Wallet PIN for Delete.
- PIN setup and PIN confirmation continue to require the PIN and do not show
  biometric authentication.
- Tapping the fingerprint control opens the same OS biometric prompt pattern
  used by the other PIN screens.
- Successful biometric authentication moves to the existing deletion approval
  screen.
- Cancelling the OS prompt leaves the Holder on the PIN screen without showing
  an error.
- A real biometric failure leaves PIN entry available and shows a friendly
  fallback message.
- The Wallet does not open the biometric prompt automatically and does not ask
  for a second authentication when the Holder approves deletion.

## Architecture

The implementation will reuse `confirmBiometricGate()` from
`src/services/auth/biometricGate.ts` through a small credential-deletion
wrapper with action-specific prompt copy, log scope, and error prefix.

The credential detail screen remains responsible for phase transitions:

```text
Delete selected
  -> PIN verification screen
  -> Holder chooses PIN or biometric
  -> authentication succeeds
  -> existing deletion approval screen
  -> Holder approves
  -> existing local credential deletion service
```

The shared `PinEntrySurface` remains unchanged. The credential detail screen
will enable its existing fingerprint control only when the security phase is
Delete plus PIN verification mode.

## Error Handling and Logging

- Biometric cancellation uses the shared cancellation classification and is
  logged as a normal diagnostic step by the shared gate.
- Sensor unavailability, enrollment problems, lockout, and unexpected native
  failures retain raw redacted diagnostic logging through the shared wallet
  logger.
- The UI maps non-cancellation failures to a generic message instructing the
  Holder to enter the PIN instead.
- No credential claims, raw credential data, PIN values, or biometric details
  are logged.

## Testing

Test-driven implementation will add regressions proving:

1. Delete PIN verification exposes the fingerprint control.
2. Successful biometric authentication enters the existing approval phase.
3. Cancellation stays on the PIN screen without an error.
4. A real biometric failure stays on the PIN screen and shows the PIN fallback
   message.
5. PIN setup and confirmation do not expose biometric authentication.

Focused credential-detail and biometric-wrapper tests will run first, followed
by the complete root test suite, TypeScript, lint, and `git diff --check`.

## Non-Goals

- Requiring both PIN and biometric authentication.
- Automatically opening biometric authentication when Delete is selected.
- Changing credential deletion storage or lifecycle behavior.
- Adding a biometric prompt to Revoke, which already uses its signing-time
  authentication gate.
