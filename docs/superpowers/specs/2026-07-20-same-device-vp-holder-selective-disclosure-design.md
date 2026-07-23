# Same-Device VP Presentation — Holder Selective Disclosure (OID4VP)

> **Status:** Approved (2026-07-20)
> **Date:** 2026-07-20
> **Related:** `docs/User_Journey/id_card/P4.md`, `docs/User_Journey/transcript/P5.md`, `docs/SPEC_COMPLIANCE_OID4VC.md`, `src/store/deeplinkStore.ts`, `src/services/vp/sdJwtSelectiveDisclosure.ts`, `docs/superpowers/plans/2026-07-17-sd-jwt-selective-disclosure.md`

## Summary

Extend the existing **Verifier-initiated OID4VP same-device deep link** flow (Scan tab) so Holders can **opt out of selective (`sd`) claims** before consent, while **mandatory (`md`) claims** requested by the Verifier are always included. Claim policy is resolved from Issuer metadata persisted at claim time, with live Issuer fetch and `cardSchemas` fallbacks. After successful `direct_post`, optionally return the Holder to the Verifier Web Portal via an allowlisted redirect URL. **SD-JWT only** in v1; mdoc (driver licence) stays Verifier-request-driven.

## Goals

1. Match journey steps **1–8** (Holder portal → Wallet consent → PoP VP → submit) without new screens or routes.
2. Implement Holder-driven selective disclosure for SD-JWT credentials using Issuer `md` / `sd` semantics.
3. Support hybrid return: **`direct_post` always** + optional browser redirect when Verifier supplies a trusted return URL.
4. Preserve current Scan UX phases, ADR one-biometric-per-sign-action, and existing trust/JAR gates.

## Non-goals (v1)

- Steps **9–22** (Verifier P5 verification: Issuer DID resolve, Trust Registry, Schema Registry, VC Status Registry, Audit Trail) — **peer lanes**, not Wallet implementation.
- Holder toggles for **mdoc** or compact **JWT VC** (driver licence mdoc remains Verifier-request-driven).
- New presentation routes, WebView portal embedding, or redesigned consent UX.
- Remote Trust Registry / central Audit Trail integration.

## Actors and scope

| Steps | Actor | Wallet v1 |
|-------|--------|-----------|
| 1 | Holder | Enters Verifier Web Portal (browser, same device) |
| 2 | Verifier | Sends OID4VP Authorization Request (fields + `nonce`) via portal deep link |
| 3–8 | Wallet + Holder | **In scope** — policy resolution, Holder toggles, consent, PoP, `direct_post`, optional redirect |
| 9–22 | Verifier + registries | **Out of scope** — P5 verification on Verifier infrastructure |

## Architecture

### Intake (unchanged)

```
Verifier portal link (openid4vp://…)
  → app/_layout.tsx / deeplinkStore
  → /(tabs)/scan
  → resolvePresentationRequest()  [JAR verify, trust gate, DCQL/PE match]
  → FacePrepare → Consent → submit → Info → FacePrepare → Success
```

Same-device deep link intake is already implemented (`openid4vp` scheme, `readPendingPresentationRoute`, `vpGeneration`). This spec adds Holder claim selection and hybrid redirect only.

### Claim policy model

#### Semantics

| Flag | Meaning when Verifier requests the claim |
|------|------------------------------------------|
| `md: true` | **Mandatory** — must disclose; Holder cannot opt out |
| `sd: true` | **Selective** — Holder may toggle send / don't send |
| Both false or missing | Default **selective** (`sd: true` behavior) |
| Verifier did not request claim | Hidden; never disclosed |

Mapping from OID4VCI `credential_metadata.claims[]`:

- `mandatory: true` → `{ md: true, sd: false }`
- Otherwise → `{ md: false, sd: true }`
- Customer extension: explicit `md` / `sd` booleans on claim entry override when present

#### Storage

Add optional field on `VerifiableCredentialRecord`:

```typescript
claimDisclosurePolicy?: Record<
  string,
  { md: boolean; sd: boolean }
>
// key = normalized SD-JWT disclosure claim key / DCQL path leaf
```

Written at end of `claimCredential()` (and dual-format save path) from Issuer metadata fetched during OID4VCI resolution.

#### Resolution order (at presentation time)

New service `src/services/vp/claimDisclosurePolicy.ts`:

1. **Stored** — `record.claimDisclosurePolicy[claimKey]`
2. **Live Issuer fetch** — `.well-known/openid-credential-issuer`, match `credential_configuration_id` / VCT
3. **`cardSchemas.ts`** — optional per-field `presentationDisclosure: { md, sd }`
4. **Default** — `{ md: false, sd: true }`

Log fallback usage with `[oid4vp:claim-policy-fallback]` (no PII/tokens).

### Presentation pipeline

```
resolvePresentationRequest()
  → enrich disclosures with md/sd flags
  → Scan: Holder toggles sd claims (local state)
  → createApprovedPresentationResponse({ selectedClaimKeys })
  → effectiveKeys = (verifierRequested ∩ holderSelected) ∪ mandatoryMdRequested
  → selectSdJwtDisclosures(rawSdJwt, effectiveKeys)   [existing helper]
  → signSdJwtKbPresentationToken (nonce, aud, sd_hash)
  → submitPresentationResponse()  [direct_post]
  → optional Linking.openURL(returnUrl) if allowlisted
  → recordSuccessfulPresentation / failure history
```

**Formats:**

- **SD-JWT** (`dc+sd-jwt`, `vc+sd-jwt`): Holder toggles apply.
- **JWT VC / mdoc**: Verifier-request-driven only; no Holder picker in v1.

## UI (current Scan flow only)

No new screens. Extend `PresentationConsentPanel`:

| Claim | List variant | Interaction |
|-------|--------------|-------------|
| `md: true`, Verifier requested | `consent` (green check) | Locked, not tappable |
| `sd: true`, Verifier requested | `selectable` (checkbox) | Tap to toggle |
| Not requested | Hidden | — |

- Default: all requested `sd` claims **selected**.
- **Accept disabled** when zero claims selected.
- **Reject** → existing decline + history path (unchanged).

State in `scan.tsx`: `selectedClaimKeys: Set<string>`, initialized from resolved disclosures, passed to `createApprovedPresentationResponse()`.

Extend `PresentationDisclosureList` with `onToggle(key)` and `disabled` for locked rows (reuse proximity `selectable` visual pattern).

### Authentication (steps 5–6)

Unchanged:

- `FacePreparePanel` before consent for raw-credential mode; signed SD-JWT skips pre-consent biometric.
- Keychain Ed25519 sign-time gate on `createApprovedPresentationResponse()` — **one biometric per user action** (ADR).
- No separate wallet-PIN prompt at presentation time.

## Submit and hybrid return (steps 7–8)

### direct_post (required)

Existing behavior:

```
POST {response_uri}
Content-Type: application/x-www-form-urlencoded
Body: vp_token [, presentation_submission] [, state]
```

### Optional return to Verifier portal

After HTTP **2xx** from `direct_post`:

| Priority | Source | Wallet action |
|----------|--------|---------------|
| 1 | Verifier POST response JSON `redirect_uri` | `Linking.openURL()` |
| 2 | `client_id` prefix `redirect_uri:https://portal…` | Open `{url}?state={state}` when `state` present |
| 3 | Neither | Stay in Wallet success flow (current) |

**Trust gate:** return URL origin must match Verifier trust allowlist (same policy as `response_uri` / `redirect_uri:` client_id origin). If not allowlisted: log warning, skip redirect, continue Wallet UI.

**OID4VP constraint:** when `response_uri` is present in the Authorization Request, a separate `redirect_uri` auth parameter must not be present. Return URL therefore comes from Verifier POST response body or `redirect_uri:` client_id — not a third auth field.

**UX:** Wallet still records history and shows `PresentationInfo` / `PresentationResultPanel` after optional redirect (Holder may switch apps manually). v1 does not embed Verifier portal in WebView.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Requested claim has no matching SD disclosure | Omit; if none remain → `PresentationCredentialInvalid` before sign |
| Holder deselects all claims | Accept disabled |
| `md` claim requested but absent in credential | Block before consent; friendly error |
| Policy resolution fails entirely | Default selective; log fallback |
| `direct_post` HTTP error | `PresentationSubmissionFailed` + `recordOid4vpPresentationFailure` |
| Return URL not allowlisted | Skip redirect; continue success UI |

All surfaced errors: raw scoped log first, then `scanFriendlyErrors` mapping.

## Security

- Trust gate unchanged: `findTrustedVerifier()` before resolve proceeds.
- Return URL open redirect blocked by origin allowlist.
- No logging of VP tokens, disclosures, claim values, or PII.
- One Keychain sign-time biometric per presentation approval (no duplicate app-level gate for signed modes).

## Testing

| Area | Location |
|------|----------|
| Policy persistence at claim | `exchangeService.test.ts`, `dualFormatIssuance.test.ts` |
| Policy resolution fallback | `claimDisclosurePolicy.test.ts` (new) |
| Selection → SD filter → sign | `presentationApproval.test.ts` |
| Consent toggles / Accept disabled | `PresentationConsentPanel.test.tsx` (new or extend) |
| Hybrid redirect | `presentationService.test.ts` (mock `Linking.openURL`) |
| Deeplink regression | `ScanScreenDeeplink.test.tsx` |

Verification: focused tests, `yarn tsc --noEmit`, `yarn lint`.

## Files (implementation)

| File | Change |
|------|--------|
| `VerifiableCredentialRecord` type | Add `claimDisclosurePolicy?` |
| `src/services/vci/exchangeService.ts` | Persist policy at claim |
| `src/services/vp/claimDisclosurePolicy.ts` | **New** — resolve md/sd |
| `src/config/cardSchemas.ts` | Optional per-field fallback |
| `src/services/vp/presentationService.ts` | Enrich disclosures; parse return URL |
| `src/services/vp/presentationApproval.ts` | Accept `selectedClaimKeys` |
| `src/components/PresentationConsentPanel.tsx` | sd toggles |
| `src/components/PresentationDisclosureList.tsx` | `onToggle`, `disabled` |
| `app/(tabs)/scan.tsx` | Selection state; redirect after submit |
| `docs/TASKS.md` | Track slice after ship |

## Peer lanes (steps 9–22) — reference only

Verifier receives VP and runs P5 checks: Issuer DID resolve, signature verify, Trust Registry, Schema Registry, VC Status Registry, PoP verify, Audit Trail. Wallet does not implement these; document for journey completeness only.

## Open items (post-v1)

- Holder toggles for mdoc ISO 18013-5 online presentation (driver licence namespace rules).
- Interpret Verifier HTTP 200 body `status: reject` as failure (separate slice).
- Central Audit Trail event for pre-consent trust failures.
