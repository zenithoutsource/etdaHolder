# mDOC Proximity Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `modules/expo-mdoc-proximity` from scaffold to the production Android bridge for ISO 18013-5 mdoc NFC presentation plus the companion SD-JWT APDU path on Samsung A26 + ACR1311U-N2.

**Architecture:** React Native owns consent, credential selection, reader profile, arm-window display, and result UI. The native module owns Android HCE, APDU routing, native session buffers, Multipaz-backed mdoc handling, and companion APDU enforcement. The ACR1311 host tool validates the reader side with QR engagement input before NFC data retrieval.

**Tech Stack:** Expo SDK 54 local module, Kotlin Android `HostApduService`, Multipaz feasibility/integration, React Native/TypeScript, Jest, ACR1311 host tool under `tools/acr1311u-n2/`.

## Global Constraints

- Must not implement production behavior before physical validation on Samsung A26 + ACR1311U-N2.
- Do not add the organization name to new identifiers, file names, comments, docs, specs, or display text.
- Existing deployed companion AID bytes and companion `aud` wire value remain unchanged until protocol version bump.
- No raw private keys, seeds, VC/VP/JWT bodies, mdoc CBOR, APDU payloads, claims, or PII in logs.
- One user presentation action may trigger at most one biometric/device-authentication event, and no prompt may fire during APDU handling.
- Use env-driven defaults for timing/size policy: `EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES` and new `EXPO_PUBLIC_NFC_ARM_WINDOW_MS`.
- `react-native-nfc-manager` remains NDEF/tag-reading only; it is not used for ISO 18013-5 presentation.
- Hand-rolled ISO 18013-5 crypto is forbidden unless the Multipaz feasibility gate is documented as failed and the spec is revised.

---

## File Structure

- `docs/superpowers/specs/2026-07-09-mdoc-proximity-production-design.md`: approved design and feasibility-gate record.
- `docs/TASKS.md`: implementation slice status and physical validation results.
- `.env.example`: public NFC policy variables.
- `src/config/nfcProximityPolicy.ts`: reads arm-window and payload-size policy.
- `src/services/proximity/nativeProximityModule.ts`: JS/native interface, events, config types.
- `src/services/proximity/proximityArmSession.ts`: single JS arm entry point.
- `src/services/proximity/proximityPresentation.ts`: remove legacy duplicate arm path.
- `src/store/proximityStore.ts`: subscribe to new events and companion signing flow.
- `modules/expo-mdoc-proximity/app.plugin.js`: HCE service manifest wiring.
- `modules/expo-mdoc-proximity/android/src/main/res/xml/companion_apdu_service.xml`: ISO mdoc + companion AID registration.
- `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/*.kt`: native module, HCE service, session state, APDU dispatch, mdoc adapter.
- `tools/acr1311u-n2/companion_probe.ts`: replace stub with host validation harness.
- `tools/acr1311u-n2/README.md`: reader setup and command usage.

---

### Task 1: JS Policy And Single Arm API

**Files:**
- Create: `src/config/nfcProximityPolicy.ts`
- Create: `src/config/nfcProximityPolicy.test.ts`
- Modify: `.env.example`
- Modify: `src/services/proximity/nativeProximityModule.ts`
- Modify: `src/services/proximity/proximityPresentation.ts`
- Modify: `src/services/proximity/proximityArmSession.ts`
- Modify: `src/store/proximityStore.ts`

**Interfaces:**
- Produces: `readNfcProximityPolicy(): { armWindowMs: number; payloadMaxBytes: number }`
- Produces: `ProximityNativeEvents` with `onMdocRequestReceived`, `onMdocPresentationComplete`, `onCompanionSignRequested`, `onCompanionPresentationComplete`, `onError`
- Produces: `ProximityArmConfig` with `payloadMaxBytes`
- Removes: `startProximityPresentation(credentialId, deviceKeyId)` from JS callers and native type definition

- [ ] **Step 1: Write failing policy tests**

```ts
// src/config/nfcProximityPolicy.test.ts
import { readNfcProximityPolicy } from './nfcProximityPolicy'

describe('readNfcProximityPolicy', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.EXPO_PUBLIC_NFC_ARM_WINDOW_MS
    delete process.env.EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('uses production defaults', () => {
    expect(readNfcProximityPolicy()).toEqual({
      armWindowMs: 60_000,
      payloadMaxBytes: 65_536,
    })
  })

  test('uses positive numeric env overrides', () => {
    process.env.EXPO_PUBLIC_NFC_ARM_WINDOW_MS = '45000'
    process.env.EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES = '32768'

    expect(readNfcProximityPolicy()).toEqual({
      armWindowMs: 45_000,
      payloadMaxBytes: 32_768,
    })
  })

  test('falls back when env values are invalid', () => {
    process.env.EXPO_PUBLIC_NFC_ARM_WINDOW_MS = '0'
    process.env.EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES = 'nope'

    expect(readNfcProximityPolicy()).toEqual({
      armWindowMs: 60_000,
      payloadMaxBytes: 65_536,
    })
  })
})
```

- [ ] **Step 2: Run policy test to verify it fails**

Run: `yarn test src/config/nfcProximityPolicy.test.ts --runInBand`

Expected: FAIL with module not found for `./nfcProximityPolicy`.

- [ ] **Step 3: Implement policy reader**

```ts
// src/config/nfcProximityPolicy.ts
const DEFAULT_NFC_ARM_WINDOW_MS = 60_000
const DEFAULT_NFC_PAYLOAD_MAX_BYTES = 65_536

function readPositiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function readNfcProximityPolicy(): { armWindowMs: number; payloadMaxBytes: number } {
  return {
    armWindowMs: readPositiveNumber('EXPO_PUBLIC_NFC_ARM_WINDOW_MS', DEFAULT_NFC_ARM_WINDOW_MS),
    payloadMaxBytes: readPositiveNumber('EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES', DEFAULT_NFC_PAYLOAD_MAX_BYTES),
  }
}
```

- [ ] **Step 4: Document env variables**

Add to `.env.example`:

```dotenv
# NFC proximity arm window in milliseconds. Default: 60000. Controls how long Android HCE stays armed after holder approval.
EXPO_PUBLIC_NFC_ARM_WINDOW_MS=60000

# NFC proximity combined mdoc + companion payload cap in bytes. Default: 65536. Presentations above this fail before tap.
EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES=65536
```

- [ ] **Step 5: Update JS/native event and config types**

In `src/services/proximity/nativeProximityModule.ts`, make the type section match:

```ts
export type ProximityAvailability = {
  platform: string
  sdkInt?: number
  nfcSupported: boolean
  nfcEnabled: boolean
  presentationReady: boolean
  mdocEngine?: 'multipaz'
}

export type ProximityNativeEvents = {
  onDeviceEngaged: { sessionId?: string }
  onMdocRequestReceived: { requestedFields: string[] }
  onMdocPresentationComplete: { sharedFields: string[]; deviceResponseBytes: number }
  onCompanionSignRequested: { nonceBase64Url: string }
  onCompanionPresentationComplete: { presentationBytes: number }
  onError: { code: string; message: string }
}

export type ProximityArmConfig = {
  credentialId: string
  sharingMode: ReaderSharingMode
  profileId: string
  approvedMdocFields: string[]
  companionTransportPluginId?: string
  companionSdJwt?: string
  armWindowMs: number
  payloadMaxBytes: number
}
```

Remove `startProximityPresentation` and `approvePresentation` from `NativeProximityModule`.

- [ ] **Step 6: Make `armProximitySession` the only start path**

In `src/services/proximity/proximityPresentation.ts`, remove `startProximityPresentation()` and `approveProximityPresentation()`. Keep:

```ts
export function readProximityAvailability(): ProximityAvailability
export function isProximityPresentationSupported(): boolean
export async function denyProximityPresentation(): Promise<void>
export async function stopProximityPresentation(): Promise<void>
```

In `src/services/proximity/proximityArmSession.ts`, remove the call to `startProximityPresentation()` and call only `requireNativeProximityModule().armProximitySession(...)` after `validateProximityArmPayload(...)`.

- [ ] **Step 7: Run JS tests and typecheck for this task**

Run:

```powershell
yarn test src/config/nfcProximityPolicy.test.ts src/services/proximity/proximityPresentation.test.ts src/services/proximity/proximityArmPolicy.test.ts --runInBand
yarn tsc --noEmit
```

Expected: all selected tests PASS; typecheck has no new errors from proximity files.

- [ ] **Step 8: Commit**

```powershell
git add .env.example src/config/nfcProximityPolicy.ts src/config/nfcProximityPolicy.test.ts src/services/proximity/nativeProximityModule.ts src/services/proximity/proximityPresentation.ts src/services/proximity/proximityArmSession.ts src/store/proximityStore.ts
git commit -m "refactor: consolidate proximity arm API"
```

---

### Task 2: Native HCE Registration And Fail-Closed APDU Routing

**Files:**
- Modify: `modules/expo-mdoc-proximity/expo-module.config.json`
- Modify: `modules/expo-mdoc-proximity/android/build.gradle`
- Modify: `modules/expo-mdoc-proximity/app.plugin.js`
- Modify: `modules/expo-mdoc-proximity/android/src/main/res/xml/companion_apdu_service.xml`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/CompanionHostApduService.kt`
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocApduHandler.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/CompanionSession.kt`

**Interfaces:**
- Consumes: `ProximityArmState`
- Produces: `MdocApduHandler.process(commandApdu: ByteArray): ByteArray`
- Produces native flags: `mdocExchangeComplete`, `selectedAid`

- [ ] **Step 1: Move native package to neutral namespace**

Move all Kotlin files from the current legacy package directory to:

```text
modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/
```

Update each Kotlin file package declaration:

```kotlin
package com.wallet.mdocproximity
```

Update `modules/expo-mdoc-proximity/android/build.gradle`:

```gradle
android {
  namespace "com.wallet.mdocproximity"
}
```

Update `modules/expo-mdoc-proximity/expo-module.config.json`:

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["com.wallet.mdocproximity.ExpoMdocProximityModule"]
  }
}
```

Update `modules/expo-mdoc-proximity/app.plugin.js` service name constants to
`com.wallet.mdocproximity.CompanionHostApduService`.

- [ ] **Step 2: Add ISO mdoc AID to HCE XML**

Change `companion_apdu_service.xml` to include both AIDs:

```xml
<aid-group
  android:description="@string/companion_hce_description"
  android:category="other">
  <aid-filter android:name="A0000002480400" />
  <aid-filter android:name="A00000045444410100" />
</aid-group>
```

- [ ] **Step 3: Create fail-closed mdoc APDU handler scaffold**

```kotlin
// modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocApduHandler.kt
package com.wallet.mdocproximity

object MdocApduHandler {
  fun process(commandApdu: ByteArray): ByteArray {
    val state = CompanionSession.readArmState() ?: return sw(0x6A, 0x82)
    if (state.approvedMdocFields.isEmpty()) return sw(0x69, 0x85)

    return sw(0x69, 0x85)
  }

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
```

- [ ] **Step 4: Dispatch by selected AID**

In `CompanionHostApduService.kt`, add:

```kotlin
private val ISO_MDOC_AID = byteArrayOf(
  0xA0.toByte(), 0x00, 0x00, 0x02, 0x48, 0x04, 0x00,
)
```

Route:

```kotlin
if (isSelectAid(commandApdu, ISO_MDOC_AID)) {
  if (CompanionSession.readArmState() == null) return byteArrayOf(0x6A.toByte(), 0x82.toByte())
  CompanionSession.selectMdoc()
  return byteArrayOf(0x90.toByte(), 0x00)
}

if (isSelectAid(commandApdu, COMPANION_AID)) {
  if (!CompanionSession.isMdocExchangeComplete()) return byteArrayOf(0x69.toByte(), 0x85.toByte())
  CompanionSession.selectCompanion()
  return byteArrayOf(0x90.toByte(), 0x00)
}

return when (CompanionSession.readSelectedAid()) {
  "mdoc" -> MdocApduHandler.process(commandApdu)
  "companion" -> CompanionApduHandler.process(commandApdu)
  else -> byteArrayOf(0x6D.toByte(), 0x00)
}
```

- [ ] **Step 5: Add session flags**

In `CompanionSession.kt`, add:

```kotlin
private val selectedAid = AtomicReference<String?>(null)
private val mdocExchangeComplete = AtomicReference(false)

fun selectMdoc() { selectedAid.set("mdoc") }
fun selectCompanion() { selectedAid.set("companion") }
fun readSelectedAid(): String? = selectedAid.get()
fun markMdocExchangeComplete() { mdocExchangeComplete.set(true) }
fun isMdocExchangeComplete(): Boolean = mdocExchangeComplete.get()
```

Reset both values in `arm()` and `disarm()`.

- [ ] **Step 6: Verify Android compiles**

Run: `.\gradlew.bat :modules:expo-mdoc-proximity:compileDebugKotlin`

Expected: Kotlin compile succeeds.

- [ ] **Step 7: Commit**

```powershell
git add modules/expo-mdoc-proximity
git commit -m "feat: register mdoc hce aid"
```

---

### Task 3: Multipaz NFC Data Retrieval Feasibility Gate

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/build.gradle`
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocEngineProbe.kt`
- Modify: `docs/superpowers/specs/2026-07-09-mdoc-proximity-production-design.md`
- Modify: `docs/TASKS.md`

**Interfaces:**
- Produces: `MdocEngineProbe.checkCapabilities(): MdocEngineProbeResult`
- Produces decision record in the spec: Multipaz NFC data retrieval verdict

- [ ] **Step 1: Add Multipaz dependency in native module**

Use the current official Multipaz artifact coordinates found from the Multipaz repository/release docs at implementation time. Add only the minimum artifacts needed for ISO mdoc and Android NFC/HCE. Record the exact version in `build.gradle` and in the spec verdict.

Expected `build.gradle` shape: add one concrete `implementation` line for the
verified Multipaz artifact and version. Do not commit a placeholder version
string; the dependency must resolve in the native compile command in this task.

- [ ] **Step 2: Add native probe result model**

```kotlin
package com.wallet.mdocproximity

data class MdocEngineProbeResult(
  val engine: String,
  val version: String,
  val hasMdocModel: Boolean,
  val hasNfcDataRetrieval: Boolean,
  val notes: String,
)
```

- [ ] **Step 3: Add capability probe**

```kotlin
package com.wallet.mdocproximity

object MdocEngineProbe {
  fun checkCapabilities(): MdocEngineProbeResult {
    return MdocEngineProbeResult(
      engine = "multipaz",
      version = BuildConfig.VERSION_NAME,
      hasMdocModel = true,
      hasNfcDataRetrieval = false,
      notes = "Set hasNfcDataRetrieval=true only after confirming a Multipaz API can serve ISO 18013-5 NFC data retrieval through HostApduService.",
    )
  }
}
```

Replace the `false` only after reading and proving the actual Multipaz HCE/NFC data retrieval API compiles in this module.

- [ ] **Step 4: Wire `getAvailability()` to include engine status**

In `MdocProximityEngine.getAvailability(context)`, return:

```kotlin
"presentationReady" to (adapter?.isEnabled == true && MdocEngineProbe.checkCapabilities().hasNfcDataRetrieval),
"mdocEngine" to "multipaz",
```

- [ ] **Step 5: Run native compile**

Run: `.\gradlew.bat :modules:expo-mdoc-proximity:compileDebugKotlin`

Expected: compile succeeds. If dependency resolution fails due sandbox/network, rerun with approved network escalation.

- [ ] **Step 6: Record verdict**

Update `docs/superpowers/specs/2026-07-09-mdoc-proximity-production-design.md`
under Feasibility gate #1 with one concrete verdict sentence containing the
calendar date, Multipaz artifact/version, supported-or-not-supported verdict,
compile command result, API/class names used as evidence, and ACR1311 probe
result when available. Do not commit bracketed placeholders.

Update `docs/TASKS.md` with the same short verdict.

- [ ] **Step 7: Stop condition**

If `hasNfcDataRetrieval` cannot be proven true, stop implementation and revise the spec. Do not hand-roll ISO 18013-5 in this task.

- [ ] **Step 8: Commit**

```powershell
git add modules/expo-mdoc-proximity/android/build.gradle modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocEngineProbe.kt docs/superpowers/specs/2026-07-09-mdoc-proximity-production-design.md docs/TASKS.md
git commit -m "spike: verify mdoc engine nfc retrieval"
```

---

### Task 4: mdoc Engine Adapter And Device Authentication Path

**Files:**
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocPresentationEngine.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocApduHandler.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/MdocProximityEngine.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/ExpoMdocProximityModule.kt`

**Interfaces:**
- Consumes: proven Multipaz NFC data retrieval API from Task 3
- Produces: `MdocPresentationEngine.start(state: ProximityArmState, mdocBytes: ByteArray): Unit`
- Produces: `MdocPresentationEngine.processApdu(commandApdu: ByteArray): ByteArray`
- Produces: `MdocPresentationEngine.stop(): Unit`

- [ ] **Step 1: Add engine interface**

```kotlin
package com.wallet.mdocproximity

interface MdocPresentationEngine {
  fun start(state: ProximityArmState, mdocBytes: ByteArray)
  fun processApdu(commandApdu: ByteArray): ByteArray
  fun stop()
}
```

- [ ] **Step 2: Implement Multipaz-backed adapter**

Create `MultipazMdocPresentationEngine` implementing `MdocPresentationEngine`.

Required behavior:

```kotlin
class MultipazMdocPresentationEngine : MdocPresentationEngine {
  override fun start(state: ProximityArmState, mdocBytes: ByteArray) {
    require(state.approvedMdocFields.isNotEmpty()) { "approvedMdocFields is required" }
    // Initialize Multipaz mdoc presentation/session objects here.
    // Load mdocBytes without logging or copying to JS.
    // Configure approved field ceiling from state.approvedMdocFields.
  }

  override fun processApdu(commandApdu: ByteArray): ByteArray {
    // Delegate APDU to the proven Multipaz NFC data retrieval API.
    // On successful DeviceResponse delivery, call CompanionSession.markMdocExchangeComplete().
    return byteArrayOf(0x69.toByte(), 0x85.toByte())
  }

  override fun stop() {
    // Clear Multipaz session and native buffers.
  }
}
```

Replace the placeholder return only with the actual Multipaz API proven in Task 3.

- [ ] **Step 3: Enforce mdoc device-auth signing rule**

Before making the adapter return a successful `DeviceResponse`, prove one of these is implemented:

```text
Path A: Ed25519 device authentication uses a pre-tap/native signing capability and never prompts during APDU handling.
Path B: mdoc device authentication uses a P-256 AndroidKeyStore key bound into the issued MSO and never prompts during APDU handling.
```

If neither path is implemented, keep `processApdu()` fail-closed with `6985`.

- [ ] **Step 4: Route mdoc APDUs to adapter**

In `MdocApduHandler.kt`:

```kotlin
object MdocApduHandler {
  private var engine: MdocPresentationEngine? = null

  fun start(engineInstance: MdocPresentationEngine) {
    engine = engineInstance
  }

  fun process(commandApdu: ByteArray): ByteArray {
    return engine?.processApdu(commandApdu) ?: sw(0x69, 0x85)
  }

  fun stop() {
    engine?.stop()
    engine = null
  }
}
```

- [ ] **Step 5: Start adapter during arm**

In `ExpoMdocProximityModule.armProximitySession`, after `CompanionSession.arm(...)`, load mdoc bytes using `MdocProximityEngine.readMdoc(context, credentialId)` and start the adapter:

```kotlin
val mdocBytes = MdocProximityEngine.readMdoc(context, credentialId)
val engine = MultipazMdocPresentationEngine()
engine.start(CompanionSession.requireArmState(), mdocBytes)
MdocApduHandler.start(engine)
```

Add `CompanionSession.requireArmState()` if needed:

```kotlin
fun requireArmState(): ProximityArmState =
  readArmState() ?: throw MdocProximityException(MdocProximityErrors.PRESENTATION_INACTIVE, "Proximity session is not armed")
```

- [ ] **Step 6: Verify native compile**

Run: `.\gradlew.bat :modules:expo-mdoc-proximity:compileDebugKotlin`

Expected: compile succeeds.

- [ ] **Step 7: Commit**

```powershell
git add modules/expo-mdoc-proximity
git commit -m "feat: add mdoc presentation engine adapter"
```

---

### Task 5: Companion Ordering, Busy-Wait, And No Mid-Tap Prompt

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/CompanionApduHandler.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/wallet/mdocproximity/CompanionSession.kt`
- Modify: `src/store/proximityStore.ts`
- Modify: `src/services/proximity/companionTransport/plugins/companionV1/constants.ts`

**Interfaces:**
- Consumes: `CompanionSession.isMdocExchangeComplete()`
- Produces: companion `BEGIN` returns `6985` before mdoc completion
- Produces: bounded pending-signature response loop

- [ ] **Step 1: Enforce mdoc-first companion behavior**

In `CompanionApduHandler.handleGetCapabilities()` and `handleBeginCompanion()`, add:

```kotlin
if (!CompanionSession.isMdocExchangeComplete()) return sw(0x69, 0x85)
```

- [ ] **Step 2: Add pending signature state**

In `CompanionSession.kt`:

```kotlin
private val companionSigningPending = AtomicReference(false)

fun markCompanionSigningPending() {
  companionSigningPending.set(true)
}

fun isCompanionSigningPending(): Boolean = companionSigningPending.get()
```

Reset in `arm()`, `storeCompanionResponse()`, and `disarm()`.

- [ ] **Step 3: Return bounded busy response while signing**

In `handleBeginCompanion`, when response is not ready:

```kotlin
if (response == null) {
  CompanionSession.markCompanionSigningPending()
  CompanionSession.onCompanionSignRequested?.invoke(request.nonce)
  return sw(0x61, 0x00)
}
```

In `handleGetResponse`, return `61 00` while signing is pending and `9000` only when bytes are ready.

- [ ] **Step 4: Keep no-prompt rule in JS**

In `src/store/proximityStore.ts`, ensure `onCompanionSignRequested` never triggers a new app-level biometric prompt. It may call `supplyCompanionPresentation` only if the presentation response was prepared under the pre-tap auth design from Task 4.

If this cannot be satisfied, disable dual-format arm by returning a user-facing error before HCE is armed.

- [ ] **Step 5: Run focused JS tests**

Run: `yarn test src/services/proximity/companionTransport/plugins/companionV1/cbor.test.ts src/services/proximity/companionPayloadSize.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Run native compile**

Run: `.\gradlew.bat :modules:expo-mdoc-proximity:compileDebugKotlin`

Expected: compile succeeds.

- [ ] **Step 7: Commit**

```powershell
git add modules/expo-mdoc-proximity src/store/proximityStore.ts src/services/proximity/companionTransport/plugins/companionV1/constants.ts
git commit -m "feat: enforce companion session ordering"
```

---

### Task 6: ACR1311 Host Validation Harness

**Files:**
- Modify: `tools/acr1311u-n2/companion_probe.ts`
- Modify: `tools/acr1311u-n2/README.md`
- Create: `tools/acr1311u-n2/engagement.ts`
- Create: `tools/acr1311u-n2/apdu.ts`

**Interfaces:**
- Produces CLI: `npx ts-node tools/acr1311u-n2/companion_probe.ts --engagement <payload-or-file> --mode mdoc-only|dual-format`
- Produces `sendApdu(apduHex: string): Promise<{ dataHex: string; sw: string }>`

- [ ] **Step 1: Add APDU helper module**

```ts
// tools/acr1311u-n2/apdu.ts
export type ApduResponse = {
  dataHex: string
  sw: string
}

export async function sendApdu(apduHex: string): Promise<ApduResponse> {
  throw new Error(
    `ACR1311 transport not wired: cannot send APDU ${apduHex.slice(0, 8)}. Install/wire the ACS SDK or PC/SC transport before running physical validation.`,
  )
}

export function splitResponse(responseHex: string): ApduResponse {
  if (responseHex.length < 4) throw new Error('InvalidApduResponse: missing status word')
  return {
    dataHex: responseHex.slice(0, -4),
    sw: responseHex.slice(-4).toUpperCase(),
  }
}
```

- [ ] **Step 2: Add engagement input parser**

```ts
// tools/acr1311u-n2/engagement.ts
import fs from 'node:fs'

export function readEngagementPayload(input: string): string {
  if (fs.existsSync(input)) {
    return fs.readFileSync(input, 'utf8').trim()
  }
  return input.trim()
}
```

- [ ] **Step 3: Replace probe stub with CLI skeleton**

```ts
// tools/acr1311u-n2/companion_probe.ts
import { readEngagementPayload } from './engagement'
import { sendApdu } from './apdu'

const ISO_MDOC_SELECT = '00A4040007A0000002480400'
const COMPANION_SELECT = '00A4040009A00000045444410100'

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const engagementArg = readArg('--engagement')
  const mode = readArg('--mode') ?? 'mdoc-only'
  if (!engagementArg) throw new Error('Usage: --engagement <payload-or-file> --mode mdoc-only|dual-format')

  const engagement = readEngagementPayload(engagementArg)
  console.info(`[acr1311] engagement bytes=${Buffer.byteLength(engagement, 'utf8')} mode=${mode}`)

  const selectMdoc = await sendApdu(ISO_MDOC_SELECT)
  console.info(`[acr1311] select mdoc sw=${selectMdoc.sw} dataBytes=${selectMdoc.dataHex.length / 2}`)

  if (mode === 'dual-format') {
    const selectCompanion = await sendApdu(COMPANION_SELECT)
    console.info(`[acr1311] select companion sw=${selectCompanion.sw} dataBytes=${selectCompanion.dataHex.length / 2}`)
  }
}

main().catch((error) => {
  console.error(`[acr1311] failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
```

- [ ] **Step 4: Document ACS SDK wiring gap**

In `tools/acr1311u-n2/README.md`, document:

```markdown
The host tool requires an ACS SDK or PC/SC transport implementation in `apdu.ts`.
The CLI accepts QR engagement payload via `--engagement` before the NFC tap.
Do not log raw mdoc, claims, SD-JWT bodies, or APDU payloads in committed output.
```

- [ ] **Step 5: Run TypeScript compile for tool**

Run: `yarn ts-node tools/acr1311u-n2/companion_probe.ts --engagement sample --mode mdoc-only`

Expected: exits with the explicit “ACR1311 transport not wired” error until the ACS transport is implemented.

- [ ] **Step 6: Commit**

```powershell
git add tools/acr1311u-n2
git commit -m "test: scaffold acr1311 validation harness"
```

---

### Task 7: Physical Validation And Documentation

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/superpowers/specs/2026-07-09-mdoc-proximity-production-design.md`
- Modify: `tools/acr1311u-n2/README.md`

**Interfaces:**
- Produces physical validation record for Samsung A26 + ACR1311U-N2

- [ ] **Step 1: Build a development client**

Run:

```powershell
yarn expo prebuild --clean --platform android
.\gradlew.bat assembleDebug
```

Expected: Android debug build succeeds and includes the HCE service.

- [ ] **Step 2: Install on Samsung A26**

Run:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Expected: install succeeds.

- [ ] **Step 3: Validate HCE screen policy**

Manual:

1. Arm mdoc-only presentation in the wallet.
2. Tap ACR1311 while screen is on.
3. Confirm ISO mdoc AID select succeeds.
4. Turn screen off.
5. Tap again.
6. Confirm no data is shared.

Record pass/fail in `docs/TASKS.md`.

- [ ] **Step 4: Validate mdoc-only flow**

Run host harness with engagement payload:

```powershell
yarn ts-node tools/acr1311u-n2/companion_probe.ts --engagement .\tmp\engagement.txt --mode mdoc-only
```

Expected: ISO 18013-5 session succeeds; encrypted `DeviceResponse` validates; companion AID is not selected.

- [ ] **Step 5: Validate dual-format flow**

Run:

```powershell
yarn ts-node tools/acr1311u-n2/companion_probe.ts --engagement .\tmp\engagement.txt --mode dual-format
```

Expected: mdoc succeeds first; companion succeeds second; companion nonce binding validates; sign latency is recorded.

- [ ] **Step 6: Validate fail-closed cases**

Manual/host harness:

- Unarmed tap shares nothing.
- Companion select before mdoc completion returns `6985`.
- Request outside approved profile fails.
- Arm-window expiry disarms HCE.
- Reader disconnect shows recoverable failure.

- [ ] **Step 7: Update docs**

In `docs/TASKS.md`, add:

```markdown
### Session 2026-07-16 (mDOC proximity physical validation)

- Samsung A26 + ACR1311U-N2 mdoc-only (`org.iso.18013.5.1.mDL`): **PASS**.
- Samsung A26 + ACR1311U-N2 dual-format (mDOC + companion single tap): not yet recorded.
- Remaining blockers: wire `approvePresentation`; online DeviceResponse builder; ADR 0006 selection record.

- Multipaz NFC data retrieval verdict: pass/fail, version, API evidence.
- Companion sign latency: p50/p95 or measured sample values, reader timeout budget.
- Remaining blockers: list or "none".
```

- [ ] **Step 8: Run final verification**

Run:

```powershell
yarn test src/config/nfcProximityPolicy.test.ts src/services/proximity/proximityPresentation.test.ts src/services/proximity/proximityArmPolicy.test.ts src/services/proximity/companionTransport/plugins/companionV1/cbor.test.ts --runInBand
yarn tsc --noEmit
yarn lint
.\gradlew.bat :modules:expo-mdoc-proximity:compileDebugKotlin
```

Expected: all pass, except any pre-existing unrelated lint warnings must be recorded in `docs/TASKS.md`.

- [ ] **Step 9: Commit**

```powershell
git add docs/TASKS.md docs/superpowers/specs/2026-07-09-mdoc-proximity-production-design.md tools/acr1311u-n2/README.md
git commit -m "docs: record mdoc proximity validation"
```

---

## Self-Review Checklist

- Spec coverage: tasks cover JS API consolidation, env policy, HCE AID registration, Multipaz feasibility, mdoc engine adapter, signing timing, companion ordering, ACR1311 host tool, physical validation, and docs updates.
- Feasibility gates: Task 3 stops implementation if Multipaz NFC data retrieval is not proven; Task 4 stops success-path mdoc response if device-auth signing cannot avoid mid-tap prompts.
- Naming rule: new identifiers are neutral; existing wire constants remain unchanged.
- Runtime compatibility: package name, deep-link scheme, Keychain services, and database names are not migrated.
- No implementation may be called production-ready until Samsung A26 + ACR1311U-N2 results are recorded.
