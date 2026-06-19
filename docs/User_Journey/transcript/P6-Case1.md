# P6 Case 1: Holder Requests Revoke/Delete

Source overview: `P6.md`

This document expands only Case 1 from P6: the Holder initiates a Revoke action for an Academic Transcript credential from the Wallet. The UI also shows `Delete this document` from the reference design, but that action is disabled until its final contract is defined.

## Purpose

Case 1 describes how a Holder requests that a specific Transcript credential be made inactive before normal expiry.

The Wallet starts the flow from the selected credential, proves that the request comes from the Holder's device, sends the request to the Issuer, and updates local wallet state only after the Issuer confirms that the VC Status Registry has been updated.

This is a future journey and contract note. The current app and local backend do not yet expose Revoke/Delete APIs.

## Actors and Responsibilities

| Actor / System | Responsibility |
|---|---|
| Holder | Chooses the Transcript credential, selects Revoke, authenticates locally, and acknowledges the result. |
| Digital Wallet | Presents the action, gathers confirmation, signs PoP evidence, sends the request, and updates only the affected local credential after confirmation. |
| Issuer | Verifies the request and PoP evidence, approves or rejects the status change, and instructs the VC Status Registry. |
| VC Status Registry | Persists the credential status as `Revoked`, subject to the final Issuer contract. |
| Audit Trail | Records the status-change event and outcome. |

## Preconditions

- The Holder has a stored `BangkokUniversityTranscript` credential in the Wallet.
- The credential is still known locally as usable before the request starts.
- The Holder can complete local authentication when prompted.
- The Wallet can produce Proof of Possession using the device-scoped Wallet Signing Key.
- The Issuer exposes a future status-change endpoint or equivalent channel for Holder-initiated Revoke requests.

## Status Semantics

The tester UI follows the P6 Case 1 design labels, but only `Revoke` is actionable in this slice. `Delete this document` remains visible and disabled.

| Status | Meaning | Local Wallet Treatment |
|---|---|---|
| `Revoked` | Final inactive state. The Transcript can no longer be used. | Keep the credential record for history/status display, but mark it revoked after approval/Issuer confirmation. |
| `Deleted` | Holder-requested inactive state using the design label "Delete this document". | Not implemented in this tester slice; button is visible but disabled. |

The Wallet must not destroy `etda_wallet_signing_key` for this flow. The current wallet architecture uses one device-scoped Wallet Signing Key, not a per-credential key. Cleanup applies only to the affected Transcript credential record and related local presentation state.

## Happy Path

1. **Holder opens Credential Detail.** The Holder opens the stored Academic Transcript credential from the Wallet.
2. **Holder chooses a status action.** The Holder selects `Revoke`. `Delete this document` is visible but disabled.
3. **Wallet explains the consequence.** The Wallet shows a confirmation screen that names the credential, the requested action, and whether the action is final or temporary.
4. **Holder confirms and authenticates.** If no Wallet PIN exists, the Holder sets and confirms a 6-digit PIN before continuing. If a PIN exists, the Holder enters it. The fingerprint button is available as a dev/tester bypass and moves directly to approval in development builds.
5. **Wallet creates PoP evidence.** The Wallet signs request evidence with the device-scoped Wallet Signing Key. The proof must bind the request to the Holder DID, the selected credential, the requested action, and a nonce or timestamp supplied by the Issuer contract.
6. **Wallet sends request to Issuer.** The Wallet sends the Revoke request and PoP evidence to the Transcript Issuer.
7. **Issuer verifies request.** The Issuer validates the Holder, credential reference, requested action, and PoP evidence.
8. **Issuer updates status registry.** After approval, the Issuer instructs the VC Status Registry to persist the confirmed inactive status.
9. **Audit Trail records the event.** The status-change request and final outcome are recorded for audit.
10. **Issuer notifies Wallet.** The Issuer returns the confirmed result to the Wallet.
11. **Wallet updates local state.** The Wallet marks/removes only the affected Transcript credential according to the confirmed status.
12. **Holder acknowledges result.** The Wallet shows the final Revoke result to the Holder. On Wallet home, tapping the revoked Transcript row expands a disabled document panel; its request button opens the Scan tab so the Holder can request or scan a replacement credential.

## Failure Branches

### Holder cancels or fails authentication

The Wallet stops the flow. No Issuer request is sent, no local credential state is changed, and no status update is assumed.

### Issuer rejects the request or PoP evidence

The Wallet shows the Issuer rejection result. The credential remains in its previous local state. The Wallet must not mark the Transcript as revoked or deleted.

### Network timeout or unavailable Issuer

The Wallet shows that the request could not be completed. The credential remains in its previous local state unless a later confirmed Issuer result is received through a supported notification or refresh channel.

### VC Status Registry update fails

If the Issuer cannot confirm that the registry status was updated, the Wallet treats the request as not completed. Local credential state remains unchanged.

### Inconsistent result

If the Issuer response says success but the status payload is missing, unknown, or does not match the requested action, the Wallet must not locally finalize the change. It should show an error and keep the credential in its previous state.

## Future Contract Notes

The future status-change contract should provide enough data for the Wallet to make a deterministic local update:

| Field | Purpose |
|---|---|
| Credential identifier | Identifies the Transcript credential being changed. |
| Requested action | `Revoke`. |
| Holder DID | Binds the request to the Holder's wallet identity. |
| PoP evidence | Proves the request was signed by the Holder's device-scoped Wallet Signing Key. |
| Issuer result | Confirms approval or rejection. |
| Confirmed status | `Revoked`, returned only after registry update succeeds. |
| Audit reference | Optional reference for support/audit follow-up. |

The contract must be idempotent from the Holder's perspective. Retrying the same confirmed request should not create duplicate status transitions or conflicting local states.

## Acceptance Criteria

- The journey starts from the selected Transcript Credential Detail screen.
- The Holder can choose Revoke; Delete is visible but disabled.
- First-time protected action requires setting and confirming a 6-digit Wallet PIN.
- Existing PIN must be verified before the Revoke approval screen.
- Dev/tester fingerprint bypass advances to approval without treating it as production biometric authentication.
- The Wallet explains whether the selected action is final or temporary before authentication.
- No status-change request is sent if the Holder cancels or fails authentication.
- The Wallet sends PoP evidence with the request.
- The Wallet does not locally mark or remove the Transcript until the Issuer confirms the registry update.
- `Revoked` is rendered as an inactive state in Wallet home and History Log.
- Tapping the revoked Transcript row expands an unavailable-document panel, and its request button opens Scan.
- The Wallet Signing Key is preserved; only the selected Transcript credential state is updated.
- Failure outcomes leave the local credential in its previous state.

## Open Questions

- What exact Issuer endpoint or protocol extension will carry Holder-initiated status-change requests?
- What credential identifier should the Issuer require: local record id, VC `jti`, issuer credential id, status-list index, or another stable issuer-side identifier?
- Should `Delete` remain a registry-backed lifecycle status, or should it become a local-only removal action after the final Issuer contract is available?
- Should a revoked/deleted Transcript remain visible as historical evidence, or be removed from the active Wallet view entirely?
- What exact audit reference should be shown to the Holder after a successful request?
