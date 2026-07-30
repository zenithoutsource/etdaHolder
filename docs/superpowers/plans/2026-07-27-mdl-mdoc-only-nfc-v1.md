# mDL mdoc-Only NFC v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship holder-facing mdoc-only NFC presentation for Driving Licence mDL (`org.iso.18013.5.1.mDL`) on Samsung A26 + ACR1311U-N2 with three interop fields and engagement QR UX.

**Architecture:** Reuse existing proximity UX (`present.tsx`, `proximityStore`, pre-tap consent). Add mDL reader profile in JS config. Integrate Multipaz in `expo-mdoc-proximity` for ISO 18013-5 NFC data retrieval; expose engagement URI to JS for QR display. Physical validation via Part G checklist extension — not mdoc-web-verifier.

**Tech Stack:** Expo SDK 54, Kotlin Android HCE (`CompanionHostApduService`), Multipaz (OpenWallet Foundation), React Native/TypeScript, Jest, ACR1311 host tool under `tools/acr1311u-n2/`.

**Spec:** [`docs/superpowers/specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md`](../specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md)

## Global Constraints

- v1 is **mdoc-only** — no companion SD-JWT, no dual-format single-tap, no BLE, no mdoc-web-verifier.
- Do not add the customer organization name to new identifiers, file names, comments, docs, or display text.
- ISO mdoc AID `A0000002480400` and companion wire constants remain unchanged until protocol version bump.
- No raw private keys, seeds, VC/VP/JWT bodies, mdoc CBOR, APDU payloads, claims, or PII in wallet logs.
- One user presentation action → at most one biometric/device-authentication event; **no prompt during APDU handling**.
- Arm window: `EXPO_PUBLIC_HCE_ARM_WINDOW_MS` (default `60000` ms via `src/config/dualFormatPolicy.ts`).
- Hand-rolled ISO 18013-5 crypto is forbidden unless Multipaz spike fails and spec §6 is revised.
- NativeWind (`className`) for all new UI; no new `StyleSheet` unless genuinely required.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/config/readerProfiles.ts` | New `mdl-acr1311u-n2-mdoc-only` profile |
| `src/config/readerProfiles.test.ts` | Profile resolution tests |
| `src/components/proximity/WaitingForTapPanel.tsx` | Engagement QR + arm countdown |
| `src/store/proximityStore.ts` | Read `deviceEngagementUri` from native after arm |
| `src/services/proximity/nativeProximityModule.ts` | `deviceEngagementUri` in arm result / getter |
| `modules/expo-mdoc-proximity/android/.../MultipazMdocAdapter.kt` | Multipaz session + `processApdu` |
| `modules/expo-mdoc-proximity/android/.../StoredMdocPresentationEngine.kt` | Delegate to adapter |
| `modules/expo-mdoc-proximity/android/.../MdocProximityEngine.kt` | `presentationReady`, engagement URI |
| `modules/expo-mdoc-proximity/android/.../ExpoMdocProximityModule.kt` | Expose engagement URI to JS |
| `modules/expo-mdoc-proximity/android/.../CompanionApduHandler.kt` | Reject companion when `mdoc-only` armed |
| `docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md` | Part G mDL mdoc-only checklist |
| `tools/acr1311u-n2/` | ISO mdoc AID host steps |
| `docs/TASKS.md` | Physical validation results |

---

### Task 1: mDL Reader Profile

**Files:**
- Modify: `src/config/readerProfiles.ts`
- Modify: `src/config/readerProfiles.test.ts`

**Interfaces:**
- Produces: `getReaderProfileForDocumentType('DLTDrivingLicence', 'mdoc-only')` → profile with `profileId: 'mdl-acr1311u-n2-mdoc-only'`
- Produces: `listMdocFieldKeysFromProfile(profile)` → `['org.iso.18013.5.1.family_name', 'org.iso.18013.5.1.given_name', 'org.iso.18013.5.1.birth_date']`

- [ ] **Step 1: Write failing profile test**

```ts
// src/config/readerProfiles.test.ts — add:
test('resolves mDL mdoc-only profile for DLTDrivingLicence', () => {
  const profile = getReaderProfileForDocumentType('DLTDrivingLicence', 'mdoc-only')
  expect(profile?.profileId).toBe('mdl-acr1311u-n2-mdoc-only')
  expect(profile?.sharingMode).toBe('mdoc-only')
  expect(readerProfileUsesCompanion(profile!)).toBe(false)
  expect(listMdocFieldKeysFromProfile(profile!)).toEqual([
    'org.iso.18013.5.1.family_name',
    'org.iso.18013.5.1.given_name',
    'org.iso.18013.5.1.birth_date',
  ])
})

test('reference vendor has three profiles after mDL add', () => {
  expect(listReaderProfilesForVendor('reference')).toHaveLength(3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/config/readerProfiles.test.ts --runInBand`
Expected: FAIL — profile undefined / length 2

- [ ] **Step 3: Add profile to registry**

```ts
// src/config/readerProfiles.ts — add constants and entry:
const MDL_MDOC_FIELDS: ReaderProfileField[] = [
  { namespace: 'org.iso.18013.5.1', identifier: 'family_name' },
  { namespace: 'org.iso.18013.5.1', identifier: 'given_name' },
  { namespace: 'org.iso.18013.5.1', identifier: 'birth_date' },
]

// In READER_PROFILES array:
{
  profileId: 'mdl-acr1311u-n2-mdoc-only',
  vendorId: 'reference',
  vendorDisplayName: 'Reference Verifier',
  documentType: 'DLTDrivingLicence',
  profileDisplayName: 'mDL (ACR1311U-N2, mdoc-only)',
  sharingMode: 'mdoc-only',
  mdocFields: MDL_MDOC_FIELDS,
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/config/readerProfiles.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/readerProfiles.ts src/config/readerProfiles.test.ts
git commit -m "feat(proximity): add mDL mdoc-only reader profile for NFC v1"
```

---

### Task 2: Multipaz Feasibility Spike

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/build.gradle`
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazMdocAdapter.kt` (spike stub)
- Modify: `docs/superpowers/specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md` (§6 spike verdict)

**Interfaces:**
- Produces: `MultipazMdocAdapter.canHandleNfcDataRetrieval(): Boolean` (spike outcome)
- Produces: documented verdict: `PASS` | `FAIL` with blocker notes in spec §6

- [ ] **Step 1: Add Multipaz dependency**

In `modules/expo-mdoc-proximity/android/build.gradle`, add the OpenWallet Foundation Multipaz Android artifact per current Multipaz release docs (verify version at https://github.com/openwallet-foundation/multipaz before pinning).

- [ ] **Step 2: Create spike adapter skeleton**

```kotlin
// MultipazMdocAdapter.kt
package com.etdawallet.mdocproximity

object MultipazMdocAdapter {
  fun isAvailable(): Boolean = try {
    Class.forName("org.multipaz.mdoc.MdocCredential") // adjust to actual entry class
    true
  } catch (_: ClassNotFoundException) {
    false
  }

  /** Spike: load bytes, open NFC retrieval session, process one SELECT mdoc AID APDU. */
  fun spikeNfcDataRetrieval(mdocBytes: ByteArray, approvedFields: List<String>): SpikeResult {
    // Time-box: implement minimal session open + one APDU round-trip on A26 dev build.
    // Return PASS only if encrypted DeviceResponse path is reachable.
    return SpikeResult.PENDING
  }
}

sealed class SpikeResult {
  data object Pass : SpikeResult()
  data class Fail(val reason: String) : SpikeResult()
  data object Pending : SpikeResult()
}
```

- [ ] **Step 3: Run spike on A26 dev build**

Run: `npx expo run:android` on Samsung A26 with a stored mDL `mso_mdoc` credential. Exercise HCE SELECT on ISO mdoc AID `A0000002480400` while armed.

Record: PASS if Multipaz processes APDU chain; FAIL with exact blocker if not.

- [ ] **Step 4: Document verdict in spec**

Add under spec §6 Phase 1:

```markdown
### Multipaz spike verdict (YYYY-MM-DD)

- Result: PASS | FAIL
- Device: Samsung A26, build fingerprint …
- Blocker (if FAIL): …
- Device key curve required: Ed25519 | P-256
```

If FAIL: **stop plan** — revise ADR 0006 before Task 3.

- [ ] **Step 5: Commit**

```bash
git add modules/expo-mdoc-proximity/android/build.gradle \
  modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazMdocAdapter.kt \
  docs/superpowers/specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md
git commit -m "chore(proximity): record Multipaz NFC data retrieval spike verdict"
```

---

### Task 3: Multipaz `processApdu` Integration

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazMdocAdapter.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/StoredMdocPresentationEngine.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MdocApduHandler.kt`

**Interfaces:**
- Consumes: `ProximityArmState` with `approvedMdocFields`, `credentialId`
- Consumes: mdoc bytes from `MdocProximityEngine.readMdoc`
- Produces: `MultipazMdocAdapter.processApdu(commandApdu: ByteArray): ByteArray`
- Produces: `MultipazMdocAdapter.getDeviceEngagementUri(): String`
- Produces: `MultipazMdocAdapter.getSharedFieldKeys(): List<String>` after successful response

- [ ] **Step 1: Implement adapter session lifecycle**

```kotlin
// MultipazMdocAdapter.kt — replace spike with:
class MultipazMdocAdapter(
  private val mdocBytes: ByteArray,
  private val approvedFields: List<String>,
  private val deviceAuthSigner: (ByteArray) -> ByteArray,
) {
  fun start() { /* open Multipaz NFC retrieval session */ }
  fun processApdu(commandApdu: ByteArray): ByteArray { /* delegate */ }
  fun deviceEngagementUri(): String { /* mdoc:// or cborg-encoded URI */ }
  fun stop() { /* clear session keys */ }
}
```

Enforce approved field ceiling inside adapter before building `DeviceResponse`.

- [ ] **Step 2: Wire StoredMdocPresentationEngine**

```kotlin
// StoredMdocPresentationEngine.kt — replace fail-closed APDU path:
private var adapter: MultipazMdocAdapter? = null

override fun start(state: ProximityArmState, mdocBytes: ByteArray) {
  // ... existing validation ...
  adapter = MultipazMdocAdapter(mdocBytes, state.approvedMdocFields, DeviceAuthBridge::sign)
  adapter?.start()
}

override fun processApdu(commandApdu: ByteArray): ByteArray {
  val active = adapter ?: return sw(0x69, 0x85)
  if (!engaged) {
    engaged = true
    ProximityEventDispatcher.sendDeviceEngaged()
  }
  return active.processApdu(commandApdu)
}
```

- [ ] **Step 3: Android compile verification**

Run: `cd android && ./gradlew :expo-mdoc-proximity:compileDebugKotlin` (or `npx expo run:android`)
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/
git commit -m "feat(proximity): wire Multipaz NFC data retrieval in mdoc engine"
```

---

### Task 4: Pre-Tap Device Auth (No Mid-APDU Biometric)

**Files:**
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/DeviceAuthBridge.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ExpoMdocProximityModule.kt`
- Modify: `src/services/proximity/proximityArmSession.ts`
- Modify: `src/store/proximityStore.ts`

**Interfaces:**
- Produces: `supplyDeviceAuthSignature(sessionTranscriptBase64Url: string): Promise<void>` on native module
- Produces: `DeviceAuthBridge` holding bounded native signing capability set at approve time

- [ ] **Step 1: JS signs once at approve, passes capability to native**

In `proximityStore.approvePresentation`, before `armProximityPresentation`:

```ts
import { signDeviceAuthentication } from '@/src/services/proximity/deviceAuth'

// After set({ status: 'approved' }), before arm:
const record = readStoredCredentialById(selectedCredentialId)
if (!record) throw new Error('Credential not found')
// Pre-sign path: native calls back with sessionTranscript hash at tap time;
// OR pass empty and use native-held Ed25519/P-256 key per spike verdict.
```

Preferred v1: native `DeviceAuthBridge` stores a **time-bounded signing delegate** registered during `approvePresentation` native call — biometric fires once in JS via existing `signProof` flow, native caches signature material only for the arm window (never log it).

- [ ] **Step 2: Add native bridge**

```kotlin
object DeviceAuthBridge {
  private var signer: ((ByteArray) -> ByteArray)? = null
  fun register(signer: (ByteArray) -> ByteArray) { this.signer = signer }
  fun sign(transcript: ByteArray): ByteArray =
    signer?.invoke(transcript) ?: throw MdocProximityException(MdocProximityErrors.NOT_READY, "Device auth not pre-authorized")
  fun clear() { signer = null }
}
```

Clear on session end, cancel, timeout.

- [ ] **Step 3: Verify no Keychain call during APDU**

Add log assertion in dev: `DeviceAuthBridge.sign` must not trigger JS bridge during `processApdu`.

- [ ] **Step 4: Commit**

```bash
git add modules/expo-mdoc-proximity/android/.../DeviceAuthBridge.kt \
  src/store/proximityStore.ts src/services/proximity/proximityArmSession.ts
git commit -m "feat(proximity): pre-tap device auth for mdoc NFC session"
```

---

### Task 5: mdoc-Only Mode + `presentationReady`

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/CompanionApduHandler.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MdocProximityEngine.kt`
- Modify: `src/services/proximity/proximityPresentation.ts`

**Interfaces:**
- Produces: `getAvailability().presentationReady === true` when NFC on + Multipaz adapter available + engine initialized
- Produces: companion SELECT returns `6985` when `sharingMode == "mdoc-only"`

- [ ] **Step 1: Gate companion handler**

```kotlin
// CompanionApduHandler — at SELECT entry:
if (CompanionSession.current()?.sharingMode == "mdoc-only") {
  return sw(0x69, 0x85)
}
```

- [ ] **Step 2: Set presentationReady**

```kotlin
// MdocProximityEngine.getAvailability
"presentationReady" to (nfcEnabled && MultipazMdocAdapter.isAvailable() && engineInitialized)
```

- [ ] **Step 3: JS proximity support check**

`isProximityPresentationSupported()` should require `readProximityAvailability().presentationReady` (not only NFC enabled).

- [ ] **Step 4: Commit**

```bash
git add modules/expo-mdoc-proximity/android/ src/services/proximity/proximityPresentation.ts
git commit -m "feat(proximity): presentationReady gate and mdoc-only companion block"
```

---

### Task 6: Engagement QR in UI

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ExpoMdocProximityModule.kt`
- Modify: `src/services/proximity/nativeProximityModule.ts`
- Modify: `src/store/proximityStore.ts`
- Modify: `src/components/proximity/WaitingForTapPanel.tsx`

**Interfaces:**
- Produces: `getDeviceEngagementUri(): string | null` on native module
- Produces: `proximityStore.deviceEngagementUri: string | null` after arm
- Consumes: existing `react-native-qrcode-svg` pattern from My QR flow

- [ ] **Step 1: Expose URI from native**

```kotlin
// ExpoMdocProximityModule.kt
Function("getDeviceEngagementUri") {
  MdocProximityEngine.getDeviceEngagementUri()
}
```

- [ ] **Step 2: Store URI after arm**

```ts
// proximityStore — add state field deviceEngagementUri
// After armProximityPresentation resolves:
const uri = requireNativeProximityModule().getDeviceEngagementUri()
set({ status: 'hce-armed', deviceEngagementUri: uri })
```

- [ ] **Step 3: Render QR in WaitingForTapPanel**

```tsx
import QRCode from 'react-native-qrcode-svg'

type WaitingForTapPanelProps = {
  deviceEngagementUri?: string | null
  armWindowMs?: number
  onCancel: () => void
}

// Show QR when deviceEngagementUri is non-null; copy: "Let the reader scan this QR, then tap"
```

- [ ] **Step 4: Wire present.tsx**

```tsx
<WaitingForTapPanel
  deviceEngagementUri={deviceEngagementUri}
  onCancel={handleDone}
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/proximity/WaitingForTapPanel.tsx app/(tabs)/present.tsx \
  src/store/proximityStore.ts src/services/proximity/nativeProximityModule.ts \
  modules/expo-mdoc-proximity/android/.../ExpoMdocProximityModule.kt
git commit -m "feat(proximity): show device engagement QR while armed"
```

---

### Task 7: Repository Tests + Lint

**Files:**
- Modify: `src/services/proximity/proximityPresentation.test.ts` (if exists) or create
- Modify: `src/store/proximityStore.test.ts` (if exists) or create minimal test
- Modify: `src/components/proximity/WaitingForTapPanel.test.tsx` (optional snapshot)

- [ ] **Step 1: Test mdoc-only arm skips companion payload**

```ts
test('armProximityPresentation mdoc-only does not require companionSdJwt', async () => {
  // mock native module; assert armProximitySession called without companionSdJwt
})
```

- [ ] **Step 2: Test presentationReady gating**

```ts
test('isProximityPresentationSupported requires presentationReady', () => {
  // mock getAvailability with nfcEnabled true, presentationReady false → false
})
```

- [ ] **Step 3: Run verification**

Run:
```bash
yarn test src/config/readerProfiles.test.ts src/services/proximity --runInBand
yarn lint
yarn tsc --noEmit
```
Expected: PASS (or only pre-existing unrelated tsc errors — note in TASKS if so)

- [ ] **Step 4: Commit**

```bash
git add src/services/proximity/ src/config/
git commit -m "test(proximity): cover mDL mdoc-only arm and presentationReady gates"
```

---

### Task 8: Physical Validation (Part G) + TASKS Update

**Files:**
- Modify: `docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md`
- Modify: `tools/acr1311u-n2/README.md` (or add `probe_mdoc.py`)
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Add Part G checklist to validation plan**

```markdown
## Part G — mDL mdoc-only v1

1. Claim mDL mso_mdoc from customer issuer
2. Wallet: DLT Driving Licence → NFC → consent (3 fields) → arm
3. Host scans engagement QR from WaitingForTapPanel
4. Tap A26 to ACR1311U-N2
5. Verify DeviceResponse contains family_name, given_name, birth_date
6. Record PASS/FAIL table (build id, Android version, reader firmware)
```

- [ ] **Step 2: Document ISO mdoc AID host steps**

Add SELECT `A0000002480400` sequence separate from companion AID in `tools/acr1311u-n2/README.md`.

- [ ] **Step 3: Run Part G on A26 + ACR1311**

Execute checklist; record issuer IACA trust setup on host.

- [ ] **Step 4: Update TASKS.md**

```markdown
### Session YYYY-MM-DD (mDL mdoc-only NFC v1 — Part G)

- **Spec:** docs/superpowers/specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md
- **Result:** PASS | FAIL
- **Notes:** Multipaz verdict, device key curve, fields verified
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md \
  tools/acr1311u-n2/ docs/TASKS.md
git commit -m "docs(proximity): record mDL mdoc-only v1 Part G validation"
```

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
|---|---|
| mDL reader profile 3 fields | Task 1 |
| Multipaz spike verdict | Task 2 |
| Native `processApdu` + engagement | Task 3 |
| One biometric, no mid-APDU | Task 4 |
| mdoc-only blocks companion | Task 5 |
| `presentationReady: true` | Task 5 |
| Engagement QR UX | Task 6 |
| Error handling / tests | Task 7 |
| Part G + TASKS | Task 8 |
| Out of scope (dual-format, BLE) | Not in any task |

No TBD placeholders. Task 2 FAIL stops execution before Task 3.

---

## Execution Handoff

**Plan saved to:** `docs/superpowers/plans/2026-07-27-mdl-mdoc-only-nfc-v1.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
