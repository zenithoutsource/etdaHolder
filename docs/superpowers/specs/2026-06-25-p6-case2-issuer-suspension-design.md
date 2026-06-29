# P6 Case 2 Issuer Suspension + Unified Holder Actions — Design Spec

> **Status:** Approved
> **Date:** 2026-06-25
> **Author:** Brainstorming session

---

## 1. Context and Scope

This spec defines how **P6 Case 2 (Issuer-initiated suspension)** coexists with **Holder-initiated Revoke/Delete** in one credential detail experience.

Final decisions locked by this session:

- `⋮` menu Holder actions must work for **all credential types**, not Transcript-only.
- Holder can use both **Revoke** and **Delete** themselves.
- Option **C** is selected for the Revoke label:
  - Same `Revoke` menu label is reused for two meanings based on state.
  - If issuer suspension is pending acknowledgment, `Revoke` opens acknowledgment overlay.
  - Otherwise, `Revoke` starts holder-initiated revoke flow.
- v1 acknowledgment is local-first with dev polling; no production backend acknowledgment contract in this slice.

This spec is UX + data-flow focused. It does not change core architecture rules:

- OID4VCI/OID4VP remain device-side.
- Backend access remains through SDK boundaries only.
- Credential rendering remains config-driven and generic.

---

## 2. Required User Journeys

### 2.1 Case 1 (Holder-initiated Revoke/Delete)

Applies to every stored credential type (ThaiNationalID, DLTDrivingLicence, BangkokUniversityTranscript, and future supported types).

1. Holder opens credential detail.
2. Holder taps `⋮`.
3. Holder chooses:
   - `Revoke`, or
   - `ลบเอกสารนี้` (Delete this document).
4. Wallet runs existing security flow:
   - PIN setup/confirm if missing, otherwise PIN verify.
   - Dev biometric bypass remains available in development builds.
5. Wallet shows approval step.
6. Wallet records lifecycle action in local lifecycle storage:
   - `Revoke` -> `revoked`
   - `Delete` -> `deleted`
7. Wallet home displays status badge and expanded revoked/deleted panel behavior.

### 2.2 Case 2 (Issuer-initiated suspension)

1. Issuer marks credential suspended.
2. Wallet home shows red suspended status badge (`ถูกระงับ`) on the affected credential row.
3. Holder opens credential detail (normal detail opens).
4. Holder taps `⋮` and selects `Revoke`.
5. Because issuer suspension is pending acknowledgment, wallet opens suspended overlay screen:
   - Greyed/disabled card visual.
   - Button `รับทราบการระงับ`.
6. Holder taps acknowledgment button.
7. Wallet records acknowledgment timestamp locally and returns to wallet home revoked/suspended presentation state.

---

## 3. Menu Rule Matrix (Final)

`⋮` menu is shown for all credential detail pages with a loaded credential.

| Condition | `Revoke` behavior | `Delete` behavior |
|---|---|---|
| `issuerSuspended && !acknowledgedAt` | Open issuer suspension acknowledgment overlay | Start Holder Delete flow |
| Otherwise | Start Holder Revoke flow | Start Holder Delete flow |

Notes:

- This is intentionally state-driven with one shared `Revoke` label (Option C).
- No additional menu item is introduced for acknowledgment in v1.
- Existing Transcript-only menu restriction is removed.
- Existing disabled Delete behavior is removed.

---

## 4. UI Screen Map

- **S0 Wallet Home**
  - Poll suspension status on screen focus.
  - Badge rules merge lifecycle + issuer suspension state.
- **S1 Credential Detail**
  - Generic detail card + `⋮` for all document types.
- **S2a Issuer Suspension Acknowledgment Overlay**
  - Triggered by `Revoke` when suspension pending acknowledgment.
  - Includes `รับทราบการระงับ`.
- **S2b Security Gate**
  - PIN setup/verify for holder actions.
- **S2c Approval**
  - Existing local approval UX for holder actions.
- **S3 Wallet Home Expanded Inactive Panel**
  - Inactive document panel with disabled card style and request replacement CTA.

---

## 5. Data Model and Storage

### 5.1 Existing lifecycle storage (Case 1)

Reuse existing lifecycle storage:

- Key pattern: `credential:lifecycle:<credentialId>`
- Type: `CredentialLifecycleStatus`
- Values include:
  - `action`: `Revoke` | `Delete`
  - `status`: `revoked` | `deleted`
  - `occurredAt`

### 5.2 New issuer suspension storage (Case 2)

Add separate issuer suspension storage:

- Key pattern: `credential:suspension:<credentialId>`
- Type: `IssuerSuspensionRecord` (new)
- Suggested fields:
  - `credentialId: string`
  - `suspendedAt: string`
  - `acknowledgedAt?: string`
  - `reasonCode?: string`
  - `issuerRef?: string`
  - `updatedAt: string`

Rationale: keep issuer event state separate from holder lifecycle commands to avoid semantic collision.

### 5.3 State precedence

For rendering inactive badges/panels:

1. `deleted` lifecycle
2. `revoked` lifecycle
3. issuer suspension (`suspendedAt` exists)

---

## 6. Polling and Dev API (v1)

Wallet home (`app/(tabs)/index.tsx`) performs suspension refresh on focus using `useFocusEffect`.

Dev-only endpoint shape for local server test loop:

- `POST /dev/issuer/suspend` (simulate issuer suspension)
- `GET /dev/wallet/suspension-status` (wallet poll endpoint)

Production contract is intentionally out of scope for this slice.

---

## 7. Component and File Impact

Primary file updates expected:

- `app/(tabs)/credential/[id].tsx`
  - Remove Transcript-only menu guard.
  - Route Revoke by matrix in Section 3.
  - Add `issuerAck` phase/screen handling.
- `app/(tabs)/index.tsx`
  - Merge lifecycle + suspension badge logic.
  - Poll suspension status on focus.
- `src/services/credentials/issuerSuspension.ts` (new)
  - Read/write suspension records.
  - Ack helper API.
- `src/components/CredentialActionMenu.tsx` (recommended extraction)
  - Reusable generic `⋮` menu with Revoke/Delete.
- `src/components/IssuerSuspensionAckOverlay.tsx` (new)
  - Overlay for Case 2 acknowledgment.

Non-goals for this slice:

- No issuer-specific detail components.
- No protocol-level revocation contract finalization.
- No production notification transport work.

---

## 8. OID4VP Presentation Filtering

Inactive credentials must be excluded from presentation matching if either condition is true:

- lifecycle says `revoked` or `deleted`, or
- issuer suspension exists (acknowledged or pending).

This extends current lifecycle-only filtering behavior.

---

## 9. Edge Cases

- If issuer suspension is pending and holder taps `Revoke`, always route to acknowledgment overlay first.
- If issuer suspension is pending and holder taps `Delete`, allow holder delete flow.
- After acknowledgment is completed, `Revoke` returns to holder action semantics.
- If credential is re-issued with newer issuance timestamp, stale lifecycle/suspension state for the older record must be ignored or cleared.
- Menu should not render when credential is missing/unresolvable.

---

## 10. Test Plan (v1)

### Unit

- Revoke routing function:
  - pending suspension -> ack overlay
  - otherwise -> holder revoke flow
- Suspension storage read/write/ack behavior.
- Badge state merge precedence.
- OID4VP eligibility filtering with suspension + lifecycle combined.

### Integration

- Simulate issuer suspend via dev endpoint.
- Focus wallet home -> badge appears.
- Open detail -> `⋮ Revoke` -> overlay appears.
- Tap `รับทราบการระงับ` -> acknowledgment saved -> home shows inactive expansion path.
- Verify Revoke/Delete holder actions still work for all credential types.

---

## 11. Implementation Notes

- Preserve current PIN and approval UX to minimize behavior regressions.
- Keep all new UI generic and schema-friendly.
- Keep error logs scoped and redacted per project logging policy.
- Update `docs/TASKS.md` after implementation slice completion.
