# Galaxy A26 Hardware Ed25519 Validation Design

Status: Approved design (2026-07-22)

## Goal

Determine whether the exact Galaxy A26 model and firmware available for this project can generate and use a non-exportable Ed25519 signing key through the public AndroidKeyStore API. The result is diagnostic evidence only; it does not change the production signer or supersede ADR 0008.

The probe passes only when a generated Ed25519 key signs and verifies correctly and Android reports that the private key is backed by the Trusted Execution Environment (TEE) or StrongBox.

## Security boundary

- The private key must be generated inside AndroidKeyStore and must never be exported to Kotlin or JavaScript.
- The diagnostic signs only a fixed, non-sensitive test message.
- Logs may contain device capability metadata, recipe labels, public-key metadata, signature byte length, security level, and sanitized exceptions.
- Logs must not contain private keys, seeds, signatures, device debugging identifiers, network addresses, application data, credentials, tokens, claims, or PII.
- Each recipe uses a unique alias and deletes it in `finally`, including failure paths.
- User authentication and attestation are deliberately excluded from this first feasibility gate. They become mandatory follow-up gates only after a hardware-backed recipe passes.

## Considered approaches

### A. Four-lane native AndroidKeyStore probe — selected

Test the direct Android 15+ generator and the canonical Curve25519-compatible EC generator, each through default and StrongBox paths. Validate the complete output rather than treating key generation as success.

This gives the best diagnostic separation between Android framework aliases, the default TEE path, and StrongBox without introducing production behavior.

### B. Minimal direct-generator smoke test

Run only `KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")` and return true after `generateKeyPair()`. This is fast but can misclassify an unusable key, cannot distinguish TEE from StrongBox, and does not prove Ed25519 sign/verify behavior.

### C. Full Android CTS execution

Run the complete platform CTS Curve25519 suite. This provides stronger platform-conformance evidence but requires substantially more setup than the initial application-level feasibility gate. Use it only if the four-lane probe contradicts the device feature declarations or produces ambiguous framework failures.

## Existing diagnostic boundary

Extend `modules/wallet-keystore-diagnostics`; do not add another signing or diagnostic module. The existing module already provides:

- unique aliases and unconditional cleanup;
- Ed25519 SPKI/OID inspection;
- signing and independent verification;
- signature byte length;
- `KeyInfo.securityLevel` classification;
- hardware-backed aggregate gating;
- P-256 default and StrongBox control recipes; and
- the canonical default and StrongBox `EC + ed25519` recipes.

The direct-generator matrix is currently asymmetric: `R7-Ed25519-digest-none` is the strict default recipe, while the existing direct StrongBox recipe does not use the same purposes and digest policy. Add or tighten a paired strict StrongBox recipe rather than using `setIsStrongBoxBacked(hasStrongBox)`, which would silently test the default path when StrongBox is absent.

## Device preflight

Capture the following from the connected A26 without recording its Wireless Debugging identifier or network address:

- manufacturer and model code;
- Android release and API level;
- build fingerprint;
- security patch level;
- primary ABI;
- `android.hardware.hardware_keystore` availability;
- `android.hardware.hardware_keystore` version 200 availability; and
- `android.hardware.strongbox_keystore` availability.

Feature version 200 is a preflight assertion that the isolated hardware keystore supports Curve25519, including Ed25519 signing. It is not accepted as proof without a usable key and successful signing result.

## Required recipe matrix

| Lane | Generator | Parameters | Security request |
|---|---|---|---|
| Direct default | `Ed25519 / AndroidKeyStore` | `SIGN | VERIFY`, `DIGEST_NONE` | No explicit StrongBox request |
| Direct StrongBox | `Ed25519 / AndroidKeyStore` | `SIGN | VERIFY`, `DIGEST_NONE` | `setIsStrongBoxBacked(true)` |
| Canonical default | `EC / AndroidKeyStore` + `ECGenParameterSpec("ed25519")` | `SIGN | VERIFY`, `DIGEST_NONE` | No explicit StrongBox request |
| Canonical StrongBox | `EC / AndroidKeyStore` + `ECGenParameterSpec("ed25519")` | `SIGN | VERIFY`, `DIGEST_NONE` | `setIsStrongBoxBacked(true)` |

If the device does not advertise StrongBox, both StrongBox lanes are reported as `SKIPPED_FEATURE_ABSENT`; they must not fall back to the default path. The two P-256 control recipes remain in the diagnostic matrix to show whether default hardware and StrongBox key generation work independently of Ed25519.

## Pass criteria

A recipe passes only when all of these conditions are true:

1. AndroidKeyStore returns a private-key entry and public certificate.
2. The public SubjectPublicKeyInfo contains Ed25519 OID `1.3.101.112` and has the expected Ed25519 bit-string shape.
3. `Signature.getInstance("Ed25519")` signs the fixed test message.
4. The signature is exactly 64 bytes.
5. Independent verification with the returned public key succeeds.
6. `KeyInfo.securityLevel` is `TRUSTED_ENVIRONMENT` or `STRONGBOX`.
7. For a StrongBox lane, the security level is specifically `STRONGBOX`; a TEE result does not satisfy the StrongBox classification.

Top-level `hardwareEd25519Supported` is true when either default lane passes. A separate `strongBoxEd25519Supported` result is true only when a StrongBox lane passes.

## Result classification

| Result | Classification |
|---|---|
| Feature version 200 absent | Hardware Curve25519 not advertised; recipe evidence still recorded where available |
| Generation or sign/verify fails | Unusable through that public AndroidKeyStore recipe |
| Sign/verify passes but security level is software or unavailable | Protocol-capable, not proven hardware-backed |
| Default lane passes with `TRUSTED_ENVIRONMENT` | Hardware-backed Ed25519 in TEE |
| StrongBox lane passes with `STRONGBOX` | StrongBox-backed Ed25519 |
| Feature version 200 advertised but all Ed25519 lanes fail | Platform capability declaration and app-facing behavior conflict; escalate to CTS/OEM investigation |

No result from the A26 may be generalized to the S24 Ultra, another A26 regional model, or another firmware build.

## Execution flow

1. Connect the A26 using Android Wireless Debugging and verify the target model before installing anything.
2. Build an ABI-compatible debug APK containing only the diagnostic changes.
3. Install without clearing unrelated application data unless a clean install is explicitly required.
4. Launch the app and capture the compact diagnostic output.
5. Stop the app, launch it fresh, and capture a second run using fresh aliases.
6. Compare both runs for identical capability flags, recipe results, signature lengths, security levels, and sanitized errors.
7. Record the device/firmware-scoped result in the hardware-keystore research document and `docs/TASKS.md`.

## Error handling

- Generation, key retrieval, signing, verification, and `KeyInfo` inspection remain separately diagnosable.
- A verification exception preserves the generated signature length.
- Unsupported StrongBox, unsupported algorithms, provider failures, and certificate/key mismatches retain their exception class and sanitized message.
- A failed or skipped recipe never contributes to either support aggregate.
- Alias deletion failures do not replace the primary recipe result, but emit a sanitized diagnostic warning.

## Verification

- Add focused native tests for the support predicates and result classifications where practical.
- Compile the Android diagnostic module for the A26 ABI.
- Run `yarn tsc --noEmit` and `yarn lint`.
- Run the relevant Jest suite using the repository's worktree-safe discovery pattern when necessary.
- Require two fresh physical-device runs before declaring support.

## Follow-up gate after a pass

A first-phase pass authorizes a separate design, not immediate production migration. The follow-up must cover:

- per-sign biometric or device authentication enforced by the key authorization policy;
- server-challenge key attestation with off-device chain, revocation, verified-boot, application-identity, challenge, and security-level validation;
- key lifecycle, rotation, backup behavior, and credential reissuance;
- protocol compatibility for OID4VCI PoP and OID4VP KB-JWT;
- failure behavior when firmware updates remove or break the capability; and
- the iOS security posture.

Until that follow-up is approved and validated, ADR 0008 remains the production signing design.
