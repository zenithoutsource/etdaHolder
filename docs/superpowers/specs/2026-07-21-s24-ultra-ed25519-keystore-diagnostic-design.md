# Galaxy S24 Ultra Ed25519 Keystore Diagnostic Design

## Purpose

Determine whether the connected Galaxy S24 Ultra can generate and use a non-exportable, hardware-backed Ed25519 signing key through `AndroidKeyStore`. The result is diagnostic evidence only and does not change the production signer or supersede ADR 0008.

## Observed baseline

The connected `SM-S928B` runs Android 16 (API 36) with the 2026-05-05 security patch. It advertises hardware-keystore Curve25519 feature version 200 and StrongBox.

The existing diagnostic produced these relevant results:

- direct `Ed25519` generator requests returned P-256-shaped EC public keys and could not produce Ed25519 signatures;
- existing `EC` plus `ECGenParameterSpec("ed25519")` recipes failed while AndroidKeyStore assembled the key certificate;
- P-256 controls succeeded in both the trusted environment and StrongBox.

The existing Curve25519 recipes do not use the complete Android CTS configuration, so the baseline is not yet a definitive Ed25519 result.

## Design

Add exactly two diagnostic-only recipes to `WalletKeystoreDiagnostics`:

1. Default security selection using `KeyPairGenerator("EC", "AndroidKeyStore")`, `ECGenParameterSpec("ed25519")`, `PURPOSE_SIGN | PURPOSE_VERIFY`, and `DIGEST_NONE`.
2. The same recipe with `setIsStrongBoxBacked(true)`.

Each recipe will use the existing isolated probe lifecycle: generate a unique alias, inspect the public key and `KeyInfo`, sign and verify a fixed non-sensitive message, log only non-secret metadata, and delete the alias in `finally`.

The diagnostic result will also record the generated signature length. The shared TypeScript result type and native log line will expose that integer alongside the existing sign/verify result.

No production signing path, wallet key, stored credential, protocol message, or app data will be changed. The debug APK will be installed with replacement semantics so existing app data remains intact.

## Pass criteria

A recipe proves hardware-backed Ed25519 only when all of the following are true:

- the public key SubjectPublicKeyInfo contains Ed25519 OID `1.3.101.112`;
- `Signature.getInstance("Ed25519")` signs and verifies successfully;
- the Ed25519 signature is 64 bytes;
- `KeyInfo.securityLevel` is `TRUSTED_ENVIRONMENT` or `STRONGBOX`;
- the private key remains represented by an AndroidKeyStore handle and is never exported.

The default recipe may prove trusted-environment support even if the explicit StrongBox recipe fails. Only a successful StrongBox recipe supports a StrongBox-backed Ed25519 claim.

## Verification procedure

1. Compile the native diagnostic module and debug Android application. The hardware-dependent AndroidKeyStore behavior is verified on the physical phone; this slice does not introduce an emulator-backed approximation or a new Android test harness.
2. Reinstall the debug APK on the connected `SM-S928B` without clearing data.
3. Launch the development client and capture `WalletKeystoreDiag` output through ADB.
4. Record the device fingerprint, Android version, API level, security patch, feature flags, exact recipe outcomes, public-key evidence, sign/verify outcome, signature length, and security level.
5. Run the project-required TypeScript, lint, and existing focused checks, reporting any unrelated pre-existing failures separately.

## Decision boundary

- If neither recipe passes, the S24 Ultra does not support hardware-backed Ed25519 through the tested public AndroidKeyStore API on this firmware.
- If only the default recipe passes with `TRUSTED_ENVIRONMENT`, hardware-backed Ed25519 is available in the trusted environment but not proven in StrongBox.
- If the StrongBox recipe passes with `STRONGBOX`, StrongBox-backed Ed25519 is available on this exact device and firmware.

Any positive result still requires a separate production signer design, key migration and credential reissuance policy, per-use authentication design, attestation policy, and cross-platform decision before ADR 0008 can be superseded.
