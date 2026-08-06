# Phase 4 Screen Capture + Route Error Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable focus-scoped screen capture prevention on four sensitive tab screens (with tester env override) and add scoped `console.error` logging to bare `catch` blocks in `auth`, `credentials`, and `wallets` server routes.

**Architecture:** Restore `useScreenCaptureGuard` using `useFocusEffect` + `expo-screen-capture` async APIs (fixes prior My QR leak). Add `server/src/logging/routeError.ts` and call it from eight route catch sites before unchanged 500 responses. Mobile `authService.ts` already logs — TASKS-only update.

**Tech Stack:** Expo SDK 54, `expo-screen-capture@~8.0.9`, expo-router `useFocusEffect`, Jest + `@testing-library/react-native`, Express (`server/`), TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-14-phase4-screen-capture-and-route-logging-design.md`

## Global constraints

- My QR (`app/(tabs)/qr.tsx`) must never call `useScreenCaptureGuard`.
- Do not use `usePreventScreenCapture()` — window-level flag leaks to other tabs.
- Server logs: no email, password, token, or credential JWT in log metadata.
- Do not modify `devWallet.ts` or `devIssuerProxy.ts`.
- After each task group: `yarn tsc --noEmit`, `yarn lint`, focused tests; `cd server && yarn tsc && yarn test` for server tasks.
- Do not commit unless the user explicitly requests it.

## File map

| Action | Path |
|--------|------|
| Create | `src/hooks/useScreenCaptureGuard.ts` |
| Create | `src/hooks/useScreenCaptureGuard.test.tsx` |
| Modify | `app/(tabs)/index.tsx` |
| Modify | `app/(tabs)/credential/[id].tsx` |
| Modify | `app/(tabs)/scan.tsx` |
| Modify | `app/(tabs)/history.tsx` |
| Modify | `.env.example` |
| Modify | `.env.development.local.example` |
| Create | `server/src/logging/routeError.ts` |
| Create | `server/src/logging/routeError.test.ts` |
| Modify | `server/src/routes/auth.ts` |
| Modify | `server/src/routes/credentials.ts` |
| Modify | `server/src/routes/wallets.ts` |
| Modify | `docs/TASKS.md` |

---

### Task 1: Screen capture guard hook

**Files:**
- Create: `src/hooks/useScreenCaptureGuard.ts`
- Create: `src/hooks/useScreenCaptureGuard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useScreenCaptureGuard.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react-native'
import * as ScreenCapture from 'expo-screen-capture'

import { useScreenCaptureGuard } from './useScreenCaptureGuard'

const useFocusEffectMock = jest.fn()
let focusCleanup: (() => void) | undefined

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => useFocusEffectMock(callback),
}))

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
}))

const preventMock = ScreenCapture.preventScreenCaptureAsync as jest.Mock
const allowMock = ScreenCapture.allowScreenCaptureAsync as jest.Mock

function runFocusEffect() {
  const callback = useFocusEffectMock.mock.calls.at(-1)?.[0] as (() => void | (() => void)) | undefined
  if (!callback) throw new Error('useFocusEffect was not called')
  focusCleanup = callback() as (() => void) | undefined
}

describe('useScreenCaptureGuard', () => {
  const originalEnv = process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD

  afterEach(() => {
    jest.clearAllMocks()
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD
    } else {
      process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD = originalEnv
    }
    focusCleanup = undefined
  })

  test('prevents capture on focus and allows on blur when guard is enabled', async () => {
    delete process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD

    renderHook(() => useScreenCaptureGuard())
    runFocusEffect()

    expect(preventMock).toHaveBeenCalledTimes(1)
    expect(allowMock).not.toHaveBeenCalled()

    focusCleanup?.()
    await Promise.resolve()

    expect(allowMock).toHaveBeenCalledTimes(1)
  })

  test('skips prevent and allow when disable env is true', () => {
    process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD = 'true'

    renderHook(() => useScreenCaptureGuard())
    runFocusEffect()
    focusCleanup?.()

    expect(preventMock).not.toHaveBeenCalled()
    expect(allowMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/hooks/useScreenCaptureGuard.test.tsx`

Expected: FAIL — module `./useScreenCaptureGuard` not found

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useScreenCaptureGuard.ts`:

```ts
import { useFocusEffect } from 'expo-router'
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture'
import { useCallback } from 'react'

import { logWalletError } from '../services/debug/walletLogger'

function isScreenCaptureGuardEnabled(): boolean {
  return process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD !== 'true'
}

export function useScreenCaptureGuard(): void {
  useFocusEffect(
    useCallback(() => {
      if (!isScreenCaptureGuardEnabled()) {
        return undefined
      }

      let active = true

      void preventScreenCaptureAsync().catch((error) => {
        logWalletError('screen-capture', 'prevent-failed', error)
      })

      return () => {
        if (!active) return
        active = false
        void allowScreenCaptureAsync().catch((error) => {
          logWalletError('screen-capture', 'allow-failed', error)
        })
      }
    }, []),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/hooks/useScreenCaptureGuard.test.tsx`

Expected: PASS (2 tests)

---

### Task 2: Wire guard into four tab screens

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/credential/[id].tsx`
- Modify: `app/(tabs)/scan.tsx`
- Modify: `app/(tabs)/history.tsx`

- [ ] **Step 1: Add hook to Wallet Home**

In `app/(tabs)/index.tsx`, add import:

```ts
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard'
```

Inside `export default function` body, as the first hook call after any existing hooks at top of component:

```ts
  useScreenCaptureGuard()
```

- [ ] **Step 2: Add hook to Credential Detail**

In `app/(tabs)/credential/[id].tsx`, add import:

```ts
import { useScreenCaptureGuard } from "../../../src/hooks/useScreenCaptureGuard";
```

Inside the default export component, near other hooks:

```ts
  useScreenCaptureGuard();
```

- [ ] **Step 3: Add hook to Scan**

In `app/(tabs)/scan.tsx`, add import:

```ts
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard'
```

Inside the default export component:

```ts
  useScreenCaptureGuard()
```

- [ ] **Step 4: Add hook to History Log**

In `app/(tabs)/history.tsx`, add import:

```ts
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard';
```

Inside `HistoryLogScreen`:

```ts
  useScreenCaptureGuard();
```

- [ ] **Step 5: Verify My QR unchanged**

Run: `rg "useScreenCaptureGuard" app/(tabs)/qr.tsx`

Expected: no matches

- [ ] **Step 6: Typecheck**

Run: `yarn tsc --noEmit`

Expected: exit 0

---

### Task 3: Document env override

**Files:**
- Modify: `.env.example`
- Modify: `.env.development.local.example`

- [ ] **Step 1: Add to `.env.example`**

Append before OID4VP issuer block (or after header comments):

```bash
# Screen capture prevention on Wallet Home, Credential Detail, Scan, and History.
# Set to true to allow tester screenshots on sensitive screens. Default: guard active.
# EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true
```

- [ ] **Step 2: Add to `.env.development.local.example`**

After the wallet debug logs section, add:

```bash
# Allow tester screenshots on sensitive screens (disables FLAG_SECURE while focused).
# EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true
```

---

### Task 4: Server route error logging helper

**Files:**
- Create: `server/src/logging/routeError.ts`
- Create: `server/src/logging/routeError.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/logging/routeError.test.ts`:

```ts
import { logRouteError } from './routeError'

describe('logRouteError', () => {
  test('logs scoped tag and error object', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = new Error('db-down')

    logRouteError('auth', 'login', err)

    expect(errorSpy).toHaveBeenCalledWith('[wallet-api:auth] login-failed', err)
    errorSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && yarn test src/logging/routeError.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

Create `server/src/logging/routeError.ts`:

```ts
export type RouteErrorScope = 'auth' | 'credentials' | 'wallets'

export function logRouteError(scope: RouteErrorScope, operation: string, error: unknown): void {
  console.error(`[wallet-api:${scope}] ${operation}-failed`, error)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && yarn test src/logging/routeError.test.ts`

Expected: PASS

---

### Task 5: Wire logging into route catch blocks

**Files:**
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/routes/credentials.ts`
- Modify: `server/src/routes/wallets.ts`

- [ ] **Step 1: Update `auth.ts`**

Add import at top:

```ts
import { logRouteError } from '../logging/routeError'
```

Replace each bare catch with named error + log (keep response bodies unchanged):

| Location | Operation slug |
|----------|----------------|
| `POST /email-status` (or equivalent exists route) | `email-status` |
| Login handler | `login` |
| Pin reset request | `pin-reset-request` |
| Pin reset verify | `pin-reset-verify` |
| Pin reset confirm | `pin-reset-confirm` |
| Logout `revokeSession` inner catch | `logout-revoke-session` |

Example pattern:

```ts
  } catch (error) {
    logRouteError('auth', 'login', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
```

For logout inner catch (best-effort — no 500 to client):

```ts
    } catch (error) {
      logRouteError('auth', 'logout-revoke-session', error)
    }
```

- [ ] **Step 2: Update `credentials.ts`**

Add import:

```ts
import { logRouteError } from '../logging/routeError'
```

Replace import credential catch:

```ts
  } catch (error) {
    logRouteError('credentials', 'import-credential', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
```

- [ ] **Step 3: Update `wallets.ts`**

Add import:

```ts
import { logRouteError } from '../logging/routeError'
```

Replace wallets list catch:

```ts
  } catch (error) {
    logRouteError('wallets', 'list-wallets', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
```

- [ ] **Step 4: Run server tests**

Run: `cd server && yarn tsc && yarn test`

Expected: all pass

---

### Task 6: Update TASKS.md

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Mark screen capture done**

Change:

```markdown
[ ] Screen capture prevention (temporarily removed for tester builds)
```

To:

```markdown
[x] Screen capture prevention: focus-scoped `useScreenCaptureGuard` on Wallet Home, Credential Detail, Scan, and History; My QR excluded; disable via `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true`. Spec: `docs/superpowers/specs/2026-07-14-phase4-screen-capture-and-route-logging-design.md`.
```

- [ ] **Step 2: Update advisory error-logging item**

Replace the advisory line about swallowed catches with:

```markdown
[x] Advisory: route error logging — `authService.ts` already uses `logWalletError`; `server/src/routes/{auth,credentials,wallets}.ts` now log via `logRouteError` before 500 responses. Dev routes unchanged.
[ ] Advisory: local-backend auth oracle cleanup still open only for registration email enumeration — ...
```

(Keep the email enumeration line unchanged.)

- [ ] **Step 3: Add session note**

Under `## Active Session Notes`, add:

```markdown
### Session 2026-07-14 (Phase 4 screen capture + route logging)

- Restored `useScreenCaptureGuard` on Home, Credential Detail, Scan, History; tester override `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true`.
- Added `server/src/logging/routeError.ts` and wired auth/credentials/wallets catch blocks.
- Plan: `docs/superpowers/plans/2026-07-14-phase4-screen-capture-and-route-logging.md`.
```

---

### Task 7: Final verification

- [ ] **Step 1: Root checks**

Run:

```bash
yarn tsc --noEmit
yarn lint
yarn test src/hooks/useScreenCaptureGuard.test.tsx
```

Expected: all pass (lint may show pre-existing warnings — record, do not fix unrelated)

- [ ] **Step 2: Server checks**

Run:

```bash
cd server && yarn tsc && yarn test
```

Expected: pass

- [ ] **Step 3: Manual smoke (optional on device)**

1. Without env override: open Credential Detail → attempt screenshot → should block on Android (`FLAG_SECURE`) / iOS capture UI.
2. Set `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true`, restart Metro → screenshot should work on guarded screens.
3. Open My QR tab → screenshot should work in both configurations.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `useScreenCaptureGuard` hook | Task 1 |
| Four guarded screens | Task 2 |
| My QR excluded | Task 2 step 5 |
| Env disable flag | Task 1 + Task 3 |
| `logRouteError` helper | Task 4 |
| auth/credentials/wallets catches | Task 5 |
| authService audit only | Task 6 |
| Tests | Tasks 1, 4, 7 |
| TASKS.md | Task 6 |
