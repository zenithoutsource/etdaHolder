# VP Presentation — Holder Claim Selection on Info Screen

> **Status:** Approved (2026-07-23)
> **Date:** 2026-07-23
> **Supersedes (UI only):** `docs/superpowers/specs/2026-07-20-same-device-vp-holder-selective-disclosure-design.md` § UI
> **Related:** `docs/ui-reference/wallet_fixed5/Wallet P4-P5/index.html`, `PresentationConsentPanel`, `PresentationInfoPanel`, `claimDisclosurePolicy.ts`

## Summary

Move Holder-driven SD-JWT claim selection from **Consent** to **Info (Approve by Wallet)** while keeping Consent as a **read-only** preview of what the Verifier requested. Presentation flow becomes: **Face Prepare → Consent (read) → Info (select + accept + sign/submit) → Success**. Claim policy (`md` / `sd`), pipeline, and security rules from the 2026-07-20 spec remain unchanged.

## Goals

1. Match HTML P4-P5 design intent: Consent shows locked checks; document approval page hosts actionable requested items.
2. Fix UX confusion from toggles on Consent conflicting with “รับทราบและยินยอมส่งข้อมูล”.
3. Preserve one Keychain biometric per sign action (ADR).
4. Reuse existing components and policy service — no new routes or screens.

## Non-goals

- Changing `md` / `sd` resolution, SD-JWT filter, or `direct_post` behavior.
- Holder toggles for mdoc or compact JWT VC.
- Redesigning credential summary, Approve by Wallet device card, or POP card.

## Approved flow (Flow B)

```
Scan / openid4vp deeplink
  → resolvePresentationRequest()
  → FacePreparePanel
  → PresentationConsentPanel          (read-only)
  → PresentationInfoPanel               (select sd claims + ยอมรับ)
  → createApprovedPresentationResponse() + submitPresentationResponse()
  → PresentationResultPanel (Success)
```

Decline paths: **ไม่ยินยอม** on Consent, or scaffold back from Info → `presentation-declined` history + reset/cancel.

**Removed from live path:** submit on Consent; post-submit Info review; second Face Prepare after submit.

## Authentication

| Step | Biometric |
|------|-----------|
| Face Prepare | Instructional only (no Keychain gate) |
| Consent → Info navigation | No sign; no Keychain gate for signed VP modes |
| Info **ยอมรับ** | Keychain Ed25519 sign gate (signed modes) — **one prompt per approval** |
| `raw-credential` mode | App-level `confirmPresentationBiometric()` at Info **ยอมรับ** before submit (no sign-time gate) |

Signed SD-JWT modes must **not** add an app-level biometric on Consent navigation.

## UI — Consent (`PresentationConsentPanel`)

**Layout:** unchanged from HTML `page-consent` and current component (verifier icon, title, disclosure list, Face ID hint, primary/secondary buttons).

| Element | Behavior |
|---------|----------|
| Disclosure list | `variant="consent"` — all rows **locked** green check |
| Toggle | **None** — remove `selectedClaimKeys` / `onToggleClaim` from this panel |
| Primary button | **รับทราบและยินยอมส่งข้อมูล** → navigate to Info only |
| Secondary button | **ไม่ยินยอม** → decline history + reset |
| Labels / values | Thai labels via `resolvePresentationDisclosureLabel`; show claim values when resolved |

## UI — Info (`PresentationInfoPanel` + `PresentationRequestedItemsCard`)

**Layout:** unchanged — credential summary, Approve by Wallet, POP, รายการที่ร้องขอ, ยอมรับ.

### รายการที่ร้องขอ — interaction (design delta documented)

Keep **`review` row chrome** (white row, left navy border, info icon on right) per HTML `vr-request-item`.

| Claim policy | Row | Interaction |
|--------------|-----|-------------|
| `mandatory` (`md: true`) | Green check + info icon | Locked — not tappable |
| `selective` (`sd: true`) | Check filled/empty; label/value dim when deselected | **Pressable** row toggles inclusion |
| Not requested by Verifier | Hidden | — |

**Affordance additions (minimal, called out as design delta):**

- Helper line under section title: `แตะรายการที่เลือกได้เพื่อส่งหรือไม่ส่ง`
- `accessibilityRole="checkbox"` and `accessibilityState={{ checked }}` on selectable rows

**Do not** switch selectable rows to `selectable` variant (surface-soft + circle checkbox) on Info — that deviates from the mockup.

### ยอมรับ button

- Calls `createApprovedPresentationResponse({ selectedClaimKeys })` then `submitPresentationResponse()`.
- **Disabled** when `resolveEffectiveDisclosureKeys()` is empty.
- **Loading** while submit in flight.

## State and data flow

- `selectedClaimKeys: Set<string>` lives in `app/(tabs)/scan.tsx` and `Oid4VpDisclosureFlow.tsx`.
- Initialized when entering Info via `readInitialSelectedClaimKeys(disclosures)` (all requested `sd` selected by default).
- Toggles on Info update the set; mandatory keys always included at token build time via existing `resolveEffectiveDisclosureKeys`.
- Policy resolution, enrichment, and SD-JWT filtering unchanged from 2026-07-20 spec.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Holder deselects all `sd` claims | **ยอมรับ** disabled |
| Sign / submit failure | Error phase + `recordOid4vpPresentationFailure` |
| Decline | Existing history event |
| `md` claim missing in credential | Block at resolve (unchanged) |

## Testing

| Area | File |
|------|------|
| Consent read-only (no toggle props) | `PresentationConsentPanel.test.tsx` |
| Info selection + accept disabled | `PresentationRequestedItemsCard.test.tsx` (extend) |
| Review-row toggle on Info | `PresentationDisclosureList.test.tsx` |
| Scan flow phases | `ScanScreenDeeplink.test.tsx` |
| My QR flow | `Oid4VpDisclosureFlow.test.tsx` |
| Pipeline unchanged | `presentationApproval.test.ts` |

Run: focused tests above, `yarn tsc --noEmit`, `yarn lint`.

## Files

| File | Change |
|------|--------|
| `src/components/PresentationConsentPanel.tsx` | Read-only list; primary navigates only |
| `src/components/PresentationRequestedItemsCard.tsx` | Selection props + toggle wiring |
| `src/components/PresentationInfoPanel.tsx` | Pass selection state + handlers |
| `src/components/PresentationDisclosureList.tsx` | Review-row pressable toggle (sd only) |
| `app/(tabs)/scan.tsx` | Phase routing; submit from Info; drop post-submit Info / second FacePrepare |
| `src/components/Oid4VpDisclosureFlow.tsx` | Mirror Scan flow |
| `docs/TASKS.md` | Session note after implementation |

## Spec self-review

- No TBD placeholders.
- UI section supersedes 2026-07-20 Consent toggles only; policy/pipeline sections defer to parent spec.
- Scope is single slice (UI + flow routing); no new services.
- Ambiguity resolved: selection on Info with review-row chrome; Consent strictly read-only.
