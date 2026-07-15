# Manual Renewal Claim Design

## Goal

Tapping a `renewal-ready` push notification must not claim the replacement credential or open biometric authentication automatically. The Holder must explicitly press a receive button.

## User flow

1. The Holder taps the new-document notification.
2. The Wallet opens the related credential detail screen without claiming the replacement.
3. The Holder can press `Receive new credential` from the credential detail screen, or expand the related credential card on Wallet Home and press the same action there.
4. Only that explicit button press starts the existing renewal claim flow and its required biometric/signing gate.
5. After a successful claim, the replacement credential is stored and the existing old-credential cleanup action remains available.

If the Wallet is locked when the notification is opened, the normal PIN/biometric unlock must complete first. Unlocking only grants access to the screen; it must not claim the replacement credential. The receive button remains a separate, explicit action.

## Architecture and data flow

- Notification routing continues to carry `notificationEvent: renewal-ready` so the detail screen can identify the ready state.
- Renewal status refresh may query the backend and update local renewal state, but must not call `completeRenewalClaim()` as a side effect.
- An explicit renewal-claim service entry point will perform the existing offer resolution, credential claim, local save, and renewal state transition.
- Home and Detail will call one shared action/handler shape. UI components remain config/prop-driven and screen files only compose state and callbacks.
- The existing `requestCredential` action remains the request/reissue action. The new receive action is shown only when a replacement offer is ready and the Holder has not claimed it.

## Security and error handling

- No biometric or PIN prompt is triggered by notification routing, screen focus, polling, or passive status refresh.
- When access is locked, PIN/biometric unlock may happen before viewing the detail screen, but it must not be treated as consent to receive the credential.
- The explicit receive action is the single user action that may reach the existing biometric-gated signing path.
- Errors must use the existing redacted wallet logger before being mapped to a user-facing dialog. Tokens, claims, credentials, and PII remain redacted.
- Duplicate presses must be guarded by the existing in-flight renewal protection and a UI processing state.

## Verification

- Add service tests proving status refresh does not claim an offer-ready renewal.
- Add service tests proving the explicit receive operation claims and transitions the renewal state correctly.
- Add notification/detail regression coverage proving a notification tap does not invoke claim or biometric.
- Add Home/Detail UI coverage proving the receive action is visible only for an offer-ready renewal and invokes the shared action.
- Run focused tests, `yarn tsc --noEmit`, and `yarn lint`.
- Update `docs/TASKS.md` with the implementation and verification result.
