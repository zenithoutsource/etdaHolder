# Ed25519 Hardware-Backed Signing on Galaxy A26 and S24 Ultra

Status: Research complete; S24 Ultra physically revalidated; Galaxy A26 validation required
Last reviewed: 2026-07-21

## Executive finding

Hardware-backed Ed25519 signing is a real Android platform capability, but it is not proven merely by the Android version or the presence of Samsung Knox Vault.

The earlier Galaxy S24 Ultra conclusion in ADR 0007/0008 was not sufficiently supported by the recorded statement that AndroidKeyStore "generated an EC key." Android KeyMint deliberately represents Curve25519 through its generic EC algorithm internally, so an `EC` algorithm label by itself does not distinguish P-256 from Ed25519. The canonical Android CTS recipes have now been run on the exact firmware recorded below.

The correct conclusion as of this review is:

- **Galaxy A26:** a strong candidate for hardware-backed Ed25519 because it launched on Android 15 and includes Knox Vault, but the exact device SKU and firmware remain unverified.
- **Galaxy S24 Ultra:** Galaxy S24 Ultra SM-S928B on the recorded Android 16 firmware advertises Curve25519 hardware-keystore version 200, but both canonical CTS recipes failed Ed25519 generation/signing requirements. Hardware-backed Ed25519 is unsupported through the tested public AndroidKeyStore API on this exact firmware.
- **StrongBox/Knox Vault:** the tested S24 Ultra advertises the StrongBox feature, but its canonical StrongBox Ed25519 recipe was unsupported. Feature presence does not prove Ed25519 support for that security level.
- **Current wallet architecture:** ADR 0008 remains active, using the accepted Keychain-protected software Ed25519 signer. Galaxy A26 physical validation remains pending.

## 1. What "hardware-backed" must mean

These properties are different and must not be described as equivalent:

| Property | Meaning | Current wallet / evaluated library |
|---|---|---|
| Encrypted at rest with a hardware-protected wrapping key | Ed25519 private bytes are stored as ciphertext; a Keychain/Keystore key protects the ciphertext | Yes |
| Non-exportable AndroidKeyStore key | Private key material never enters the app process; signing is delegated to AndroidKeyStore | No |
| TEE-backed Ed25519 | `KeyInfo.securityLevel == TRUSTED_ENVIRONMENT` | Unsupported through the canonical default recipe on the tested S24 firmware; unverified on A26 |
| StrongBox-backed Ed25519 | `KeyInfo.securityLevel == STRONGBOX`, ideally confirmed by attestation | Unsupported through the canonical StrongBox recipe on the tested S24 firmware; unverified on A26 |
| Remotely attestable hardware key | A trusted server validates the attestation chain, challenge, security level, boot state, and application identity | Not implemented |

Android explains that AndroidKeyStore key material never enters the application process and that `TRUSTED_ENVIRONMENT` or `STRONGBOX` from `KeyInfo.getSecurityLevel()` indicates secure hardware. It also warns that hardware backing depends on the exact algorithm and authorization combination, not only on the device having a secure element. See [Android Keystore system](https://developer.android.com/privacy-and-security/keystore).

## 2. Evaluated React Native keystore library

The package under review is `@algorandfoundation/react-native-keystore`. It is not a dependency of this repository; the current wallet uses `@noble/ed25519` with a seed stored through `react-native-keychain`.

Source review was pinned to upstream commit [`149ef2ab`](https://github.com/algorandfoundation/wallet-provider-extensions/tree/149ef2ab955460144de36af5ac2a3924cc4dd40a/keystore/react-native).

The evaluated library:

- persists seeds and private keys in MMKV after AES-256-GCM encryption;
- stores the AES master key in `react-native-keychain`;
- decrypts private material into application memory for derivation and signing;
- attempts to clear temporary buffers after use; and
- supports deterministic/HD Ed25519 derivation, which inherently requires access to seed material.

The upstream architecture explicitly says that MMKV stores encrypted private material while Keychain stores only the master encryption key. See its [architecture](https://github.com/algorandfoundation/wallet-provider-extensions/blob/149ef2ab955460144de36af5ac2a3924cc4dd40a/keystore/react-native/ARCHITECTURE.md), [storage encryption](https://github.com/algorandfoundation/wallet-provider-extensions/blob/149ef2ab955460144de36af5ac2a3924cc4dd40a/keystore/react-native/src/storage/crypto.ts), and [MMKV persistence](https://github.com/algorandfoundation/wallet-provider-extensions/blob/149ef2ab955460144de36af5ac2a3924cc4dd40a/keystore/react-native/src/storage/state.ts).

Therefore, its current Ed25519 implementation provides hardware-protected encryption at rest, not hardware-native non-exportable Ed25519 signing. The library would need a separate Android native-key backend. Its HD-derived key model cannot be transparently replaced by AndroidKeyStore because standard AndroidKeyStore does not expose deterministic Ed25519 child derivation.

## 3. Android platform capability

### 3.1 KeyMint and the hardware feature flag

Android 13 introduced KeyMint HAL v2 support for Curve25519 for signing and key agreement. See [AOSP hardware-backed Keystore](https://source.android.com/docs/security/features/keystore#android_13).

The most useful runtime preflight is:

```kotlin
packageManager.hasSystemFeature(
    PackageManager.FEATURE_HARDWARE_KEYSTORE,
    200,
)
```

Android defines hardware-keystore feature version `200` as hardware support for Curve25519, explicitly including Ed25519 signature generation and X25519 key agreement. See [`FEATURE_HARDWARE_KEYSTORE`](https://developer.android.com/reference/android/content/pm/PackageManager#FEATURE_HARDWARE_KEYSTORE).

This check is stronger than testing `SDK_INT >= 33`, but it is still only a preflight. The generated key and its security level must be inspected.

### 3.2 Canonical Ed25519 generation recipe

The Android CTS test uses this recipe:

```kotlin
val generator = KeyPairGenerator.getInstance("EC", "AndroidKeyStore")
val spec = KeyGenParameterSpec.Builder(
    alias,
    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
)
    .setAlgorithmParameterSpec(ECGenParameterSpec("ed25519"))
    .setDigests(KeyProperties.DIGEST_NONE)
    .build()

generator.initialize(spec)
val keyPair = generator.generateKeyPair()

val signer = Signature.getInstance("Ed25519")
signer.initSign(keyPair.private)
signer.update(message)
val signature = signer.sign()
```

See AOSP's [`Curve25519Test.ed25519KeyGenerationAndSigningTest`](https://android.googlesource.com/platform/cts/+/refs/heads/master/tests/tests/keystore/src/android/keystore/cts/Curve25519Test.java#137).

Two details are critical:

1. On Android 13/14, use `KeyPairGenerator.getInstance("EC", "AndroidKeyStore")` plus `ECGenParameterSpec("ed25519")` and `DIGEST_NONE`.
2. The direct `KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")` alias was added for Android 15. AOSP records this in the [AndroidKeyStore Ed25519 generator change](https://android.googlesource.com/platform/frameworks/base/+/2c68aa6bc7d30124fd27a1d00508722823e1768e%5E%21/).

Consequently, a test that only tries the direct `Ed25519` generator can falsely report failure on the S24 Ultra's original Android 14 software.

### 3.3 Why an `EC` label is not a negative result

AOSP's AndroidKeyStore implementation states that Curve25519 is treated as EC at the KeyMint layer. The framework must separately distinguish X25519, Ed25519, and ordinary NIST EC curves. See [`AndroidKeyStoreKeyPairGeneratorSpi`](https://android.googlesource.com/platform/frameworks/base/+/80a664262667cf14ee1ae52ab7c53abc26e17d1e/keystore/java/android/security/keystore2/AndroidKeyStoreKeyPairGeneratorSpi.java#109).

Do not classify a generated key from `privateKey.algorithm`, `publicKey.algorithm`, or the generator name alone. A passing probe must establish all of the following:

- the public key is an `EdECPublicKey`, or its SubjectPublicKeyInfo contains Ed25519 OID `1.3.101.112` (`06 03 2B 65 70`);
- signing with `Signature.getInstance("Ed25519")` succeeds;
- the signature is exactly 64 bytes and verifies against the exported public key; and
- `KeyInfo.securityLevel` is `TRUSTED_ENVIRONMENT` or `STRONGBOX`.

This distinction is why the prior S24 Ultra finding required canonical revalidation. The completed probe now establishes failure before any public-key algorithm or OID could be inspected on the exact tested firmware.

## 4. StrongBox and Samsung Knox Vault

Samsung documents Knox Vault as a physically isolated subsystem and states that its StrongBox Keymaster can generate keys and perform cryptographic operations without decrypting those keys outside the Knox Vault processor. See [Samsung Knox Vault documentation](https://docs.samsungknox.com/admin/fundamentals/whitepaper/samsung-knox-mobile-security/system-security/knox-vault/).

Samsung also confirms Knox Vault for the [Galaxy A26](https://news.samsung.com/in/galaxy-a26-5g-samsungs-most-affordable-ai-powered-smartphone-launches-in-india-starting-at-just-inr-22999) and [Galaxy S24 series](https://news.samsung.com/global/enter-the-new-era-of-mobile-ai-with-samsung-galaxy-s24-series).

That establishes the presence of secure hardware, not its Ed25519 algorithm matrix. Android's documented baseline StrongBox algorithm list includes P-256 ECDSA/ECDH but does not list Ed25519. Android explicitly says an unsupported StrongBox algorithm causes `StrongBoxUnavailableException`, after which an app may retry without requesting StrongBox. See [StrongBox KeyMint](https://developer.android.com/privacy-and-security/keystore#HardwareSecurityModule).

Therefore, test two independent paths:

1. `setIsStrongBoxBacked(true)` to prove Knox Vault/StrongBox Ed25519 specifically.
2. No StrongBox request to test TEE-backed Ed25519 when StrongBox rejects it.

If the second path returns `TRUSTED_ENVIRONMENT`, the key is still hardware-backed and non-exportable, but it is not Knox Vault/StrongBox-backed. Whether that is acceptable is a security-policy decision, not a protocol decision.

## 5. Device assessment

| Device | Relevant facts | Current evidence | Research conclusion |
|---|---|---|---|
| Galaxy A26 5G | Launched with Android 15 / One UI 7 and Knox Vault | No captured canonical Ed25519 probe or attestation | Unverified; likely candidate, not yet supportable as a production claim |
| Galaxy S24 Ultra SM-S928B | Tested on Android 16 / API 36, security patch 2026-05-05; hardware-keystore version 200 and StrongBox features present | Both canonical default and StrongBox recipes produced the same generation failures across two fresh cold launches, before public-key, OID, signature, or security-level evidence | Hardware-backed Ed25519 is unsupported through the tested public AndroidKeyStore API on this exact firmware |

Samsung's platform record confirms that the S24 generation launched on Android 14, which is relevant to the unavailable direct generator alias. See the [Samsung 2024 interim report](https://images.samsung.com/is/content/samsung/assets/global/ir/docs/2024_1Q_Interim_Report.pdf).

Support must be recorded per model number, Android API level, build fingerprint, security patch, and application build. A pass on one regional SKU or firmware does not automatically prove another.

## 6. Physical validation

The `modules/wallet-keystore-diagnostics` probe uses the exact canonical CTS recipe:

```text
generator = EC / AndroidKeyStore
curve = ed25519
purposes = SIGN | VERIFY
digests = NONE
StrongBox = false for the default recipe; true for the StrongBox recipe
```

### 6.1 Galaxy S24 Ultra result

The physical probe recorded this device and firmware:

| Field | Recorded value |
|---|---|
| Model | `SM-S928B` |
| Build fingerprint | `samsung/e3qxxx/e3q:16/BP4A.251205.006/S928BXXS6DZE1:user/release-keys` |
| Android | 16 / API 36 |
| Security patch | 2026-05-05 |
| `android.hardware.hardware_keystore` version 200 | Present |
| `android.hardware.strongbox_keystore` | Present |

The feature flags advertise Curve25519 hardware-keystore and StrongBox capabilities, but they are preflight signals rather than proof that the public AndroidKeyStore API accepts the requested Ed25519 recipe.

- **Canonical default recipe:** unsupported. Key/certificate construction failed because the private-key algorithm did not match the end-entity certificate public-key algorithm.
- **Canonical StrongBox recipe:** unsupported. StrongBox rejected the requested EC Ed25519 parameters.

Both recipes failed before a public key, Ed25519 OID, signature, or `KeyInfo.securityLevel` could be produced. The same null evidence fields, sanitized exception classes/messages, and unsupported classifications were observed across two fresh cold launches using fresh aliases.

The installed diagnostic APK was an arm64-only debug build matching the handset ABI. The Windows multi-ABI build hit a documented `armeabi-v7a` Prefab path-length failure; rebuilding for `arm64-v8a` completed successfully and the APK installed successfully. This build-host limitation is not a device capability result.

Remote attestation was not performed because neither recipe produced a candidate key. No attestation conclusion is claimed for this device.

### 6.2 Remaining Galaxy A26 validation

Galaxy A26 remains unverified. Its saved result must include:

- manufacturer, model, model number, Android release/API, build fingerprint, and security patch;
- `FEATURE_HARDWARE_KEYSTORE` feature version and whether version `200` is present;
- `FEATURE_STRONGBOX_KEYSTORE` presence;
- the exact generation recipe and whether StrongBox was requested;
- public-key class, algorithm, format, encoded length, and SPKI prefix/OID;
- Ed25519 signature length and independent verification result;
- `KeyInfo.securityLevel` and user-authentication enforcement fields;
- generation/sign exceptions with class and sanitized message; and
- an attestation certificate chain for the final candidate key.

For production evidence, generate the candidate with a server-provided random attestation challenge and validate the certificate chain off-device. Android recommends checking the trusted root, chain signatures, revocation status, challenge, application identity, verified boot state, and `attestationSecurityLevel`. See [Android hardware-backed key attestation](https://developer.android.com/privacy-and-security/security-key-attestation).

### Pass criteria

| Result | Classification |
|---|---|
| Ed25519 sign/verify fails | Unsupported |
| Sign/verify passes, security level is `SOFTWARE` or unavailable | Protocol-capable but not hardware-backed |
| Sign/verify passes, security level is `TRUSTED_ENVIRONMENT` | Hardware-backed Ed25519 in TEE |
| Sign/verify passes, security level is `STRONGBOX` | StrongBox/Knox Vault-backed Ed25519 |
| Hardware result plus valid off-device attestation | Production-grade evidence for that tested device/firmware |

## 7. iOS boundary

Apple's public CryptoKit API supports Ed25519 through generic `Curve25519.Signing`, but the public Secure Enclave signing API is exposed as `SecureEnclave.P256.Signing`. See [CryptoKit Curve25519](https://developer.apple.com/documentation/cryptokit/curve25519) and [Secure Enclave P-256 signing](https://developer.apple.com/documentation/cryptokit/secureenclave/p256/signing).

Therefore, an Android hardware Ed25519 implementation would not create a portable iOS Secure Enclave Ed25519 path. Cross-platform policy must explicitly choose between:

- Android hardware Ed25519 with a different iOS security posture;
- software Ed25519 protected by platform key storage on both platforms; or
- a protocol/key-algorithm change that permits hardware P-256 on both platforms.

## 8. Recommendation

1. **Keep ADR 0008 active.** The S24 Ultra result does not justify replacing the current Keychain-protected software Ed25519 production signer.
2. **Treat the S24 Ultra result as firmware-scoped.** Both public AndroidKeyStore recipes are unsupported on the exact recorded SM-S928B firmware; do not generalize to other SKUs or firmware.
3. **Test Galaxy A26 twice:** run the default and StrongBox recipes on the exact intended production firmware and require complete result fields.
4. **Require attestation for any future production candidate.** Local `KeyInfo` is useful diagnostics; verified remote attestation is stronger evidence. No attestation was performed for the failed S24 recipes.
5. **If Galaxy A26 passes:** evaluate a device-specific Android native non-exportable Ed25519 signer, migration/reissuance, per-use authentication, alias rotation, and iOS behavior in a new ADR.
6. **If only TEE passes:** decide explicitly whether TEE satisfies the security requirement or whether Knox Vault/StrongBox is mandatory.
7. **Do not treat the evaluated React Native keystore library as the hardware signer.** Its current protection is encrypted software key material, and its HD derivation model needs a separate design from a non-exportable AndroidKeyStore key.
