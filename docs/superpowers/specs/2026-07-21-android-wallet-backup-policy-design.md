# Android Wallet Backup Policy Design

## Status

Approved for implementation on 2026-07-21.

## Problem

Android Auto Backup is currently enabled by the Expo default. A fresh installation on the test device restored the wallet's MMKV and React Native Keychain files, but Android did not restore the non-exportable Keystore AES keys that protected the Keychain ciphertext. The next storage read failed with `AEADBadTagException`, surfaced to JavaScript as `E_CRYPTO_FAILED` / `CryptoFailedException` with `Wrapped error: null`.

Restoring credential records without the original Ed25519 signing seed is not a usable wallet migration. The restored credentials remain bound to the old Holder DID, while the restored Keychain ciphertext cannot release the old signing seed.

## Security Boundary

Local credentials, the MMKV encryption key, Wallet PIN recovery metadata, sessions, and the Ed25519 signing seed are device-bound security state. They must not be copied through Android cloud or device-to-device application backup. Wallet migration requires an explicit future protocol that re-establishes holder keys and reissues or securely transfers credentials; Android file restore is not that protocol.

## Considered Approaches

### 1. Disable application backup entirely — selected

Set Expo `android.allowBackup` to `false`, which generates `android:allowBackup="false"`. Android will neither back up nor restore the application's files. This is the smallest production-grade control and matches the wallet's device-bound key model.

Tradeoff: reinstalling or moving to another device starts a new local wallet. The Holder must authenticate again and reissue credentials.

### 2. Keep backup enabled but exclude Keychain and MMKV

Custom Android backup rules could exclude the Keychain DataStore and MMKV files while retaining non-sensitive preferences. The wallet currently has no application data worth restoring independently, and an incomplete exclusion list could silently reintroduce the failure or leak sensitive metadata.

Rejected because it adds native configuration complexity without a product benefit.

### 3. Restore MMKV through the PIN-wrapped fallback

The existing PIN-wrapped MMKV key can recover credential display data when the Keychain item becomes unreadable in the same installation. It cannot recover the Ed25519 signing seed after an Android restore, so restored credentials would no longer have their holder-binding key.

Rejected as a migration mechanism. The fallback remains available for its existing same-install recovery purpose.

## Implementation

1. Add a regression test that reads the committed Expo configuration and requires `expo.android.allowBackup` to be `false`.
2. Set `android.allowBackup` to `false` in `app.json`.
3. Regenerate the Android native project and verify the merged application manifest contains `android:allowBackup="false"`.
4. Document the backup prohibition in `docs/SECURITY.md` and record the completed slice in `docs/TASKS.md`.
5. Clear the currently restored test-device application data, because changing the manifest cannot repair ciphertext already restored with a missing Keystore key.

## Error Handling

The existing raw, redacted storage diagnostic remains unchanged. The app must not automatically wipe storage merely because a Keychain read fails: same-install PIN recovery can still preserve data. The one-time test-device reset is an explicit operator action approved for this incident.

## Verification

- The new configuration regression test fails before the `app.json` change and passes afterward.
- `npx expo config --type public --json` reports `android.allowBackup: false`.
- Android prebuild produces `android:allowBackup="false"`.
- Focused storage/startup tests pass.
- `yarn tsc --noEmit` and `yarn lint` pass, or unrelated existing blockers are recorded.
- After application data is cleared, the connected physical device completes clean storage initialization without `E_CRYPTO_FAILED`.
