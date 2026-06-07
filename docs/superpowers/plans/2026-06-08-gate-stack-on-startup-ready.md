# Gate Root Stack on Startup-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Wallet home (and any future screen) from reading credential storage before async startup init resolves, so stored credentials show on first paint instead of only after a tab-focus refresh.

**Architecture:** In `app/_layout.tsx`, change `RootLayout`'s render from "always mount `<Stack>`, overlay loading/error visuals on top" to "mount `<Stack>` only when `startupState.status === 'ready'`; otherwise render only the full-screen overlay." No screen — and therefore no storage-reading hook — exists until storage/crypto/session are confirmed ready.

**Tech Stack:** React Native, Expo Router (`Stack`, `useSegments`), `expo-status-bar`, `expo-splash-screen`.

---

### Task 1: Gate `<Stack>` mount behind `startupState.status === 'ready'`

**Files:**
- Modify: `app/_layout.tsx:105-127`

No automated test is added for this task. `RootLayout` has no existing test file (`Glob **/_layout.test.tsx` → no matches), and the change is a render-structure decision (which subtree mounts) rather than a pure function — meaningfully testing it would require mocking Expo Router's navigation container and async startup timing, which is disproportionate to a one-branch JSX change. Verification is `yarn tsc --noEmit` plus the three manual walkthroughs in Step 4-6 (these mirror the spec's "Testing" section).

- [ ] **Step 1: Read the current return block to confirm line numbers are still accurate**

Run: read `app/_layout.tsx` lines 105-127. Confirm it still matches:

```tsx
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Create Account' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      {startupState.status === 'loading' ? (
        <View style={styles.overlayScreen}>
          <ActivityIndicator color="#002887" />
          <Text style={styles.loadingText}>Starting wallet...</Text>
        </View>
      ) : null}
      {startupState.status === 'error' ? (
        <View style={styles.overlayScreen}>
          <Text style={styles.errorTitle}>Wallet startup failed</Text>
          <Text style={styles.errorMessage}>{startupState.message}</Text>
        </View>
      ) : null}
      <StatusBar style={isTabRoute ? 'light' : 'dark'} backgroundColor={isTabRoute ? '#002887' : '#f4f6fa'} />
    </ThemeProvider>
  );
```

If the lines have drifted, locate the equivalent block by searching for `<Stack>` inside `RootLayout`'s `return`.

- [ ] **Step 2: Replace the block with status-gated rendering**

Replace the entire `return (...)` block from Step 1 with:

```tsx
  if (startupState.status !== 'ready') {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.overlayScreen}>
          {startupState.status === 'loading' ? (
            <>
              <ActivityIndicator color="#002887" />
              <Text style={styles.loadingText}>Starting wallet...</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorTitle}>Wallet startup failed</Text>
              <Text style={styles.errorMessage}>{startupState.message}</Text>
            </>
          )}
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Create Account' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={isTabRoute ? 'light' : 'dark'} backgroundColor={isTabRoute ? '#002887' : '#f4f6fa'} />
    </ThemeProvider>
  );
```

Note: `startupState.status !== 'ready'` narrows the discriminated union `StartupState` to `{ status: 'loading' }` or `{ status: 'error'; message: string }`, so `startupState.message` is type-safe inside the `else` branch (TypeScript narrows on the `startupState.status === 'loading'` check within that block).

- [ ] **Step 3: Run typecheck**

Run: `yarn tsc --noEmit`
Expected: `Done in <N>s.` with no errors. The discriminated-union narrowing in Step 2 must compile cleanly — if TypeScript complains about `startupState.message` being possibly undefined, the narrowing structure was not preserved; re-check that `startupState.status === 'loading'` gates the `ActivityIndicator` branch and the `else` covers only `'error'`.

- [ ] **Step 4: Manual walkthrough — existing credentials show immediately**

On a device/emulator with at least one stored credential (e.g., from a prior QR claim):
1. Force-quit the app.
2. Relaunch it.
3. Watch Wallet home on first paint (after the loading overlay disappears).

Expected: stored credential card(s) appear immediately — no need to switch tabs and back.

- [ ] **Step 5: Manual walkthrough — fresh install shows empty state immediately**

On a device/emulator with no stored credentials (or after clearing app storage):
1. Launch the app.
2. Watch Wallet home on first paint.

Expected: the empty/no-documents state renders immediately and stays consistent — no flicker or delayed population.

- [ ] **Step 6: Manual walkthrough — error path does not flash the tab UI**

Trigger a startup error path (e.g., temporarily make `initStorage()` throw, or test on a device without the required secure-lock-screen/biometric setup so `assertHardwareSecureEnvironmentSupported` fails):
1. Launch the app.

Expected: only the error overlay (title + message) renders. The bottom tab bar / Wallet UI never flashes underneath it, because `<Stack>` never mounted. Revert any temporary throw used for this test before continuing.

- [ ] **Step 7: Commit**

```bash
git add app/_layout.tsx
git commit -m "fix(startup): gate root Stack mount on startup-ready to stop premature storage reads"
```

---

### Task 2: Update session docs

**Files:**
- Modify: `docs/TASKS.md` (Active Session Notes → today's session section, per repo convention of one section per work session)

- [ ] **Step 1: Add a note describing the bug and fix**

Append a bullet to the relevant session-notes section in `docs/TASKS.md`:

```markdown
- Bug found in testing: Wallet home showed no stored credentials on cold launch (only appeared after switching tabs and back). Root cause: `app/_layout.tsx` mounted `<Stack>` (and therefore Wallet home / `useStoredCredentials`) immediately, in parallel with async `initStorage()`; the mount-time `refresh()` hit `StorageNotInitialized`, was silently caught, and nothing re-triggered it once storage became ready — only an incidental tab-focus event did. Fixed by gating `<Stack>` mount behind `startupState.status === 'ready'` in `RootLayout`, so no screen exists (and therefore no storage read can happen) until startup completes. See `docs/superpowers/specs/2026-06-08-gate-stack-on-startup-ready-design.md`.
```

Use the actual current date's session header if `docs/TASKS.md` already has one open for today; otherwise add a new `### Session <date>` heading following the existing format (see `### Session 2026-06-07`).

- [ ] **Step 2: Commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record startup-race fix for Wallet home credential loading"
```
