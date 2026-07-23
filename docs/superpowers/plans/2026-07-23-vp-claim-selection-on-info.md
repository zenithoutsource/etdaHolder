# VP Claim Selection on Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Holder SD-JWT claim selection from Consent to the Info (Approve by Wallet) screen while Consent stays read-only, matching Flow B in `docs/superpowers/specs/2026-07-23-vp-claim-selection-on-info-design.md`.

**Architecture:** Reuse `selectedClaimKeys` state in flow controllers (`scan.tsx`, `Oid4VpDisclosureFlow.tsx`). Consent navigates to Info only. Info `PresentationRequestedItemsCard` wires toggles through `readConsentItems` helpers and submits on **ยอมรับ**. `PresentationDisclosureList` gains pressable review rows for `toggleable` items without changing review row chrome.

**Tech Stack:** Expo SDK 54, React Native, NativeWind, Jest, existing VP services (`claimDisclosurePolicy`, `presentationApproval`).

## Global Constraints

- NativeWind `className` for styling; no new routes.
- One Keychain biometric per sign action — no app-level biometric on Consent navigation for signed VP modes.
- SD-JWT holder toggles only; mandatory rows locked.
- Keep review-row layout on Info (navy left border, info icon) — do not use `selectable` variant surface-soft rows on Info.
- No PII/tokens in logs; raw error log before friendly UI message.
- English only in code/comments; Thai copy in UI per existing panels.
- Do not use customer org name in new identifiers.

---

## File map

| File | Responsibility |
|------|----------------|
| `PresentationDisclosureList.tsx` | Review-row toggle for `toggleable` items |
| `PresentationRequestedItemsCard.tsx` | Selection UI + helper text + accept gate |
| `PresentationInfoPanel.tsx` | Pass selection props through |
| `PresentationConsentPanel.tsx` | Read-only; navigate on primary |
| `app/(tabs)/scan.tsx` | Phase machine: Consent → Info → Success |
| `Oid4VpDisclosureFlow.tsx` | Mirror Scan flow |
| Tests | Update/add per spec |

---

### Task 1: Review-row toggle in `PresentationDisclosureList`

**Files:**
- Modify: `src/components/PresentationDisclosureList.tsx`
- Test: `src/components/PresentationDisclosureList.test.tsx`

**Interfaces:**
- Consumes: existing `PresentationDisclosureListItem` (`toggleable`, `selected`)
- Produces: when `variant="review"` and `item.toggleable === true` and `onToggle` provided → row is `Pressable`; icon toggles between `checkbox-marked` / `checkbox-blank-outline`; text dims when deselected

- [ ] **Step 1: Write failing test**

Add to `PresentationDisclosureList.test.tsx`:

```tsx
test('review variant toggles selectable rows without changing row chrome', () => {
  const onToggle = jest.fn()
  render(
    <PresentationDisclosureList
      variant="review"
      onToggle={onToggle}
      items={[
        { key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75', selected: true, toggleable: true },
        { key: 'student_id', label: 'รหัส', value: '123', selected: true, toggleable: false },
      ]}
    />,
  )

  fireEvent.press(screen.getByLabelText('เกรดเฉลี่ย'))
  expect(onToggle).toHaveBeenCalledWith('gpa')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test PresentationDisclosureList.test.tsx`
Expected: FAIL — `onToggle` not called or row not pressable

- [ ] **Step 3: Implement**

In `readItemVariant`, when `variant === 'review'` and `item.toggleable === true`, treat as pressable review (do not switch to `selectable` chrome).

In `readIconName` for review + toggleable: use `checkbox-marked` vs `checkbox-blank-outline` based on `selected`.

In `isSelectableRow`, allow `variant === 'review'` when `item.toggleable === true`.

Keep mandatory rows non-pressable (`toggleable: false`).

- [ ] **Step 4: Run test — expect PASS**

Run: `yarn test PresentationDisclosureList.test.tsx`

---

### Task 2: Selection props on `PresentationRequestedItemsCard`

**Files:**
- Modify: `src/components/PresentationRequestedItemsCard.tsx`
- Test: `src/components/PresentationRequestedItemsCard.test.tsx`

**Interfaces:**
- Consumes: `readConsentItems`, `hasSelectedClaims`, `isToggleablePresentationDisclosure` from `PresentationConsentPanel.tsx`
- Produces:

```typescript
type Props = {
  documentType: string
  disclosures: PresentationDisclosure[]
  selectedClaimKeys: ReadonlySet<string>
  onToggleClaim: (claimKey: string) => void
  onAccept: () => void
  submitting?: boolean
}
```

- [ ] **Step 1: Write failing tests**

```tsx
test('disables accept when no selective claims remain selected', () => {
  render(
    <PresentationRequestedItemsCard
      documentType="ChulalongkornUniversityTranscript"
      disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true }]}
      selectedClaimKeys={new Set()}
      onToggleClaim={jest.fn()}
      onAccept={jest.fn()}
    />,
  )
  expect(screen.getByText('ยอมรับ')).toBeDisabled()
})

test('shows helper text for selectable items', () => {
  render(
    <PresentationRequestedItemsCard
      documentType="ChulalongkornUniversityTranscript"
      disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true }]}
      selectedClaimKeys={new Set(['gpa'])}
      onToggleClaim={jest.fn()}
      onAccept={jest.fn()}
    />,
  )
  expect(screen.getByText('แตะรายการที่เลือกได้เพื่อส่งหรือไม่ส่ง')).toBeTruthy()
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test PresentationRequestedItemsCard.test.tsx`

- [ ] **Step 3: Implement**

- Import `readConsentItems`, `hasSelectedClaims` from `PresentationConsentPanel`
- Map items via `readConsentItems(disclosures, selectedClaimKeys, documentType)`
- Pass `variant="review"` + `onToggle={handleToggle}` to `PresentationDisclosureList`
- Helper `Text` under title when any item has `toggleable === true`
- `AppButton` `disabled={!hasSelectedClaims(...)}` `loading={submitting}`

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 3: Wire `PresentationInfoPanel`

**Files:**
- Modify: `src/components/PresentationInfoPanel.tsx`

**Interfaces:**
- Consumes: Task 2 props
- Produces: `PresentationInfoPanel` accepts `selectedClaimKeys`, `onToggleClaim`, `onConfirm`, `submitting`

- [ ] **Step 1: Extend Props and pass through to `PresentationRequestedItemsCard`**

No new test file required if Task 2 covers card; optional smoke via flow tests in Task 5.

---

### Task 4: Read-only `PresentationConsentPanel`

**Files:**
- Modify: `src/components/PresentationConsentPanel.tsx`
- Test: `src/components/PresentationConsentPanel.test.tsx`

**Interfaces:**
- Produces: simplified Props — remove `selectedClaimKeys`, `onToggleClaim`; keep `onAccept` (navigate), `onReject`, `submitting?`
- Keep exported helpers: `readInitialSelectedClaimKeys`, `readSelectedDisclosureLabels`, `readConsentItems`, `hasSelectedClaims`, `isToggleablePresentationDisclosure`

- [ ] **Step 1: Update tests**

Remove toggle tests from Consent panel. Add:

```tsx
test('renders all disclosure rows as locked consent items', () => {
  render(
    <PresentationConsentPanel request={request} onAccept={jest.fn()} onReject={jest.fn()} />,
  )
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByText('เลขบัตรประจำตัวประชาชน')).toBeTruthy()
})

test('primary button calls onAccept without requiring claim selection state', () => {
  const onAccept = jest.fn()
  render(
    <PresentationConsentPanel request={request} onAccept={onAccept} onReject={jest.fn()} />,
  )
  fireEvent.press(screen.getByText('รับทราบและยินยอมส่งข้อมูล'))
  expect(onAccept).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement**

- Build list items with all rows `toggleable: false`, `variant="consent"` without `onToggle`
- Remove accept disabled logic tied to selection (primary always enabled unless `submitting`)
- Remove `readItemVariant` consent→selectable path usage from this panel

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test PresentationConsentPanel.test.tsx`

---

### Task 5: Scan flow routing

**Files:**
- Modify: `app/(tabs)/scan.tsx`
- Test: `src/screens/ScanScreenDeeplink.test.tsx`

**Interfaces:**
- Phase type change:

```typescript
| { tag: 'presentationInfo'; request: ResolvedPresentationRequest }
// Remove verifierName/response from presentationInfo — submit happens here
| { tag: 'presentationSuccess'; request: ...; verifierName: string; response: VerifierResponse }
```

- [ ] **Step 1: Update flow**

1. `presentationConsent` primary → `setSelectedClaimKeys(readInitialSelectedClaimKeys(...))` + `setPhase({ tag: 'presentationInfo', request })` — **no** `approvePresentation`
2. `presentationInfo` → pass selection props; **ยอมรับ** calls `approvePresentation(request, selectedClaimKeys)`
3. `approvePresentation` success → `setPhase({ tag: 'presentationSuccess', ... })` directly — **no** second `presentationFacePrepare` or post-submit Info
4. Consent `onAccept` / Info back / reject paths unchanged for history logging

- [ ] **Step 2: Update `ScanScreenDeeplink.test.tsx` expectations** for Consent → Info → Success sequence

- [ ] **Step 3: Run**

Run: `yarn test ScanScreenDeeplink.test.tsx Oid4VpDisclosureFlow.test.tsx`

---

### Task 6: My QR flow mirror

**Files:**
- Modify: `src/components/Oid4VpDisclosureFlow.tsx`
- Test: `src/components/Oid4VpDisclosureFlow.test.tsx`

- [ ] **Step 1: Mirror Task 5 changes** (consent navigate → info select → submit → success)

- [ ] **Step 2: Run** `yarn test Oid4VpDisclosureFlow.test.tsx`

---

### Task 7: Verification and docs

- [x] Run `yarn test PresentationConsentPanel PresentationRequestedItemsCard PresentationDisclosureList Oid4VpDisclosureFlow ScanScreenDeeplink presentationApproval`
- [x] Run `yarn tsc --noEmit` and `yarn lint`
- [x] Add session note to `docs/TASKS.md` referencing spec `2026-07-23-vp-claim-selection-on-info-design.md`

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Consent read-only | Task 4 |
| Info selection on review rows | Tasks 1–3 |
| Flow B routing | Tasks 5–6 |
| Accept disabled when empty selection | Task 2 |
| One biometric on sign | Task 5 (no change to approval service) |
| Tests | All tasks |

No TBD placeholders. Types consistent across Tasks 2–3–5.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-23-vp-claim-selection-on-info.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement in this session with checkpoints

Which approach do you want?
