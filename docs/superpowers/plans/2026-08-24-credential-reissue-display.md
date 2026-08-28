# Credential Reissue Home Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Scan or Deeplink claim, Home shows the newest credential per reissue family; active superseded siblings stay in MMKV with a **ดูเอกสาร (เอกสารเดิม)** link; calendar-expired siblings are removed on finalize.

**Architecture:** Reuse or add `credentialReissueFamily` for family matching. Extend `pickPreferredHomeCredential` with `issuedAt` tie-break. Add `findSupersededOldCredentialForDisplay` for Home link (P3 + plain reissue). Add `finalizeCredentialClaim` post-save hook (pairing + expired sibling removal). Detail screen shows superseded inactive chrome for old VC when a newer family sibling exists.

**Tech Stack:** Expo SDK 54, TypeScript, Jest, Yarn, React Native / Expo Router, existing `CredentialOfferClaimScreen` + `app/(tabs)/index.tsx`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-credential-reissue-display-design.md`
- Prerequisite helper: `src/services/credentials/credentialReissueFamily.ts` with `areCredentialsSameReissueFamily` — from `docs/superpowers/plans/2026-08-24-first-party-third-party-mdl-identity.md` Task 1. If that file does not exist yet, complete that Task 1 first (same tests and implementation).
- English-only new identifiers, comments, and docs.
- Do not add the customer organization name in new identifiers, files, or docs.
- First-party issuer hostname from `EXPO_PUBLIC_ISSUER_CREDENTIAL_ISSUER`, default `issuer.zenithcomp.co.th`.
- Active superseded old VC: **no** silent MMKV delete — Holder deletes via existing delete flow.
- Calendar-expired same-family sibling: remove on `finalizeCredentialClaim`.
- Home link label reuses `WALLET_HOME_COPY.viewCredential + ' (เอกสารเดิม)'` — no new Home string unless superseded detail panel copy is added.
- One biometric prompt per user action (delete still uses sign-time gate only).
- No secrets/PII in logs — credential ids only.
- Yarn only. Run `yarn tsc --noEmit` and focused tests before closing the slice.

## File map

| File | Responsibility |
|---|---|
| `src/services/credentials/credentialReissueFamily.ts` | **Prerequisite** — family matching (mdl-identity plan Task 1) |
| `src/services/credentials/credentialGuard.ts` | `issuedAt` tie-break in `pickPreferredHomeCredential` |
| `src/services/credentials/credentialGuard.test.ts` | Tie-break + regression tests |
| `src/services/credentials/credentialSupersededSibling.ts` | **New.** `findSupersededOldCredentialForDisplay`, `isCredentialSupersededByNewerSibling` |
| `src/services/credentials/credentialSupersededSibling.test.ts` | **New.** Unit tests |
| `src/services/credentials/finalizeCredentialClaim.ts` | **New.** Post-save pairing + expired removal |
| `src/services/credentials/finalizeCredentialClaim.test.ts` | **New.** Unit tests |
| `src/services/credentials/scannedCredentialSave.ts` | Call `finalizeCredentialClaim` after save |
| `src/services/vci/exchangeService.ts` | Call `finalizeCredentialClaim` after `claimCredential` save path |
| `src/services/credentials/renewalCleanupNotification.ts` | Delegate P3 lookup to superseded helper (optional thin wrapper) |
| `app/(tabs)/index.tsx` | Wire superseded link for catalog + unregistered rows |
| `src/services/credentials/credentialInactiveState.ts` | `superseded` inactive kind for old detail |
| `src/services/credentials/walletHomeCopy.ts` | Superseded detail panel message |
| `app/(tabs)/credential/[id].tsx` | Pass superseded inactive state on detail |
| `docs/TASKS.md` | Mark slice done + verification |

---

### Task 1: `pickPreferredHomeCredential` — prefer newest `issuedAt`

**Files:**
- Modify: `src/services/credentials/credentialGuard.ts`
- Modify: `src/services/credentials/credentialGuard.test.ts`

**Interfaces:**
- Consumes: existing renewal / expiry / hardware filters
- Produces: same `pickPreferredHomeCredential` export; when multiple candidates share `renewal` undefined, returns highest `issuedAt`

- [ ] **Step 1: Write the failing test**

Add to `credentialGuard.test.ts`:

```typescript
test('prefers newer issuedAt when both credentials are normal active with different k_cred DIDs', () => {
  const oldRecord: VerifiableCredentialRecord = {
    id: 'transcript-old',
    type: 'ChulalongkornUniversityTranscript',
    rawVc: 'vc-old',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
  }
  const newRecord: VerifiableCredentialRecord = {
    id: 'transcript-new',
    type: 'ChulalongkornUniversityTranscript',
    rawVc: 'vc-new',
    claims: {},
    issuedAt: '2026-08-24T00:00:00.000Z',
  }

  const picked = pickPreferredHomeCredential([oldRecord, newRecord], {})

  expect(picked?.id).toBe('transcript-new')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/credentials/credentialGuard.test.ts -t "prefers newer issuedAt"`

Expected: FAIL — picks `transcript-old` (index order).

- [ ] **Step 3: Implement tie-break**

In `pickPreferredHomeCredential`, replace the `normalActive` `find` with pick-by-max-`issuedAt`:

```typescript
function pickLatestIssuedAt(
  records: VerifiableCredentialRecord[],
): VerifiableCredentialRecord | undefined {
  if (records.length === 0) return undefined
  return records.reduce((best, current) => {
    const bestTime = Date.parse(best.issuedAt)
    const currentTime = Date.parse(current.issuedAt)
    if (Number.isNaN(currentTime)) return best
    if (Number.isNaN(bestTime) || currentTime > bestTime) return current
    return best
  })
}

// Replace:
// const normalActive = rankedCandidates.find(...)
// if (normalActive) return normalActive
// With:
const normalActiveCandidates = rankedCandidates.filter(
  (record) => readRenewalState(record.id, renewalStatuses) === undefined,
)
const normalActive = pickLatestIssuedAt(normalActiveCandidates)
if (normalActive) return normalActive
```

Apply the same `pickLatestIssuedAt` for the mDOC normal-active branch if multiple mDOC normals exist.

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/credentialGuard.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/credentialGuard.ts src/services/credentials/credentialGuard.test.ts
git commit -m "fix: prefer newest issuedAt on home when reissue siblings coexist"
```

---

### Task 2: Superseded sibling lookup for Home link

**Files:**
- Create: `src/services/credentials/credentialSupersededSibling.ts`
- Create: `src/services/credentials/credentialSupersededSibling.test.ts`

**Interfaces:**
- Consumes: `areCredentialsSameReissueFamily` from `credentialReissueFamily.ts`; `pickPreferredHomeCredential`; `isCredentialDocumentExpired`; `isCredentialWithdrawnFromUse`; `readCredentialRenewalStatuses`, `isRenewalAwaitingHolderCleanup` from renewal modules
- Produces:
  - `findSupersededOldCredentialForDisplay({ preferredCredential, credentials, renewalStatuses }): { oldCredentialId: string } | undefined`
  - `isCredentialSupersededByNewerSibling(credentialId, credentials, renewalStatuses): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  findSupersededOldCredentialForDisplay,
  isCredentialSupersededByNewerSibling,
} from './credentialSupersededSibling'

const issuer = 'https://issuer.zenithcomp.co.th:455/'

function record(
  id: string,
  issuedAt: string,
  overrides: Partial<VerifiableCredentialRecord> = {},
): VerifiableCredentialRecord {
  return {
    id,
    type: 'ChulalongkornUniversityTranscript',
    rawVc: `vc-${id}`,
    claims: {},
    issuedAt,
    issuerUrl: issuer,
    ...overrides,
  }
}

describe('credentialSupersededSibling', () => {
  test('returns older active sibling when preferred is newer', () => {
    const old = record('old', '2026-01-01T00:00:00.000Z')
    const newer = record('new', '2026-08-24T00:00:00.000Z')
    const result = findSupersededOldCredentialForDisplay({
      preferredCredential: newer,
      credentials: [old, newer],
      renewalStatuses: {},
    })
    expect(result).toEqual({ oldCredentialId: 'old' })
  })

  test('does not return calendar-expired old sibling', () => {
    const expired = record('old', '2020-01-01T00:00:00.000Z', {
      claims: { expirationDate: '2020-06-01' },
    })
    const newer = record('new', '2026-08-24T00:00:00.000Z')
    const result = findSupersededOldCredentialForDisplay({
      preferredCredential: newer,
      credentials: [expired, newer],
      renewalStatuses: {},
    })
    expect(result).toBeUndefined()
  })

  test('isCredentialSupersededByNewerSibling is true for old record', () => {
    const old = record('old', '2026-01-01T00:00:00.000Z')
    const newer = record('new', '2026-08-24T00:00:00.000Z')
    expect(
      isCredentialSupersededByNewerSibling('old', [old, newer], {}),
    ).toBe(true)
  })
})
```

Add cross-family negative test using `areCredentialsSameReissueFamily` false case (first-party DLT vs third-party mDL) once family helper exists.

- [ ] **Step 2: Run tests to verify failure**

Run: `yarn test src/services/credentials/credentialSupersededSibling.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { areCredentialsSameReissueFamily } from './credentialReissueFamily'
import { pickPreferredHomeCredential } from './credentialGuard'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import { isCredentialWithdrawnFromUse } from './credentialGuard'
import {
  readCredentialRenewalStatuses,
  type CredentialRenewalRecord,
} from './credentialKeyRenewal'
import { isRenewalAwaitingHolderCleanup } from './renewalCleanupNotification'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function findSupersededOldCredentialForDisplay({
  preferredCredential,
  credentials,
  renewalStatuses,
}: {
  preferredCredential: VerifiableCredentialRecord
  credentials: VerifiableCredentialRecord[]
  renewalStatuses: Record<string, CredentialRenewalRecord>
}): { oldCredentialId: string } | undefined {
  // P3 cleanup-pending path (existing product)
  const p3Old = credentials.find((candidate) => {
    if (candidate.id === preferredCredential.id) return false
    const renewal = renewalStatuses[candidate.id]
    return (
      isRenewalAwaitingHolderCleanup(renewal) &&
      renewal?.replacementCredentialId === preferredCredential.id
    )
  })
  if (p3Old) return { oldCredentialId: p3Old.id }

  // Plain reissue: older active same-family sibling
  const olderSibling = credentials.find((candidate) => {
    if (candidate.id === preferredCredential.id) return false
    if (!areCredentialsSameReissueFamily(candidate, preferredCredential)) return false
    if (isCredentialWithdrawnFromUse(candidate.id)) return false
    if (isCredentialDocumentExpired(candidate)) return false
    const state = renewalStatuses[candidate.id]?.state
    if (state === 'old-revoked') return false
    const candidateTime = Date.parse(candidate.issuedAt)
    const preferredTime = Date.parse(preferredCredential.issuedAt)
    if (Number.isNaN(candidateTime) || Number.isNaN(preferredTime)) return false
    return candidateTime < preferredTime
  })

  if (!olderSibling) return undefined

  // Confirm preferred is still the family winner
  const familyMatches = credentials.filter((c) =>
    areCredentialsSameReissueFamily(c, preferredCredential),
  )
  const winner = pickPreferredHomeCredential(familyMatches, renewalStatuses)
  if (winner?.id !== preferredCredential.id) return undefined

  return { oldCredentialId: olderSibling.id }
}

export function isCredentialSupersededByNewerSibling(
  credentialId: string,
  credentials: VerifiableCredentialRecord[],
  renewalStatuses: Record<string, CredentialRenewalRecord> = readCredentialRenewalStatuses(
    credentials,
  ),
): boolean {
  const credential = credentials.find((c) => c.id === credentialId)
  if (!credential) return false

  const newerSibling = credentials.find((candidate) => {
    if (candidate.id === credentialId) return false
    if (!areCredentialsSameReissueFamily(candidate, credential)) return false
    if (isCredentialDocumentExpired(candidate)) return false
    const candidateTime = Date.parse(candidate.issuedAt)
    const selfTime = Date.parse(credential.issuedAt)
    return !Number.isNaN(candidateTime) && !Number.isNaN(selfTime) && candidateTime > selfTime
  })
  if (!newerSibling) return false

  return findSupersededOldCredentialForDisplay({
    preferredCredential: newerSibling,
    credentials,
    renewalStatuses,
  })?.oldCredentialId === credentialId
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/credentialSupersededSibling.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/credentialSupersededSibling.ts src/services/credentials/credentialSupersededSibling.test.ts
git commit -m "feat: locate superseded old credential for home view-old link"
```

---

### Task 3: Wire Home **ดูเอกสาร (เอกสารเดิม)** link

**Files:**
- Modify: `app/(tabs)/index.tsx` (catalog rows ~365–515 and unregistered block ~594+)

**Interfaces:**
- Consumes: `findSupersededOldCredentialForDisplay`
- Produces: Home rows call superseded helper instead of only `findCleanupPendingForCredentialType`

- [ ] **Step 1: Replace cleanup-only lookup**

Import `findSupersededOldCredentialForDisplay` from `credentialSupersededSibling`.

Inside `documentMenuItems.map`, replace:

```typescript
const cleanupPendingForType = item.credentialType
  ? findCleanupPendingForCredentialType(item.credentialType)
  : undefined
```

With:

```typescript
const supersededOld = credential
  ? findSupersededOldCredentialForDisplay({
      preferredCredential: credential,
      credentials,
      renewalStatuses,
    })
  : undefined
```

Update `oldCredentialLabel` / `onViewOldCredential` to use `supersededOld?.oldCredentialId` (same label string as today).

- [ ] **Step 2: Unregistered rows**

In `unregisteredDocuments.map`, after resolving `credential = item.record`, compute:

```typescript
const supersededOld = findSupersededOldCredentialForDisplay({
  preferredCredential: credential,
  credentials,
  renewalStatuses,
})
```

Pass `oldCredentialLabel` / `onViewOldCredential` to `WalletDocumentMenuItem` if that component supports it on unregistered rows (add props if missing).

- [ ] **Step 3: Manual smoke**

Run: `yarn start` — with two same-family creds in MMKV, Home main row shows newer; link opens older detail.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: show view-old-document link when reissue sibling exists"
```

---

### Task 4: `finalizeCredentialClaim` post-save hook

**Files:**
- Create: `src/services/credentials/finalizeCredentialClaim.ts`
- Create: `src/services/credentials/finalizeCredentialClaim.test.ts`
- Modify: `src/services/credentials/scannedCredentialSave.ts`
- Modify: `src/services/vci/exchangeService.ts` (`claimCredential` success path after `saveCredentialRecord`)

**Interfaces:**
- Consumes: `pairRenewalReplacementForSavedCredential`; `areCredentialsSameReissueFamily`; `isCredentialDocumentExpired`; `deleteExpiredCredentialAfterReissue` from `documentExpiryCleanup.ts`
- Produces: `finalizeCredentialClaim(record: VerifiableCredentialRecord): void`

- [ ] **Step 1: Write failing tests**

```typescript
import { finalizeCredentialClaim } from './finalizeCredentialClaim'
import { readStoredCredentials } from './storedCredentials'
import { pairRenewalReplacementForSavedCredential } from './renewalIssuerIntake'

jest.mock('./renewalIssuerIntake', () => ({
  pairRenewalReplacementForSavedCredential: jest.fn(() => false),
}))

describe('finalizeCredentialClaim', () => {
  test('removes calendar-expired same-family sibling', () => {
    // Use getCredentialStorage mock pattern from exchangeService.test.ts
    // Seed expired old + save new, call finalizeCredentialClaim(new)
    // Expect old id absent from readStoredCredentials()
  })
})
```

- [ ] **Step 2: Implement**

```typescript
import { areCredentialsSameReissueFamily } from './credentialReissueFamily'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import { deleteExpiredCredentialAfterReissue } from './documentExpiryCleanup'
import { pairRenewalReplacementForSavedCredential } from './renewalIssuerIntake'
import { readStoredCredentials } from './storedCredentials'
import { logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export function finalizeCredentialClaim(record: VerifiableCredentialRecord): void {
  try {
    pairRenewalReplacementForSavedCredential(record)
  } catch (error) {
    // Log and continue — pairing failure must not block finalize
    logWalletStep('credentials', 'finalize-claim-pair-skipped', { credentialId: record.id })
  }

  const credentials = readStoredCredentials()
  for (const candidate of credentials) {
    if (candidate.id === record.id) continue
    if (!areCredentialsSameReissueFamily(candidate, record)) continue
    if (!isCredentialDocumentExpired(candidate)) continue
    logWalletStep('credentials', 'finalize-claim-remove-expired-sibling', {
      newCredentialId: record.id,
      expiredCredentialId: candidate.id,
    })
    deleteExpiredCredentialAfterReissue(candidate.id)
  }
}
```

- [ ] **Step 3: Wire callers**

`scannedCredentialSave.ts`:

```typescript
import { finalizeCredentialClaim } from './finalizeCredentialClaim'

export function saveScannedCredential(...) {
  saveCredentialRecord(record)
  finalizeCredentialClaim(record)
  markCredentialAsNew(record.id)
  dependencies.refreshCredentials?.()
}
```

`exchangeService.ts` — after successful `saveCredentialRecord` inside `claimCredential`, call `finalizeCredentialClaim(record)` only when save path does not already go through `saveScannedCredential` (avoid double finalize on deeplink screen).

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/finalizeCredentialClaim.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/finalizeCredentialClaim.ts src/services/credentials/finalizeCredentialClaim.test.ts src/services/credentials/scannedCredentialSave.ts src/services/vci/exchangeService.ts
git commit -m "feat: finalize credential claim with pairing and expired sibling cleanup"
```

---

### Task 5: Superseded inactive state on old detail

**Files:**
- Modify: `src/services/credentials/walletHomeCopy.ts`
- Modify: `src/services/credentials/credentialInactiveState.ts`
- Modify: `src/services/credentials/credentialInactiveState.test.ts`
- Modify: `app/(tabs)/credential/[id].tsx`

**Interfaces:**
- Consumes: `isCredentialSupersededByNewerSibling`
- Produces: inactive `kind: 'superseded'` with grey badge + panel message

- [ ] **Step 1: Add copy**

In `walletHomeCopy.ts`:

```typescript
supersededDocumentPanelMessage:
  'มีเอกสารฉบับใหม่แล้ว เอกสารนี้จะถูกเก็บไว้จนกว่าคุณจะลบ',
```

- [ ] **Step 2: Extend inactive state**

In `readCredentialInactiveState`, before default active return, when `credential` provided:

```typescript
import { isCredentialSupersededByNewerSibling } from './credentialSupersededSibling'
import { readStoredCredentials } from './storedCredentials'

// After renewal/lifecycle checks, before document-expired:
if (
  credential &&
  isCredentialSupersededByNewerSibling(credential.id, readStoredCredentials())
) {
  return {
    kind: 'superseded',
    badgeLabel: 'Inactive',
    badgeClassName: 'bg-gray-badge',
    panelMessage: WALLET_HOME_COPY.supersededDocumentPanelMessage,
  }
}
```

Add `'superseded'` to `InactiveCredentialState['kind']` union.

- [ ] **Step 3: Tests**

Add test in `credentialInactiveState.test.ts` for superseded kind.

- [ ] **Step 4: Commit**

```bash
git add src/services/credentials/walletHomeCopy.ts src/services/credentials/credentialInactiveState.ts src/services/credentials/credentialInactiveState.test.ts app/(tabs)/credential/[id].tsx
git commit -m "feat: show superseded inactive state on old reissue credential detail"
```

---

### Task 6: Docs and verification

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Update TASKS.md**

Add completed slice entry with spec/plan links and verification commands:

```bash
yarn test src/services/credentials/credentialGuard.test.ts
yarn test src/services/credentials/credentialSupersededSibling.test.ts
yarn test src/services/credentials/finalizeCredentialClaim.test.ts
yarn test src/services/credentials/credentialInactiveState.test.ts
yarn tsc --noEmit
```

- [ ] **Step 2: Run full verification**

Run all commands above.

Expected: PASS / no errors.

- [ ] **Step 3: Commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record credential reissue home display slice"
```

---

## Plan self-review (spec coverage)

| Spec section | Task |
|---|---|
| Reissue family rules | Prerequisite `credentialReissueFamily.ts` (mdl-identity Task 1) |
| `pickPreferredHomeCredential` issuedAt tie-break | Task 1 |
| Home “ดูเอกสาร (เอกสารเดิม)” option A | Task 2 + 3 |
| `finalizeCredentialClaim` | Task 4 |
| Expired sibling removal | Task 4 |
| No silent delete of active old | Tasks 2–5 (no delete in finalize for active) |
| Old detail superseded UX | Task 5 |
| Tests | All tasks |
| Out of scope (VP matcher) | Not in plan |

No placeholders remain in task steps.
