# Driving Licence Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a screenshot-matched driving-licence card using the fixed sample data and `assets/images/user_profile.png`, and reuse it in credential detail/home and VC receive confirmation.

**Architecture:** Keep the existing schema-driven credential system and action/lifecycle wrappers. Add a small shared sample-data module plus one focused presentational card component; route both the existing credential-detail card and the VC receive screen to that component for `DLTDrivingLicence`. The sample card is intentionally fixed for this demo slice and does not change credential parsing, storage, or protocol behavior.

**Tech Stack:** React Native, Expo, NativeWind, TypeScript, Jest/@testing-library/react-native, existing `CredentialDocumentDetailCard` and `CredentialOfferClaimScreen` flows.

## Global Constraints

- Respond in English only.
- Do not add customer-specific organization names to new identifiers, files, docs, comments, or specs.
- Use `assets/images/user_profile.png` for the portrait.
- Keep screen files thin and put reusable UI under `src/components/`.
- Preserve the existing config-driven credential mapping and `DLTDrivingLicence` type.
- Preserve existing credential actions, lifecycle badges, confirmation callbacks, and storage behavior.
- Use React Native primitives/NativeWind and the existing image pattern.
- Every caught/surfaced error must retain the existing redacted logging conventions; this visual-only slice adds no new error path.
- Verify with focused tests, `yarn tsc --noEmit`, and `yarn lint`.
- Update `docs/TASKS.md` after the implementation slice.

---

## File Map

- Create: `src/config/drivingLicenceSample.ts` — fixed screenshot copy and image source shared by both consumers.
- Create: `src/components/DrivingLicenceDocumentCard.tsx` — focused screenshot-matched card UI.
- Create: `src/components/DrivingLicenceDocumentCard.test.tsx` — exact copy, image, layout marker, and expiry assertions.
- Create: `src/components/DrivingLicencePreviewPanel.tsx` — receive-flow wrapper using the shared card and existing accept button conventions.
- Create: `src/components/DrivingLicencePreviewPanel.test.tsx` — receive-flow rendering and callback assertions.
- Modify: `src/components/CredentialDocumentDetailCard.tsx` — branch `DLTDrivingLicence` to the focused card while retaining the surrounding action row/wrapper contract.
- Modify: `src/screens/CredentialOfferClaimScreen.tsx` — select the driving-licence preview panel before the existing transcript/Thai ID branches.
- Modify: `docs/TASKS.md` — record the completed UI slice and verification.
- Do not modify: protocol exchange, credential storage, SDK, native NFC, or generic schema behavior.

---

### Task 1: Add the shared fixed reference model

**Files:**
- Create: `src/config/drivingLicenceSample.ts`
- Test: `src/components/DrivingLicenceDocumentCard.test.tsx` (model assertions can be added with the component tests)

**Interfaces:**
- Produces `DRIVING_LICENCE_SAMPLE` with typed strings for title, Thai/English name, birth date, type, English type, licence number, issue date, and expiry date.
- Produces `DRIVING_LICENCE_IMAGE` as the existing React Native `ImageSourcePropType` for `../../assets/images/user_profile.png`.

- [ ] **Step 1: Write failing assertions for the exported sample contract**

Add tests that import the sample model and assert the exact values:

```ts
expect(DRIVING_LICENCE_SAMPLE.documentTitle).toBe('DRIVING LICENSE')
expect(DRIVING_LICENCE_SAMPLE.thaiName).toBe('นางสาว พิชญา รุ่งเรืองกิต')
expect(DRIVING_LICENCE_SAMPLE.englishName).toBe('Ms. Pichaya Rungruangkit')
expect(DRIVING_LICENCE_SAMPLE.birthDate).toBe('15 พฤษภาคม 2530')
expect(DRIVING_LICENCE_SAMPLE.type).toBe('รถยนต์ส่วนบุคคล')
expect(DRIVING_LICENCE_SAMPLE.englishType).toBe('Private Motor Car')
expect(DRIVING_LICENCE_SAMPLE.licenceNumber).toBe('54002891')
expect(DRIVING_LICENCE_SAMPLE.issueDate).toBe('20 มกราคม 2565')
expect(DRIVING_LICENCE_SAMPLE.expiryDate).toBe('20 มกราคม 2570')
```

- [ ] **Step 2: Run the focused test and verify it fails because the module is absent**

Run: `yarn test DrivingLicenceDocumentCard.test.tsx --runInBand`

Expected: FAIL with the new module/export unavailable.

- [ ] **Step 3: Create the minimal typed model**

Export a `const` object with the exact copy above and a local `require('../../assets/images/user_profile.png')` typed as `ImageSourcePropType`. Do not read values from VC claims in this sample model.

- [ ] **Step 4: Run the focused test and verify the model passes**

Run: `yarn test DrivingLicenceDocumentCard.test.tsx --runInBand`

Expected: model assertions PASS; component assertions may remain pending until Task 2.

- [ ] **Step 5: Commit the isolated model/test change**

```bash
git add src/config/drivingLicenceSample.ts src/components/DrivingLicenceDocumentCard.test.tsx
git commit -m "feat: add driving licence sample model"
```

---

### Task 2: Build the screenshot-matched reusable card

**Files:**
- Create: `src/components/DrivingLicenceDocumentCard.tsx`
- Modify: `src/components/DrivingLicenceDocumentCard.test.tsx`

**Interfaces:**
- Consumes optional `testID?: string` and no credential data, because the approved first slice is fixed sample content.
- Produces a presentational `<DrivingLicenceDocumentCard />` with stable test IDs for the card, header, portrait, hero, lower columns, divider, and expiry value.
- Uses `DRIVING_LICENCE_SAMPLE` and `DRIVING_LICENCE_IMAGE`; no duplicated sample strings.

- [ ] **Step 1: Add failing component assertions**

Render the component and assert:

```ts
expect(screen.getByTestId('driving-licence-card')).toBeTruthy()
expect(screen.getByText('DRIVING LICENSE')).toBeTruthy()
expect(screen.getByText('นางสาว พิชญา รุ่งเรืองกิต')).toBeTruthy()
expect(screen.getByText('Ms. Pichaya Rungruangkit')).toBeTruthy()
expect(screen.getByText('Private Motor Car')).toBeTruthy()
expect(screen.getByText('54002891')).toBeTruthy()
expect(screen.getByTestId('driving-licence-image').props.source).toBe(DRIVING_LICENCE_IMAGE)
expect(screen.getByTestId('driving-licence-divider')).toBeTruthy()
expect(screen.getByTestId('driving-licence-expiry')).toHaveTextContent('20 มกราคม 2570')
```

Use an explicit expiry label/value marker so the test confirms the expiry is visually distinct and red without relying only on NativeWind class serialization.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `yarn test DrivingLicenceDocumentCard.test.tsx --runInBand`

Expected: FAIL because the component is not implemented.

- [ ] **Step 3: Implement the card**

Use a white rounded/overflow-hidden shell with the established shadow style. Match the reference structure:

```text
header band: DRIVING LICENSE
hero row: portrait | Name + Thai name + English name + Date of Birth
lower row: left type + English type + licence number | divider | right issue date + red expiry date
```

Use the reference’s navy/light-blue header treatment, dark navy values, muted grey labels, and red expiry label/value. Use `Image` with `resizeMode="cover"` for `user_profile.png`. Keep the component free of navigation, storage, and credential actions.

- [ ] **Step 4: Run component tests and verify they pass**

Run: `yarn test DrivingLicenceDocumentCard.test.tsx --runInBand`

Expected: all model and component assertions PASS.

- [ ] **Step 5: Commit the reusable card**

```bash
git add src/config/drivingLicenceSample.ts src/components/DrivingLicenceDocumentCard.tsx src/components/DrivingLicenceDocumentCard.test.tsx
git commit -m "feat: add driving licence card"
```

---

### Task 3: Reuse the card in wallet detail/home

**Files:**
- Modify: `src/components/CredentialDocumentDetailCard.tsx`
- Modify: `src/components/CredentialDocumentDetailCard.test.tsx`

**Interfaces:**
- The existing `CredentialDocumentDetailCard` keeps its current props and action-row behavior.
- For `display.imageKey === 'car'` / `DLTDrivingLicence`, it renders `DrivingLicenceDocumentCard` inside the existing `DocumentCardShell` and keeps `DocumentActionRow` outside.
- Existing transcript, ID, and generic branches remain unchanged.

- [ ] **Step 1: Add a failing regression test**

Create a driving-licence display fixture and render `CredentialDocumentDetailCard`; assert the fixed header/name/number/expiry and the driving-licence test ID are present, while the existing action callback contract remains available.

- [ ] **Step 2: Run the focused regression test and verify it fails**

Run: `yarn test CredentialDocumentDetailCard.test.tsx --runInBand`

Expected: FAIL because the current `car` schema takes the generic branch.

- [ ] **Step 3: Add the focused branch**

Import `DrivingLicenceDocumentCard`. Add a `DrivingLicenceDocumentDetailCard` wrapper only if needed to preserve the existing shell/action-row contract; otherwise compose the shared card directly within the existing exported component. Do not duplicate the screenshot markup in the detail file.

- [ ] **Step 4: Run the regression suite**

Run: `yarn test CredentialDocumentDetailCard.test.tsx --runInBand`

Expected: all existing detail-card tests plus the new driving-licence test PASS.

- [ ] **Step 5: Commit the detail integration**

```bash
git add src/components/CredentialDocumentDetailCard.tsx src/components/CredentialDocumentDetailCard.test.tsx
git commit -m "feat: use driving licence card in wallet detail"
```

---

### Task 4: Reuse the card in VC receive confirmation

**Files:**
- Create: `src/components/DrivingLicencePreviewPanel.tsx`
- Create: `src/components/DrivingLicencePreviewPanel.test.tsx`
- Modify: `src/screens/CredentialOfferClaimScreen.tsx`

**Interfaces:**
- `DrivingLicencePreviewPanelProps = { onAccept: () => void }`.
- Produces the fixed driving-licence card followed by the existing accept/confirm button style.
- `CredentialOfferClaimScreen` selects this panel when `phase.record.type === 'DLTDrivingLicence'`; transcript and Thai ID paths remain unchanged.

- [ ] **Step 1: Add failing receive-panel tests**

Render `<DrivingLicencePreviewPanel onAccept={onAccept} />`; assert the exact card values and press the existing confirmation button to assert `onAccept` is called once. Add a screen-level branch test or update the existing claim-screen test fixture so a driving-licence record renders `driving-licence-preview-panel`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `yarn test DrivingLicencePreviewPanel.test.tsx CredentialOfferClaimScreen.test.tsx --runInBand`

Expected: FAIL because the panel and claim-screen branch do not exist.

- [ ] **Step 3: Implement the receive panel and route**

Compose `DrivingLicenceDocumentCard` inside the same `flex-1 bg-surface px-4 pt-6` / `ScrollView` pattern used by `TranscriptPreviewPanel`. Use `AppButton` with the established accept label/style and call the supplied `onAccept`. In `CredentialOfferClaimScreen`, import the panel and put the `DLTDrivingLicence` condition before the existing transcript/Thai ID rendering branch.

- [ ] **Step 4: Run the focused receive tests**

Run: `yarn test DrivingLicencePreviewPanel.test.tsx CredentialOfferClaimScreen.test.tsx --runInBand`

Expected: all focused receive tests PASS.

- [ ] **Step 5: Commit the receive integration**

```bash
git add src/components/DrivingLicencePreviewPanel.tsx src/components/DrivingLicencePreviewPanel.test.tsx src/screens/CredentialOfferClaimScreen.tsx
git commit -m "feat: show driving licence card on receive"
```

---

### Task 5: Documentation and full verification

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Add the completed slice to the active task log**

Record that the fixed reference driving-licence card now renders in wallet detail/home and VC receive confirmation, using `assets/images/user_profile.png`, and note the verification commands/results.

- [ ] **Step 2: Run focused component and screen tests**

Run: `yarn test DrivingLicenceDocumentCard.test.tsx DrivingLicencePreviewPanel.test.tsx CredentialDocumentDetailCard.test.tsx CredentialOfferClaimScreen.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 3: Run TypeScript verification**

Run: `yarn tsc --noEmit`

Expected: PASS with no new errors.

- [ ] **Step 4: Run lint**

Run: `yarn lint`

Expected: PASS with no new lint errors.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/TASKS.md
git commit -m "docs: record driving licence card slice"
```

---

## Plan Self-Review

- Spec coverage: fixed copy/image, reusable component, wallet detail/home integration, receive integration, focused tests, and TASKS update are covered by Tasks 1–5.
- Placeholder scan: no TBD/TODO/“implement later” instructions are used.
- Type consistency: `DRIVING_LICENCE_SAMPLE`, `DRIVING_LICENCE_IMAGE`, `DrivingLicenceDocumentCard`, and `DrivingLicencePreviewPanel` are named consistently across tasks.
- Scope: no protocol, storage, SDK, native, or unrelated credential changes are included.

