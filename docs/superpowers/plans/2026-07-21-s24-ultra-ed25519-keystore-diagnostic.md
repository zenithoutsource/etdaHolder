# Galaxy S24 Ultra Ed25519 Keystore Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the exact Android CTS Ed25519 generation recipe against the connected Galaxy S24 Ultra and record whether the resulting non-exportable key is TEE-backed, StrongBox-backed, software-only, or unsupported.

**Architecture:** Extend only the existing diagnostic Expo native module with default and StrongBox variants of the CTS recipe. Reuse its unique-alias lifecycle, SPKI/OID validation, `KeyInfo` inspection, sanitized logging, and unconditional alias deletion; add signature length as one extra evidence field. Build and reinstall the debug APK without clearing data, then record the physical-device result without changing the production signer or ADR 0008.

**Tech Stack:** Kotlin, AndroidKeyStore/KeyMint, Expo Modules API, TypeScript, Gradle, ADB, Galaxy `SM-S928B`.

## Global Constraints

- Diagnostic evidence only: do not modify the production Keychain-protected software Ed25519 signer or supersede ADR 0008.
- Do not expose private keys, raw seeds, credentials, tokens, claims, JWTs, or PII in code, logs, or documentation.
- Do not use the customer organization name in new identifiers, comments, file names, or prose.
- Generate every probe under a unique temporary alias and delete it in `finally`, whether generation, inspection, signing, or verification succeeds or fails.
- Preserve installed wallet data by using APK replacement installation; do not clear application data or uninstall the app.
- Treat TEE and StrongBox as separate results. A default-path TEE pass must not be described as a StrongBox pass.
- A hardware-backed Ed25519 pass requires Ed25519 OID `1.3.101.112`, a 64-byte Ed25519 signature, successful independent verification, and `KeyInfo.securityLevel` equal to `TRUSTED_ENVIRONMENT` or `STRONGBOX`.
- The physical result applies only to model `SM-S928B`, the recorded build fingerprint, and the recorded security patch.
- Preserve unrelated working-tree changes and commit only the files named in each task.

---

### Task 1: Add the canonical CTS recipes and signature-length evidence

**Files:**
- Modify: `modules/wallet-keystore-diagnostics/android/src/main/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnostics.kt:24-244`
- Modify: `modules/wallet-keystore-diagnostics/index.ts:3-25`

**Interfaces:**
- Consumes: existing `diagnosticRecipe(...)`, `looksLikeEd25519PublicKey(...)`, `readKeyInfo(...)`, and `isSupportedEd25519Recipe(...)` behavior.
- Produces: recipe labels `R10-CTS-EC-ed25519-default` and `R11-CTS-EC-ed25519-sb`; native result field `signatureBytes: Int`; TypeScript field `signatureBytes?: number`.

- [ ] **Step 1: Reconfirm the failing acceptance baseline**

Run:

```powershell
adb logcat -d -s WalletKeystoreDiag:I "*:S" | Select-String -Pattern 'R10-CTS|R11-CTS|sigBytes'
```

Expected: no matching output because the installed diagnostic has neither canonical recipe nor signature-length logging.

- [ ] **Step 2: Add the minimal native recipe and result implementation**

In `WalletKeystoreDiagnostics.kt`, add this result type beside the existing constants:

```kotlin
private data class SignatureProbeResult(
  val verified: Boolean,
  val signatureBytes: Int,
)
```

Append these two entries to `collectDiagnosticRecipes()` after the existing P-256 controls:

```kotlin
diagnosticRecipe(
  "R10-CTS-EC-ed25519-default",
  "EC",
  ECGenParameterSpec("ed25519"),
  KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
  digests = arrayOf(KeyProperties.DIGEST_NONE),
  signatureAlgorithm = ED25519,
),
diagnosticRecipe(
  "R11-CTS-EC-ed25519-sb",
  "EC",
  ECGenParameterSpec("ed25519"),
  KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
  strongBoxBacked = true,
  digests = arrayOf(KeyProperties.DIGEST_NONE),
  signatureAlgorithm = ED25519,
),
```

Replace the boolean-only signature assignment inside `diagnosticRecipe(...)` with:

```kotlin
val signatureProbe = if (privKey != null && pubKey != null) {
  probeSignature(privKey, pubKey, signatureAlgorithm)
} else {
  SignatureProbeResult(verified = false, signatureBytes = 0)
}

result["signVerifyOk"] = signatureProbe.verified
result["signatureBytes"] = signatureProbe.signatureBytes
```

Replace `canSignAndVerify(...)` with:

```kotlin
private fun probeSignature(
  privateKey: PrivateKey,
  publicKey: PublicKey,
  signatureAlgorithm: String,
): SignatureProbeResult {
  return try {
    val message = "wallet-keystore-diagnostic".toByteArray(Charsets.UTF_8)
    val signatureBytes = Signature.getInstance(signatureAlgorithm).apply {
      initSign(privateKey)
      update(message)
    }.sign()
    val verified = Signature.getInstance(signatureAlgorithm).apply {
      initVerify(publicKey)
      update(message)
    }.verify(signatureBytes)
    SignatureProbeResult(verified = verified, signatureBytes = signatureBytes.size)
  } catch (_: Exception) {
    SignatureProbeResult(verified = false, signatureBytes = 0)
  }
}
```

Add `sigBytes=${recipe["signatureBytes"]}` immediately after the existing `signVerify` value in the native `Log.i` message. Do not change exception redaction or the `finally` deletion.

- [ ] **Step 3: Extend the TypeScript diagnostic result contract**

In `modules/wallet-keystore-diagnostics/index.ts`, add the field directly after `signVerifyOk`:

```typescript
signatureBytes?: number
```

- [ ] **Step 4: Compile the Android code**

Run from `android/`:

```powershell
.\gradlew.bat :app:compileDebugKotlin -x lint -x test --configure-on-demand -PreactNativeDevServerPort=8081
```

Expected: `BUILD SUCCESSFUL`; Kotlin compilation confirms the native result type, recipe arguments, and logging expression are valid.

- [ ] **Step 5: Run the TypeScript contract check**

Run from the repository root:

```powershell
yarn.cmd tsc --noEmit
```

Expected: no new diagnostic-module error. If the existing unrelated error remains, record it exactly as:

```text
src/services/vp/claimDisclosurePolicy.ts(108,18): error TS2339: Property 'selective' does not exist on type 'Pick<PresentationDisclosure, "key" | "mandatory">'.
```

- [ ] **Step 6: Commit the diagnostic implementation**

```powershell
git add -- modules/wallet-keystore-diagnostics/android/src/main/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnostics.kt modules/wallet-keystore-diagnostics/index.ts
git commit -m "test: add canonical Ed25519 keystore probes"
```

Expected: the commit contains only the two diagnostic module files.

---

### Task 2: Build, install, and run the physical S24 Ultra probe

**Files:**
- Read: `android/app/build/outputs/apk/debug/app-debug.apk`
- Read: physical device properties and `WalletKeystoreDiag` log output through ADB

**Interfaces:**
- Consumes: `R10-CTS-EC-ed25519-default`, `R11-CTS-EC-ed25519-sb`, and `signatureBytes` from Task 1.
- Produces: an evidence set containing device identity, firmware, feature flags, recipe outcome, SPKI evidence, signature result and length, security level, and sanitized exceptions.

- [ ] **Step 1: Reconfirm the connected target and immutable device evidence**

Run:

```powershell
adb devices -l
adb shell getprop ro.product.model
adb shell getprop ro.build.fingerprint
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.build.version.security_patch
adb shell cmd package has-feature android.hardware.hardware_keystore 200
adb shell cmd package has-feature android.hardware.strongbox_keystore
```

Expected model: `SM-S928B`. Record every other returned value verbatim; stop if the connected model differs.

- [ ] **Step 2: Assemble the debug APK**

Run from `android/`:

```powershell
.\gradlew.bat app:assembleDebug -x lint -x test --configure-on-demand -PreactNativeDevServerPort=8081
```

Expected: `BUILD SUCCESSFUL` and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Replace the installed debug app without clearing data**

Run from the repository root:

```powershell
adb install -r -d android\app\build\outputs\apk\debug\app-debug.apk
```

Expected: `Success`. Do not run `adb uninstall`, `pm clear`, or any command that removes app data.

- [ ] **Step 4: Ensure the device can reach Metro**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081/status' -TimeoutSec 5
adb reverse tcp:8081 tcp:8081
```

Expected: Metro returns HTTP 200 with `packager-status:running`; ADB reverse completes without error.

- [ ] **Step 5: Launch one clean diagnostic run**

Run:

```powershell
adb logcat -c
$appConfig = Get-Content -Raw app.json | ConvertFrom-Json
$walletPackage = $appConfig.expo.android.package
$walletScheme = @($appConfig.expo.scheme)[0]
$launchUri = "${walletScheme}://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
adb shell am force-stop $walletPackage
adb shell am start -W -a android.intent.action.VIEW -d $launchUri
```

Wait until startup finishes, without interacting with wallet credentials or triggering signing.

- [ ] **Step 6: Capture and classify the exact recipes**

Run:

```powershell
adb logcat -d -s WalletKeystoreDiag:I "*:S" | Select-String -Pattern 'R10-CTS-EC-ed25519-default|R11-CTS-EC-ed25519-sb'
```

Expected: exactly one line for each recipe and each line includes `ed25519`, `signVerify`, `sigBytes`, `secLevel`, `hardware`, and any sanitized error.

Classify each line using this fixed matrix:

| Evidence | Classification |
|---|---|
| `ed25519=true`, `signVerify=true`, `sigBytes=64`, `secLevel=TRUSTED_ENVIRONMENT` | Hardware-backed Ed25519 in TEE |
| `ed25519=true`, `signVerify=true`, `sigBytes=64`, `secLevel=STRONGBOX` | StrongBox-backed Ed25519 |
| Ed25519 sign/verify succeeds but the security level is software or unavailable | Protocol-capable but not hardware-backed |
| Key generation, Ed25519 SPKI validation, 64-byte signing, or verification fails | Unsupported through the tested public AndroidKeyStore recipe |

- [ ] **Step 7: Repeat once to rule out stale-key or transient output**

Repeat Steps 5 and 6.

Expected: the same classification on both runs. Because aliases are unique and deleted in `finally`, the second run creates fresh probe keys.

---

### Task 3: Record the verified result and run repository checks

**Files:**
- Modify: `docs/eddsa/eddsa-hardware-keystore-research.md:1-195`
- Modify: `docs/TASKS.md:1-9`

**Interfaces:**
- Consumes: exact device evidence and repeated recipe classifications from Task 2.
- Produces: durable project evidence for the tested S24 Ultra firmware while retaining ADR 0008 as the production decision.

- [ ] **Step 1: Update the research status and S24 evidence**

In `docs/eddsa/eddsa-hardware-keystore-research.md`, change the status to `Research complete; S24 Ultra physically revalidated; Galaxy A26 validation required`.

Replace the S24 Ultra executive-finding bullet and device-table row with the exact matching outcome below:

```text
Unsupported outcome: Galaxy S24 Ultra SM-S928B on the recorded Android 16 firmware advertises Curve25519 hardware-keystore version 200, but both canonical CTS recipes failed Ed25519 generation/signing requirements. Hardware-backed Ed25519 is unsupported through the tested public AndroidKeyStore API on this exact firmware.

TEE-only outcome: Galaxy S24 Ultra SM-S928B on the recorded Android 16 firmware passed the canonical default recipe with a 64-byte verified Ed25519 signature at TRUSTED_ENVIRONMENT security level, while the StrongBox recipe failed. Hardware-backed Ed25519 is available in TEE but not proven in StrongBox on this exact firmware.

StrongBox outcome: Galaxy S24 Ultra SM-S928B on the recorded Android 16 firmware passed the canonical StrongBox recipe with a 64-byte verified Ed25519 signature at STRONGBOX security level. StrongBox-backed Ed25519 is available on this exact firmware, subject to attestation and production-signer design before adoption.
```

Use only the one sentence matching the captured evidence. Add the exact build fingerprint, security patch, both recipe log summaries, and the repeated-run consistency result under the physical-validation section. Do not copy unrelated logcat output.

- [ ] **Step 2: Update the active task record**

In the leading `2026-07-21` session of `docs/TASKS.md`:

- replace `documentation/source review only; no runtime code changed and no device was available` with the exact Gradle, ADB, lint, type-check, and focused-check outcomes;
- record model `SM-S928B`, the exact firmware fingerprint and security patch;
- record the default and StrongBox recipe classifications separately;
- state that ADR 0008 remains active and Galaxy A26 physical validation is still pending.

- [ ] **Step 3: Run formatting, lint, and focused repository verification**

Run:

```powershell
git diff --check -- modules/wallet-keystore-diagnostics/android/src/main/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnostics.kt modules/wallet-keystore-diagnostics/index.ts docs/eddsa/eddsa-hardware-keystore-research.md docs/TASKS.md
yarn.cmd lint
yarn.cmd tsc --noEmit
```

Expected: `git diff --check` passes; lint exits 0 with only previously existing warnings; type-check has no new diagnostic-module errors and either passes or reports only the pre-existing `claimDisclosurePolicy.ts(108,18)` error recorded in Task 1.

Run the focused existing crypto tests:

```powershell
yarn.cmd test src/services/crypto --runInBand
```

Expected: all discovered focused crypto suites pass. If Jest reports that no tests match the directory, record that exact outcome and rely on the successful native compile plus two physical runs for this hardware-only diagnostic slice.

- [ ] **Step 4: Commit only the durable result documentation**

```powershell
git add -- docs/eddsa/eddsa-hardware-keystore-research.md docs/TASKS.md
git commit -m "docs: record S24 Ed25519 probe result"
```

Expected: the commit contains only the research document and active task record; unrelated working-tree changes remain untouched.
