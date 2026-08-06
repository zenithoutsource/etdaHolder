# Driving Licence mDOC-Only Issuance Debug Slice

**Date:** 2026-08-05  
**Status:** Approved for implementation planning  
**Related:** `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md`, `docs/superpowers/specs/2026-07-27-my-qr-driving-licence-dual-format-design.md`, `src/services/credentials/dualFormatIssuance.ts`, `src/services/vci/exchangeService.ts`, `src/screens/CredentialOfferClaimScreen.tsx`, `docs/TASKS.md`

## Summary

Temporary **debug slice** to unblock driving-licence OID4VCI on device: for dual-format offers (`dc+sd-jwt` + `mso_mdoc`), acquire **`mso_mdoc` only** via the existing `@sphereon/oid4vci-client` path — one token exchange, one proof (`jwk`), one credential request. Do **not** attempt SD-JWT in the same flow. Fail fast with the raw mDOC error when acquisition fails.

This isolates whether failures are caused by dual-format orchestration (shared v2 key/session, `c_nonce`, `DualFormatClaimFailed` aggregation) versus Issuer/protocol issues on the mDOC wire path.

**Library migration (`@openid4vc/openid4vci`) is explicitly out of scope for this slice.** If mDOC still fails on Sphereon with a clear error, a follow-up POC may compare `@openid4vc` for mDOC-only requests per the Phase 2 VCI plan in `2026-07-31-oid4vc-vp-adapter-design.md`.

## Problem

Users hit `DualFormatClaimFailed: neither format could be acquired` when requesting a driving licence through the Issuer portal. Both SD-JWT and mDOC acquisition fail inside `acquireDualFormatForPreview()`, and the UI surfaces a generic message while underlying errors are logged separately.

Recent work addressed v2 per-credential shared proof-session coupling, but physical-device validation remains inconclusive because:

- Portal return sometimes fails before issuance (`no-walletapp-deep-link`).
- Dual-format orchestration still combines two different PoP shapes (`did-kid` vs `jwk`) in one flow.

## Goals

1. **Prove mDOC OID4VCI works** on Samsung A26 against the customer Issuer (`issuer.zenithcomp.co.th:455` or configured dev Issuer).
2. **Surface the real mDOC failure** in UI/logs when it does not work — no SD-JWT attempt, no `DualFormatClaimFailed` masking.
3. **Keep blast radius minimal** — driving licence dual-format offers only; no env flag; no library swap.

## Non-goals

- Production release with mDOC-only driving licence (SD-JWT deferred indefinitely).
- My QR / OID4VP dual-format presentation (requires SD-JWT — unchanged).
- Replacing `@sphereon/oid4vci-client` with `@openid4vc/openid4vci` in this slice.
- Fixing Issuer portal callback delivery (`walletapp://callback`) — separate issue.
- Transcript or Thai ID dual-format behavior changes.
- NFC proximity presentation validation (follows after mDOC bytes are stored).

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Primary goal | Debug / unblock (A) — prove mDOC issuance, then restore dual-format |
| Activation | Automatic for driving licence dual-format offers only — no `EXPO_PUBLIC_*` flag |
| Order | mDOC first; **stop on success** (do not attempt SD-JWT) |
| On mDOC failure | Fail immediately — show mDOC error only; **no** SD-JWT fallback, **no** full dual-format retry |
| VCI library | Keep `@sphereon/oid4vci-client` + `applyMsoMdocCredentialRequestFields` |
| `@openid4vc` | Deferred — POC only if Slice 1 fails with Sphereon-specific errors |

## Approaches considered

| Approach | Pros | Cons | Choice |
|----------|------|------|--------|
| **A. `acquireDrivingLicenceMdocOnlyForPreview()` in `dualFormatIssuance.ts`** | Testable; matches existing patterns; easy to remove | ~80–120 lines new code | **Chosen** |
| **B. Branch in `CredentialOfferClaimScreen` only** | Smallest diff | Debug logic in UI; hard to test | Rejected |
| **C. Switch to `@openid4vc/openid4vci` now** | Better lib errors long-term | Phase 2 migration scope; delays debug answer; high regression risk | **Deferred** |

## Architecture

### Trigger

Route to mDOC-only path when **all** are true:

1. `isDualFormatOffer(resolvedOffer.credentialConfigurations)` is true.
2. `findDualFormatGroup(...)` resolves to driving licence family (`DLTDrivingLicence` / ISO mDL group per `logicalCredentialGrouping.ts`).

All other dual-format offers (e.g. transcript) continue using `acquireDualFormatForPreview()`.

### Data flow

```text
CredentialOfferClaimScreen.acquireForPreview()
        │
        ├─ driving licence dual-format?
        │     YES → acquireDrivingLicenceMdocOnlyForPreview()
        │     NO  → acquireDualFormatForPreview() or single-format path
        │
        ▼
acquireDrivingLicenceMdocOnlyForPreview()
        │
        ├─ findDualFormatGroup → slice mso_mdoc configuration
        ├─ acquireAccessToken (once)
        ├─ acquireCredentialRecord(mdocOffer) — single call
        │     • jwk PoP (via readProofKeyBinding for mso_mdoc)
        │     • applyMsoMdocCredentialRequestFields (existing)
        │     • optional v2 pending key — single acquire, no dual-format session sharing
        ├─ storeMdocCredential (native)
        └─ return preview: placeholder primaryRecord + pendingMdoc
        │
        ▼
Preview → accept → finalize
        │
        └─ logical credential: mso_mdoc only → consistencyStatus: 'warning'
```

### New / modified modules

| Module | Change |
|--------|--------|
| `src/services/credentials/dualFormatIssuance.ts` | Add `acquireDrivingLicenceMdocOnlyForPreview()`, helper `isDrivingLicenceDualFormatOffer()` |
| `src/screens/CredentialOfferClaimScreen.tsx` | Branch driving licence dual-format to mDOC-only path; allow save when mDOC present without SD-JWT |
| `src/services/credentials/dualFormatIssuance.test.ts` | Happy path + fail-fast error propagation |
| `src/services/scan/scanFriendlyErrors.ts` | Map raw mDOC/VCI errors (already partially improved for `DualFormatClaimFailed`) |

No changes to `@sphereon/oid4vci-client` usage beyond reusing existing `acquireCredentialRecord`.

### Save / storage model

- Native mDOC: `storeMdocCredential` via `mdocStorage`.
- MMKV: placeholder `VerifiableCredentialRecord` when SD-JWT absent (`createMdocPlaceholderRecord`).
- Logical credential: only `mso_mdoc` format entry → `validateCrossFormatConsistency` returns `warning` (existing behavior when SD-JWT missing).
- Per-credential v2 key: bind on successful finalize (same as dual-format preview defer pattern).

### UI behavior

- **Preview:** `DrivingLicencePreviewPanel` may show `—` for claim fields sourced from SD-JWT until Slice 2 restores dual-format. Fixed portrait/reference card still renders.
- **Success:** User can complete receive flow when mDOC is stored.
- **Error:** Show friendly-mapped **mDOC error directly** — not `DualFormatClaimFailed: neither format could be acquired`.
- Optional dev-only subtitle on preview: *"mDOC debug — SD-JWT not loaded"* (may omit if zero UI churn preferred).

### Error handling

| Condition | Behavior |
|-----------|----------|
| mDOC acquire succeeds | Continue to preview/save — no SD-JWT attempt |
| mDOC acquire fails | Log `[wallet:oid4vci] driving-licence-mdoc-failed`, throw/propagate raw error to UI |
| Token exchange fails | Existing `CredentialTokenExchangeFailed` — unchanged |
| User cancel / timeout | Existing abort paths — unchanged |
| Portal no callback | Out of scope — existing portal empty-offer handling |

Enhancement already in code: aggregate errors in `throwDualFormatTotalFailure` for dual-format path — mDOC-only path should throw the single underlying error without aggregation.

## Testing

### Automated

1. `acquireDrivingLicenceMdocOnlyForPreview` — mocked `acquireCredentialRecord` returns `mdoc:...` → pending mdoc present, no second acquire call.
2. mDOC failure — error propagates; `acquireCredentialRecord` called exactly once (mdoc config).
3. Routing — ISO mDL + SD-JWT dual offer triggers mDOC-only; transcript dual-format still calls `acquireDualFormatForPreview`.
4. `yarn test src/services/credentials/dualFormatIssuance.test.ts`
5. `yarn tsc --noEmit`

### Manual E2E (required for slice done)

Setup: dev build on Samsung A26, Metro connected, Thai ID (PID) in wallet if required by Issuer.

| # | Step | Expected |
|---|------|----------|
| 1 | Request driving licence via portal; complete Issuer flow until `walletapp://callback?credential_offer_uri=...` | Claim screen opens |
| 2 | Observe Metro | Single `credential-request-start` with `format: mso_mdoc` only |
| 3 | Complete biometric if prompted | One sign-time gate for single acquire |
| 4a | Success | Preview or success; mDOC stored; no `DualFormatClaimFailed` |
| 4b | Failure | UI shows specific mDOC/issuer error (not dual-format aggregate) |

**Prerequisite:** Portal must return callback — if `no-walletapp-deep-link`, fix portal/Issuer redirect first (blocks all issuance).

## Rollout and removal

- Ship as temporary debug behavior in development builds first; document in `docs/TASKS.md`.
- **Remove** driving licence mDOC-only branch when dual-format issuance passes E2E on device.
- Restore full `acquireDualFormatForPreview` for driving licence once shared-session fix is validated.

## Follow-up (not this slice)

| Trigger | Next step |
|---------|-----------|
| mDOC succeeds, dual-format fails | Fix dual-format shared v2 session / `c_nonce`; re-enable both formats |
| mDOC fails with Sphereon-specific request shape errors | Narrow `@openid4vc/openid4vci` mDOC-only POC (compare errors) |
| Both paths work | Remove debug branch; update My QR dual-format VP validation per `2026-07-27-my-qr-driving-licence-dual-format-design.md` |
| Long-term VCI | Phase 2 from `2026-07-31-oid4vc-vp-adapter-design.md` |

## Definition of done

- [ ] `acquireDrivingLicenceMdocOnlyForPreview()` implemented and tested
- [ ] `CredentialOfferClaimScreen` routes driving licence dual-format offers to mDOC-only path
- [ ] mDOC failure surfaces raw error in UI (not `DualFormatClaimFailed`)
- [ ] Partial mDOC-only save allowed (logical credential `warning` status)
- [ ] `docs/TASKS.md` updated with slice status and removal criteria
- [ ] Manual E2E on A26: success **or** actionable mDOC error captured in Metro

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Preview card empty without SD-JWT claims | Accept for debug; document; restore dual-format for production UI |
| My QR broken for debug credentials | Expected — document as non-goal until Slice 2 |
| Debug branch left in production | Explicit removal criteria in TASKS; code comment `DEBUG_SLICE_MDOC_ONLY` |
| Portal callback still broken | E2E checklist calls out prerequisite |
