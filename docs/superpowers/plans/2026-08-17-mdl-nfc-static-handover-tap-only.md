# mDL NFC Static Handover (Tap-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issued driving-licence NFC presentment on A26 + ACR1311 is tap-only static NFC handover (no holder QR, no Add test mDL), with DeviceRequest ∩ three-field ceiling.

**Architecture:** Keep Multipaz `NfcTransportMdoc` for AID `A0000002480400`. Add Type 4 NDEF HCE on AID `D2760000850101` that serves ISO 18013-5 static Handover Select containing the same DeviceEngagement the session already builds. Host waits for the card, reads NDEF, then runs mdoc retrieval. Holder UX: NFC press arms immediately (no PreTapConsent); Waiting for tap shows hold instruction + ceiling copy, not a QR. Session transcript uses NFC handover CBOR, not `Simple.NULL`.

**Tech Stack:** Expo SDK 54, React Native / NativeWind, Jest + `@testing-library/react-native`, Kotlin Multipaz `0.100.0`, PC/SC host `tools/acr1311u-n2`, Yarn.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-17-mdl-nfc-static-handover-tap-only-design.md`
- English-only code, comments, docs, and UI strings in this slice (existing Thai copy elsewhere stays).
- Do not add the customer organization name in new identifiers, files, or docs. Wire AIDs stay opaque (`A0000002480400`, `A00000045444410100`, `D2760000850101`).
- Yarn only; native HCE/AID XML changes require `npx expo run:android`.
- One biometric per NFC action, at sign time only. No second consent after DeviceRequest.
- Do not log credential claims, mdoc payloads, or key material.
- Durations stay env-driven (`EXPO_PUBLIC_HCE_ARM_WINDOW_MS`, `EXPO_PUBLIC_HCE_RESPONSE_DRAIN_GRACE_MS`); no new window unless a task introduces one.
- Host `generate-mdl` CLI stays. Wallet `generateTestMdl` / Home button go.
- iOS, BLE, dual-format companion, negotiated handover, and auto-purge of TEST cards are out of scope.
- P1–P6 canvases unchanged (online VP). This is ADR 0003 proximity.

## File map

| File | Responsibility |
|---|---|
| `app/(tabs)/index.tsx` | Remove Add test mDL |
| `src/components/proximity/InjectTestMdlButton.tsx` | Delete |
| `src/services/proximity/injectTestMdl.ts` + `.test.ts` | Delete |
| `src/services/proximity/nativeProximityModule.ts` | Drop `generateTestMdl` |
| `modules/expo-mdoc-proximity/.../ExpoMdocProximityModule.kt` | Drop `generateTestMdl` |
| `modules/expo-mdoc-proximity/.../TestMdlGenerator.kt` | Delete |
| `src/store/proximityStore.ts` | Tap-first arm (no awaiting-consent for mdoc-only) |
| `src/store/proximityStore.test.ts` | Store TDD |
| `app/(tabs)/present.tsx` | Skip PreTapConsent; fail-closed copy |
| `src/components/proximity/WaitingForTapPanel.tsx` + `.test.tsx` | No QR; ceiling copy |
| `tools/acr1311u-n2/.../NfcStaticHandover.kt` | Encode/decode static handover NDEF |
| `tools/acr1311u-n2/.../NdefType4Reader.kt` | PC/SC Type 4 read |
| `tools/acr1311u-n2/.../MdocNfcReaderSession.kt` | Present from tap (NDEF first) |
| `tools/acr1311u-n2/src/main/resources/web/*` | Wait for tap without QR |
| `modules/expo-mdoc-proximity/.../NfcStaticHandover.kt` | Same encode as host (wallet copy) |
| `modules/expo-mdoc-proximity/.../NdefType4Handler.kt` | HCE Type 4 APDUs |
| `modules/expo-mdoc-proximity/.../CompanionHostApduService.kt` | Route NDEF AID |
| `modules/expo-mdoc-proximity/android/src/main/res/xml/companion_apdu_service.xml` | Add `D2760000850101` |
| `modules/expo-mdoc-proximity/.../MultipazPresentmentSession.kt` | NFC handover in transcript; publish NDEF bytes |
| `docs/TASKS.md`, `tools/acr1311u-n2/README.md`, `docs/ARCHITECTURE.md` | Runbook |

---

### Task 1: Remove wallet test mDL inject

**Files:**
- Delete: `src/components/proximity/InjectTestMdlButton.tsx`
- Delete: `src/services/proximity/injectTestMdl.ts`
- Delete: `src/services/proximity/injectTestMdl.test.ts`
- Delete: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/TestMdlGenerator.kt`
- Modify: `app/(tabs)/index.tsx` (remove import and `<InjectTestMdlButton />`)
- Modify: `src/services/proximity/nativeProximityModule.ts` (remove `generateTestMdl`)
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ExpoMdocProximityModule.kt` (remove `AsyncFunction("generateTestMdl")` block)

**Interfaces:**
- Consumes: none
- Produces: wallet has no TEST mint path; host `generate-mdl` unchanged

- [ ] **Step 1: Write the failing guard test**

Create `src/services/proximity/testMdlInjectRemoved.test.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'

describe('test mDL inject removed', () => {
  test('Home does not import InjectTestMdlButton', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../app/(tabs)/index.tsx'),
      'utf8',
    )
    expect(source).not.toMatch(/InjectTestMdlButton/)
  })

  test('inject service file is gone', () => {
    expect(
      fs.existsSync(path.join(__dirname, 'injectTestMdl.ts')),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/proximity/testMdlInjectRemoved.test.ts --no-coverage`

Expected: FAIL (`InjectTestMdlButton` still imported; `injectTestMdl.ts` exists)

- [ ] **Step 3: Delete inject path and native generator**

1. Remove from `app/(tabs)/index.tsx`:
   - `import { InjectTestMdlButton } from "../../src/components/proximity/InjectTestMdlButton";`
   - `<InjectTestMdlButton />`
2. Delete the three JS files listed above.
3. Remove `generateTestMdl` from `NativeProximityModule` in `nativeProximityModule.ts`.
4. Remove the entire `AsyncFunction("generateTestMdl") { ... }` from `ExpoMdocProximityModule.kt`.
5. Delete `TestMdlGenerator.kt` under `expo-mdoc-proximity` only. Do **not** touch `tools/acr1311u-n2/.../TestMdlGenerator.kt`.

- [ ] **Step 4: Run tests**

Run:

```bash
yarn test src/services/proximity/testMdlInjectRemoved.test.ts --no-coverage
yarn tsc --noEmit
```

Expected: PASS; `tsc` clean (no remaining `generateTestMdl` / `injectTestMdl` references).

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx src/services/proximity src/components/proximity src/services/proximity/nativeProximityModule.ts modules/expo-mdoc-proximity
git commit -m "feat(proximity): remove debug test mDL inject"
```

---

### Task 2: Tap-first arm (no PreTapConsent)

**Files:**
- Modify: `src/store/proximityStore.ts`
- Create: `src/store/proximityStore.test.ts`
- Modify: `app/(tabs)/present.tsx`

**Interfaces:**
- Consumes: `listMdocFieldKeysFromProfile`, `getReaderProfileForDocumentType`, existing `approvePresentation`
- Produces: `openPresentation(credentialId)` starts arm immediately for `mdoc-only`; status never sits on `awaiting-consent` for this golden path

- [ ] **Step 1: Write the failing store test**

Create `src/store/proximityStore.test.ts`:

```typescript
const armProximityPresentation = jest.fn(async () => undefined)
const disarmProximityPresentation = jest.fn(async () => undefined)
const denyProximityPresentation = jest.fn(async () => undefined)
const subscribeToProximityEvents = jest.fn(() => () => undefined)
const getDeviceEngagementUri = jest.fn(() => null)

jest.mock('@/src/services/proximity/proximityArmSession', () => ({
  armProximityPresentation: (...args: unknown[]) => armProximityPresentation(...args),
  disarmProximityPresentation: (...args: unknown[]) => disarmProximityPresentation(...args),
}))

jest.mock('@/src/services/proximity/proximityPresentation', () => ({
  denyProximityPresentation: (...args: unknown[]) => denyProximityPresentation(...args),
  ProximityPresentationError: class ProximityPresentationError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

jest.mock('@/src/services/proximity/nativeProximityModule', () => ({
  subscribeToProximityEvents: (...args: unknown[]) => subscribeToProximityEvents(...args),
  requireNativeProximityModule: () => ({ getDeviceEngagementUri }),
}))

jest.mock('@/src/services/credentials/storedCredentials', () => ({
  readStoredCredentialById: () => ({ id: 'cred-1', type: 'DLTDrivingLicence' }),
}))

jest.mock('@/src/services/history/walletHistoryRecording', () => ({
  recordNfcPresentationDeclined: jest.fn(),
  recordNfcPresentationFailure: jest.fn(),
  recordNfcPresentationSuccess: jest.fn(),
}))

import { useProximityStore } from './proximityStore'

describe('proximityStore tap-first', () => {
  beforeEach(() => {
    armProximityPresentation.mockClear()
    useProximityStore.getState().reset()
  })

  test('openPresentation arms mdoc-only with profile ceiling fields', async () => {
    useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
    await Promise.resolve()
    await Promise.resolve()

    expect(armProximityPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        sharingMode: 'mdoc-only',
        approvedMdocFields: [
          'org.iso.18013.5.1.family_name',
          'org.iso.18013.5.1.given_name',
          'org.iso.18013.5.1.birth_date',
        ],
      }),
    )
    expect(useProximityStore.getState().status).not.toBe('awaiting-consent')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/store/proximityStore.test.ts --no-coverage`

Expected: FAIL (`armProximityPresentation` not called; status is `awaiting-consent`)

- [ ] **Step 3: Implement tap-first `openPresentation`**

In `src/store/proximityStore.ts`, change `openPresentation` so that after setting `selectedCredentialId` / `sharingMode` it resolves the profile and invokes the existing `approvePresentation` path (do not leave `mdoc-only` on `awaiting-consent`):

```typescript
openPresentation: (credentialId, sharingMode = 'mdoc-only') => {
  activeUnsubscribe?.()
  activeUnsubscribe = null
  const record = readStoredCredentialById(credentialId)
  const profile = record
    ? getReaderProfileForDocumentType(record.type, sharingMode)
    : undefined
  const approvedMdocFields = profile ? listMdocFieldKeysFromProfile(profile) : []
  set({
    status: 'approved',
    selectedCredentialId: credentialId,
    sharingMode,
    approvedMdocFields,
    sharedFields: null,
    deviceEngagementUri: null,
    error: null,
  })
  void get().approvePresentation(approvedMdocFields)
},
```

If `approvedMdocFields` is empty, set `status: 'error'` with `No reader profile is configured for this document type.` and do not call `approvePresentation`.

In `app/(tabs)/present.tsx`, remove the `PreTapConsentPanel` branches (`status === 'awaiting-consent'`). Keep the blocked-credential and `mdocAvailable === false` panels. Change the no-mdoc message to:

`This document cannot be presented over NFC.`

Cancel remains `WaitingForTapPanel onCancel={exitFlow}` → existing `reset` / `denyPresentation`.

- [ ] **Step 4: Run tests**

Run: `yarn test src/store/proximityStore.test.ts --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/proximityStore.ts src/store/proximityStore.test.ts app/(tabs)/present.tsx
git commit -m "feat(proximity): arm NFC on present without pre-tap consent"
```

---

### Task 3: Waiting for tap UI without holder QR

**Files:**
- Modify: `src/components/proximity/WaitingForTapPanel.tsx`
- Create: `src/components/proximity/WaitingForTapPanel.test.tsx`
- Modify: `app/(tabs)/present.tsx` (pass ceiling labels; stop passing URI into the QR)

**Interfaces:**
- Consumes: `listMdocFieldKeysFromProfile` labels
- Produces: `WaitingForTapPanel({ preparing, ceilingLabels, onCancel })` — no `deviceEngagementUri`

- [ ] **Step 1: Write the failing panel test**

```tsx
import { render, screen } from '@testing-library/react-native'

import { WaitingForTapPanel } from './WaitingForTapPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockIcon() {
    return null
  }
})

jest.mock('react-native-qrcode-svg', () => {
  return function MockQR() {
    throw new Error('QR must not render on tap-only waiting panel')
  }
})

describe('WaitingForTapPanel', () => {
  test('shows hold instruction and ceiling, not a QR', () => {
    render(
      <WaitingForTapPanel
        ceilingLabels={['family name', 'given name', 'date of birth']}
        onCancel={jest.fn()}
      />,
    )
    expect(screen.getByText('Waiting for Tap...')).toBeTruthy()
    expect(
      screen.getByText(/Hold the phone still on the reader/i),
    ).toBeTruthy()
    expect(screen.getByText(/family name/)).toBeTruthy()
    expect(screen.queryByText(/scan this QR/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/components/proximity/WaitingForTapPanel.test.tsx --no-coverage`

Expected: FAIL (current copy still mentions QR; `QRCode` would throw if URI were passed — armed path currently passes URI)

- [ ] **Step 3: Rewrite the panel**

Replace `WaitingForTapPanel.tsx` so it does **not** import `react-native-qrcode-svg`:

```tsx
type WaitingForTapPanelProps = {
  preparing?: boolean
  ceilingLabels?: string[]
  onCancel: () => void
}

export function WaitingForTapPanel({
  preparing = false,
  ceilingLabels = [],
  onCancel,
}: WaitingForTapPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="nfc-search-variant" size={56} color={THEME.navy} />
        <Text className="mt-4 text-center text-lg font-semibold text-ink">
          {preparing ? 'Preparing NFC…' : 'Waiting for Tap...'}
        </Text>
        <Text className="mt-2 text-center text-sm text-slate">
          {preparing
            ? 'Keep this screen on. Do not leave until NFC is ready.'
            : 'Keep this screen on. Hold the phone still on the reader until Success. Do not tap and lift.'}
        </Text>
        {ceilingLabels.length > 0 && !preparing ? (
          <Text className="mt-4 text-center text-sm text-slate">
            This tap may share: {ceilingLabels.join(', ')}.
          </Text>
        ) : null}
      </View>
      <AppButton
        variant="outline-block"
        label="Cancel"
        onPress={onCancel}
        className="mt-6 border-slate200 py-3"
        textClassName="text-center text-sm font-semibold text-ink"
      />
    </View>
  )
}
```

In `present.tsx`, pass human labels (not raw `namespace.identifier`):

```tsx
const ceilingLabels = ['family name', 'given name', 'date of birth']
// ...
<WaitingForTapPanel preparing onCancel={exitFlow} />
<WaitingForTapPanel ceilingLabels={ceilingLabels} onCancel={exitFlow} />
```

Use those three strings only when `readerProfile?.profileId === 'mdl-acr1311u-n2-mdoc-only'`; otherwise map `profile.mdocFields` identifiers with underscores replaced by spaces.

Stop reading `deviceEngagementUri` for UI. Native may still generate it; do not display it.

- [ ] **Step 4: Run tests**

Run: `yarn test src/components/proximity/WaitingForTapPanel.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/proximity/WaitingForTapPanel.tsx src/components/proximity/WaitingForTapPanel.test.tsx app/(tabs)/present.tsx
git commit -m "feat(proximity): drop holder engagement QR from waiting panel"
```

---

### Task 4: Host static-handover NDEF codec

**Files:**
- Create: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/NfcStaticHandover.kt`
- Create: `tools/acr1311u-n2/src/test/kotlin/org/wallet/mdocnfchost/NfcStaticHandoverTest.kt`

**Interfaces:**
- Consumes: DeviceEngagement CBOR bytes
- Produces:

```kotlin
object NfcStaticHandover {
  fun encode(deviceEngagementCbor: ByteArray): ByteArray
  fun decode(ndefMessage: ByteArray): ByteArray
}
```

`encode` returns a complete NDEF message for ISO 18013-5:2021 static handover with NFC data retrieval (Handover Select + alternative carrier `nfc` + DeviceEngagement record). `decode` is the inverse and throws `IllegalArgumentException` if DeviceEngagement is missing.

Use Multipaz NDEF helpers if present on the 0.100.0 classpath (`org.multipaz.nfc` / NDEF record types). If the JVM artifact has no writer, implement the minimum NDEF record layout from ISO 18013-5 clause 9.2.1:

- Handover Select (`urn:nfc:wkt:Hs`) version 1.2
- Alternative Carrier pointing at id `nfc`
- Carrier configuration record type `iso.org:18013:nfc` (command/response max length `0xFFFF`)
- DeviceEngagement record type `iso.org:18013:deviceengagement` with payload = DeviceEngagement CBOR

- [ ] **Step 1: Write the failing round-trip test**

```kotlin
class NfcStaticHandoverTest {
  @Test
  fun roundTripDeviceEngagement() {
    val engagement = byteArrayOf(0xA1.toByte(), 0x00, 0x01, 0x02, 0x03)
    val ndef = NfcStaticHandover.encode(engagement)
    assertTrue(ndef.size > engagement.size)
    assertTrue(NfcStaticHandover.decode(ndef).contentEquals(engagement))
  }

  @Test
  fun rejectEmptyNdef() {
    assertFailsWith<IllegalArgumentException> {
      NfcStaticHandover.decode(byteArrayOf())
    }
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `tools/acr1311u-n2`: `.\gradlew.bat test --tests org.wallet.mdocnfchost.NfcStaticHandoverTest`

Expected: FAIL (class missing)

- [ ] **Step 3: Implement `NfcStaticHandover`**

Add `NfcStaticHandover.kt` so both tests pass. Keep encode/decode pure (no PC/SC).

- [ ] **Step 4: Run tests**

Run: `.\gradlew.bat test --tests org.wallet.mdocnfchost.NfcStaticHandoverTest`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/NfcStaticHandover.kt tools/acr1311u-n2/src/test/kotlin/org/wallet/mdocnfchost/NfcStaticHandoverTest.kt
git commit -m "feat(host): encode and decode ISO 18013-5 static NFC handover"
```

---

### Task 5: Host present-from-tap (NDEF then mdoc)

**Files:**
- Create: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/NdefType4Reader.kt`
- Modify: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/Constants.kt`
- Modify: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/MdocNfcReaderSession.kt`
- Modify: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/LocalVerifierServer.kt`
- Modify: `tools/acr1311u-n2/src/main/resources/web/index.html`
- Modify: `tools/acr1311u-n2/src/main/resources/web/app.js`
- Modify: `tools/acr1311u-n2/src/test/kotlin/org/wallet/mdocnfchost/EngagementParserTest.kt` (keep QR tests)

**Interfaces:**
- Consumes: `NfcStaticHandover.decode`, `PcscNfcIsoTag`
- Produces:

```kotlin
object NdefType4Reader {
  const val NDEF_AID_HEX = "D2760000850101"
  suspend fun readNdefMessage(tag: PcscNfcIsoTag): ByteArray
}

// MdocNfcReaderSession
suspend fun present(engagementUri: String?, timeoutMs: Long = DEFAULT_TAP_TIMEOUT_MS): MdocPresentmentResult
```

When `engagementUri` is null or blank, wait for card, `NdefType4Reader.readNdefMessage`, `NfcStaticHandover.decode`, then existing `attemptExchange`. When URI is non-blank, keep today’s QR path (lab fallback).

Type 4 read (ISO 7816): SELECT AID `D2760000850101`; SELECT CC (`02` / `E103`); READ BINARY CC; SELECT NDEF file from CC; READ BINARY NDEF payload. Map SELECT `6A82` through existing `StatusWordMapper`.

Session transcript for the tap path must use NFC handover (Task 7 wires wallet the same way). On the host, after NDEF decode, pass handover into session encryption **instead of `Simple.NULL`**. Until Task 7, keep a `handover` parameter on `attemptExchange`:

```kotlin
handover: org.multipaz.cbor.DataItem = Simple.NULL
```

For NDEF presentment set `handover` to the CBOR array ISO 18013-5 defines for NFC static handover (`[HandoverSelectBytes, null]` or Multipaz’s equivalent `NfcEngagementHandover` helper if 0.100.0 exposes it). QR fallback keeps `Simple.NULL`.

- [ ] **Step 1: Write the failing server/API test**

If HTTP tests are awkward, add `MdocNfcReaderSession` documentation test via `EngagementParserTest` neighbor:

```kotlin
@Test
fun blankEngagementMeansTapOnly() {
  assertTrue(engagementUri.isNullOrBlank() /* helper */)
}
```

Prefer a real unit test on a new helper:

```kotlin
object PresentmentEngagement {
  fun isTapOnly(engagement: String?): Boolean = engagement.isNullOrBlank()
}
```

```kotlin
@Test
fun tapOnlyWhenEngagementOmitted() {
  assertTrue(PresentmentEngagement.isTapOnly(null))
  assertTrue(PresentmentEngagement.isTapOnly("  "))
  assertFalse(PresentmentEngagement.isTapOnly("mdoc:abc"))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.\gradlew.bat test --tests org.wallet.mdocnfchost.PresentmentEngagementTest`

Expected: FAIL (missing)

- [ ] **Step 3: Implement tap-only present + page**

`LocalVerifierServer.handlePresent`: if JSON `engagement` missing/blank, call `MdocNfcReaderSession.present(null)`; else existing parse.

`app.js`: **Wait for tap** allowed with empty textarea. Status: `Waiting for tap on ACR1311… hold the phone still.` Keep Scan/paste as collapsed “Lab: paste mdoc QR”.

`index.html`: primary button copy `Wait for tap`. Note: holder does not show a QR.

`NdefType4Reader.readNdefMessage`: implement SELECT/READ as above; throw `MdocPresentmentException("6A82", ...)` on unarmed NDEF SELECT using `StatusWordMapper`.

- [ ] **Step 4: Run tests**

Run: `.\gradlew.bat test`

Expected: PASS (existing status-word + new handover + tap-only tests)

- [ ] **Step 5: Commit**

```bash
git add tools/acr1311u-n2
git commit -m "feat(host): default presentment reads static NFC handover from the phone"
```

---

### Task 6: Wallet Type 4 NDEF HCE

**Files:**
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/NfcStaticHandover.kt` (same encode as host Task 4; keep in sync)
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/NdefType4Handler.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/CompanionHostApduService.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/res/xml/companion_apdu_service.xml`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/CompanionSession.kt` (store NDEF bytes on arm)
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazPresentmentSession.kt` (publish NDEF when engagement is ready)

**Interfaces:**
- Consumes: DeviceEngagement CBOR already produced in `presentArmedDocument`
- Produces: armed HCE answers NDEF AID with Type 4 CC + NDEF file containing `NfcStaticHandover.encode(engagementCbor)`

Add to `companion_apdu_service.xml` inside the existing `aid-group`:

```xml
<aid-filter android:name="D2760000850101" />
```

Keep mdoc + companion AIDs. One `HostApduService` so `HcePreferredService` still claims a single component.

`NdefType4Handler.process(commandApdu): ByteArray`:

- Unarmed → `6A82`
- SELECT NDEF AID → `9000` and mark selected `ndef`
- SELECT CC / NDEF file + READ BINARY per Type 4
- Unknown INS → `6D00`

Do **not** forward NDEF APDUs into `NfcTransportMdoc` (that path crashes on unsupported INS).

When engagement URI is built, also:

```kotlin
CompanionSession.setNdefMessage(NfcStaticHandover.encode(encodedDeviceEngagement.toByteArray()))
```

Clear NDEF on `disarm`.

`CompanionHostApduService`: if `isSelectAid(..., NDEF_AID)` or `readSelectedAid() == "ndef"`, return `NdefType4Handler.process(commandApdu)` (synchronous bytes, not async Multipaz).

- [ ] **Step 1: Compile-gate**

No Android instrumented test in this repo. Add a tiny JVM-unfriendly comment test is not possible here. Instead add a Kotlin unit-test-free compile check plus a host round-trip using the **same** encode function copied byte-for-byte. After copy, run host `NfcStaticHandoverTest` still PASS.

Document in the commit that wallet `NfcStaticHandover.kt` must stay behavior-identical to the host file (same record order). If a constant diverges, NDEF decode on the host fails.

- [ ] **Step 2: Implement handler + AID + session publish**

As specified above.

- [ ] **Step 3: Compile native module**

Run: `cd android; .\gradlew.bat :expo-mdoc-proximity:compileDebugKotlin --console=plain -q`

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add modules/expo-mdoc-proximity
git commit -m "feat(proximity): serve ISO 18013-5 static handover over HCE NDEF"
```

---

### Task 7: NFC handover in session transcript

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazPresentmentSession.kt`
- Modify: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/MdocNfcReaderSession.kt`

**Interfaces:**
- Consumes: NDEF message bytes from Task 4/6
- Produces: `Iso18013Presentment(..., handover = nfcHandoverDataItem)` matching host `SessionEncryption` handover

ISO 18013-5 NFC static handover transcript uses handover = CBOR array of the Handover Select message bytes (and null request). Implement one function on both sides:

```kotlin
fun nfcStaticHandoverDataItem(ndefMessage: ByteArray): DataItem =
  buildCborArray {
    add(Bstr(ndefMessage))
    add(Simple.NULL)
  }
```

Put it next to `NfcStaticHandover` (host) and the wallet copy. QR fallback on the host keeps `Simple.NULL`. Wallet tap-only path **never** uses `Simple.NULL`.

Replace `handover = Simple.NULL` in `Iso18013Presentment(...)` with `nfcStaticHandoverDataItem(CompanionSession.ndefMessage()!!)`.

If NDEF bytes are missing, fail the session with `PROXIMITY_NOT_READY` (do not send a decrypt-mismatch DeviceResponse).

- [ ] **Step 1: Host test that QR vs NDEF handover differs**

```kotlin
@Test
fun nfcHandoverIsNotNull() {
  val ndef = NfcStaticHandover.encode(byteArrayOf(0x01))
  val item = NfcStaticHandover.handoverDataItem(ndef)
  assertTrue(item !== Simple.NULL)
}
```

- [ ] **Step 2: Run to fail, then add `handoverDataItem`, re-run PASS**

- [ ] **Step 3: Wire both presentment paths**

Wallet `Iso18013Presentment` + host `attemptExchange` session transcript third element.

- [ ] **Step 4: Compile**

Wallet: `.\gradlew.bat :expo-mdoc-proximity:compileDebugKotlin`  
Host: `.\gradlew.bat test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/expo-mdoc-proximity tools/acr1311u-n2
git commit -m "feat(proximity): use NFC static handover in session transcript"
```

---

### Task 8: Docs and physical gate

**Files:**
- Modify: `tools/acr1311u-n2/README.md`
- Modify: `docs/ARCHITECTURE.md` (NFC presentation row: tap-only static handover; QR is lab fallback)
- Modify: `docs/TASKS.md` (session note + physical checklist)
- Modify: `docs/superpowers/specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md` — one-line pointer that holder QR engagement is superseded for mDL by `2026-08-17-mdl-nfc-static-handover-tap-only-design.md`

**Interfaces:** none

- [ ] **Step 1: Rewrite host README golden path**

Replace “QR then tap” with:

1. Claim Driving Licence from the Issuer (no Add test mDL).  
2. `.\gradlew.bat run` → `http://127.0.0.1:8787` → **Wait for tap** (empty engagement).  
3. Phone: Driving Licence → NFC → Waiting for tap (no QR) → hold still on ACR1311.  
4. Pass = three claims on the page and wallet Success.

Keep a short “Lab fallback” section for paste `mdoc:` QR.

Delete Home **Add test mDL** from the cheat-sheet.

- [ ] **Step 2: Architecture + TASKS**

ARCHITECTURE table row: Present to reader (proximity) | Credential detail → NFC → hold | ISO 18013-5 static NFC handover + mdoc data retrieval | Send mdoc | Spec 2026-08-17

TASKS session:

```markdown
### Session 2026-08-17 (tap-only static NFC handover)

- Holder golden path no longer shows DeviceEngagement QR or Add test mDL.
- Physical gate: three tap-only runs on A26 + ACR1311 with an issued mDL.
```

- [ ] **Step 3: Commit**

```bash
git add tools/acr1311u-n2/README.md docs/ARCHITECTURE.md docs/TASKS.md docs/superpowers/specs/2026-07-27-mdl-mdoc-only-nfc-v1-design.md
git commit -m "docs: tap-only mDL NFC static handover runbook"
```

- [ ] **Step 4: Physical validation (manual)**

Rebuild: `npx expo run:android`. Restart host. Three issued-mDL taps with **empty** host engagement field. Record PASS/FAIL in `docs/TASKS.md`. A second hold after NDEF→mdoc field drop is allowed; requiring a holder QR is not.

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Remove test mDL | 1 |
| Tap-first, no PreTapConsent | 2 |
| Waiting for tap, no QR, ceiling copy | 3 |
| Host NDEF default + QR lab fallback | 4–5 |
| Wallet NDEF HCE + preferred single service | 6 |
| NFC handover transcript (not `Simple.NULL`) | 7 |
| Disclosure ∩ ceiling (already native) | unchanged; Task 2 still passes profile fields |
| Docs + physical PASS | 8 |
| No negotiated handover / BLE / dual-format / iOS / auto-purge | omitted on purpose |

**Placeholder scan:** no TBD. Host/wallet `NfcStaticHandover` duplication is explicit.

**Types:** `present(engagementUri: String?)`, `NfcStaticHandover.encode/decode`, `handoverDataItem`, NDEF AID `D2760000850101` used in XML, handler, and host reader.
