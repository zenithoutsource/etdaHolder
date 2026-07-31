# Credential Delete Biometric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the same OS biometric alternative used by other Wallet PIN screens to credential deletion.

**Architecture:** Add a thin deletion-specific wrapper around the shared `confirmBiometricGate()` service so prompt copy, diagnostics, and cancellation classification remain scoped to credential deletion. Wire that wrapper into the existing credential-detail PIN verification phase; successful PIN or biometric authentication enters the unchanged approval and deletion flow.

**Tech Stack:** React Native, Expo SDK 54, `expo-local-authentication`, Expo Router, NativeWind, Jest, React Native Testing Library.

## Global Constraints

- Deletion is a non-signing action and must trigger at most one authentication event.
- Biometric authentication is an alternative to PIN, not an additional requirement.
- Do not add an app-level biometric prompt to Revoke; its signing-time gate remains authoritative.
- PIN setup and PIN confirmation must not expose biometric authentication.
- Cancellation is a normal outcome; other failures must be logged before friendly UI mapping.
- Never log credential claims, raw credentials, PIN values, biometric data, tokens, or key material.
- Reuse `PinEntrySurface` and `confirmBiometricGate()`; do not create duplicate PIN or biometric implementations.
- Use NativeWind for UI styling and preserve the existing credential deletion service.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Credential deletion biometric service

**Files:**
- Create: `src/services/credentials/credentialDeletionBiometric.ts`
- Create: `src/services/credentials/credentialDeletionBiometric.test.ts`

**Interfaces:**
- Consumes: `confirmBiometricGate(options): Promise<void>` and `isBiometricGateCancellation(error, prefix): boolean` from `src/services/auth/biometricGate.ts`.
- Produces: `confirmCredentialDeletionBiometric(): Promise<void>` and `isCredentialDeletionBiometricCancellation(error: unknown): boolean`.

- [ ] **Step 1: Write the failing service test**

Create a focused test that mocks only the OS-facing shared gate and verifies the deletion wrapper's public contract:

```ts
import {
  confirmCredentialDeletionBiometric,
  isCredentialDeletionBiometricCancellation,
} from './credentialDeletionBiometric'

const mockConfirmBiometricGate = jest.fn()
const mockIsBiometricGateCancellation = jest.fn()

jest.mock('../auth/biometricGate', () => ({
  confirmBiometricGate: (...args: unknown[]) => mockConfirmBiometricGate(...args),
  isBiometricGateCancellation: (...args: unknown[]) =>
    mockIsBiometricGateCancellation(...args),
}))

describe('credential deletion biometric approval', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConfirmBiometricGate.mockResolvedValue(undefined)
  })

  test('uses the shared biometric gate with deletion-specific diagnostics', async () => {
    await confirmCredentialDeletionBiometric()

    expect(mockConfirmBiometricGate).toHaveBeenCalledWith({
      promptMessage: 'ยืนยันตัวตนเพื่อลบเอกสาร',
      cancelButtonText: 'ยกเลิก',
      logScope: 'credential-delete',
      errorPrefix: 'CredentialDeletionBiometric',
    })
  })

  test('classifies cancellation with the deletion error prefix', () => {
    const error = new Error('CredentialDeletionBiometricCancelled')
    mockIsBiometricGateCancellation.mockReturnValueOnce(true)

    expect(isCredentialDeletionBiometricCancellation(error)).toBe(true)
    expect(mockIsBiometricGateCancellation).toHaveBeenCalledWith(
      error,
      'CredentialDeletionBiometric',
    )
  })
})
```

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
yarn test src/services/credentials/credentialDeletionBiometric.test.ts --runInBand
```

Expected: FAIL because `credentialDeletionBiometric.ts` does not exist.

- [ ] **Step 3: Implement the minimal wrapper**

```ts
import {
  confirmBiometricGate,
  isBiometricGateCancellation,
} from '../auth/biometricGate'

const ERROR_PREFIX = 'CredentialDeletionBiometric'

export function isCredentialDeletionBiometricCancellation(error: unknown): boolean {
  return isBiometricGateCancellation(error, ERROR_PREFIX)
}

export async function confirmCredentialDeletionBiometric(): Promise<void> {
  await confirmBiometricGate({
    promptMessage: 'ยืนยันตัวตนเพื่อลบเอกสาร',
    cancelButtonText: 'ยกเลิก',
    logScope: 'credential-delete',
    errorPrefix: ERROR_PREFIX,
  })
}
```

- [ ] **Step 4: Run the service test and verify GREEN**

Run:

```bash
yarn test src/services/credentials/credentialDeletionBiometric.test.ts --runInBand
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit the service slice**

```bash
git add src/services/credentials/credentialDeletionBiometric.ts src/services/credentials/credentialDeletionBiometric.test.ts
git commit -m "feat: add credential delete biometric gate"
```

### Task 2: Credential detail Delete PIN integration

**Files:**
- Modify: `app/(tabs)/credential/[id].tsx`
- Create: `src/screens/CredentialDetailDeleteBiometric.test.tsx`

**Interfaces:**
- Consumes: `confirmCredentialDeletionBiometric()` and `isCredentialDeletionBiometricCancellation(error)` from Task 1.
- Consumes: `isBiometricDisabledForTesting()` from `src/config/runtimeFlags.ts`.
- Produces: Delete verification UI with the existing `pin-key-fingerprint` control and unchanged approval/deletion phases.

- [ ] **Step 1: Write failing screen tests**

Use the real `PinEntrySurface` and `PinKeypad`, mock only routing, storage-backed services, the OS biometric wrapper, and unrelated detail-card surfaces. Drive the real UI from the action menu into Delete:

```ts
test('offers biometric authentication while verifying Delete', () => {
  render(<CredentialDetailScreen />)
  fireEvent.press(screen.getByLabelText('Open credential actions'))
  fireEvent.press(screen.getByTestId('credential-delete-action'))

  expect(screen.getByTestId('pin-key-fingerprint')).toBeTruthy()
})

test('moves to deletion approval after biometric success', async () => {
  mockConfirmCredentialDeletionBiometric.mockResolvedValueOnce(undefined)

  renderDeleteSecurityScreen()
  fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })
})

test('keeps PIN available without an error after biometric cancellation', async () => {
  mockConfirmCredentialDeletionBiometric.mockRejectedValueOnce(
    new Error('CredentialDeletionBiometricCancelled'),
  )
  mockIsCredentialDeletionBiometricCancellation.mockReturnValueOnce(true)

  renderDeleteSecurityScreen()
  fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

  await waitFor(() => {
    expect(screen.getByTestId('pin-key-1')).toBeTruthy()
  })
  expect(screen.queryByText(BIOMETRIC_FALLBACK_MESSAGE)).toBeNull()
})

test('keeps PIN available with a friendly message after biometric failure', async () => {
  mockConfirmCredentialDeletionBiometric.mockRejectedValueOnce(
    new Error('CredentialDeletionBiometricFailed'),
  )
  mockIsCredentialDeletionBiometricCancellation.mockReturnValueOnce(false)

  renderDeleteSecurityScreen()
  fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

  expect(
    await screen.findByText('Biometric verification failed. Enter your PIN instead.'),
  ).toBeTruthy()
  expect(screen.getByTestId('pin-key-1')).toBeTruthy()
})
```

The action-menu mock must render a real `Pressable`:

```tsx
jest.mock('../../src/components/CredentialActionMenu', () => ({
  CredentialActionMenu: ({ onDelete }: { onDelete: () => void }) => (
    <MockPressable testID="credential-delete-action" onPress={onDelete}>
      <MockText>Delete</MockText>
    </MockPressable>
  ),
}))
```

Set `hasWalletPin()` to `true` so tests exercise verification mode. Add one
separate fixture with `hasWalletPin()` returning `false`, enter the setup PIN,
and assert `pin-key-fingerprint` remains absent during setup and confirmation.

- [ ] **Step 2: Run the screen tests and verify RED**

Run:

```bash
yarn test src/screens/CredentialDetailDeleteBiometric.test.tsx --runInBand
```

Expected: FAIL because the Delete security phase does not enable the fingerprint
control and does not call the production deletion biometric wrapper.

- [ ] **Step 3: Replace the development bypass with the production gate**

Add imports:

```ts
import { isBiometricDisabledForTesting } from '../../../src/config/runtimeFlags'
import {
  confirmCredentialDeletionBiometric,
  isCredentialDeletionBiometricCancellation,
} from '../../../src/services/credentials/credentialDeletionBiometric'
```

Replace `handleFingerprintBypass()` with:

```ts
async function handleDeleteBiometric() {
  if (
    phase.tag !== 'security' ||
    phase.action !== 'Delete' ||
    phase.mode !== 'verify'
  ) {
    return
  }

  setPinError(null)
  if (isBiometricDisabledForTesting()) {
    setPhase({ tag: 'approve', action: phase.action })
    return
  }

  try {
    await confirmCredentialDeletionBiometric()
    setPhase({ tag: 'approve', action: phase.action })
  } catch (error) {
    if (isCredentialDeletionBiometricCancellation(error)) return
    setPinError('Biometric verification failed. Enter your PIN instead.')
  }
}
```

Enable the shared keypad control only for Delete verification:

```tsx
<PinEntrySurface
  title={titleByMode}
  subtitle={messageByMode}
  pin={pin}
  error={pinError}
  showFingerprint={
    phase.action === 'Delete' && phase.mode === 'verify'
  }
  onDigit={handleKeyPress}
  onBackspace={() => setPin((value) => value.slice(0, -1))}
  onFingerprint={() => {
    void handleDeleteBiometric()
  }}
/>
```

- [ ] **Step 4: Run the screen tests and verify GREEN**

Run:

```bash
yarn test src/screens/CredentialDetailDeleteBiometric.test.tsx --runInBand
```

Expected: all success, cancellation, failure, and setup/confirmation tests pass.

- [ ] **Step 5: Run the combined focused tests**

Run:

```bash
yarn test src/services/credentials/credentialDeletionBiometric.test.ts src/screens/CredentialDetailDeleteBiometric.test.tsx src/components/PinEntrySurface.test.tsx src/services/credentials/credentialDeletion.test.ts --runInBand
```

Expected: all suites pass.

- [ ] **Step 6: Commit the UI slice**

```bash
git add "app/(tabs)/credential/[id].tsx" src/screens/CredentialDetailDeleteBiometric.test.tsx
git commit -m "feat: add biometric credential deletion"
```

### Task 3: Tracker and complete verification

**Files:**
- Modify: `docs/TASKS.md`

**Interfaces:**
- Consumes: completed service and UI behavior from Tasks 1-2.
- Produces: durable implementation and verification record.

- [ ] **Step 1: Update the task tracker**

Add a current session entry recording:

- Delete PIN verification now exposes the shared OS biometric alternative.
- Success enters the unchanged approval screen.
- Cancellation is silent and real failures fall back to PIN.
- PIN setup/confirmation and Revoke behavior remain unchanged.
- Include exact verification results from the commands below.

- [ ] **Step 2: Run the complete verification set**

```bash
yarn test --runInBand
yarn tsc --noEmit
yarn lint
git diff --check
```

Expected:

- Jest exits 0 with no failed suites.
- Lint exits 0 with no errors.
- `git diff --check` exits 0.
- If TypeScript reports only the already-recorded callback-route, Keychain
  test-mock, and OID4VCI offer-cast diagnostics, record them as pre-existing;
  any diagnostic in touched files must be fixed before completion.

- [ ] **Step 3: Review the final diff**

Confirm that:

- exact credential deletion storage/lifecycle behavior is unchanged;
- no biometric prompt was added to Revoke;
- no biometric control appears in PIN setup or confirmation;
- no raw credential, PIN, or biometric data is logged;
- unrelated workspace changes remain unmodified and unstaged.

- [ ] **Step 4: Commit the tracker update**

```bash
git add docs/TASKS.md
git commit -m "docs: record credential delete biometric"
```
