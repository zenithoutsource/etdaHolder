# Same-Device VP Presentation via Verifier Portal — `walletapp://callback` Intake

> **Status:** Implemented (2026-07-24; direct `openid4vp://` intake hardened 2026-08-07)
> **Date:** 2026-07-24
> **Related:** `docs/superpowers/specs/2026-07-20-same-device-authorization-code-issuance-design.md`, `docs/superpowers/specs/2026-07-20-same-device-vp-holder-selective-disclosure-design.md`, `docs/superpowers/specs/2026-07-23-vp-claim-selection-on-info-design.md`, `src/components/Oid4VpDisclosureFlow.tsx`, `src/services/credentials/parseIssuanceCallbackUrl.ts`, `app/callback.tsx`

## Summary

Align Verifier-initiated same-device OID4VP with the existing VC same-device pattern: the Verifier Web Portal redirects to **`walletapp://callback`** (not `openid4vp://` directly), the Wallet routes to a **camera-free hidden tab** that reuses **`Oid4VpDisclosureFlow`** and existing presentation panels. QR/cross-device VP on the Scan tab hands off to the same route. Presentation UX, claim policy (`md`/`sd`), and `direct_post` behavior are unchanged from the 2026-07-20 / 2026-07-23 VP specs.

## Goals

1. Holder taps a button on the Verifier Web Portal (same device) → Wallet opens → existing VP flow (Face Prepare → Consent → Info → sign/submit → Success).
2. **No camera permission** on the portal-initiated path (mirror `/(tabs)/credential-offer` for VC).
3. Single callback hub: `walletapp://callback` serves both Issuer (VC offer) and Verifier (VP request) returns.
4. Reuse existing UI (`Oid4VpDisclosureFlow` + presentation panels) — **no new consent/info screens**.
5. Preserve hybrid return to Verifier browser after successful `direct_post` (allowlisted `redirect_uri`).

## Non-goals

- New presentation UI or routes beyond a thin tab shell (`presentation-request.tsx`).
- Removing `openid4vp` from `app.json` (still needed for QR scan and legacy direct links).
- Changing Holder claim policy, SD-JWT filtering, or Verifier P5 verification (peer lane).
- Embedding Verifier portal in a WebView.

## Holder journey

```
Verifier Web Portal (browser, same device)
  → Holder taps "Verify with Wallet"
  → Browser redirects to walletapp://callback?<vp-param>=...
  → Wallet: /callback → /(tabs)/presentation-request
  → resolvePresentationRequest()
  → Face Prepare → Consent (read-only) → Info (select sd claims) → sign/submit
  → direct_post to Verifier
  → (optional) Linking.openURL(allowlisted redirect_uri) back to Verifier portal
  → Success UI in Wallet
```

## Verifier portal contract (locked)

Same return URL as VC issuance: `EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL` (default `walletapp://callback`).

**Portal buttons must redirect to `walletapp://callback`**, not `openid4vp://`.

### Supported callback query parameters

Parsed by `parseIssuanceCallbackUrl` after VC offer keys are checked. First VP match wins.

| Priority | Query key | Value | Normalized internal URI |
|----------|-----------|-------|-------------------------|
| 1 | `authorization_request_uri` | HTTPS JAR request URI | `openid4vp://authorize?request_uri=<encoded>` |
| 2 | `presentation_request_uri` | alias | same |
| 3 | `uri` | full `openid4vp://…` or HTTPS request URI | normalized `openid4vp://…` |
| 4 | `openid4vp` | URL-encoded full `openid4vp://authorize?…` | decoded `openid4vp://…` |

### Examples

```text
walletapp://callback?authorization_request_uri=https%3A%2F%2Fverifier.example%2Fopenid4vp%2Frequest%2Fabc

walletapp://callback?openid4vp=openid4vp%3A%2F%2Fauthorize%3Fclient_id%3D...
```

`+native-intent` continues to rewrite `walletapp://callback?…` → `/callback?…`; `app/callback.tsx` reads Expo Router search params when `Linking.useURL()` is stale (Android Custom Tabs parity with VC).

## Wallet routing

| Parsed kind | Destination | Camera |
|-------------|-------------|--------|
| `credential_offer` | `/(tabs)/credential-offer` | No |
| `presentation_request` | `/(tabs)/presentation-request` | No |

### `readPendingPresentationRoute`

Returns `/(tabs)/presentation-request` (was `/(tabs)/scan`). Used by `app/_layout.tsx`, `app/pin-lock.tsx`, and `app/callback.tsx`.

### Thin route `app/(tabs)/presentation-request.tsx`

Mirror `credential-offer.tsx`:

- Key remount on `deeplinkStore.vpGeneration`
- Consume pending presentation URI once
- Render `Oid4VpDisclosureFlow` with:
  - `authorizationRequestUri` = normalized URI
  - `historyChannel`: `'oid4vp'` (Verifier-initiated)
  - `onDone` / `onCancel` → `router.replace('/(tabs)')`
- `useScreenCaptureGuard()` on the route/screen wrapper

**No new presentation panels.** Optional props on `Oid4VpDisclosureFlow`: `historyChannel`, `logScope` — avoid duplicating approve/submit logic.

## Scan tab (camera only)

After this slice:

| Input | Action |
|-------|--------|
| `openid-credential-offer://` QR | Hand off to `/(tabs)/credential-offer` (unchanged) |
| `openid4vp://` QR / barcode | Store URI + `router.push('/(tabs)/presentation-request')` |
| Other | Error / unsupported |

Remove all `presentation*` phases and camera-permission gate for VP deeplinks from `scan.tsx`.

## Presentation flow (unchanged UX)

From `docs/superpowers/specs/2026-07-23-vp-claim-selection-on-info-design.md`:

- Consent: read-only preview → navigate to Info
- Info: Holder toggles selective (`sd`) claims → **ยอมรับ** → single Keychain sign (signed modes)
- `raw-credential`: app-level biometric at Info accept only
- Claim policy: `claimDisclosurePolicy.ts` → `resolveEffectiveDisclosureKeys` → `selectSdJwtDisclosures`

## Post-submit hybrid return

Port from `scan.tsx` into `Oid4VpDisclosureFlow` (or shared approve helper) for `historyChannel === 'oid4vp'`:

1. After HTTP 2xx from `direct_post`
2. If `response.redirectUri` is allowlisted → `Linking.openURL()`
3. Record history + show Success UI in Wallet (Holder may switch apps)

My QR (`historyChannel === 'wallet'`) behavior unchanged unless redirect is also desired later.

## Backward compatibility

| Entry | Behavior |
|-------|----------|
| Verifier portal (primary) | `walletapp://callback?…` only |
| QR on Scan tab | `openid4vp://` → hand off to `presentation-request` |
| Direct `openid4vp://` app link (legacy/dev) | `deeplinkStore` → `presentation-request` (not Scan) |
| `openid4vp` scheme in `app.json` | Retained |

## Security

- Trust gate before resolve: `findTrustedVerifier()` (unchanged).
- Return URL open redirect blocked by origin allowlist (unchanged).
- No logging of VP tokens, disclosures, claim values, or PII.
- One Keychain sign-time biometric per Info **ยอมรับ** (ADR).

## Testing

| Area | Location |
|------|----------|
| VP callback query parse | `parseIssuanceCallbackUrl.test.ts` |
| Callback routing kind | `resolveIssuanceCallbackResult.test.ts` |
| Presentation route helper | `deeplinkStore.test.ts` |
| Scan VP handoff | `ScanScreenDeeplink.test.tsx` |
| Flow regression | `Oid4VpDisclosureFlow.test.tsx` |
| Redirect after submit | extend `Oid4VpDisclosureFlow.test.tsx` or `presentationService.test.ts` |

Verification: focused tests, `yarn tsc --noEmit`, `yarn lint`.

## Files (implementation)

| File | Change |
|------|--------|
| `src/services/credentials/parseIssuanceCallbackUrl.ts` | Parse VP params on `walletapp://callback` |
| `src/store/deeplinkStore.ts` | `readPendingPresentationRoute` → `presentation-request` |
| `app/callback.tsx` | Route `presentation_request` → `presentation-request` |
| `app/(tabs)/presentation-request.tsx` | **New** thin route |
| `app/(tabs)/_layout.tsx` | Register hidden tab |
| `app/(tabs)/scan.tsx` | Remove VP phases; hand off VP to presentation-request |
| `src/components/Oid4VpDisclosureFlow.tsx` | `historyChannel` / redirect after submit for oid4vp |
| `docs/superpowers/specs/2026-07-20-same-device-authorization-code-issuance-design.md` | Note VP callback routes to `presentation-request` (not Scan) |

## Cross-reference: VC issuance spec update

The VC same-device spec optional line *"openid4vp on callback → Scan"* is superseded by this spec: VP callback → **`/(tabs)/presentation-request`**.
