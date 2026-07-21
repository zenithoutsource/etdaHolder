# Android Wallet Backup Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Prevent Android backup restore from reintroducing Keychain/MMKV ciphertext that cannot be decrypted by the newly generated Android Keystore key, then return the approved test device to a clean wallet state.

**Architecture:** Disable Android application backup at the Expo configuration boundary so generated native manifests reject cloud backup and restore for all wallet-local data. Keep the existing same-install PIN recovery path unchanged; reinstall recovery is intentionally unsupported because the Ed25519 signing seed and its Holder DID binding cannot be reconstructed safely after the device-bound Keychain key is lost.

**Tech Stack:** Expo SDK 54 app configuration, React Native, TypeScript, Jest, Android Gradle tooling, ADB.

## Global Constraints

- Preserve the existing dirty worktree and do not stage or rewrite unrelated user changes.
- Add no dependency and no native signing or storage implementation.
- Do not add an automatic storage wipe to application startup.
- Keep all new names neutral; do not add legacy customer naming.
- Treat the connected-device reset as destructive but authorized by the user for this incident.
- Install the manifest fix before clearing device data.
- Use the package identifier read from `app.json`; do not copy it into new documentation or scripts.
- Record exact verification outcomes in `docs/TASKS.md`, including any pre-existing failures.

---

### Task 1: Lock Android backup off with a regression test

**Files:**

- Create: `src/config/androidBackupPolicy.test.ts`
- Modify: `app.json`
- Modify: `docs/SECURITY.md`

- [ ] **Step 1: Add a failing configuration test**

Create `src/config/androidBackupPolicy.test.ts`:

```ts
import appConfig from '../../app.json';

type AppConfigWithAndroidBackup = {
  expo: {
    android?: {
      allowBackup?: boolean;
    };
  };
};

describe('Android backup policy', () => {
  it('disables application backup for device-bound wallet data', () => {
    const config = appConfig as AppConfigWithAndroidBackup;

    expect(config.expo.android?.allowBackup).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm the security regression is exposed**

Run:

```powershell
yarn.cmd test src/config/androidBackupPolicy.test.ts --runInBand
```

Expected: FAIL because `expo.android.allowBackup` is currently undefined rather than `false`.

- [ ] **Step 3: Disable Android application backup in Expo configuration**

Add the following property to the existing `expo.android` object in `app.json`:

```json
"allowBackup": false
```

Keep the surrounding Android configuration and property order intact.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```powershell
yarn.cmd test src/config/androidBackupPolicy.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Document the security boundary**

Add this policy to the Android/build portion of `docs/SECURITY.md`:

```markdown
- Android application backup and restore is disabled through `expo.android.allowBackup = false`. Wallet Keychain entries, encrypted MMKV files, and their device-bound Android Keystore keys must not cross an installation boundary independently; a reinstall starts a new wallet and requires credential reissuance.
```

State explicitly that the existing PIN fallback is only a same-install recovery mechanism and does not make the Ed25519 signing seed portable.

- [ ] **Step 6: Verify Expo config and the generated Android manifest**

Run:

```powershell
$walletExpoConfig = yarn.cmd expo config --type public --json | ConvertFrom-Json
$walletExpoConfig.android.allowBackup
```

Expected: `False`.

Regenerate Android native output:

```powershell
yarn.cmd expo prebuild --clean --platform android
```

Then run:

```powershell
Select-String -LiteralPath 'android/app/src/main/AndroidManifest.xml' -Pattern 'android:allowBackup="false"'
```

Expected: one match in the generated `<application>` element.

- [ ] **Step 7: Run focused and project verification**

Run:

```powershell
yarn.cmd test src/config/androidBackupPolicy.test.ts src/services/storage/storage.test.ts src/services/startup/startupState.test.ts --runInBand
yarn.cmd tsc --noEmit
yarn.cmd lint
```

Expected: focused tests pass. TypeScript and lint pass, or any unrelated pre-existing failures are captured verbatim for the handoff.

- [ ] **Step 8: Review the slice without committing unrelated work**

Run:

```powershell
git diff -- app.json src/config/androidBackupPolicy.test.ts docs/SECURITY.md
git status --short
```

Expected: only the backup-policy edits appear in the scoped diff. Do not create an implementation commit while `docs/TASKS.md` contains overlapping unowned changes; preserve a reviewable working-tree handoff.

---

### Task 2: Remediate and verify the approved physical test device

**Files:**

- Modify: `docs/TASKS.md`
- Consume generated output: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Confirm the connected device and installed manifest fix**

Run:

```powershell
adb devices -l
$walletAppId = (Get-Content -Raw app.json | ConvertFrom-Json).expo.android.package
adb shell dumpsys package $walletAppId | Select-String -Pattern 'ALLOW_BACKUP'
```

Expected: the intended Samsung physical device is connected. If `ALLOW_BACKUP` is still present before the rebuilt APK is installed, continue to Step 2 and repeat this check after installation.

- [ ] **Step 2: Build and install the fixed Android debug application**

Run from `android/`:

```powershell
.\gradlew.bat installDebug
```

Expected: `BUILD SUCCESSFUL` and installation succeeds on the connected device.

Repeat the installed-package check from the repository root:

```powershell
$walletAppId = (Get-Content -Raw app.json | ConvertFrom-Json).expo.android.package
adb shell dumpsys package $walletAppId | Select-String -Pattern 'ALLOW_BACKUP'
```

Expected: no `ALLOW_BACKUP` flag for the installed package.

- [ ] **Step 3: Clear the approved, unrecoverable local wallet state**

Resolve the exact package from tracked configuration and clear only that package:

```powershell
$walletAppId = (Get-Content -Raw app.json | ConvertFrom-Json).expo.android.package
adb shell pm clear $walletAppId
```

Expected: `Success`. This removes the app's local Keychain/MMKV state, sessions, settings, and cached wallet data. It is not recoverable from the application after clearing.

- [ ] **Step 4: Launch against Metro and capture clean startup evidence**

Keep Metro running in a separate terminal:

```powershell
yarn.cmd start
```

Clear device logs, launch the installed app, and inspect wallet startup:

```powershell
adb logcat -c
$walletAppId = (Get-Content -Raw app.json | ConvertFrom-Json).expo.android.package
adb shell monkey -p $walletAppId -c android.intent.category.LAUNCHER 1
adb logcat -d -v threadtime ReactNativeJS:I RNKeychainManager:E '*:S' | Select-String -Pattern 'wallet:storage|wallet:startup|E_CRYPTO_FAILED|CryptoFailedException|AEADBadTagException'
```

Expected: storage initialization completes without `E_CRYPTO_FAILED`, `CryptoFailedException`, or `AEADBadTagException`. The app presents a new-wallet state because the old Holder DID and credentials were intentionally discarded.

- [ ] **Step 5: Record the completed implementation slice**

At the top of `docs/TASKS.md`, add a dated session entry that records:

- the confirmed `AEADBadTagException`/Android Keystore verification failure root cause;
- evidence that Keychain/MMKV files had been auto-restored on a fresh install;
- `expo.android.allowBackup = false` and the generated manifest check;
- focused test, TypeScript, and lint outcomes;
- the authorized physical-device clear and clean startup result;
- the requirement to reissue test credentials under the newly generated Holder DID.

Do not claim a check passed unless its command output was observed in this session.

- [ ] **Step 6: Final scoped review**

Run:

```powershell
git diff -- app.json src/config/androidBackupPolicy.test.ts docs/SECURITY.md docs/TASKS.md
git status --short
```

Expected: the final diff contains only the intended policy, regression test, and durable security/task documentation additions among the pre-existing user changes.

## Self-Review Gate

- [ ] Confirm every approved design requirement maps to a task above: backup disabled, no startup auto-wipe, same-install PIN recovery retained, device reset performed only after installing the fixed manifest, credential reissuance documented.
- [ ] Confirm the configuration test fails before and passes after the `app.json` change.
- [ ] Confirm public type usage remains internal to the test and no runtime API surface changes.
- [ ] Scan the new plan and implementation for placeholder language and legacy customer naming:

```powershell
rg -n 'T[B]D|T[O]DO|implement later|fill in' docs/superpowers/plans/2026-07-21-android-wallet-backup-remediation.md src/config/androidBackupPolicy.test.ts | Where-Object { $_ -notmatch '^\d+:rg -n' }
```

- [ ] Confirm the generated manifest and installed package both reject Android backup before clearing the device.
- [ ] Confirm exact test/device evidence is written to `docs/TASKS.md` and that unrelated dirty-worktree changes remain untouched.
