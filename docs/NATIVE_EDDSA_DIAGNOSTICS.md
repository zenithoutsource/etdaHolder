# Native Ed25519 Diagnostic Logs

This document explains the development-only `[wallet:native-eddsa] diagnostics` log emitted by `runNativeEd25519Diagnostics()`.

The native Android Ed25519 module is diagnostic/experimental only. Production signing uses the Keychain-protected software Ed25519 signer documented in ADR 0008. These diagnostics exist to prove whether a physical Android device can generate a real hardware-backed AndroidKeyStore Ed25519 key.

## Log Shape

Example event:

```text
[wallet:native-eddsa] diagnostics {
  sdkInt: 36,
  deviceModel: "SM-S928B",
  hasHardwareKeystore: true,
  hasCurve25519HardwareKeystore: true,
  hasStrongBoxKeystore: true,
  supported: false,
  recipes: [...]
}
```

If diagnostics fail before returning data, the logger emits:

```text
[wallet:native-eddsa] diagnostics-failed { message, name }
```

`diagnostics-failed` means the diagnostic module call itself failed, for example because the native module is missing from the dev build. It is not used as the production signing path.

## Top-Level Fields

| Field | Meaning | Good value |
| --- | --- | --- |
| `sdkInt` | Android SDK version reported by `Build.VERSION.SDK_INT`. Ed25519 AndroidKeyStore probing only runs on Android 13 / API 33 and newer. | `>= 33` |
| `deviceModel` | Android model code from `Build.MODEL`, for example `SM-S928B`. | Any real target device |
| `hasHardwareKeystore` | Whether Android reports the generic hardware keystore feature. This alone does not prove Ed25519 support. | `true` |
| `hasCurve25519HardwareKeystore` | Whether Android reports hardware keystore feature version `200+`, the Android feature gate used for Curve25519 / Ed25519-class support. | `true` |
| `hasStrongBoxKeystore` | Whether the device reports StrongBox support. StrongBox is preferred when available, but TEE can also be hardware-backed. | `true` is useful, `false` is not automatically fatal |
| `supported` | Final diagnostic decision. It is `true` only if at least one recipe produced a key that looks like Ed25519, signs/verifies successfully, and is hardware-backed. | `true` |
| `recipes` | Per-generation-attempt details. Each recipe tries a different AndroidKeyStore API shape. | At least one supported recipe |

## Recipe Fields

Each entry in `recipes` is one AndroidKeyStore key-generation attempt.

| Field | Meaning | Good value |
| --- | --- | --- |
| `label` | Stable recipe name, such as `R1-Ed25519-sign`. Use this when comparing devices. | Any recipe can pass |
| `requestedAlgorithm` | Algorithm passed to `KeyPairGenerator.getInstance(...)`, usually `Ed25519` or `EC`. | Prefer `Ed25519` |
| `requestedPurposes` | Android `KeyProperties` purpose bitmask used in `KeyGenParameterSpec`. Current values are sign-only or sign+verify. | Any recipe-specific expected value |
| `algorithmParameterSpec` | Optional curve parameter spec passed to the generator, for example `ECGenParameterSpec(ed25519)`. | Usually `null` for direct Ed25519 recipes |
| `requestedStrongBoxBacked` | Whether the recipe explicitly requested StrongBox via `setIsStrongBoxBacked(...)`. Missing means the recipe did not force StrongBox. | `true` only if StrongBox recipe succeeds |
| `requestedDigests` | Optional digest list passed to `setDigests(...)`, for example `[NONE]`. | Recipe-specific |
| `privateKeyAlgorithm` | Algorithm reported by the generated private key. Some providers may report Ed25519 as OID `1.3.101.112`. | `Ed25519` or `1.3.101.112` can be acceptable if other checks pass |
| `publicKeyAlgorithm` | Algorithm reported by the generated public key. If this says `EC`, the key is probably not usable as Ed25519. | Ed25519-compatible value |
| `publicKeyFormat` | Public key encoding format, usually `X.509` for SPKI. | `X.509` or raw compatible encoding |
| `publicKeyEncodedBytes` | Length of the encoded public key. Raw Ed25519 is 32 bytes; RFC 8410 SPKI Ed25519 is usually 44 bytes. | `32` or valid SPKI size |
| `publicKeySpkiPrefix` | First 8 bytes of the encoded public key in hex. This is a non-secret fingerprint of the encoding shape. | Useful for debugging only |
| `publicKeyLooksEd25519` | Whether the public key is raw 32-byte Ed25519 or contains the RFC 8410 Ed25519 OID. | `true` |
| `signVerifyOk` | Whether the generated private key can sign a diagnostic message and the generated public key can verify it using `Signature.getInstance("Ed25519")`. | `true` |
| `keyInfoAlgorithm` | Algorithm name that successfully returned Android `KeyInfo` for the private key. The code tries `Ed25519`, the requested algorithm, and the provider-reported private-key algorithm. | Any non-empty value if `securityLevel` is available |
| `securityLevel` | Numeric Android `KeyInfo.securityLevel`. On Android 12+, hardware-backed means Trusted Environment or StrongBox. Older Android uses a compatibility value. | Hardware-backed level |
| `securityLevelLabel` | Human-readable label for `securityLevel`: `SOFTWARE`, `TRUSTED_ENVIRONMENT`, `STRONGBOX`, etc. | `TRUSTED_ENVIRONMENT` or `STRONGBOX` |
| `hardwareBacked` | Derived boolean from `securityLevel`. True means the key is backed by TEE or StrongBox. | `true` |
| `userAuthenticationRequired` | Whether Android reports user authentication is required for the generated key. Diagnostics do not focus on auth policy; they focus on key shape and backing. | Context-dependent |
| `userAuthenticationHardwareEnforced` | Whether Android reports user-auth requirements are enforced by secure hardware. | `true` if auth was requested and hardware-enforced |
| `errorClass` | Exception class if the recipe failed before generating a usable key. | Missing |
| `errorMessage` | Exception message if the recipe failed. | Missing |

## Recipe Labels

| Label | What it tries |
| --- | --- |
| `R1-Ed25519-sign` | Direct `KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")` with sign purpose only. |
| `R2-Ed25519-sign-verify` | Direct Ed25519 generation with sign and verify purposes. |
| `R3-EC-ed25519lower` | `EC` generator with `ECGenParameterSpec("ed25519")`. This catches providers that expose Ed25519 through EC-style curve parameters. |
| `R4-EC-Ed25519upper` | Same as R3 but with `ECGenParameterSpec("Ed25519")`. |
| `R5-Ed25519-no-sb` | Direct Ed25519 generation while explicitly not requesting StrongBox. |
| `R6-Ed25519-sb` | Direct Ed25519 generation while explicitly requesting StrongBox. |
| `R7-Ed25519-digest-none` | Direct Ed25519 sign+verify generation with `DIGEST_NONE`. |

## Android Logcat Compact Line

The native module also writes compact Android `Log.i` lines tagged `EtdaWalletEddsa`:

```text
[R1-Ed25519-sign] requested=Ed25519 alg=EC publicAlg=EC spki=91b [...] ed25519=false signVerify=false secLevel=-1/UNAVAILABLE hardware=false error=null:null
```

Mapping:

| Compact field | Structured field |
| --- | --- |
| `requested` | `requestedAlgorithm` |
| `alg` | `privateKeyAlgorithm` |
| `publicAlg` | `publicKeyAlgorithm` |
| `spki` | `publicKeyEncodedBytes` plus `publicKeySpkiPrefix` |
| `ed25519` | `publicKeyLooksEd25519` |
| `signVerify` | `signVerifyOk` |
| `secLevel` | `securityLevel` / `securityLevelLabel` |
| `hardware` | `hardwareBacked` |
| `error` | `errorClass` / `errorMessage` |

## How To Interpret A Device

A device only passes native Ed25519 support if at least one recipe has:

```text
publicKeyLooksEd25519: true
signVerifyOk: true
hardwareBacked: true
```

Common failure patterns:

| Pattern | Meaning |
| --- | --- |
| `supported: false` | No recipe satisfied all required checks. Production must not depend on AndroidKeyStore Ed25519 on this device. |
| `hasCurve25519HardwareKeystore: true` but all recipes fail | Android advertises the feature, but the concrete AndroidKeyStore Ed25519 path is still unusable. |
| `privateKeyAlgorithm: EC` or `publicKeyAlgorithm: EC` | The provider generated an EC-shaped key instead of a real Ed25519 key. |
| `publicKeyLooksEd25519: false` | The public key is not raw Ed25519 and does not contain the Ed25519 SPKI OID. |
| `signVerifyOk: false` | The generated key cannot complete an Ed25519 sign/verify round trip. |
| `securityLevelLabel: SOFTWARE` or `hardwareBacked: false` | The key is not TEE/StrongBox-backed, so it fails the native hardware-backed signing requirement. |
| `errorClass` / `errorMessage` present | That recipe failed during generation, key lookup, KeyInfo read, or sign/verify. |

For the tested Galaxy S24 Ultra, diagnostics showed Android advertised hardware keystore features, but every recipe generated EC-shaped or otherwise unusable output. That is why ADR 0008 keeps production on Keychain-protected software Ed25519 for protocol-valid `alg: EdDSA` signing.
