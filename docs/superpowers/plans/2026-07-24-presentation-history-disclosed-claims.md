# Presentation History Disclosed Claims — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wallet History `disclosedClaims` must list only claims the Holder actually disclosed in a successful OID4VP presentation, using the same effective-key resolution as VP signing.

**Architecture:** Add `resolveDisclosedClaimLabels()` in `claimDisclosurePolicy.ts` as the single resolver shared by VP token builders and history recorders. Fix `readEffectiveClaimKeys` to pass full `mandatory` + `selective` flags. Wire `Oid4VpDisclosureFlow` success/failure/decline paths to the shared resolver.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, Jest, `@/src/services/vp/claimDisclosurePolicy`, `Oid4VpDisclosureFlow`, encrypted MMKV history via `walletEventLog`.

**Spec:** `docs/superpowers/specs/2026-07-24-presentation-history-disclosed-claims-design.md`

## Global Constraints

- History stores **claim labels only** — never claim values, VP tokens, or PII.
- One biometric prompt per user action (sign-time Keychain gate only when signing).
- Use existing `resolveEffectiveDisclosureKeys` semantics: mandatory + `selective: false` locked claims always included; optional `selective: true` claims only when in holder selection.
- Localized labels via `resolvePresentationDisclosureLabel(documentType, key)`.
- Yarn only; verify with `yarn test`, `yarn tsc --noEmit`, `yarn lint`.
- Update `docs/TASKS.md` after the slice ships.

## File map

| File | Responsibility |
|------|----------------|
| `src/services/vp/claimDisclosurePolicy.ts` | Add `resolveDisclosedClaimLabels` |
| `src/services/vp/claimDisclosurePolicy.test.ts` | Unit tests for resolver + VP/history parity |
| `src/services/vp/presentationTokenBuilders/builders.ts` | Fix `readEffectiveClaimKeys` selective flags |
| `src/components/PresentationConsentPanel.tsx` | Delegate `readSelectedDisclosureLabels` to shared resolver |
| `src/components/Oid4VpDisclosureFlow.tsx` | Success/failure/decline use shared resolver |
| `src/services/history/walletHistoryRecording.ts` | `recordOid4vpPresentationFailure` accepts caller `disclosedClaims` |
| `src/components/Oid4VpDisclosureFlow.test.tsx` | Integration: deselect GPA → history excludes เกรดเฉลี่ย |
| `docs/TASKS.md` | Track completed slice |

---

### Task 1: Shared `resolveDisclosedClaimLabels` resolver

**Files:**
- Modify: `src/services/vp/claimDisclosurePolicy.ts`
- Test: `src/services/vp/claimDisclosurePolicy.test.ts`

**Interfaces:**
- Produces: `resolveDisclosedClaimLabels(disclosures, holderSelectedKeys, documentType): string[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/services/vp/claimDisclosurePolicy.test.ts`:

```typescript
import {
  // ...existing imports
  resolveDisclosedClaimLabels,
} from './claimDisclosurePolicy'

// inside describe('claimDisclosurePolicy'):

test('resolveDisclosedClaimLabels returns localized labels for effective keys only', () => {
  const disclosures: PresentationDisclosure[] = [
    { key: 'student_id', label: 'Student ID', value: '6512345678', mandatory: true, selective: false },
    { key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true },
    { key: 'graduation_date', label: 'Graduation', value: '2026-05-31', mandatory: false, selective: true },
  ]

  const labels = resolveDisclosedClaimLabels(
    disclosures,
    new Set(['student_id']),
    'ChulalongkornUniversityTranscript',
  )

  expect(labels).toEqual(['รหัสนักศึกษา'])
  expect(labels).not.toContain('เกรดเฉลี่ย')
})

test('resolveDisclosedClaimLabels includes selective:false locked claims even when not toggled', () => {
  const disclosures: PresentationDisclosure[] = [
    { key: 'institution_name', label: 'Institution', value: 'CU', mandatory: false, selective: false },
    { key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true },
  ]

  const labels = resolveDisclosedClaimLabels(
    disclosures,
    new Set(),
    'ChulalongkornUniversityTranscript',
  )

  expect(labels).toEqual(['ชื่อสถาบัน'])
})

test('resolveDisclosedClaimLabels key set matches resolveEffectiveDisclosureKeys', () => {
  const disclosures: PresentationDisclosure[] = [
    { key: 'student_id', label: 'Student ID', value: '1', mandatory: true, selective: false },
    { key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true },
  ]
  const selected = new Set(['student_id'])

  const effectiveKeys = resolveEffectiveDisclosureKeys(disclosures, selected)
  const labels = resolveDisclosedClaimLabels(disclosures, selected, 'ChulalongkornUniversityTranscript')

  expect(labels).toHaveLength(effectiveKeys.length)
  expect(labels.every((label) => typeof label === 'string' && label.length > 0)).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/services/vp/claimDisclosurePolicy.test.ts -t resolveDisclosedClaimLabels`
Expected: FAIL — `resolveDisclosedClaimLabels is not a function`

- [ ] **Step 3: Implement minimal resolver**

Add to `src/services/vp/claimDisclosurePolicy.ts` (after `resolveEffectiveDisclosureKeys`):

```typescript
export function resolveDisclosedClaimLabels(
  disclosures: readonly PresentationDisclosure[],
  holderSelectedKeys: ReadonlySet<string>,
  documentType: string,
): string[] {
  const effectiveKeys = new Set(
    resolveEffectiveDisclosureKeys(disclosures, holderSelectedKeys),
  )

  return disclosures
    .filter((disclosure) => effectiveKeys.has(disclosure.key))
    .map((disclosure) => resolvePresentationDisclosureLabel(documentType, disclosure.key))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/services/vp/claimDisclosurePolicy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/claimDisclosurePolicy.ts src/services/vp/claimDisclosurePolicy.test.ts
git commit -m "feat: add resolveDisclosedClaimLabels shared history resolver"
```

---

### Task 2: Fix VP builder `readEffectiveClaimKeys` selective flags

**Files:**
- Modify: `src/services/vp/presentationTokenBuilders/builders.ts`
- Test: `src/services/vp/presentationApproval.test.ts`

**Interfaces:**
- Consumes: `resolveEffectiveDisclosureKeys` from `claimDisclosurePolicy.ts`
- Produces: `readEffectiveClaimKeys` passes `{ key, mandatory, selective }` for each disclosure

- [ ] **Step 1: Write the failing test**

Add to `src/services/vp/presentationApproval.test.ts` inside the holder-selected SD-JWT test block area:

```typescript
test('holder-selected keys exclude optional selective claims from SD-JWT when deselected', async () => {
  const request: ResolvedPresentationRequest = {
    ...requestWithDcql(true),
    disclosures: [
      { key: 'name', label: 'Name', value: 'Alice', mandatory: false, selective: true },
      { key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true },
      { key: 'institution_name', label: 'Institution', value: 'CU', mandatory: false, selective: false },
    ],
    matchedCredential: {
      ...baseRequest.matchedCredential,
      type: 'ChulalongkornUniversityTranscript',
      rawVc:
        'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~WyJzYWx0LWdwYSIsImdwYSIsIjMuNzUiXQ~WyJzYWx0LWluc3QiLCJpbnN0aXR1dGlvbl9uYW1lIiwiQ1UiXQ~',
    },
    dcqlQuery: {
      credentials: [
        {
          id: 'transcript_credential',
          format: 'dc+sd-jwt',
          claims: [{ path: ['name'] }, { path: ['gpa'] }, { path: ['institution_name'] }],
          require_cryptographic_holder_binding: true,
        },
      ],
    },
  }
  const signSdJwtKbPresentationToken = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')

  await createApprovedPresentationResponse(request, { selectedClaimKeys: ['name'] }, { signSdJwtKbPresentationToken })

  expect(signSdJwtKbPresentationToken).toHaveBeenCalledWith({
    audience: request.clientId,
    nonce: request.nonce,
    sdJwt: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~WyJzYWx0LWluc3QiLCJpbnN0aXR1dGlvbl9uYW1lIiwiQ1UiXQ~',
    credentialId: request.matchedCredential.id,
  })
})
```

- [ ] **Step 2: Run test to verify failure mode**

Run: `yarn test src/services/vp/presentationApproval.test.ts -t "holder-selected keys exclude optional selective"`
Expected: May FAIL if `institution_name` (selective:false) is incorrectly excluded — confirms the bug.

- [ ] **Step 3: Fix `readEffectiveClaimKeys`**

In `src/services/vp/presentationTokenBuilders/builders.ts`, replace the `resolveEffectiveDisclosureKeys` call:

```typescript
return resolveEffectiveDisclosureKeys(
  request.disclosures.map((disclosure) => ({
    key: disclosure.key,
    mandatory: disclosure.mandatory === true,
    selective: disclosure.selective !== false,
  })),
  new Set(selectedClaimKeys),
)
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/vp/presentationApproval.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/presentationTokenBuilders/builders.ts src/services/vp/presentationApproval.test.ts
git commit -m "fix: pass selective flags in VP effective claim key resolution"
```

---

### Task 3: Delegate `readSelectedDisclosureLabels` to shared resolver

**Files:**
- Modify: `src/components/PresentationConsentPanel.tsx`
- Test: `src/components/PresentationConsentPanel.test.tsx` (optional extend)

**Interfaces:**
- Consumes: `resolveDisclosedClaimLabels(documentType, ...)`
- Produces: `readSelectedDisclosureLabels` remains exported for backward compatibility

- [ ] **Step 1: Replace implementation**

In `src/components/PresentationConsentPanel.tsx`:

```typescript
import { resolveDisclosedClaimLabels, resolveEffectiveDisclosureKeys } from '../services/vp/claimDisclosurePolicy'

export function readSelectedDisclosureLabels(
  disclosures: PresentationDisclosure[],
  selectedClaimKeys: ReadonlySet<string>,
  documentType?: string,
): string[] {
  if (!documentType) {
    const effectiveKeys = new Set(resolveEffectiveDisclosureKeys(disclosures, selectedClaimKeys))
    return disclosures
      .filter((disclosure) => effectiveKeys.has(disclosure.key))
      .map((disclosure) => disclosure.label)
  }

  return resolveDisclosedClaimLabels(disclosures, selectedClaimKeys, documentType)
}
```

Update `Oid4VpDisclosureFlow` call sites to pass `request.matchedCredential.type` as third argument wherever `readSelectedDisclosureLabels` is used (Task 4 does this comprehensively).

- [ ] **Step 2: Run existing tests**

Run: `yarn test src/components/PresentationConsentPanel.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/PresentationConsentPanel.tsx
git commit -m "refactor: delegate readSelectedDisclosureLabels to shared resolver"
```

---

### Task 4: Wire `Oid4VpDisclosureFlow` success, failure, and decline paths

**Files:**
- Modify: `src/components/Oid4VpDisclosureFlow.tsx`
- Modify: `src/services/history/walletHistoryRecording.ts`

**Interfaces:**
- Consumes: `resolveDisclosedClaimLabels(disclosures, holderSelectedKeys, documentType)`
- Produces: history events with accurate `disclosedClaims`

- [ ] **Step 1: Update imports and helper in `Oid4VpDisclosureFlow.tsx`**

```typescript
import { resolveDisclosedClaimLabels } from '../services/vp/claimDisclosurePolicy'
// keep readInitialSelectedClaimKeys from PresentationConsentPanel
// remove readSelectedDisclosureLabels import if fully replaced
```

Add local helper:

```typescript
function readHistoryDisclosedClaims(
  request: ResolvedPresentationRequest,
  holderSelectedKeys: ReadonlySet<string>,
): string[] {
  return resolveDisclosedClaimLabels(
    request.disclosures,
    holderSelectedKeys,
    request.matchedCredential.type,
  )
}
```

- [ ] **Step 2: Update `approvePresentation` success path**

Replace:

```typescript
const disclosedLabels = readSelectedDisclosureLabels(request.disclosures, holderSelectedClaimKeys)
```

With:

```typescript
const disclosedLabels = readHistoryDisclosedClaims(request, holderSelectedClaimKeys)
```

- [ ] **Step 3: Update `approvePresentation` failure path**

Replace wallet-channel failure:

```typescript
recordWalletInitiatedPresentationFailure({
  record: request.matchedCredential,
  disclosedClaims: request.disclosures.map((disclosure) => disclosure.label),
})
```

With:

```typescript
recordWalletInitiatedPresentationFailure({
  record: request.matchedCredential,
  disclosedClaims: readHistoryDisclosedClaims(request, holderSelectedClaimKeys),
})
```

For oid4vp failure, pass resolved labels into updated `recordOid4vpPresentationFailure` (Step 4).

- [ ] **Step 4: Update `recordOid4vpPresentationFailure` signature**

In `src/services/history/walletHistoryRecording.ts`:

```typescript
export function recordOid4vpPresentationFailure(
  request: ResolvedPresentationRequest,
  error: unknown,
  disclosedClaims: string[],
): void {
  appendWalletHistoryEvent({
    kind: 'presentation-failed',
    credentialId: request.matchedCredential.id,
    documentType: getCardSchema(request.matchedCredential.type).title,
    partyName: request.verifier.name,
    disclosedClaims,
    channel: 'oid4vp',
    reasonCode: classifyPresentationFailure(error),
  })
}
```

Update oid4vp catch in `Oid4VpDisclosureFlow`:

```typescript
recordOid4vpPresentationFailure(
  request,
  err,
  readHistoryDisclosedClaims(request, holderSelectedClaimKeys),
)
```

Search for other `recordOid4vpPresentationFailure` call sites and pass explicit `disclosedClaims` (use all disclosure labels only when info-screen selection is unavailable).

- [ ] **Step 5: Split decline behavior (consent vs info)**

Replace `declinePresentation` with:

```typescript
const declinePresentation = useCallback((
  request: ResolvedPresentationRequest,
  holderSelectedKeys?: ReadonlySet<string>,
) => {
  logWalletStep(logScope, 'presentation-user-declined', describePresentationForLog(request))
  const disclosedClaims = holderSelectedKeys
    ? readHistoryDisclosedClaims(request, holderSelectedKeys)
    : []

  appendWalletHistoryEvent({
    kind: 'presentation-declined',
    credentialId: request.matchedCredential.id,
    documentType: getCardSchema(request.matchedCredential.type).title,
    partyName: request.verifier.name,
    disclosedClaims,
    channel: historyChannel,
  })
  onCancel()
}, [historyChannel, logScope, onCancel])
```

Update call sites:

```typescript
// consent reject
onReject={() => declinePresentation(phase.request)}

// info back
onBack={() => declinePresentation(phase.request, selectedClaimKeys)}
```

- [ ] **Step 6: Run typecheck**

Run: `yarn tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/Oid4VpDisclosureFlow.tsx src/services/history/walletHistoryRecording.ts
git commit -m "fix: record presentation history from holder effective disclosure set"
```

---

### Task 5: Integration tests — deselect GPA on success

**Files:**
- Modify: `src/components/Oid4VpDisclosureFlow.test.tsx`

**Interfaces:**
- Consumes: real `resolveDisclosedClaimLabels` (remove mock override for history labels in selective test)

- [ ] **Step 1: Stop mocking `readSelectedDisclosureLabels` in selective test**

Update the `PresentationConsentPanel` mock to re-export real helpers:

```typescript
jest.mock('./PresentationConsentPanel', () => {
  const actual = jest.requireActual('./PresentationConsentPanel')
  const { Pressable, Text } = require('react-native')
  return {
    ...actual,
    PresentationConsentPanel: ({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) => (
      <>
        <Pressable onPress={onAccept}><Text>consent-accept</Text></Pressable>
        <Pressable onPress={onReject}><Text>consent-reject</Text></Pressable>
      </>
    ),
  }
})
```

- [ ] **Step 2: Enhance `PresentationInfoPanel` mock to support deselect**

```typescript
jest.mock('./PresentationInfoPanel', () => {
  const React = require('react')
  const { Pressable, Text } = require('react-native')
  return {
    PresentationInfoPanel: ({
      onConfirm,
      onToggleClaim,
    }: {
      onConfirm: () => void
      onToggleClaim: (key: string) => void
    }) => (
      <>
        <Pressable onPress={() => onToggleClaim('gpa')}>
          <Text>toggle-gpa-off</Text>
        </Pressable>
        <Pressable onPress={onConfirm}>
          <Text>info-confirm</Text>
        </Pressable>
      </>
    ),
  }
})
```

- [ ] **Step 3: Write failing integration test**

```typescript
test('records only effective disclosed claims when holder deselects optional GPA', async () => {
  mockResolve.mockResolvedValue({
    matchedCredential: {
      id: 'transcript-1',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'issuer.jwt~',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
    },
    verifier: { name: 'Verifier' },
    disclosures: [
      { key: 'student_id', label: 'รหัสนักศึกษา', value: '6512345678', mandatory: true, selective: false },
      { key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75', mandatory: false, selective: true },
    ],
  })

  render(
    <Oid4VpDisclosureFlow
      authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
      credentials={[credential]}
      onDone={jest.fn()}
      onCancel={jest.fn()}
    />,
  )

  await flush()
  fireEvent.press(screen.getByText('scan-face'))
  await flush()
  fireEvent.press(screen.getByText('consent-accept'))
  await flush()
  fireEvent.press(screen.getByText('toggle-gpa-off'))
  fireEvent.press(screen.getByText('info-confirm'))
  await flush()

  expect(mockRecordSuccess).toHaveBeenCalledWith(
    expect.objectContaining({
      disclosedClaims: ['รหัสนักศึกษา'],
    }),
  )
  expect(mockRecordSuccess.mock.calls[0]?.[0]?.disclosedClaims).not.toContain('เกรดเฉลี่ย')
})
```

Mock `getCardSchema` to return `{ title: 'Transcript' }` or use real card schema mock with transcript type.

- [ ] **Step 4: Run test**

Run: `yarn test src/components/Oid4VpDisclosureFlow.test.tsx -t "records only effective disclosed claims"`
Expected: PASS after Task 4 implementation

- [ ] **Step 5: Run full verification**

```bash
yarn test src/components/Oid4VpDisclosureFlow.test.tsx src/services/vp/claimDisclosurePolicy.test.ts src/services/vp/presentationApproval.test.ts
yarn tsc --noEmit
yarn lint
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Oid4VpDisclosureFlow.test.tsx
git commit -m "test: assert history excludes deselected transcript GPA on success"
```

---

### Task 6: Update `docs/TASKS.md`

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Add completed slice entry**

Under active/recent session notes, add:

```markdown
- [x] **Presentation history disclosed-claims fix** — `disclosedClaims` on presentation-success/failed/declined now uses `resolveDisclosedClaimLabels()` aligned with VP `resolveEffectiveDisclosureKeys`. Spec: `docs/superpowers/specs/2026-07-24-presentation-history-disclosed-claims-design.md`; plan: `docs/superpowers/plans/2026-07-24-presentation-history-disclosed-claims.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record presentation history disclosed-claims fix in TASKS"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Shared `resolveDisclosedClaimLabels` | Task 1 |
| Fix `readEffectiveClaimKeys` selective flags | Task 2 |
| Success path uses shared resolver | Task 4 |
| Failure uses holder final selection | Task 4 |
| Decline consent → `[]`, info → effective selection | Task 4 |
| Transcript GPA regression test | Task 5 |
| TASKS.md update | Task 6 |

No placeholders. Type names consistent across tasks.
