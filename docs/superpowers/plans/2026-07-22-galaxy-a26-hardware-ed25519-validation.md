# Galaxy A26 Hardware Ed25519 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether the available Galaxy A26 can generate and use a non-exportable Ed25519 key in TEE or StrongBox through public AndroidKeyStore APIs.

**Architecture:** Extend the existing diagnostic Expo module instead of adding a signing backend. Complete its strict four-lane Ed25519 matrix, explicitly skip unavailable StrongBox lanes, unit-test the pure support predicates, then build and run the diagnostic twice on the Wireless Debugging target. Record firmware-scoped evidence without changing ADR 0008 or the production Keychain-protected software signer.

**Tech Stack:** Kotlin, AndroidKeyStore/KeyMint, Expo Modules API, TypeScript, JUnit 4, Gradle, ADB Wireless Debugging, Samsung Galaxy A26.

## Global Constraints

- Diagnostic evidence only: do not modify the production Keychain-protected software Ed25519 signer or supersede ADR 0008.
- Do not add another native module; extend `modules/wallet-keystore-diagnostics`.
- Do not add a new dependency beyond JUnit 4 for local native predicate tests.
- Do not expose private keys, seeds, signatures, Wireless Debugging identifiers, network addresses, credentials, tokens, claims, JWTs, or PII in logs or documentation.
- Use only a fixed non-sensitive message for signing.
- Generate every executed probe under a unique alias and delete it in `finally`.
- Never turn a missing StrongBox feature into a default-keystore probe; report `SKIPPED_FEATURE_ABSENT`.
- A hardware-backed pass requires Ed25519 OID `1.3.101.112`, a 64-byte signature, successful independent verification, and `KeyInfo.securityLevel` equal to `TRUSTED_ENVIRONMENT` or `STRONGBOX`.
- A StrongBox pass additionally requires `KeyInfo.securityLevel == STRONGBOX`.
- Preserve installed wallet data: use replacement installation and never uninstall or clear application data.
- Scope all physical conclusions to the exact A26 model, build fingerprint, security patch, and application build.
- Preserve unrelated working-tree changes and stage only files named by the current task.

---

### Task 1: Complete and test the strict diagnostic matrix

**Files:**
- Modify: `modules/wallet-keystore-diagnostics/android/build.gradle`
- Create: `modules/wallet-keystore-diagnostics/android/src/test/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnosticsTest.kt`
- Modify: `modules/wallet-keystore-diagnostics/android/src/main/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnostics.kt`
- Modify: `modules/wallet-keystore-diagnostics/index.ts`

**Interfaces:**
- Consumes: existing `R7-Ed25519-digest-none`, `R10-CTS-EC-ed25519-default`, `R11-CTS-EC-ed25519-sb`, SPKI/OID validation, signature probe, unique alias lifecycle, and P-256 controls.
- Produces: strict direct StrongBox recipe `R12-Ed25519-digest-none-sb`; recipe `status`; top-level `strongBoxEd25519Supported`; stage-specific failure evidence; pure native functions `shouldSkipStrongBoxRecipe`, `supportsHardwareEd25519`, and `supportsStrongBoxEd25519`.

- [ ] **Step 1: Add the native unit-test dependency**

Append this block to `modules/wallet-keystore-diagnostics/android/build.gradle`:

```groovy
dependencies {
  testImplementation 'junit:junit:4.13.2'
}
```

- [ ] **Step 2: Write failing predicate tests**

Create `modules/wallet-keystore-diagnostics/android/src/test/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnosticsTest.kt`:

```kotlin
package com.wallet.keystorediagnostics

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WalletKeystoreDiagnosticsTest {
  private fun passingRecipe(label: String, securityLevelLabel: String): Map<String, Any?> {
    return mapOf(
      "label" to label,
      "status" to "EXECUTED",
      "publicKeyLooksEd25519" to true,
      "signVerifyOk" to true,
      "signatureBytes" to 64,
      "hardwareBacked" to true,
      "securityLevelLabel" to securityLevelLabel,
    )
  }

  @Test
  fun `StrongBox request is skipped only when feature is absent`() {
    assertTrue(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(true, false))
    assertFalse(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(true, true))
    assertFalse(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(false, false))
    assertFalse(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(null, false))
  }

  @Test
  fun `hardware aggregate accepts only strict default recipes`() {
    assertFalse(
      WalletKeystoreDiagnostics.supportsHardwareEd25519(
        listOf(passingRecipe("R1-Ed25519-sign", "TRUSTED_ENVIRONMENT")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsHardwareEd25519(
        listOf(passingRecipe("R7-Ed25519-digest-none", "TRUSTED_ENVIRONMENT")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsHardwareEd25519(
        listOf(passingRecipe("R10-CTS-EC-ed25519-default", "TRUSTED_ENVIRONMENT")),
      ),
    )
  }

  @Test
  fun `StrongBox aggregate requires strict recipe and StrongBox level`() {
    assertFalse(
      WalletKeystoreDiagnostics.supportsStrongBoxEd25519(
        listOf(passingRecipe("R12-Ed25519-digest-none-sb", "TRUSTED_ENVIRONMENT")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsStrongBoxEd25519(
        listOf(passingRecipe("R12-Ed25519-digest-none-sb", "STRONGBOX")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsStrongBoxEd25519(
        listOf(passingRecipe("R11-CTS-EC-ed25519-sb", "STRONGBOX")),
      ),
    )
  }

  @Test
  fun `skipped recipe never satisfies either aggregate`() {
    val skipped = passingRecipe("R11-CTS-EC-ed25519-sb", "STRONGBOX") +
      ("status" to "SKIPPED_FEATURE_ABSENT")

    assertFalse(WalletKeystoreDiagnostics.supportsHardwareEd25519(listOf(skipped)))
    assertFalse(WalletKeystoreDiagnostics.supportsStrongBoxEd25519(listOf(skipped)))
  }
}
```

- [ ] **Step 3: Run the native tests and confirm the intended failure**

Run from `android/`:

```powershell
.\gradlew.bat :wallet-keystore-diagnostics:testDebugUnitTest --tests "com.wallet.keystorediagnostics.WalletKeystoreDiagnosticsTest"
```

Expected: Kotlin test compilation fails because `shouldSkipStrongBoxRecipe`, `supportsHardwareEd25519`, and `supportsStrongBoxEd25519` do not exist.

- [ ] **Step 4: Add strict recipe labels and pure predicates**

In `WalletKeystoreDiagnostics.kt`, add these constants beside the existing constants:

```kotlin
private const val STATUS_EXECUTED = "EXECUTED"
private const val STATUS_SKIPPED_FEATURE_ABSENT = "SKIPPED_FEATURE_ABSENT"

private val STRICT_DEFAULT_ED25519_RECIPES = setOf(
  "R7-Ed25519-digest-none",
  "R10-CTS-EC-ed25519-default",
)

private val STRICT_STRONGBOX_ED25519_RECIPES = setOf(
  "R11-CTS-EC-ed25519-sb",
  "R12-Ed25519-digest-none-sb",
)
```

Replace the current private `isSupportedEd25519Recipe` function and add the aggregate helpers:

```kotlin
internal fun shouldSkipStrongBoxRecipe(
  requestedStrongBoxBacked: Boolean?,
  hasStrongBoxKeystore: Boolean,
): Boolean {
  return requestedStrongBoxBacked == true && !hasStrongBoxKeystore
}

private fun isSupportedEd25519Recipe(recipe: Map<String, Any?>): Boolean {
  return recipe["status"] == STATUS_EXECUTED &&
    recipe["publicKeyLooksEd25519"] == true &&
    recipe["signVerifyOk"] == true &&
    recipe["signatureBytes"] == 64 &&
    recipe["hardwareBacked"] == true
}

internal fun supportsHardwareEd25519(recipes: List<Map<String, Any?>>): Boolean {
  return recipes.any { recipe ->
    recipe["label"] in STRICT_DEFAULT_ED25519_RECIPES && isSupportedEd25519Recipe(recipe)
  }
}

internal fun supportsStrongBoxEd25519(recipes: List<Map<String, Any?>>): Boolean {
  return recipes.any { recipe ->
    recipe["label"] in STRICT_STRONGBOX_ED25519_RECIPES &&
      recipe["securityLevelLabel"] == "STRONGBOX" &&
      isSupportedEd25519Recipe(recipe)
  }
}
```

- [ ] **Step 5: Pass the StrongBox feature into recipe collection**

Replace the beginning of `probe(...)` through recipe collection with:

```kotlin
val reactContext = context.reactContext ?: throw Exceptions.ReactContextLost()
val packageManager = reactContext.packageManager
val hasStrongBoxKeystore = hasFeature(
  packageManager,
  PackageManager.FEATURE_STRONGBOX_KEYSTORE,
)
val recipes = collectDiagnosticRecipes(hasStrongBoxKeystore)
```

In the returned top-level map, replace the two support/StrongBox entries with:

```kotlin
"hasStrongBoxKeystore" to hasStrongBoxKeystore,
"hardwareEd25519Supported" to supportsHardwareEd25519(recipes),
"strongBoxEd25519Supported" to supportsStrongBoxEd25519(recipes),
```

Change the recipe collection signature to:

```kotlin
private fun collectDiagnosticRecipes(hasStrongBoxKeystore: Boolean): List<Map<String, Any?>> {
```

- [ ] **Step 6: Complete the strict direct StrongBox lane and explicit skip inputs**

Add `strongBoxFeatureAvailable = hasStrongBoxKeystore` to the existing `R6-Ed25519-sb`, `R9-EC-p256-sb`, and `R11-CTS-EC-ed25519-sb` calls.

Append this fourth strict lane after `R11-CTS-EC-ed25519-sb`:

```kotlin
diagnosticRecipe(
  "R12-Ed25519-digest-none-sb",
  ED25519,
  null,
  KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
  strongBoxBacked = true,
  strongBoxFeatureAvailable = hasStrongBoxKeystore,
  digests = arrayOf(KeyProperties.DIGEST_NONE),
  signatureAlgorithm = ED25519,
),
```

Add this parameter to `diagnosticRecipe(...)` immediately after `strongBoxBacked`:

```kotlin
strongBoxFeatureAvailable: Boolean = true,
```

After populating `requestedStrongBoxBacked` and `requestedDigests`, insert:

```kotlin
if (shouldSkipStrongBoxRecipe(strongBoxBacked, strongBoxFeatureAvailable)) {
  result["status"] = STATUS_SKIPPED_FEATURE_ABSENT
  return result
}
result["status"] = STATUS_EXECUTED
```

Add `status=${recipe["status"]}` after the label in the compact native log line. Do not change private-key handling or remove alias cleanup for executed recipes.

Preserve the exact signing or verification failure boundary by adding `errorStage: String? = null` to `SignatureProbeResult`, setting it to `"SIGN"` in the signing catch and `"VERIFY"` in the verification catch, and copying it into the recipe result with:

```kotlin
if (signatureProbe.errorClass != null) {
  result["errorStage"] = signatureProbe.errorStage
  result["errorClass"] = signatureProbe.errorClass
  result["errorMessage"] = signatureProbe.errorMessage
}
```

Track the outer operation stage without swallowing its exception. Insert this declaration immediately before the existing `try`:

```kotlin
var failureStage = "GENERATION"
```

Insert this assignment immediately after `generateKeyPair()` and before `KeyStore.getInstance(...)`:

```kotlin
failureStage = "ENTRY_READ"
```

Insert this assignment immediately after `val entry = ks.getEntry(alias, null) as? KeyStore.PrivateKeyEntry` and before reading `entry.privateKey`:

```kotlin
failureStage = "RESULT_INSPECTION"
```

Replace the outer catch with:

```kotlin
catch (e: Exception) {
  result["errorStage"] = failureStage
  result["errorClass"] = e.javaClass.simpleName
  result["errorMessage"] = e.message
}
```

Replace the silent alias-deletion catch with a non-fatal, sanitized result and warning:

```kotlin
} finally {
  try {
    KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(alias)
  } catch (e: Exception) {
    result["aliasCleanupErrorClass"] = e.javaClass.simpleName
    result["aliasCleanupErrorMessage"] = e.message
    Log.w(TAG, "[$label] alias cleanup failed: ${e.javaClass.simpleName}:${e.message}")
  }
}
```

Do not log the generated UUID alias.

Make `KeyInfo` failure independently diagnosable by adding this result type beside `SignatureProbeResult`:

```kotlin
private data class KeyInfoProbeResult(
  val keyInfo: KeyInfo? = null,
  val algorithm: String? = null,
  val errorClass: String? = null,
  val errorMessage: String? = null,
)
```

Replace `readKeyInfo(...)` with:

```kotlin
private fun readKeyInfo(privateKey: PrivateKey, requestedAlgorithm: String): KeyInfoProbeResult {
  val algorithms = listOf(ED25519, requestedAlgorithm, privateKey.algorithm).distinct()
  var lastError: Exception? = null
  for (algorithm in algorithms) {
    try {
      return KeyInfoProbeResult(
        keyInfo = KeyFactory
          .getInstance(algorithm, ANDROID_KEYSTORE)
          .getKeySpec(privateKey, KeyInfo::class.java),
        algorithm = algorithm,
      )
    } catch (e: Exception) {
      lastError = e
    }
  }
  return KeyInfoProbeResult(
    errorClass = lastError?.javaClass?.simpleName ?: "KeyInfoUnavailable",
    errorMessage = lastError?.message,
  )
}
```

Update the result assembly to read `keyInfoResult?.keyInfo`, store `keyInfoResult?.algorithm`, and add:

```kotlin
if (keyInfoResult?.errorClass != null) {
  result["keyInfoErrorClass"] = keyInfoResult.errorClass
  result["keyInfoErrorMessage"] = keyInfoResult.errorMessage
}
```

- [ ] **Step 7: Extend the TypeScript result contract**

In `modules/wallet-keystore-diagnostics/index.ts`, add:

```typescript
export type KeystoreRecipeStatus = 'EXECUTED' | 'SKIPPED_FEATURE_ABSENT'
```

Add this required property after `label` in `KeystoreKeygenRecipeResult`:

```typescript
status: KeystoreRecipeStatus
```

Add the stage and cleanup fields beside the existing error fields:

```typescript
errorStage?: 'GENERATION' | 'ENTRY_READ' | 'RESULT_INSPECTION' | 'SIGN' | 'VERIFY'
aliasCleanupErrorClass?: string
aliasCleanupErrorMessage?: string | null
keyInfoErrorClass?: string
keyInfoErrorMessage?: string | null
```

Add this required property after `hardwareEd25519Supported` in `KeystoreKeygenDiagnostics`:

```typescript
strongBoxEd25519Supported: boolean
```

- [ ] **Step 8: Run the focused native tests**

Run from `android/`:

```powershell
.\gradlew.bat :wallet-keystore-diagnostics:testDebugUnitTest --tests "com.wallet.keystorediagnostics.WalletKeystoreDiagnosticsTest"
```

Expected: four tests pass.

- [ ] **Step 9: Compile native and TypeScript contracts**

Run from `android/`:

```powershell
.\gradlew.bat :app:compileDebugKotlin -x lint -x test --configure-on-demand -PreactNativeArchitectures=arm64-v8a -PreactNativeDevServerPort=8081
```

Expected: `BUILD SUCCESSFUL`.

Run from the repository root:

```powershell
yarn.cmd tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 10: Commit the diagnostic implementation**

```powershell
git add -- modules/wallet-keystore-diagnostics/android/build.gradle modules/wallet-keystore-diagnostics/android/src/test/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnosticsTest.kt modules/wallet-keystore-diagnostics/android/src/main/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnostics.kt modules/wallet-keystore-diagnostics/index.ts
git commit -m "test: complete A26 Ed25519 probe matrix"
```

Expected: the commit contains only the diagnostic module, its native unit test, and its local test dependency.

---

### Task 2: Run the physical Galaxy A26 probe twice

**Files:**
- Read: `android/app/build/outputs/apk/debug/app-debug.apk`
- Read: physical device properties and `WalletKeystoreDiag` output through ADB

**Interfaces:**
- Consumes: strict recipes `R7`, `R10`, `R11`, `R12`; `status`; `signatureBytes`; `securityLevelLabel`; `hardwareEd25519Supported`; `strongBoxEd25519Supported`.
- Produces: two consistent, sanitized evidence sets scoped to the exact A26 model and firmware.

- [ ] **Step 1: Identify exactly one connected A26 target**

Run:

```powershell
$a26Matches = @(adb devices -l | Select-String -Pattern 'model:SM-A26')
if ($a26Matches.Count -ne 1) {
  throw "Expected exactly one paired Galaxy A26; found $($a26Matches.Count)"
}
$a26Serial = (($a26Matches[0].ToString() -split '\s+')[0])
adb -s $a26Serial get-state
adb -s $a26Serial shell getprop ro.product.model
```

Expected: state `device` and a model beginning with `SM-A26`. If no device appears, pause and ask the user to finish Android Wireless Debugging pairing; do not guess or record its endpoint.

- [ ] **Step 2: Capture immutable device and feature evidence**

Run in the same PowerShell session:

```powershell
adb -s $a26Serial shell getprop ro.product.manufacturer
adb -s $a26Serial shell getprop ro.product.model
adb -s $a26Serial shell getprop ro.build.version.release
adb -s $a26Serial shell getprop ro.build.version.sdk
adb -s $a26Serial shell getprop ro.build.fingerprint
adb -s $a26Serial shell getprop ro.build.version.security_patch
adb -s $a26Serial shell getprop ro.product.cpu.abilist
adb -s $a26Serial shell cmd package has-feature android.hardware.hardware_keystore
adb -s $a26Serial shell cmd package has-feature android.hardware.hardware_keystore 200
adb -s $a26Serial shell cmd package has-feature android.hardware.strongbox_keystore
```

Expected: record the returned model, Android/API, fingerprint, security patch, ABI, and three feature results. Do not copy `$a26Serial` into documentation.

- [ ] **Step 3: Assemble an arm64 debug APK**

Run from `android/`:

```powershell
.\gradlew.bat app:assembleDebug -x lint -x test --configure-on-demand -PreactNativeArchitectures=arm64-v8a -PreactNativeDevServerPort=8081
```

Expected: `BUILD SUCCESSFUL` and `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 4: Replace the installed app without clearing data**

Run from the repository root after recreating `$a26Serial` using Step 1:

```powershell
adb -s $a26Serial install -r -d android\app\build\outputs\apk\debug\app-debug.apk
```

Expected: `Success`. Do not run `adb uninstall` or `adb shell pm clear`.

- [ ] **Step 5: Start Metro and establish the debug transport**

In a dedicated terminal, run:

```powershell
yarn.cmd expo start --dev-client --host lan --port 8081
```

In the execution terminal, run:

```powershell
adb -s $a26Serial reverse tcp:8081 tcp:8081
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081/status' -TimeoutSec 5 | Select-Object StatusCode,Content
```

Expected: ADB reverse succeeds and Metro returns HTTP 200 with `packager-status:running`.

- [ ] **Step 6: Launch the first fresh diagnostic run**

Run:

```powershell
$appConfig = Get-Content -Raw app.json | ConvertFrom-Json
$walletPackage = $appConfig.expo.android.package
$walletScheme = @($appConfig.expo.scheme)[0]
$launchUri = "${walletScheme}://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
adb -s $a26Serial logcat -c
adb -s $a26Serial shell am force-stop $walletPackage
adb -s $a26Serial shell am start -W -a android.intent.action.VIEW -d $launchUri
```

Wait for startup to complete. Do not open credentials or trigger production signing.

- [ ] **Step 7: Capture and classify run one**

Run:

```powershell
adb -s $a26Serial logcat -d -s WalletKeystoreDiag:I "*:S" |
  Select-String -Pattern 'R7-Ed25519-digest-none|R10-CTS-EC-ed25519-default|R11-CTS-EC-ed25519-sb|R12-Ed25519-digest-none-sb|R8-EC-p256|R9-EC-p256-sb'
```

Expected: each executed recipe includes `status`, `ed25519`, `signVerify`, `sigBytes`, `secLevel`, `hardware`, and sanitized error fields. Feature-absent StrongBox recipes show `status=SKIPPED_FEATURE_ABSENT` and no generated-key evidence.

Use this fixed classification:

| Evidence | Classification |
|---|---|
| Strict default recipe has Ed25519 OID, verified 64-byte signature, and `TRUSTED_ENVIRONMENT` | Hardware-backed Ed25519 in TEE |
| Strict StrongBox recipe has Ed25519 OID, verified 64-byte signature, and `STRONGBOX` | StrongBox-backed Ed25519 |
| Ed25519 signing passes but security level is software/unavailable | Protocol-capable, not proven hardware-backed |
| Generation, OID, signing, length, verification, or hardware level fails | Unusable through that public recipe |
| Feature version 200 is true but every strict Ed25519 recipe fails | Platform declaration/app-facing behavior conflict; CTS or OEM escalation required |

- [ ] **Step 8: Repeat with fresh aliases**

Repeat Steps 6 and 7 after clearing logcat again.

Expected: both runs have identical feature flags and classifications. Every executed recipe uses a fresh UUID alias that is deleted in `finally`.

---

### Task 3: Record the A26 evidence and complete verification

**Files:**
- Modify: `docs/eddsa/eddsa-hardware-keystore-research.md`
- Modify: `docs/TASKS.md`

**Interfaces:**
- Consumes: exact device properties, feature flags, strict recipe results, control results, and repeated-run consistency from Task 2.
- Produces: durable firmware-scoped A26 evidence while keeping ADR 0008 active.

- [ ] **Step 1: Update the research status and A26 device row**

In `docs/eddsa/eddsa-hardware-keystore-research.md`:

- change the status from A26 validation required to A26 physically validated;
- replace the A26 device-table row with the exact model, Android/API, security patch, feature flags, and both-run result;
- add a compact physical-validation subsection containing one sanitized summary for each of `R7`, `R10`, `R11`, and `R12`;
- state whether P-256 controls passed; and
- retain the existing S24 result unchanged.

Use exactly one conclusion matching the evidence:

```text
TEE pass: The tested Galaxy A26 firmware supports non-exportable Ed25519 through the strict default AndroidKeyStore recipe at TRUSTED_ENVIRONMENT security level. StrongBox-backed Ed25519 was not proven.

StrongBox pass: The tested Galaxy A26 firmware supports non-exportable Ed25519 through AndroidKeyStore at STRONGBOX security level, subject to authentication-bound testing and remote attestation before production adoption.

Software-only result: The tested Galaxy A26 firmware can perform Ed25519 signing, but the returned key is not proven hardware-backed; it does not satisfy the production hardware requirement.

Failure result: The tested Galaxy A26 firmware does not expose a usable hardware-backed Ed25519 key through the tested public AndroidKeyStore recipes, even if Curve25519 feature version 200 is advertised.
```

- [ ] **Step 2: Add the completed A26 session to the active task record**

Add a leading `Session 2026-07-22 (Galaxy A26 hardware Ed25519 validation)` section to `docs/TASKS.md` containing:

- exact model, Android/API, fingerprint, and security patch;
- hardware-keystore v200 and StrongBox feature results;
- separate direct-default, direct-StrongBox, canonical-default, and canonical-StrongBox classifications;
- two-run consistency;
- P-256 control outcome;
- build/install scope; and
- an explicit statement that ADR 0008 remains active until authentication-bound testing, attestation, migration design, and credential reissuance are approved.

- [ ] **Step 3: Run all scoped and repository verification**

Run from `android/`:

```powershell
.\gradlew.bat :wallet-keystore-diagnostics:testDebugUnitTest --tests "com.wallet.keystorediagnostics.WalletKeystoreDiagnosticsTest"
.\gradlew.bat :app:compileDebugKotlin -x lint -x test --configure-on-demand -PreactNativeArchitectures=arm64-v8a -PreactNativeDevServerPort=8081
```

Expected: native predicate tests pass and Kotlin compilation reports `BUILD SUCCESSFUL`.

Run from the repository root:

```powershell
yarn.cmd tsc --noEmit
yarn.cmd lint
yarn.cmd test --runInBand
git diff --check -- modules/wallet-keystore-diagnostics/android/build.gradle modules/wallet-keystore-diagnostics/android/src/test/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnosticsTest.kt modules/wallet-keystore-diagnostics/android/src/main/java/com/wallet/keystorediagnostics/WalletKeystoreDiagnostics.kt modules/wallet-keystore-diagnostics/index.ts docs/eddsa/eddsa-hardware-keystore-research.md docs/TASKS.md
```

Expected: type-check exits 0; lint exits 0 with only documented pre-existing warnings; all discovered Jest suites pass; scoped diff check emits no errors. If Jest discovery fails only because the nested Windows worktree path mixes slash separators, rerun with the repository's established explicit mobile patterns and exclude `server`:

```powershell
yarn.cmd test --runInBand --silent --testMatch "**/src/**/*.test.ts" --testMatch "**/src/**/*.test.tsx" --testMatch "**/scripts/**/*.test.js" --testPathIgnorePatterns "server"
```

Expected: all 140 mobile suites and 750 tests pass, or the updated repository totals pass if unrelated tests have been added since the S24 validation.

- [ ] **Step 4: Commit only durable A26 evidence**

```powershell
git add -- docs/eddsa/eddsa-hardware-keystore-research.md docs/TASKS.md
git commit -m "docs: record A26 Ed25519 probe result"
```

Expected: the commit contains only the research document and active task record. Diagnostic implementation remains in the Task 1 commit, and unrelated working-tree changes remain untouched.

- [ ] **Step 5: Stop diagnostic-only processes**

Identify the listener before stopping it:

```powershell
Get-NetTCPConnection -LocalPort 8081 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq (Get-NetTCPConnection -LocalPort 8081 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess) } | Select-Object ProcessId,CommandLine
```

Stop the process only when its command line points to this repository's Expo CLI and port 8081. Leave unrelated listeners untouched.
