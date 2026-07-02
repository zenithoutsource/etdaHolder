# Issuer Portal Credential Request — Design Spec

> **Date:** 2026-06-29  
> **Status:** Draft — pending user review  
> **Author:** Brainstorming session (Wallet Home **ขอเอกสาร** flow)

---

## 1. Context

### Problem

On Wallet Home, tapping **ขอเอกสาร** on a document row that has no stored VC currently navigates to the **Scan** tab (`router.push('/(tabs)/scan')`). That implies the Holder should scan a QR immediately.

Per P1/P2 user journeys, the correct first step is for the Holder to **request the document on the Issuer’s web portal** (Figures 1–3 in `docs/User_Journey/id_card/P1.md` and `docs/User_Journey/transcript/P2.md`). The Wallet connects to the Issuer system afterward — typically when the Issuer redirects back with an OID4VCI credential offer deeplink, or when the Holder scans an offer QR as a fallback.

The local dev environment already has an Issuer dashboard at `:3000` (`docs/ANDROID_NETWORK_TESTING.md`). The mobile app has no issuer portal URL configuration or open-portal service today.

### Locked decisions (brainstorming)

| Topic | Decision |
|---|---|
| Portal URL | **One URL per credential type**; dev values from env; production mapping deferred |
| Browser | **In-app browser** via `expo-web-browser` (`openAuthSessionAsync`) |
| Return path | **Primary:** Issuer redirects to Wallet with supported credential-offer deeplink → existing `credential-offer` claim flow |
| Return fallback | User dismisses browser without redirect → informational dialog with optional **ไป Scan** |
| Scope | **Only** Wallet Home rows with **no stored VC** where `canRequestCredentialType` is true |
| Out of scope | Renewal (**ขอเอกสารใหม่** / `submitRenewalRequest`), PID gate dialog actions, Medical certificate row (no `credentialType`), Scan tab behavior |

### Architecture constraints (unchanged)

- OID4VCI claim stays on-device via `@sphereon/oid4vci-client`; no mobile `/exchange/*`.
- Deeplink handling stays in `app/_layout.tsx` + `deeplinkStore`; do not duplicate claim logic in the portal service.
- Credential UI remains config-driven (`cardSchemas.ts`); portal URLs live in a separate config module.
- Operational logs use `walletLogger`; never log full offer URIs, tokens, or PII.

---

## 2. User journey (target)

```
Wallet Home — row without VC, request allowed
  │
  │ 1. Holder taps row or ขอเอกสาร pill
  │
  ▼
Resolve issuer portal URL for credentialType
  │
  │ 2. openAuthSessionAsync(portalUrl, walletReturnUrl)
  │    (Safari View / Chrome Custom Tabs)
  │
  ▼
Issuer web portal — Holder completes request + identity steps
  │
  │ 3a. Success: Issuer redirects to walletReturnUrl with credential-offer deeplink
  │     → WebBrowser session completes → app receives URL
  │     → setIncomingDeeplinkUri / routeDeeplink → /(tabs)/credential-offer
  │
  │ 3b. Cancel / dismiss without redirect
  │     → Dialog: รอรับเอกสารจาก Issuer; optional [ไป Scan]
  │
  ▼
Existing OID4VCI pre-save confirmation + claim (unchanged)
```

**PID gate (unchanged):** If the Holder taps a non-PID document row without a usable ThaID VC, the existing `showPidGateDialog` still runs; its **ขอ ThaID** action continues to route to Scan until a separate spec changes ThaID bootstrap.

**Renewal (unchanged):** Inactive rows with `renewal-required` still use `submitRenewalRequest` on the expanded panel — not the issuer portal.

---

## 3. Configuration

### 3.1 Module

New file: `src/config/issuerPortalUrls.ts`

```typescript
export type IssuerPortalCredentialType =
  | 'ThaiNationalID'
  | 'DLTDrivingLicence'
  | 'BangkokUniversityTranscript'

export function resolveIssuerPortalUrl(
  credentialType: IssuerPortalCredentialType,
): string | undefined
```

- Map each type to a dedicated `EXPO_PUBLIC_*` env var (read at runtime via `process.env`).
- Return `undefined` when unset or empty — caller shows a config error dialog.
- Do **not** hardcode LAN IPs in source; document examples only in `.env.example`.

### 3.2 Environment variables (dev)

Add to root `.env.example`:

```bash
# Issuer web portals for Wallet Home "ขอเอกสาร" (one URL per document type)
EXPO_PUBLIC_ISSUER_PORTAL_THAI_NATIONAL_ID=http://192.168.1.36:3000/thaid
EXPO_PUBLIC_ISSUER_PORTAL_DLT=http://192.168.1.36:3000/dlt
EXPO_PUBLIC_ISSUER_PORTAL_TRANSCRIPT=http://192.168.1.36:3000/transcript
```

Paths are illustrative; actual paths depend on the Issuer dashboard implementation.

### 3.3 Production (deferred)

Future work: resolve portal URL from Trust Registry / issuer metadata instead of env. This spec only requires the env-based resolver so dev and demo devices work without backend schema changes.

---

## 4. Service layer

New file: `src/services/credentials/openCredentialRequestPortal.ts`

### 4.1 Public API

```typescript
export type OpenCredentialRequestPortalResult =
  | { status: 'claimed'; deeplink: string }
  | { status: 'dismissed' }
  | { status: 'misconfigured' }
  | { status: 'error'; message: string }

export async function openCredentialRequestPortal(
  credentialType: IssuerPortalCredentialType,
): Promise<OpenCredentialRequestPortalResult>
```

### 4.2 Behavior

1. **Resolve URL** — `resolveIssuerPortalUrl(credentialType)`; if missing → `{ status: 'misconfigured' }`.
2. **Build return URL** — `Linking.createURL('/')` (scheme `etdawallet` from `app.json`). This is the `redirectUrl` passed to `WebBrowser.openAuthSessionAsync`.
3. **Optional query params** — If the Issuer portal supports a return hint, append `wallet_redirect` (or agreed name) with encoded return URL to the portal open URL. Only when Issuer documents support; safe to omit in v1 if portal ignores unknown params.
4. **Open session** — `WebBrowser.openAuthSessionAsync(portalUrl, returnUrl)`.
5. **On `type === 'success'`** — If `result.url` passes `isSupportedWalletDeeplink` and `isCredentialOfferDeeplink`:
   - Log `issuer-portal-return-offer` with redacted metadata.
   - Call `useDeeplinkStore.getState().setIncomingDeeplinkUri(result.url)` (or inject store for tests).
   - Return `{ status: 'claimed', deeplink: result.url }`.
   - Caller invokes existing `routeDeeplink` from layout context **or** relies on layout listener if URL is already routed — prefer explicit handoff from `index.tsx` via a small callback prop/callback imported from layout helper to avoid duplicate navigation. **Implementation note:** export a `handleWalletDeeplink(url: string)` from a thin `src/services/deeplink/routeWalletDeeplink.ts` wrapper used by both `_layout.tsx` and portal service if needed to keep a single routing path.
6. **On `type === 'cancel'` or success URL not a credential offer** — Return `{ status: 'dismissed' }`.
7. **On thrown errors** — `logWalletError('wallet-home', 'issuer-portal-open-failed', err)` → `{ status: 'error', message: generic }`.

### 4.3 Web platform

`Platform.OS === 'web'`: open portal with `window.open` or `Linking.openURL` and return `{ status: 'dismissed' }` (no auth session). Credential request from web wallet is out of v1 scope; guard must not crash.

---

## 5. Issuer portal contract (dev)

The Issuer dashboard team should redirect the Holder back to the Wallet using a URL the app already accepts:

**Preferred redirect (existing handler):**

```
openid-credential-offer://?credential_offer_uri=<url-encoded-offer-uri>
```

**Alternative** if portal uses app scheme wrapper:

```
etdawallet://?...   (only if extended in isSupportedWalletDeeplink — not required for v1)
```

The portal must perform an HTTP redirect (302) or JavaScript `location.replace` to the above so `openAuthSessionAsync` completes with `result.url`.

Document this contract in `server/README.md` or Issuer dashboard README when those repos expose the redirect endpoint.

---

## 6. UI changes

### 6.1 `app/(tabs)/index.tsx`

Replace **only** the branch:

```typescript
if (!credential && canRequestCredentialType(...)) {
  router.push('/(tabs)/scan')
}
```

With:

```typescript
void handleRequestCredential(item.credentialType)
```

`handleRequestCredential`:

| Result | UI |
|---|---|
| `misconfigured` | Dialog: portal URL not configured for this document type |
| `error` | Dialog: generic retry message |
| `dismissed` | Dialog: รอรับเอกสารจาก Issuer when complete; actions **[ปิด]** and **[ไป Scan]** |
| `claimed` | No extra dialog — deeplink routing opens `credential-offer` |

Do **not** change PID gate `() => router.push('/(tabs)/scan')` callbacks.

### 6.2 Copy (suggested Thai)

| Key | Text |
|---|---|
| `portalMisconfiguredTitle` | ไม่สามารถเปิดหน้าขอเอกสารได้ |
| `portalMisconfiguredMessage` | ยังไม่ได้ตั้งค่า Issuer portal สำหรับเอกสารประเภทนี้ |
| `portalDismissedTitle` | รอรับเอกสาร |
| `portalDismissedMessage` | เมื่อ Issuer อนุมัติแล้ว คุณจะได้รับเอกสารใน Wallet หรือสแกน QR จาก Issuer |
| `portalDismissedScanAction` | ไป Scan |

Add strings to `src/services/credentials/walletHomeCopy.ts`.

---

## 7. Data flow diagram

```text
┌─────────────────┐     openAuthSession      ┌──────────────────┐
│  Wallet Home    │ ───────────────────────► │ Issuer portal    │
│  index.tsx      │                          │ (web, :3000 dev) │
└────────┬────────┘                          └────────┬─────────┘
         │                                            │
         │         redirect: openid-credential-offer://
         │ ◄──────────────────────────────────────────┘
         ▼
┌─────────────────┐     push      ┌──────────────────────┐
│ deeplinkStore   │ ────────────► │ /(tabs)/credential-  │
│ + routeDeeplink │               │ offer (existing)       │
└─────────────────┘               └──────────────────────┘
```

---

## 8. Files to touch

| File | Change |
|---|---|
| `src/config/issuerPortalUrls.ts` | **New** — type → env URL resolver |
| `src/config/issuerPortalUrls.test.ts` | **New** — resolver unit tests |
| `src/services/credentials/openCredentialRequestPortal.ts` | **New** — browser session + deeplink handoff |
| `src/services/credentials/openCredentialRequestPortal.test.ts` | **New** — mock `expo-web-browser` |
| `src/services/credentials/walletHomeCopy.ts` | Portal dialog copy |
| `app/(tabs)/index.tsx` | Replace scan navigation in scoped branch |
| `.env.example` | Three `EXPO_PUBLIC_ISSUER_PORTAL_*` vars |
| `docs/ANDROID_NETWORK_TESTING.md` | Note portal URLs vs proxy ports |
| `docs/TASKS.md` | Session note after implementation |

Optional refactor (only if needed to avoid duplicate routing):

| File | Change |
|---|---|
| `src/services/deeplink/routeWalletDeeplink.ts` | Thin shared wrapper extracted from `_layout.tsx` |

---

## 9. Error handling

| Condition | Log tag | User-facing |
|---|---|---|
| Missing env URL | `issuer-portal-misconfigured` | Config dialog |
| `openAuthSessionAsync` throws | `issuer-portal-open-failed` | Generic error dialog |
| Success URL not supported deeplink | `issuer-portal-unexpected-return` | Dismissed dialog + optional Scan |
| User cancels browser | `issuer-portal-cancelled` | Dismissed dialog (optional: silent) |
| PIN lock active | N/A — Home not reachable without unlock | Unchanged |

---

## 10. Testing

### Unit

- `resolveIssuerPortalUrl` returns correct URL per type; undefined when env missing.
- `openCredentialRequestPortal` mocks:
  - success with `openid-credential-offer://` → sets deeplink store / returns `claimed`
  - cancel → `dismissed`
  - misconfigured type → `misconfigured`

### Manual (device)

1. Set three portal env vars; restart Expo.
2. Wallet Home → ID Card row without VC → in-app browser opens Issuer portal.
3. Complete Issuer flow → redirect → `credential-offer` screen.
4. Dismiss browser without redirect → dialog with Scan option.
5. Confirm renewal row and PID gate still behave as before.

---

## 11. Security

- Only open **configured** HTTPS/HTTP URLs from env — never user-supplied URLs on this path.
- Validate return URL with `isSupportedWalletDeeplink` before routing; reject unknown schemes.
- Do not pass session tokens or Holder DID in portal URL unless Issuer spec requires it in a later iteration.
- Production builds must not enable dev-only HTTP portals without explicit release policy (existing network security posture).

---

## 12. Out of scope

- Issuer portal UI implementation
- Trust Registry–based portal discovery
- Changing ThaID PID gate to use portal instead of Scan
- Renewal async flow (`submitRenewalRequest`)
- Medical certificate issuance (no `credentialType` mapping yet)
- Universal Links / App Links for portal return (scheme-based redirect is sufficient for v1)

---

## 13. Success criteria

- [ ] Tapping **ขอเอกสาร** on an eligible empty Wallet Home row opens the correct Issuer in-app browser URL for that document type.
- [ ] Successful Issuer redirect with `openid-credential-offer://` lands on existing credential-offer claim flow without visiting Scan first.
- [ ] Dismissing the browser shows fallback guidance and optional Scan navigation.
- [ ] Renewal and PID gate flows are unchanged.
- [ ] Unit tests pass; `yarn tsc --noEmit` clean.

---

## Spec self-review (2026-06-29)

| Check | Result |
|---|---|
| Placeholders / TBD | None — env paths marked illustrative only |
| Internal consistency | Scope excludes renewal and PID gate; §2 and §6 align |
| Single implementation plan scope | Yes — one vertical slice, ~6 files |
| Ambiguity | `routeDeeplink` handoff: spec allows thin shared wrapper if layout duplication is risky; implementer picks minimal diff |
