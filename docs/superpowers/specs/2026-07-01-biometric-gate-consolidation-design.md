# Plan: Consolidate biometric gate, fix inconsistent fingerprint/face availability

## Context

User asked: can every biometric-gated screen show both fingerprint and face scan together.

Reality: OS controls modality display. iOS: one sensor type per device (Face ID or Touch ID),
never both — not fixable in app code. Android: `BiometricPrompt` surfaces whatever's enrolled
that matches the authenticator bitmask the app requests — so "both" already happens today when
the mask is broad enough and the device has both enrolled.

Investigation found the real, pre-existing bug behind the user's earlier complaint in this same
session ("บางทีสแกนนิ้วบ้าง ไม่บ้าง" — sometimes fingerprint prompt shows, sometimes not):
3 near-duplicate biometric call sites each independently decide native-module vs
`react-native-biometrics`-fallback, and the two paths use different Android authenticator masks:

- `modules/etda-wallet-eddsa/android/.../EtdaWalletWeakBiometrics.kt:19-20` — native module,
  mask = `BIOMETRIC_WEAK | BIOMETRIC_STRONG` (broad — includes class-2 "weak" face unlock).
- `react-native-biometrics` fallback (`node_modules/react-native-biometrics/android/.../ReactNativeBiometrics.java:188-201`),
  used by `walletUnlockBiometric.ts` and `presentationApproval.ts` when native module absent —
  mask = `BIOMETRIC_STRONG` only, hardcoded in the library, no public option to widen.

Because 3 separately-written call sites each independently roll their own native-first/fallback
logic, the effective modality set drifts across screens/devices unpredictably. Fix: consolidate
into one shared implementation (per CLAUDE.md's "same job, same code" rule) so the same
device gets the same modality behavior everywhere, and never silently drops an enrolled
biometric.

**Non-goal:** iOS is untouched — no `LAPolicy`/`biometryType` restriction exists there; OS
decides Face ID vs Touch ID per device, one sensor type only. "Show both at once" isn't
achievable there or meaningful (a phone has one sensor). The deliverable is: stop inconsistently
excluding an enrolled modality across screens.

## Design

### 1. New shared module: `src/services/auth/biometricGate.ts`

Extract the native-then-fallback logic (currently duplicated in `walletUnlockBiometric.ts` and
`presentationApproval.ts`) into one parameterized implementation:

```ts
type BiometricGateOptions = {
  promptMessage: string
  cancelButtonText: string
  logScope: string      // 'wallet-unlock' | 'oid4vp' | 'storage'
  errorPrefix: string    // 'WalletUnlockBiometric' | 'PresentationBiometric' | 'StorageUnlock'
}

function confirmBiometricGate(options: BiometricGateOptions): Promise<void>
function isBiometricGateCancellation(error: unknown, errorPrefix: string): boolean
```

Internals: same try-native-first (`authenticateWeakBiometric`), fallback-to-`react-native-biometrics`
structure as today, logging via `logWalletStep`/`logWalletError` with `logScope`, throwing
`${errorPrefix}Cancelled` / `${errorPrefix}Unavailable...` / `${errorPrefix}Failed` to preserve
today's error-message contracts (existing tests match these strings).

### 2. Fix the Android modality mismatch (behavioral, not parametric)

`react-native-biometrics`'s Android native code hardcodes `BIOMETRIC_STRONG`; it can't be
widened from JS. So instead: only fall through to it when the native module is genuinely
unavailable (`!isNativeWeakBiometricAvailable()`). Because all Android call sites now resolve
through the one shared `confirmBiometricGate`, this check happens identically everywhere —
modality availability becomes deterministic per device instead of drifting per call site.

### 3. Update call sites (single prompt-per-action preserved)

- `src/services/auth/walletUnlockBiometric.ts` — `confirmWalletUnlockBiometric()` becomes a thin
  wrapper over `confirmBiometricGate` (logScope=`wallet-unlock`, errorPrefix=`WalletUnlockBiometric`).
  `isWalletUnlockBiometricCancellation` delegates to `isBiometricGateCancellation`. No changes
  needed at call sites `app/pin-lock.tsx:64` or `src/services/crypto/walletKeyRotation.ts:69`.
- `src/services/vp/presentationApproval.ts` — `confirmPresentationBiometric()` becomes a thin
  wrapper (logScope=`oid4vp`, errorPrefix=`PresentationBiometric`). Remove the duplicated
  try/native/fallback block and the now-unused `ReactNativeBiometrics` import. No change needed
  at `app/(tabs)/scan.tsx:326`.
- `src/services/storage/storage.ts` — `getOrCreateEncryptionKey()`'s Android-only direct
  `authenticateWeakBiometric` call routes through `confirmBiometricGate` too (logScope=`storage`,
  errorPrefix=`StorageUnlock`), preserving the existing `Platform.OS === 'android'` guard and
  the `StorageUnlockCancelled` error string. iOS storage path is untouched — it already gates via
  Keychain's `BIOMETRY_ANY_OR_DEVICE_PASSCODE` access control (implicit prompt on Keychain read),
  and routing it through the shared gate too would cause a double prompt, violating the
  one-biometric-prompt-per-action rule.

## Test updates

- Any biometric-service tests for `walletUnlockBiometric.ts`/`presentationApproval.ts`: retarget
  mocks to the new `biometricGate.ts` seam; error-message assertions must still pass unchanged.
- `src/components/StartupStoragePinUnlock.test.tsx`, `src/screens/PinLockScreen.test.tsx`: these
  mock `confirmWalletUnlockBiometric` (public API unchanged) — should need no changes unless they
  mock `react-native-biometrics`/`nativeEddsaSigner` directly.
- `src/services/storage/storage.test.ts`: update the Android-branch mock to point at
  `confirmBiometricGate` (or keep mocking `authenticateWeakBiometric`/`isNativeWeakBiometricAvailable`
  if `biometricGate.ts` still calls through them — confirm while coding); assert
  `StorageUnlockCancelled` still thrown on cancel.
- Add `src/services/auth/biometricGate.test.ts`: native-available path (Android),
  native-unavailable fallback path (Android), iOS path, cancellation/error-prefix behavior.

## Verification

```bash
yarn test src/services/auth/biometricGate.test.ts
yarn test src/services/auth/walletUnlockBiometric.test.ts
yarn test src/services/vp/presentationApproval.test.ts
yarn test src/services/storage/storage.test.ts
yarn test src/components/StartupStoragePinUnlock.test.tsx
yarn test src/screens/PinLockScreen.test.tsx
yarn tsc --noEmit
```

## Critical files

- `src/services/auth/walletUnlockBiometric.ts`
- `src/services/vp/presentationApproval.ts`
- `src/services/storage/storage.ts`
- `src/services/crypto/nativeEddsaSigner.ts`
- `modules/etda-wallet-eddsa/android/src/main/java/.../EtdaWalletWeakBiometrics.kt` (reference only, no change expected)
