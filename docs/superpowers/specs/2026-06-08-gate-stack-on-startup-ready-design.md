# Gate Root Stack on Startup-Ready — Design

## Problem

Wallet home shows no stored credentials immediately after app launch, even when credentials already exist from a prior session. Navigating to the Scan tab and back makes them appear.

## Root Cause

`app/_layout.tsx` (`RootLayout`) renders `<Stack>` — including `(tabs)` and therefore the Wallet home screen — unconditionally on every render. While `prepareWallet()` runs asynchronously (`initStorage()`, `generateWalletKeyIfNeeded()`, `loadSession()`), a full-screen loading overlay is drawn *on top* of the already-mounted `<Stack>`, purely as a visual mask.

Because `(tabs)` is mounted in parallel with `prepareWallet()`:

1. `WalletHomeScreen` mounts and `useStoredCredentials` runs its initial `useEffect(() => refresh(), [refresh])`.
2. `refresh()` calls `getCredentialStorage()`, which throws `StorageNotInitialized` because `initStorage()` has not resolved yet.
3. `useStoredCredentials` silently catches `StorageNotInitialized` and sets `credentials = []`, `error = null`.
4. `prepareWallet()` finishes, the overlay disappears — but nothing re-triggers `refresh()`. The hook only re-runs on focus (`useFocusEffect(refresh)`).
5. Switching tabs and back fires the focus effect; storage is now initialized, `refresh()` succeeds, and credentials finally appear.

This is a race between async startup initialization and a screen's mount-time storage read, masked by a silent catch and incidentally "fixed" by an unrelated focus event.

## Fix

Make `startupState.status` gate *mounting*, not just visual overlay:

- **`status === 'ready'`**: render `<Stack>` (with its four `Stack.Screen` entries) and `<StatusBar>`, exactly as today.
- **`status === 'loading'` or `status === 'error'`**: render *only* the existing full-screen overlay (`ActivityIndicator` + "Starting wallet..." text, or the error title/message block). `<Stack>` does not mount.

This guarantees no screen — Wallet home or any future screen reading from storage on mount — can run before `initStorage()`, `generateWalletKeyIfNeeded()`, and `loadSession()` resolve, because no screen exists yet to do so. `StorageNotInitialized` becomes structurally unreachable from any UI mount path; it remains a valid defensive throw inside `storage.ts` for misuse from non-UI code.

## Scope

Single file: `app/_layout.tsx`. No changes to `useStoredCredentials`, `storage.ts`, or any tab screen.

## Side Effects Considered

- `isTabRoute` (derived from `useSegments()`) is used to pick `StatusBar` style/color. Before `(tabs)` mounts, `segments` is already empty today (Stack exists but route hasn't resolved), so `isTabRoute` is `false` during the loading phase under both the old and new behavior — no visible change.
- Web platform (`Platform.OS === 'web'`) sets `status: 'ready'` synchronously at the start of `prepareWallet()`, so the gate is a no-op there — Stack mounts immediately as before.
- `SplashScreen.hideAsync()` timing is unaffected; it already runs in the `finally` block of `prepareWallet()` regardless of render structure.

## Testing

- `yarn tsc --noEmit`
- Manual: cold-launch app with existing stored credentials → Wallet home should show them immediately on first paint, without navigating away and back.
- Manual: cold-launch on a fresh install (no credentials) → Wallet home should show the empty state immediately, not a delayed-empty-then-still-empty flicker.
- Manual: trigger a startup error path (e.g., simulate `StorageInitializationFailed`) → error overlay shows, `<Stack>` does not flash underneath it.
