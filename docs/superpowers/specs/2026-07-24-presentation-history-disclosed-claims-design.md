# Presentation History — Disclosed Claims Accuracy

> **Status:** Approved (2026-07-24)
> **Date:** 2026-07-24
> **Related:** `docs/superpowers/specs/2026-07-20-same-device-vp-holder-selective-disclosure-design.md`, `src/components/Oid4VpDisclosureFlow.tsx`, `src/services/vp/claimDisclosurePolicy.ts`, `src/services/history/presentationHistory.ts`, `src/services/history/walletHistoryRecording.ts`

## Summary

Wallet History Log must record **only the claims the Holder actually disclosed** in a successful OID4VP presentation — after the Holder confirms on the info screen with their final selective-disclosure toggles. Today, success events intend to use holder selection but history resolution is duplicated and can diverge from the VP token builder. Failure and decline paths log verifier-requested claims instead of the Holder’s final selection.

This spec unifies disclosure resolution so VP signing and history recording share one source of truth.

## Problem

When presenting a Transcript (and likely other SD-JWT credentials) via same-device OID4VP deeplink, a Holder can deselect optional claims such as **เกรดเฉลี่ย (GPA)** on the info screen before pressing **ยอมรับ**. After a **successful** presentation, History Log still lists GPA under **ข้อมูลที่เปิดเผย** as if it were sent.

**Expected:** History reflects the effective disclosed set — the same claims included in the submitted VP token.

**Observed:** History can include claims the Holder opted out of.

## Goals

1. `disclosedClaims` on `presentation-success` events lists only claims included in the submitted VP.
2. VP token building and history recording use the **same** effective-claim resolution.
3. Failure and decline events use the Holder’s **final** selection when the info screen was reached.
4. Transcript same-device deeplink is the primary regression case; fix applies to all `Oid4VpDisclosureFlow` channels (`oid4vp`, `wallet`).

## Non-goals

- Parsing the built VP/SD-JWT token post-sign to derive history (deferred; approach B).
- Separate history fields for “verifier requested” vs “holder disclosed” (deferred).
- NFC/proximity presentation changes beyond aligning with the shared resolver if those paths already call similar helpers.
- UI redesign of History Log detail screen.

## Root cause

| Layer | Location | Issue |
|-------|----------|-------|
| VP signing | `presentationTokenBuilders/builders.ts` → `readEffectiveClaimKeys` | Calls `resolveEffectiveDisclosureKeys` with disclosures stripped to `{ key, mandatory }`, dropping `selective`. Non-mandatory `selective: false` claims are treated differently than in history. |
| History (success) | `PresentationConsentPanel.readSelectedDisclosureLabels` | Duplicate filter logic; always includes `selective === false` claims even when not in holder selection. |
| History (failure) | `walletHistoryRecording.recordOid4vpPresentationFailure`, `Oid4VpDisclosureFlow` catch | Logs **all** verifier-requested disclosure labels. |
| History (decline from info) | `Oid4VpDisclosureFlow.declinePresentation` | Uses `readInitialSelectedClaimKeys` (default pre-selection), not holder’s final toggles. |

Success path timing is correct (record after submit). The bug is **which labels are stored**, not **when** recording happens.

## Chosen approach: single resolver at confirm time (Approach A)

Compute effective disclosure keys once from holder selection + claim policy, use that set for both VP signing and history labels.

### New shared API

Add to `src/services/vp/claimDisclosurePolicy.ts`:

```typescript
export function resolveDisclosedClaimLabels(
  disclosures: readonly PresentationDisclosure[],
  holderSelectedKeys: ReadonlySet<string>,
  documentType: string,
): string[]
```

**Algorithm:**

1. `effectiveKeys = resolveEffectiveDisclosureKeys(disclosures, holderSelectedKeys)`
2. For each disclosure in original order, if `disclosure.key` is in `effectiveKeys`, append `resolvePresentationDisclosureLabel(documentType, disclosure.key)`
3. Return ordered label array (stable, matches presentation UI list order)

**Invariant:** For any `(disclosures, holderSelectedKeys)`, the key set implied by `resolveDisclosedClaimLabels` equals `resolveEffectiveDisclosureKeys(...)`.

### Fix VP builder

In `readEffectiveClaimKeys` (`presentationTokenBuilders/builders.ts`), pass full disclosure policy into `resolveEffectiveDisclosureKeys`:

```typescript
request.disclosures.map((d) => ({
  key: d.key,
  mandatory: d.mandatory === true,
  selective: d.selective !== false, // or pass d.selective explicitly when present
}))
```

Use the same shape as `resolveEffectiveDisclosureKeys` expects (`mandatory`, `selective`).

When `selectedClaimKeys` is omitted (legacy/no UI selection), keep current fallback: all disclosure keys from the resolved request.

### Refactor history helpers

- Replace `readSelectedDisclosureLabels` with `resolveDisclosedClaimLabels` (or make the former a deprecated wrapper calling the shared function).
- `readConsentItems` / UI code unchanged except import path if moved.

## Data flow — success path

```
Holder confirms on PresentationInfoPanel (selectedClaimKeys)
  → effectiveKeys = resolveEffectiveDisclosureKeys(disclosures, selectedClaimKeys)
  → createApprovedPresentationResponse(request, { selectedClaimKeys: [...effectiveKeys] })
  → submitPresentationResponse(...)
  → on HTTP success:
      labels = resolveDisclosedClaimLabels(disclosures, selectedClaimKeys, matchedCredential.type)
      recordSuccessfulPresentation / recordWalletPresentationSuccess({ disclosedClaims: labels })
```

History records **effective** disclosed claims (mandatory + holder-selected optional), not raw checkbox state alone.

## Data flow — failure and decline

| Scenario | `disclosedClaims` |
|----------|-------------------|
| Success after info confirm | `resolveDisclosedClaimLabels(..., finalSelectedKeys, documentType)` |
| Failure after info confirm (sign/submit error) | Same resolver with `finalSelectedKeys` from the confirm attempt |
| Decline from info screen (back / cancel) | Same resolver with current `selectedClaimKeys` on info screen |
| Decline from consent screen (before info) | `[]` (holder did not finalize selection) |

Update:

- `Oid4VpDisclosureFlow.approvePresentation` catch block — pass holder’s `holderSelectedClaimKeys` into failure recorder instead of `request.disclosures.map(...)`.
- `recordOid4vpPresentationFailure` — accept optional `disclosedClaims: string[]` from caller; stop defaulting to all request disclosures.
- `recordWalletInitiatedPresentationFailure` — already accepts `disclosedClaims`; callers must pass resolved labels.
- `declinePresentation` — when called from info phase, pass current `selectedClaimKeys`; when from consent, pass `[]`.

**Implementation note:** `declinePresentation` today is shared for back-from-info and consent-reject. Split or add a parameter (`source: 'consent' | 'info'`) so consent decline logs `[]` and info decline logs resolved partial selection.

## Security and privacy

- History stores **claim labels only** (existing behavior); never store claim values in `disclosedClaims`.
- No logging of VP tokens, SD-JWT payloads, or PII in diagnostic logs (unchanged).
- History remains local encrypted MMKV via `walletEventLog`.

## Testing

| Area | File | Assertion |
|------|------|-----------|
| Transcript: deselect GPA, success | `Oid4VpDisclosureFlow.test.tsx` | History recorder called with `disclosedClaims` not containing `เกรดเฉลี่ย` |
| VP/history key parity | `claimDisclosurePolicy.test.ts` | `resolveDisclosedClaimLabels` keys match `resolveEffectiveDisclosureKeys` |
| `selective: false` locked claim | `claimDisclosurePolicy.test.ts` | Included when policy requires; excluded when holder opted out of optional-only set |
| Decline from info after deselect | `Oid4VpDisclosureFlow.test.tsx` | Declined event omits deselected labels |
| Failure after info with partial selection | `Oid4VpDisclosureFlow.test.tsx` | Failed event lists effective selection, not all requested |
| VP builder selective flag | `presentationApproval.test.ts` | `readEffectiveClaimKeys` respects `selective: false` same as history resolver |

Verification: focused tests, `yarn tsc --noEmit`, `yarn lint`.

## Files to change

| File | Change |
|------|--------|
| `src/services/vp/claimDisclosurePolicy.ts` | Add `resolveDisclosedClaimLabels` |
| `src/services/vp/claimDisclosurePolicy.test.ts` | Unit tests for new resolver + parity |
| `src/services/vp/presentationTokenBuilders/builders.ts` | Pass full `selective` in `readEffectiveClaimKeys` |
| `src/components/PresentationConsentPanel.tsx` | Delegate `readSelectedDisclosureLabels` to shared resolver or remove |
| `src/components/Oid4VpDisclosureFlow.tsx` | Use shared resolver for success/failure/decline; thread `selectedClaimKeys` into decline |
| `src/services/history/walletHistoryRecording.ts` | `recordOid4vpPresentationFailure` accepts caller-supplied `disclosedClaims` |
| `src/components/Oid4VpDisclosureFlow.test.tsx` | Integration tests for selective disclosure → history |
| `docs/TASKS.md` | Track implementation slice |

## Open items (post-v1)

- Optional History UI section: “Verifier requested but not sent” for audit transparency.
- Post-sign VP parse validation in tests only (approach B) as a safety net.
