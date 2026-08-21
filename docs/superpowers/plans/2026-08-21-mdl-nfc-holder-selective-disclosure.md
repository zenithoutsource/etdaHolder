# mDL NFC Holder Selective Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NFC Presentment Consent lets the holder toggle every listed mDL field; tap sends `DeviceRequest ∩ holder selection` and omits declined fields. Wallet Success is verification-complete only (no claim list). The ACR1311 page shows received vs omitted with the Thai omit reason. Sent `birth_date` must appear as a value, not omitted copy.

**Architecture:** Split native arm into `profileCeiling` (fail-closed max) and `approvedMdocFields` (holder selection). `ApprovedMdocFieldCeiling.extraFieldCount` uses the ceiling. After Multipaz silent consent, filter `CredentialSelection.matches[].claims` to the selection (Multipaz `mdocPresentment` builds `DeviceResponse` from those keys with an empty `errors` map — that is the omit path). Complete event carries `sharedFields` plus `omittedFields[{key,reason}]`. Consent reuses `PresentationDisclosureList` `variant="consent"` with `toggleable: true`.

**Tech Stack:** Expo SDK 54, React Native / NativeWind, Jest + `@testing-library/react-native`, Kotlin Multipaz `0.100.0` (`CredentialSelection` / `CredentialPresentmentSetOptionMemberMatch` data classes), PC/SC host `tools/acr1311u-n2`, Yarn.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-21-mdl-nfc-holder-selective-disclosure-design.md`
- English-only new identifiers, comments, and docs. Existing Thai UI copy stays (including ผู้ถือบัตรไม่ยินยอมเปิดเผย / ไม่มีในเอกสารที่ส่ง / ไม่ได้ส่ง).
- Do not add the customer organization name in new identifiers, files, or docs. Wire AIDs stay opaque.
- Yarn only. Kotlin wallet changes need `npx expo run:android`. Host Kotlin/JS needs `Ctrl+C` then `.\gradlew.bat run` and a hard-refresh.
- One biometric at NFC device-auth sign time only. No consent after `DeviceRequest`.
- Do not log credential claims, mdoc payloads, or key material (keys + reason codes only).
- No new `EXPO_PUBLIC_*` window.
- OID4VP mdoc toggles, post-tap consent, expanding ISO mandatory fields, custom ISO Errors on the wire, BLE, TNEP, iOS are out of scope.
- P1–P6 canvases unchanged (online VP). This is ADR 0003 proximity.
- Reuse `PresentationDisclosureList` / `prepareHolderFacingDisclosureItems`. Do not add a second consent list.
- If Multipaz still ends the session with **status 20** when DeviceRequest includes an on-mDL identifier that was filtered out of `CredentialSelection`, stop and fix omit before shipping toggles.

## File map

| File | Responsibility |
|---|---|
| `src/config/nfcDisclosureCopy.ts` | Thai omitted-reason strings shared by Success UI |
| `ApprovedMdocFieldCeiling.kt` | extra vs **profile ceiling**; filter selection; omitted list |
| `ApprovedMdocFieldCeilingTest.kt` | JUnit for extra / filter / omitted |
| `ProximityArmState` (`CompanionSession.kt`) | add `profileCeiling` |
| `ExpoMdocProximityModule.kt` | read `profileCeiling` on arm |
| `MdocProximityEngine.kt` | approve subset vs `profileCeiling` |
| `MultipazPresentmentSession.kt` | ceiling check + filter + store sent/omitted |
| `ProximityEventDispatcher.kt` / `StoredMdocPresentationEngine.kt` | complete event with `omittedFields` |
| `nativeProximityModule.ts` | `profileCeiling` + omitted event types |
| `proximityArmSession.ts` | pass both lists |
| `proximityStore.ts` | arm selected keys; store omitted |
| `PreTapConsentPanel.tsx` | toggles; `onAccept(selectedKeys)` |
| `app/(tabs)/present.tsx` | pass selected keys; Success props |
| `src/components/proximity/PresentationResultPanel.tsx` | sent then omitted |
| `PresentationSuccessPanel.tsx` | optional details slot |
| `tools/acr1311u-n2/.../HostClaimDisplay.kt` | omitted requested identifiers |
| `LocalVerifierServer.kt` + `app.js` | render ไม่ได้ส่ง + reason |
| `docs/ui-reference/nfc-presentment-consent.html` | toggles, not all-or-nothing |
| `docs/TASKS.md` | implementation note |

---

### Task 1: Native ceiling vs selection helpers

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ApprovedMdocFieldCeiling.kt`
- Create: `modules/expo-mdoc-proximity/android/src/test/java/com/etdawallet/mdocproximity/ApprovedMdocFieldCeilingTest.kt`

**Interfaces:**
- Consumes: existing `contains` / `fieldKey` / `requestedFieldKeys`
- Produces:
  - `REASON_HOLDER_DECLINED = "holder_declined"`
  - `REASON_NOT_IN_DOCUMENT = "not_in_document"`
  - `data class OmittedMdocField(val key: String, val reason: String)`
  - `fun extraIdentifierCount(ceiling: Collection<String>, requestedKeys: Collection<String>): Int`
  - `fun extraFieldCount(ceiling, selection)` delegates to `extraIdentifierCount` + `requestedFieldKeys`
  - `fun filterToApproved(selection: CredentialSelection, approved: Collection<String>): CredentialSelection`
  - `fun disclosedAndOmitted(requestedKeys, approved, ceiling): Pair<List<String>, List<OmittedMdocField>>`

- [ ] **Step 1: Write the failing JUnit tests**

```kotlin
package com.etdawallet.mdocproximity

import org.junit.Assert.assertEquals
import org.junit.Test

class ApprovedMdocFieldCeilingTest {
  private val ns = "org.iso.18013.5.1"
  private val ceiling = listOf(
    "$ns.family_name",
    "$ns.given_name",
    "$ns.birth_date",
    "$ns.driving_privileges",
    "$ns.issue_date",
    "$ns.expiry_date",
  )
  private val requested = ceiling
  private val approvedWithoutExpiry = ceiling.filter { !it.endsWith("expiry_date") }

  @Test
  fun extraCountIsZeroWhenRequestStaysInsideCeilingEvenIfHolderTurnedAFieldOff() {
    assertEquals(0, ApprovedMdocFieldCeiling.extraIdentifierCount(ceiling, requested))
  }

  @Test
  fun extraCountFlagsIdentifiersOutsideTheProfileCeiling() {
    assertEquals(
      1,
      ApprovedMdocFieldCeiling.extraIdentifierCount(ceiling, requested + "$ns.portrait"),
    )
  }

  @Test
  fun holderDeclinedOmittedWhenRequestedInCeilingButNotSelected() {
    val (disclosed, omitted) = ApprovedMdocFieldCeiling.disclosedAndOmitted(
      requestedKeys = requested,
      approved = approvedWithoutExpiry,
      ceiling = ceiling,
    )
    assertEquals(approvedWithoutExpiry, disclosed)
    assertEquals(1, omitted.size)
    assertEquals("$ns.expiry_date", omitted[0].key)
    assertEquals(ApprovedMdocFieldCeiling.REASON_HOLDER_DECLINED, omitted[0].reason)
  }

  @Test
  fun disclosedKeysAreRequestIntersectApproved() {
    val (disclosed, omitted) = ApprovedMdocFieldCeiling.disclosedAndOmitted(
      requestedKeys = listOf("$ns.given_name", "$ns.expiry_date"),
      approved = approvedWithoutExpiry,
      ceiling = ceiling,
    )
    assertEquals(listOf("$ns.given_name"), disclosed)
    assertEquals("$ns.expiry_date", omitted.single().key)
  }
}
```

- [ ] **Step 2: Run the test and confirm it fails**

From repo root (or the Android library module, matching existing extractor tests):

```bash
cd modules/expo-mdoc-proximity/android
# If this module is only built via the Expo app gradle, run from android/:
# .\gradlew.bat :expo-mdoc-proximity:testDebugUnitTest --tests com.etdawallet.mdocproximity.ApprovedMdocFieldCeilingTest
```

Expected: FAIL (methods missing) or FAIL on extra-count using selection.

- [ ] **Step 3: Implement helpers**

Keep `contains` / `fieldKey` / `requestedFieldKeys`. Change `extraFieldCount` to take the **ceiling**. Add:

```kotlin
const val REASON_HOLDER_DECLINED = "holder_declined"
const val REASON_NOT_IN_DOCUMENT = "not_in_document"

data class OmittedMdocField(val key: String, val reason: String)

fun extraIdentifierCount(ceiling: Collection<String>, requestedKeys: Collection<String>): Int =
  requestedKeys.count { key ->
    val identifier = key.substringAfterLast('.', key.substringAfterLast(':', key))
    val namespace = key.removeSuffix(".$identifier").removeSuffix(":$identifier")
    if (namespace == key) !contains(ceiling, "", key) else !contains(ceiling, namespace, identifier)
  }

fun extraFieldCount(ceiling: Collection<String>, selection: CredentialSelection): Int =
  extraIdentifierCount(ceiling, requestedFieldKeys(selection))

fun filterToApproved(selection: CredentialSelection, approved: Collection<String>): CredentialSelection =
  CredentialSelection(
    matches = selection.matches.map { match ->
      match.copy(
        claims = match.claims.filterKeys { requested ->
          val mdoc = requested as? MdocRequestedClaim ?: return@filterKeys false
          contains(approved, mdoc.namespaceName, mdoc.dataElementName)
        },
      )
    },
  )

fun disclosedAndOmitted(
  requestedKeys: Collection<String>,
  approved: Collection<String>,
  ceiling: Collection<String>,
): Pair<List<String>, List<OmittedMdocField>> {
  val disclosed = requestedKeys.filter { key ->
    val identifier = key.substringAfterLast('.', key.substringAfterLast(':', key))
    val namespace = key.removeSuffix(".$identifier").removeSuffix(":$identifier")
    contains(approved, namespace, identifier)
  }
  val omitted = requestedKeys.mapNotNull { key ->
    val identifier = key.substringAfterLast('.', key.substringAfterLast(':', key))
    val namespace = key.removeSuffix(".$identifier").removeSuffix(":$identifier")
    when {
      !contains(ceiling, namespace, identifier) -> null
      contains(approved, namespace, identifier) -> null
      else -> OmittedMdocField(key, REASON_HOLDER_DECLINED)
    }
  }
  return disclosed to omitted
}
```

Prefer extracting a private `splitKey` so namespace/identifier parsing is not copy-pasted.

- [ ] **Step 4: Re-run tests — expected PASS**

- [ ] **Step 5: Commit** (only if the user asked to commit)

```bash
git add modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ApprovedMdocFieldCeiling.kt
git add modules/expo-mdoc-proximity/android/src/test/java/com/etdawallet/mdocproximity/ApprovedMdocFieldCeilingTest.kt
git commit -m "test: split NFC mdoc ceiling from holder selection"
```

---

### Task 2: Arm `profileCeiling` and complete-event omitted list

**Files:**
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/CompanionSession.kt` (`ProximityArmState`)
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ExpoMdocProximityModule.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MdocProximityEngine.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/MultipazPresentmentSession.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ProximityEventDispatcher.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/StoredMdocPresentationEngine.kt`
- Modify: `src/services/proximity/nativeProximityModule.ts`
- Modify: `src/services/proximity/proximityArmSession.ts`
- Modify: `src/services/proximity/proximityArmSession.test.ts`
- Modify: `src/services/proximity/proximityPresentation.ts`
- Modify: `src/services/proximity/nfcPresentmentCompleteOnSend.test.ts` (only if the notify signature string-match breaks)

**Interfaces:**
- Consumes: Task 1 helpers
- Produces:
  - `ProximityArmState.profileCeiling: List<String>` (default `approvedMdocFields` if omitted for safety)
  - `ProximityArmConfig.profileCeiling: string[]`
  - `onPresentationComplete: { sharedFields: string[]; omittedFields: { key: string; reason: string }[] }`
  - `armProximityPresentation` passes `profileCeiling` from `listMdocFieldKeysFromProfile`

- [ ] **Step 1: Failing JS tests for arm payload**

In `proximityArmSession.test.ts`, after the overlay tests, add:

```typescript
test('passes profileCeiling from the reader profile and selected approvedMdocFields', async () => {
  mockPrepareMdocDeviceAuthForArm.mockResolvedValue(undefined)
  mockReadStoredCredentialById.mockReturnValue({
    id: 'licence-1',
    type: 'DLTDrivingLicence',
    rawVc: 'dl',
    claims: { givenName: 'สมชาย', familyName: 'ใจดี' },
    issuedAt: '2026-01-01T00:00:00.000Z',
  })

  await armProximityPresentation({
    credentialId: 'licence-1',
    approvedMdocFields: ['org.iso.18013.5.1.given_name'],
    profileCeiling: [
      'org.iso.18013.5.1.family_name',
      'org.iso.18013.5.1.given_name',
    ],
    sharingMode: 'mdoc-only',
    mdocPayloadBytes: 10,
  })

  expect(mockArmProximitySession).toHaveBeenCalledWith(
    expect.objectContaining({
      approvedMdocFields: ['org.iso.18013.5.1.given_name'],
      profileCeiling: [
        'org.iso.18013.5.1.family_name',
        'org.iso.18013.5.1.given_name',
      ],
    }),
  )
})
```

Add `profileCeiling?: string[]` to `ArmProximityPresentationInput` only after the test fails on the missing property / missing native key.

- [ ] **Step 2: Run** `yarn test src/services/proximity/proximityArmSession.test.ts` — expected FAIL

- [ ] **Step 3: Wire native + JS**

`ProximityArmState`:

```kotlin
data class ProximityArmState(
  val credentialId: String,
  val sharingMode: String,
  val profileId: String,
  val approvedMdocFields: List<String>,
  val profileCeiling: List<String> = approvedMdocFields,
  // ...existing fields
)
```

`armProximitySessionBody`: read `profileCeiling` via `readStringList`; if empty, use `approvedFields`. Reject if `approvedFields` is empty. Reject if any approved field is not in the ceiling (`contains`).

`MdocProximityEngine.approvePresentation`:

```kotlin
val ceiling = state.profileCeiling.ifEmpty { state.approvedMdocFields }.toSet()
val approved = if (requestedFields.isEmpty()) state.approvedMdocFields else requestedFields
if (approved.isEmpty() || approved.any { field ->
    !ApprovedMdocFieldCeiling.contains(ceiling, field.substringBeforeLast('.', ""), field.substringAfterLast('.'))
      && !ceiling.contains(field)
  }) {
  throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "Requested fields exceed the pre-tap consent ceiling")
}
CompanionSession.markPresentationApproved(approved) // must NOT copy over profileCeiling
```

`enforceConsentCeiling` must take `state` (or both lists):

```kotlin
val requestedKeys = ApprovedMdocFieldCeiling.requestedFieldKeys(selection)
ProximityEventDispatcher.sendRequestReceived(requestedKeys)

val extraCount = ApprovedMdocFieldCeiling.extraFieldCount(state.profileCeiling, selection)
if (extraCount > 0) {
  throw MdocProximityException(MdocProximityErrors.DISCLOSURE_CEILING_EXCEEDED, "Presentation failed — try again")
}

val filtered = ApprovedMdocFieldCeiling.filterToApproved(selection, state.approvedMdocFields)
val (disclosed, omitted) = ApprovedMdocFieldCeiling.disclosedAndOmitted(
  requestedKeys,
  state.approvedMdocFields,
  state.profileCeiling,
)
CompanionSession.storeDisclosureOutcome(disclosed, omitted)
return filtered
```

Add `storeDisclosureOutcome` / `readDisclosureOutcome` on `CompanionSession` (keys + reason codes only).

`onSendingResponse`:

```kotlin
val outcome = CompanionSession.readDisclosureOutcome()
sharedFields.set(outcome?.first ?: state.approvedMdocFields)
StoredMdocPresentationEngine.notifyPresentationComplete(sharedFields.get(), outcome?.second.orEmpty())
```

`ProximityEventDispatcher.sendPresentationComplete(sharedFields, omittedFields)`:

```kotlin
emitter?.invoke(
  "onPresentationComplete",
  mapOf(
    "sharedFields" to sharedFields,
    "omittedFields" to omittedFields.map { mapOf("key" to it.key, "reason" to it.reason) },
  ),
)
```

JS types:

```ts
export type OmittedMdocField = { key: string; reason: 'holder_declined' | 'not_in_document' | string }

export type ProximityArmConfig = {
  // existing
  approvedMdocFields: string[]
  profileCeiling: string[]
}

onPresentationComplete: { sharedFields: string[]; omittedFields?: OmittedMdocField[] }
```

`proximityPresentation.ts` `onPresentationComplete` callback must forward the **event object**, not only `sharedFields`.

`proximityArmSession.ts`: require `profileCeiling` on the input (or resolve it from the stored credential's reader profile if omitted, so dual-format callers do not break). Prefer explicit from the store.

ShowConsentPromptFn currently passes `approvedFields = state.approvedMdocFields` into `enforceConsentCeiling` — change the call to pass `state`.

- [ ] **Step 4: Re-run arm-session Jest — expected PASS.** Kotlin unit tests from Task 1 still PASS.

- [ ] **Step 5: Commit** (only if asked)

---

### Task 3: Consent toggles

**Files:**
- Modify: `src/components/proximity/PreTapConsentPanel.tsx`
- Modify: `src/components/proximity/PreTapConsentPanel.test.tsx`
- Modify: `app/(tabs)/present.tsx`

**Interfaces:**
- Consumes: `PresentationDisclosureList` consent + `onToggle` (already tested in `PresentationDisclosureList.test.tsx`)
- Produces: `onAccept(selectedKeys: string[])` — keys are `namespace.identifier`

- [ ] **Step 1: Write failing tests**

Replace the Accept test in `PreTapConsentPanel.test.tsx`:

```typescript
test('Accept passes selected keys and is disabled when none remain on', () => {
  expect(profile).toBeDefined()
  if (!profile) return

  const onAccept = jest.fn()
  render(<PreTapConsentPanel profile={profile} onAccept={onAccept} onDecline={jest.fn()} />)

  fireEvent.press(screen.getByText('รับทราบและยินยอมส่งข้อมูล'))
  expect(onAccept).toHaveBeenCalledWith(
    expect.arrayContaining(['org.iso.18013.5.1.expiry_date']),
  )
  expect(onAccept.mock.calls[0][0]).toHaveLength(profile.mdocFields.length)

  fireEvent.press(screen.getByLabelText('วันหมดอายุ'))
  onAccept.mockClear()
  fireEvent.press(screen.getByText('รับทราบและยินยอมส่งข้อมูล'))
  expect(onAccept.mock.calls[0][0]).not.toContain('org.iso.18013.5.1.expiry_date')
  expect(onAccept.mock.calls[0][0].length).toBe(profile.mdocFields.length - 1)

  for (const field of profile.mdocFields) {
    const label = /* use resolvePresentationDisclosureLabel('DLTDrivingLicence', field.identifier) */
  }
})
```

Use `resolvePresentationDisclosureLabel` for labels. After turning every remaining row off, expect the Accept button to be disabled (`disabled` / no `onAccept` call).

Keep religion-hidden and given-before-family tests.

- [ ] **Step 2:** `yarn test src/components/proximity/PreTapConsentPanel.test.tsx` — expected FAIL (`onAccept` currently `() => void`)

- [ ] **Step 3: Implement panel**

```tsx
type PreTapConsentPanelProps = {
  profile: ReaderProfile
  onAccept: (selectedKeys: string[]) => void
  onDecline: () => void
  submitting?: boolean
}

export function PreTapConsentPanel(...) {
  const visibleItems = prepareHolderFacingDisclosureItems(
    profile.mdocFields.map((field) => ({
      key: `${field.namespace}.${field.identifier}`,
      label: resolvePresentationDisclosureLabel(profile.documentType, field.identifier),
    })),
  )
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(visibleItems.map((item) => item.key)),
  )
  const items = visibleItems.map((item) => ({
    ...item,
    selected: selectedKeys.has(item.key),
    toggleable: true as const,
  }))
  const selectedList = items.filter((item) => item.selected).map((item) => item.key)

  return (
    // existing chrome
    <PresentationDisclosureList
      items={items}
      variant="consent"
      onToggle={(key) => {
        setSelectedKeys((previous) => {
          const next = new Set(previous)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }}
    />
    <AppButton
      variant="solid-block"
      label="รับทราบและยินยอมส่งข้อมูล"
      onPress={() => onAccept(selectedList)}
      loading={submitting}
      disabled={selectedList.length === 0}
      className="mt-8 w-full py-4"
    />
    // Decline unchanged
  )
}
```

`present.tsx`:

```tsx
const handleAccept = useCallback((selectedKeys: string[]) => {
  if (selectedKeys.length === 0) return
  void approvePresentation(selectedKeys)
}, [approvePresentation])
```

Do **not** pass store `approvedMdocFields` (the full profile) into approve.

- [ ] **Step 4: Re-run PreTapConsentPanel tests — expected PASS**

- [ ] **Step 5: Commit** (only if asked)

---

### Task 4: Store omitted + NFC Success UI

**Files:**
- Modify: `src/config/nfcDisclosureCopy.ts` (create)
- Modify: `src/store/proximityStore.ts`
- Modify: `src/store/proximityStore.test.ts`
- Modify: `src/components/PresentationSuccessPanel.tsx`
- Modify: `src/components/proximity/PresentationResultPanel.tsx`
- Modify: `src/components/proximity/PresentationResultPanel.test.tsx`
- Modify: `app/(tabs)/present.tsx`

**Interfaces:**
- Consumes: Task 2 complete event; `NFC_DISCLOSURE_COPY`; `resolvePresentationDisclosureLabel`
- Produces: store `omittedFields`; Success lists sent then omitted; history still **sent labels only**

- [ ] **Step 1: Failing tests**

`nfcDisclosureCopy.ts` can be created in the implement step; tests may import it.

`proximityStore.test.ts`:

```typescript
test('approvePresentation arms with selected keys not the full openPresentation ceiling', async () => {
  useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
  const selected = mdlCeiling.filter((key) => !key.endsWith('expiry_date'))
  await useProximityStore.getState().approvePresentation(selected)
  expect(mockArmProximityPresentation).toHaveBeenCalledWith(
    expect.objectContaining({
      approvedMdocFields: selected,
      profileCeiling: mdlCeiling,
    }),
  )
})

test('presentation complete stores omitted fields and history uses sent labels only', async () => {
  useProximityStore.getState().openPresentation('cred-1', 'mdoc-only')
  await useProximityStore.getState().approvePresentation(mdlCeiling)
  capturedHandlers?.onPresentationComplete?.({
    sharedFields: ['org.iso.18013.5.1.given_name'],
    omittedFields: [{ key: 'org.iso.18013.5.1.expiry_date', reason: 'holder_declined' }],
  })
  expect(useProximityStore.getState().omittedFields).toEqual([
    { key: 'org.iso.18013.5.1.expiry_date', reason: 'holder_declined' },
  ])
  expect(recordNfcPresentationSuccess).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'DLTDrivingLicence' }),
    ['ชื่อ'],
  )
})
```

Update `ProximityEventHandlers` `onPresentationComplete` type in the test mock.

`PresentationResultPanel.test.tsx`:

```typescript
test('lists sent fields then omitted fields with holder-decline copy', () => {
  render(
    <PresentationResultPanel
      credentialType="DLTDrivingLicence"
      sharedFields={['org.iso.18013.5.1.given_name']}
      omittedFields={[{ key: 'org.iso.18013.5.1.expiry_date', reason: 'holder_declined' }]}
      onDone={jest.fn()}
    />,
  )
  expect(screen.getByText('ชื่อ')).toBeTruthy()
  expect(screen.getByText('วันหมดอายุ')).toBeTruthy()
  expect(screen.getByText('ผู้ถือบัตรไม่ยินยอมเปิดเผย')).toBeTruthy()
})
```

- [ ] **Step 2:** `yarn test src/store/proximityStore.test.ts src/components/proximity/PresentationResultPanel.test.tsx` — expected FAIL

- [ ] **Step 3: Implement**

```ts
// src/config/nfcDisclosureCopy.ts
export const NFC_DISCLOSURE_COPY = {
  holderDeclined: 'ผู้ถือบัตรไม่ยินยอมเปิดเผย',
  notInDocument: 'ไม่มีในเอกสารที่ส่ง',
  omittedValue: 'ไม่ได้ส่ง',
} as const

export function readNfcOmittedReasonCopy(reason: string): string {
  if (reason === 'not_in_document') return NFC_DISCLOSURE_COPY.notInDocument
  return NFC_DISCLOSURE_COPY.holderDeclined
}
```

Store: add `omittedFields: OmittedMdocField[] | null`. Reset on open/deny/reset. `approvePresentation` calls:

```ts
await armProximityPresentation({
  credentialId: selectedCredentialId,
  approvedMdocFields,
  profileCeiling: readProximityProfileCeiling(selectedCredentialId, sharingMode),
  sharingMode,
  mdocPayloadBytes: 0,
})
```

`readProximityProfileCeiling` = `listMdocFieldKeysFromProfile` for the credential's profile (same as today's openPresentation list).

Complete handler: `set({ status: 'complete', sharedFields: event.sharedFields, omittedFields: event.omittedFields ?? [] })`. History uses `event.sharedFields` labels only.

`PresentationSuccessPanel`: add optional `children?: React.ReactNode` after the message `Text`, before `AppButton`.

Proximity result panel:

```tsx
<VerifierPresentationResultPanel verifierName={...} onDone={onDone}>
  <PresentationDisclosureList
    variant="result"
    items={sentItems}
  />
  {omittedItems.length ? (
    <PresentationDisclosureList
      variant="result"
      items={omittedItems} // value = readNfcOmittedReasonCopy(reason)
    />
  ) : null}
</VerifierPresentationResultPanel>
```

The OID4VP `PresentationResultPanel` must forward `children`. Sent items: `selected: true`. Omitted: `selected: false` is fine; result variant uses check icons — omitted rows should still show the reason as `value`.

`present.tsx` complete branch:

```tsx
<PresentationResultPanel
  credentialType={credential?.type}
  sharedFields={sharedFields ?? []}
  omittedFields={omittedFields ?? []}
  onDone={exitFlow}
/>
```

- [ ] **Step 4: Re-run store + result panel tests — expected PASS**

- [ ] **Step 5: Commit** (only if asked)

---

### Task 5: ACR1311 omitted rows

**Files:**
- Create: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/HostClaimDisplay.kt`
- Create: `tools/acr1311u-n2/src/test/kotlin/org/wallet/mdocnfchost/HostClaimDisplayTest.kt`
- Modify: `tools/acr1311u-n2/src/main/kotlin/org/wallet/mdocnfchost/LocalVerifierServer.kt`
- Modify: `tools/acr1311u-n2/src/main/resources/web/app.js`
- Modify: `tools/acr1311u-n2/src/main/resources/web/index.html` (optional muted omitted style)

**Interfaces:**
- Consumes: `MDL_REQUEST_FIELDS` from `Constants.kt`; existing `claims` map (do **not** treat `age_over_18` as requested)
- Produces: `/api/present` JSON `omittedFields: [{ key, reason: "holder_declined" }]`; page rows ไม่ได้ส่ง + ผู้ถือบัตรไม่ยินยอมเปิดเผย

- [ ] **Step 1: Failing Kotlin test**

```kotlin
class HostClaimDisplayTest {
  @Test
  fun omitsRequestedIdentifierMissingFromClaims() {
    val omitted = HostClaimDisplay.omittedFields(
      requested = MDL_REQUEST_FIELDS,
      claims = mapOf("given_name" to "สมชาย", "family_name" to "ใจดี"),
    )
    assertTrue(omitted.any { it.key == "expiry_date" && it.reason == "holder_declined" })
    assertTrue(omitted.none { it.key == "age_over_18" })
  }

  @Test
  fun doesNotOmitWhenClaimIsPresentIncludingNestedDatesCopiedOntoClaims() {
    val omitted = HostClaimDisplay.omittedFields(
      requested = MDL_REQUEST_FIELDS,
      claims = mapOf(
        "given_name" to "A",
        "family_name" to "B",
        "age_over_18" to "ใช่",
        "driving_privileges" to "รถยนต์ส่วนบุคคล",
        "issue_date" to "2024-01-01",
        "expiry_date" to "2034-01-01",
      ),
    )
    assertTrue(omitted.isEmpty())
  }
}
```

- [ ] **Step 2:** `cd tools/acr1311u-n2 && .\gradlew.bat test --tests org.wallet.mdocnfchost.HostClaimDisplayTest` — expected FAIL

- [ ] **Step 3: Implement**

```kotlin
data class HostOmittedField(val key: String, val reason: String = "holder_declined")

object HostClaimDisplay {
  fun omittedFields(requested: List<String>, claims: Map<String, String>): List<HostOmittedField> =
    requested
      .filter { key -> claims[key].isNullOrBlank() }
      .map { HostOmittedField(it) }
}
```

`LocalVerifierServer` after claims:

```kotlin
val omitted = HostClaimDisplay.omittedFields(MDL_REQUEST_FIELDS, result.claims)
putJsonArray("omittedFields") {
  omitted.forEach { field ->
    addJsonObject {
      put("key", field.key)
      put("reason", field.reason)
    }
  }
}
```

(Use the same kotlinx.serialization builders already in that file.)

`app.js` — keep showing arriving claims (including derived อายุเกิน 18 **only if** `claims.age_over_18` / `claims.birth_date` exists). After the claims loop:

```javascript
const OMITTED_COPY = 'ผู้ถือบัตรไม่ยินยอมเปิดเผย'
const NOT_SENT = 'ไม่ได้ส่ง'
const CLAIM_LABELS = { /* existing, plus birth_date: 'วันเดือนปีเกิด' */ }
;(body.omittedFields || []).forEach((row) => {
  const dt = document.createElement('dt')
  dt.textContent = CLAIM_LABELS[row.key] || row.key
  const dd = document.createElement('dd')
  dd.className = 'omitted'
  dd.textContent = NOT_SENT + ' — ' + OMITTED_COPY
  claimsEl.append(dt, dd)
})
```

If `birth_date` is omitted, do not invent an อายุเกิน 18 omitted row (`age_over_18` is not in `MDL_REQUEST_FIELDS`).

Optional CSS: `dd.omitted { color: #556; }`

- [ ] **Step 4: Re-run host test — expected PASS**

- [ ] **Step 5: Commit** (only if asked)

---

### Task 6: UI reference + TASKS

**Files:**
- Modify: `docs/ui-reference/nfc-presentment-consent.html` (slides that say ทั้งชุด / ไม่มีติ๊ก / เลือกได้แค่ว่าจะเข้าสู่การแตะ)
- Modify: `docs/TASKS.md` (session note: implemented; physical remaining)
- Confirm: parent spec + `docs/CODEMAPS/frontend.md` already describe toggles — only patch if a leftover all-or-nothing sentence remains

**Interfaces:** none

- [ ] **Step 1: Update the HTML** so consent shows per-field toggles; Accept needs ≥1; Success and host show omitted + ผู้ถือบัตรไม่ยินยอมเปิดเผย; comparison table NFC column is “ติ๊กก่อนแตะ · ส่งคำขอ ∩ ที่เลือก”. Keep “no consent after DeviceRequest”.

Concrete replacements:

- Slide text at “ไม่มีปุ่มติ๊ก…” → holder can turn any listed field off before Accept.
- “เลือกได้แค่ว่าจะเข้าสู่การแตะหรือไม่ (ยินยอมทั้งชุด / ปฏิเสธ)” → ติ๊กช่องก่อนกดยินยอม; หลังแตะแก้รายการไม่ได้.
- Table “NFC Presentment Consent · ทั้งชุดเพดาน” → NFC Presentment Consent · ติ๊กได้ทุกช่องในเพดาน
- “ไม่มีติ๊ก · SD อยู่ที่คำขอ ∩ เพดาน” → ติ๊กก่อนแตะ · SD อยู่ที่คำขอ ∩ ที่เลือก

Walkthrough: add a beat where the holder turns วันหมดอายุ off; Success and verifier page show that row as ไม่ได้ส่ง.

- [ ] **Step 2: TASKS.md session note**

Replace “Not implemented yet” with: implemented (Jest + host unit tests); physical A26 + ACR1311 still required — one tap all-on, one tap with `expiry_date` off. Native rebuild + host restart.

- [ ] **Step 3: Commit** (only if asked)

---

## Verification (all tasks)

```bash
yarn test src/components/proximity/PreTapConsentPanel.test.tsx src/store/proximityStore.test.ts src/components/proximity/PresentationResultPanel.test.tsx src/services/proximity/proximityArmSession.test.ts src/services/proximity/nfcPresentmentCompleteOnSend.test.ts
yarn tsc --noEmit
cd tools/acr1311u-n2 && .\gradlew.bat test --tests org.wallet.mdocnfchost.HostClaimDisplayTest
```

Android unit tests for `ApprovedMdocFieldCeilingTest` via the Expo app gradle module.

Physical (release gate, not blocking unit completion):

1. All fields on → same claims as today.
2. Turn `expiry_date` off → tap succeeds; wallet Success and ACR1311 show omitted + ผู้ถือบัตรไม่ยินยอมเปิดเผย.
3. Identifier outside profile ceiling still fail-closed.

Native Kotlin: `npx expo run:android`. Host: restart `.\gradlew.bat run`, hard-refresh the page.
