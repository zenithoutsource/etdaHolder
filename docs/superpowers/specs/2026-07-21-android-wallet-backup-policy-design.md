# Android Wallet Backup Policy Design

## Status

Revised design approved on 2026-07-21 after final review identified the Android 12+ device-transfer boundary.

## Problem

Android Auto Backup was enabled by the Expo default. A fresh installation on the incident device restored the wallet's MMKV and React Native Keychain files, but Android did not restore the non-exportable Keystore AES keys that protected the Keychain ciphertext. The next storage read failed with `AEADBadTagException`, surfaced to JavaScript as `E_CRYPTO_FAILED` / `CryptoFailedException` with `Wrapped error: null`.

Restoring credential records without the original Ed25519 signing seed is not a usable wallet migration. The restored credentials remain bound to the old Holder DID, while the restored Keychain ciphertext cannot release the old signing seed.

Setting `android:allowBackup="false"` prevents cloud backup and restore, including the restore path that caused this incident. It is not the complete Android 12+ control: for applications targeting API level 31 or later, some manufacturers can still perform device-to-device migration when `allowBackup` is false. The wallet therefore also needs explicit legacy backup exclusions and Android 12+ cloud/device-transfer exclusions.

## Security Boundary

Local credentials, the MMKV encryption key, Wallet PIN recovery metadata, sessions, settings, history, cached state, and the Ed25519 signing seed are device-bound security state. Every supported Android application-data domain must be excluded from cloud backup, restore, and device-to-device transfer.

A reinstall or migration starts a new wallet. Wallet migration requires an explicit future protocol that re-establishes holder keys and reissues or securely transfers credentials; Android file transfer is not that protocol. The existing PIN-wrapped fallback remains a same-install recovery mechanism and does not make the signing seed or Holder DID portable.

## Considered Approaches

### 1. Expo config plugin with complete backup rules — selected

Keep Expo `android.allowBackup` set to `false` and add a neutral local config plugin that generates both legacy and Android 12+ exclusion resources and connects them to the application manifest. This is reproducible under Continuous Native Generation and survives `expo prebuild --clean`.

Tradeoff: the plugin owns small native XML resources and must be covered by configuration tests. Reinstalling or moving to another device deliberately discards local wallet state, so the Holder must authenticate again and reissue credentials.

### 2. Edit generated Android resources directly

Directly editing `android/app/src/main/AndroidManifest.xml` and `res/xml` is mechanically simple, but the native Android directory is generated and ignored. `expo prebuild --clean` can erase the protection.

Rejected because the security boundary must be reproducible from tracked source configuration.

### 3. Relocate or exclude individual wallet stores

Moving selected files into no-backup storage or naming only current Keychain/MMKV paths could reduce the exclusion list. It is fragile: preferences, history, sessions, or future stores could silently become transferable, and partially restored state has no product value.

Rejected because the policy is installation-bound wallet identity, not selective portability.

## Architecture and Components

### Expo configuration

`app.json` keeps `expo.android.allowBackup = false` and registers `./plugins/with-android-backup-rules.js` next to the existing local Android plugin.

### Local config plugin

`plugins/with-android-backup-rules.js` has one responsibility: materialize the Android backup policy during prebuild.

- A manifest mod sets `android:fullBackupContent="@xml/wallet_backup_rules"` for Android 11 and earlier.
- The same manifest mod sets `android:dataExtractionRules="@xml/wallet_data_extraction_rules"` for Android 12 and later.
- An Android file mod creates the `res/xml` directory and writes both resources deterministically.
- Repeated plugin execution produces identical XML and does not duplicate manifest attributes.

The plugin exports testable policy constants or pure render helpers without introducing a runtime mobile API.

### Legacy resource

`wallet_backup_rules.xml` uses `<full-backup-content>` and excludes path `.` from every supported application-data domain:

- `root`
- `file`
- `database`
- `sharedpref`
- `external`
- `device_root`
- `device_file`
- `device_database`
- `device_sharedpref`

### Android 12+ resource

`wallet_data_extraction_rules.xml` uses `<data-extraction-rules>`. It repeats the complete domain exclusion list under both `<cloud-backup>` and `<device-transfer>`. Neither mode relies on omitted-section defaults.

## Failure Handling

Prebuild must fail with a descriptive error if the application manifest has no `<application>` element or if either XML resource cannot be written. A partially generated policy is not accepted as a successful build.

The runtime storage and signing implementation remains unchanged. The app must not automatically wipe storage when a Keychain read fails because same-install PIN recovery can still preserve data. The completed incident reset remains an explicit, operator-approved action and is not repeated during this revision.

## Testing

Tests follow red-green order:

1. Extend the committed configuration test so it fails while the local plugin is unregistered.
2. Add a Node-side plugin policy test that fails before the plugin exists and then verifies both manifest attributes, all domain exclusions in both XML formats, deterministic output, and idempotent application.
3. Implement the minimal plugin and make the focused tests pass.
4. Run focused storage and startup suites to prove the runtime recovery path is unchanged.

Generated-output verification must run `expo prebuild --clean --platform android` and assert:

- `android:allowBackup="false"` remains in the application element;
- both manifest rule references are present;
- both XML resources exist;
- the legacy resource excludes every domain once;
- the Android 12+ resource excludes every domain once under cloud backup and once under device transfer.

The packaged APK must be inspected to confirm the manifest references and XML resources survived Android packaging. Project TypeScript and lint commands still run; unrelated existing failures are recorded exactly rather than described as passing.

## Rollout and Device Verification

The revised APK is built from the proven short physical checkout to avoid the diagnosed legacy Ninja long-path failure. It is installed only on the explicitly selected incident-device transport. The installed package must still report no `ALLOW_BACKUP` flag and must reach wallet-ready state without the original crypto failure.

The application data is not cleared again. The previous incident reset already created a new Holder DID and empty wallet, and credentials must be reissued under that DID.

SM-S928B verification is incident evidence only. It does not satisfy the production Galaxy A26 plus ACR1311U-N2 validation gate. A target-device release validation must not claim device-to-device migration behavior as supported until the negative transfer case is physically exercised on the target hardware.

## Documentation

`docs/SECURITY.md` must describe `allowBackup=false` as the cloud-backup control and the generated XML rules as the explicit cloud/device-transfer exclusions. It must not claim that `allowBackup=false` alone disables every Android migration path.

`docs/TASKS.md` must record the review-discovered gap, the additional controls, focused/generated/APK verification, device installation result, and the remaining target-hardware migration validation boundary.
