# Plan: Same-Device OID4VCI Deeplink

## Problem

Issuer web app adds a "same device" button that opens the Wallet via deeplink instead of QR scan. Currently the Wallet only processes `openid-credential-offer://` URIs from the camera in `app/(tabs)/scan.tsx`. No deeplink listener exists — the app ignores incoming URIs on cold start or resume.

## Current State

- `app.json` scheme: `etdawallet` (custom scheme only)
- `app/(tabs)/scan.tsx` `handleBarcode(uri)` already handles both `openid-credential-offer://` and `openid4vp://` URIs — all offer resolution, PID gating, tx_code, acquisition, and save logic lives here
- No `useURL()`, no `Linking.addEventListener` anywhere in the app
- `expo-linking` already installed as a dependency

## What the Issuer Sends

```
openid-credential-offer://?credential_offer=...
openid-credential-offer://?credential_offer_uri=...
```

Same URI format as QR content. Tapped from browser instead of scanned.

## Implementation

### Step 1: Register `openid-credential-offer` scheme

**File**: `app.json`

Change `scheme` from a single string to an array:

```json
"scheme": ["etdawallet", "openid-credential-offer"]
```

This makes the OS route `openid-credential-offer://` URIs to this app. After this change, run `npx expo prebuild --clean` to regenerate native intent filters / URL schemes.

### Step 2: Add deeplink listener

**File**: `app/(tabs)/scan.tsx`

Add `useURL()` from `expo-linking` to catch incoming deeplinks:

```typescript
import * as Linking from 'expo-linking'

// Inside ScanScreen component:
const incomingUrl = Linking.useURL()

useEffect(() => {
  if (!incomingUrl) return
  if (incomingUrl.startsWith('openid-credential-offer://') || isOid4VpAuthorizationRequest(incomingUrl)) {
    handleBarcode(incomingUrl)
  }
}, [incomingUrl])
```

`useURL()` handles both:
- **Cold start**: app not running → OS launches app with URI → `useURL()` returns it on first render
- **Warm resume**: app in background → OS brings app to foreground with URI → `useURL()` updates

### Step 3: Auto-navigate to Scan tab

**File**: `app/_layout.tsx`

If the app opens on a different tab (Wallet Home), the deeplink must navigate to the Scan tab first. `openid-credential-offer://` is a custom scheme (not a path-based route), so Expo Router cannot auto-route it.

Recommended approach — thin Zustand slice or module-level ref:

```typescript
// app/_layout.tsx
const url = Linking.useURL()
useEffect(() => {
  if (url?.startsWith('openid-credential-offer://') || (url && isOid4VpAuthorizationRequest(url))) {
    setPendingDeeplinkUri(url)  // Zustand or module-level ref
    router.replace('/(tabs)/scan')
  }
}, [url])

// app/(tabs)/scan.tsx
useEffect(() => {
  const pending = consumePendingDeeplinkUri()
  if (pending) handleBarcode(pending)
}, [])
```

### Step 4: Guard against duplicate processing

`handleBarcode` already has `processingRef.current` guard. Add dedup for `useURL()` re-fires:

```typescript
const lastDeeplinkRef = useRef<string | null>(null)

useEffect(() => {
  if (!incomingUrl) return
  if (incomingUrl === lastDeeplinkRef.current) return
  lastDeeplinkRef.current = incomingUrl
  handleBarcode(incomingUrl)
}, [incomingUrl])
```

## Files to Change

| File | Action | What |
|---|---|---|
| `app.json` | UPDATE | Add `openid-credential-offer` to scheme array |
| `app/_layout.tsx` | UPDATE | Add `Linking.useURL()` → store pending URI → navigate to Scan |
| `app/(tabs)/scan.tsx` | UPDATE | Consume pending deeplink URI on mount → feed into `handleBarcode` |
| `src/store/deeplinkStore.ts` | CREATE | Thin Zustand store or module-level ref for pending deeplink URI |

## OID4VP Same-Device (Future)

Same pattern works for `openid4vp://` Verifier deeplinks. Add `openid4vp` to `app.json` scheme array when needed. `handleBarcode` already handles `openid4vp://` URIs — no protocol changes required.

## Testing

1. `npx expo prebuild --clean` — regenerate native project with new scheme
2. Android: `adb shell am start -a android.intent.action.VIEW -d "openid-credential-offer://?credential_offer=..."` — verify app opens and processes offer
3. iOS: `xcrun simctl openurl booted "openid-credential-offer://?credential_offer=..."` — same
4. Same-device browser test: open Issuer web on phone browser → tap deeplink button → Wallet opens → offer resolves → credential flow starts
5. Verify: cold start (app killed), warm resume (app in background), already on Scan tab — all three paths work

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Another app registers `openid-credential-offer://` | Android shows app chooser | Standard OID4VCI behavior — acceptable |
| Deeplink arrives before startup completes | Offer resolution fails (storage not ready) | `_layout.tsx` already gates `<Stack>` on `startupState === 'ready'` — deeplink processing waits |
| `useURL()` re-fires on tab focus | Duplicate processing | `lastDeeplinkRef` dedup guard |

## Complexity

**Small** — ~50 lines new code, 1 new tiny store file, no new dependencies, no protocol changes. All offer/presentation logic reused from existing QR flow.

## Prerequisite

Issuer web must link to `openid-credential-offer://...` (not `etdawallet://...`). This is the OID4VCI standard scheme and what other wallets also register.
