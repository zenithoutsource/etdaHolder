# My QR — Driving Licence Dual-Format OID4VP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let holders present linked Driving Licence credentials (`dc+sd-jwt` + `mso_mdoc`) via the My QR tab when a Verifier scans the broker QR — online OID4VP only, no NFC.

**Architecture:** Add `resolveMyQrPresentationCredential()` with driving-licence-first policy when dual-format storage is ready; wire `app/(tabs)/qr.tsx` to the new resolver; reuse `useWalletInitiatedVpQrSession` and `Oid4VpDisclosureFlow` unchanged. VP assembly stays on existing `buildDualFormatDcqlVpToken` + `readMdocVpTokenEntry`. NFC mDL v1 work remains paused per spec §8.

**Tech Stack:** Expo SDK 54, React Native/TypeScript, Jest, existing broker client (`brokerSessionClient.ts`), OID4VP services under `src/services/vp/`.

**Spec:** [`docs/superpowers/specs/2026-07-27-my-qr-driving-licence-dual-format-design.md`](../specs/2026-07-27-my-qr-driving-licence-dual-format-design.md)

## Global Constraints

- My QR shows **broker `qr_payload` URL** — never `mdoc://` engagement URIs.
- **No NFC / proximity arm** in My QR code paths (`armProximityPresentation`, `prepareMdocDeviceAuthForArm`, engagement URI APIs forbidden).
- One user presentation action → at most one biometric (sign-time Keychain gate in `createApprovedPresentationResponse` only).
- No raw mdoc bytes, VP bodies, JWT claims, or PII in wallet logs.
- NativeWind (`className`) for UI; no new `StyleSheet` unless required.
- Do not add customer organization name to new identifiers, files, comments, or docs.
- ThaID-only My QR must keep working when no driving licence is present.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/services/credentials/resolveMyQrPresentationCredential.ts` | **NEW** — driving-licence-first resolver + dual-format readiness |
| `src/services/credentials/resolveMyQrPresentationCredential.test.ts` | **NEW** — resolver unit tests |
| `src/services/credentials/isMyQrDualFormatReady.ts` | **NEW** — shared async gate (logical link + `hasStoredMdoc`) |
| `app/(tabs)/qr.tsx` | Use new resolver; config-driven subtitle for active document |
| `src/services/credentials/walletHomeCopy.ts` | My QR copy keys for driving licence / fallback |
| `src/services/vp/dualFormatVpToken.test.ts` | Add DLTDrivingLicence fixture regression |
| `docs/TASKS.md` | Session entry + NFC pause note |
| `docs/superpowers/specs/2026-07-27-my-qr-driving-licence-dual-format-design.md` | Status → Approved |

---

### Task 1: Dual-format readiness helper

**Files:**
- Create: `src/services/credentials/isMyQrDualFormatReady.ts`
- Create: `src/services/credentials/isMyQrDualFormatReady.test.ts`

**Interfaces:**
- Consumes: `findLogicalCredentialBySdJwtRecordId` from `logicalCredentialStorage.ts`, `hasStoredMdoc` from `mdocStorage.ts`, `isCredentialPresentable` from `credentialLifecycle.ts`
- Produces: `export async function isMyQrDualFormatReady(record: VerifiableCredentialRecord): Promise<boolean>`

- [ ] **Step 1: Write failing test**

```ts
// src/services/credentials/isMyQrDualFormatReady.test.ts
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isMyQrDualFormatReady } from './isMyQrDualFormatReady'

jest.mock('../credentials/logicalCredentialStorage', () => ({
  findLogicalCredentialBySdJwtRecordId: jest.fn(),
}))
jest.mock('../proximity/mdocStorage', () => ({
  hasStoredMdoc: jest.fn(),
}))
jest.mock('./credentialLifecycle', () => ({
  isCredentialPresentable: jest.fn(() => true),
}))

import { findLogicalCredentialBySdJwtRecordId } from '../credentials/logicalCredentialStorage'
import { hasStoredMdoc } from '../proximity/mdocStorage'

const record: VerifiableCredentialRecord = {
  id: 'dl-1',
  type: 'DLTDrivingLicence',
  rawVc: 'issuer.jwt~d~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

test('returns true when logical credential has both formats and mdoc is stored', async () => {
  jest.mocked(findLogicalCredentialBySdJwtRecordId).mockReturnValue({
    logicalCredentialId: 'logical-1',
    issuer: 'issuer',
    documentType: 'DLTDrivingLicence',
    formats: {
      'dc+sd-jwt': { format: 'dc+sd-jwt', credentialConfigurationId: 'x', rawCredentialRef: 'dl-1' },
      'mso_mdoc': { format: 'mso_mdoc', credentialConfigurationId: 'y', rawCredentialRef: 'dl-1' },
    },
    consistencyStatus: 'verified',
    warnings: [],
  })
  jest.mocked(hasStoredMdoc).mockResolvedValue(true)

  await expect(isMyQrDualFormatReady(record)).resolves.toBe(true)
})

test('returns false when mdoc is not stored', async () => {
  jest.mocked(findLogicalCredentialBySdJwtRecordId).mockReturnValue({
    logicalCredentialId: 'logical-1',
    issuer: 'issuer',
    documentType: 'DLTDrivingLicence',
    formats: {
      'dc+sd-jwt': { format: 'dc+sd-jwt', credentialConfigurationId: 'x', rawCredentialRef: 'dl-1' },
      'mso_mdoc': { format: 'mso_mdoc', credentialConfigurationId: 'y', rawCredentialRef: 'dl-1' },
    },
    consistencyStatus: 'verified',
    warnings: [],
  })
  jest.mocked(hasStoredMdoc).mockResolvedValue(false)

  await expect(isMyQrDualFormatReady(record)).resolves.toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/credentials/isMyQrDualFormatReady.test.ts --runInBand`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper**

```ts
// src/services/credentials/isMyQrDualFormatReady.ts
import { isCredentialPresentable } from './credentialLifecycle'
import { findLogicalCredentialBySdJwtRecordId } from './logicalCredentialStorage'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { hasStoredMdoc } from '../proximity/mdocStorage'

export async function isMyQrDualFormatReady(record: VerifiableCredentialRecord): Promise<boolean> {
  if (!isCredentialPresentable(record)) return false

  const logical = findLogicalCredentialBySdJwtRecordId(record.id)
  if (!logical?.formats['dc+sd-jwt'] || !logical.formats['mso_mdoc']) return false

  return hasStoredMdoc(record.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/services/credentials/isMyQrDualFormatReady.test.ts --runInBand`  
Expected: PASS

---

### Task 2: My QR credential resolver

**Files:**
- Create: `src/services/credentials/resolveMyQrPresentationCredential.ts`
- Create: `src/services/credentials/resolveMyQrPresentationCredential.test.ts`
- Modify: `src/services/credentials/resolvePidVpQrCredential.ts` (optional: delegate ThaID branch to shared helper — only if it reduces duplication without behavior change)

**Interfaces:**
- Consumes: `isMyQrDualFormatReady`, `resolvePidVpQrCredential` (ThaID fallback), `pickPreferredHomeCredential`, `readCredentialRenewalStatuses`
- Produces: `export function resolveMyQrPresentationCredential(credentials: VerifiableCredentialRecord[]): VerifiableCredentialRecord | undefined` — sync pick of best **candidate**; dual-format async gate runs in `qr.tsx` before starting broker session OR export `export async function resolveMyQrPresentationCredentialAsync(...)` if cleaner

**Decision (locked):** use **async resolver** `resolveMyQrPresentationCredential(credentials): Promise<VerifiableCredentialRecord | undefined>` so mdoc storage is checked before showing QR.

- [ ] **Step 1: Write failing tests**

```ts
// src/services/credentials/resolveMyQrPresentationCredential.test.ts
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { resolveMyQrPresentationCredential } from './resolveMyQrPresentationCredential'

jest.mock('./isMyQrDualFormatReady', () => ({
  isMyQrDualFormatReady: jest.fn(),
}))
jest.mock('./resolvePidVpQrCredential', () => ({
  resolvePidVpQrCredential: jest.fn(),
}))

import { isMyQrDualFormatReady } from './isMyQrDualFormatReady'
import { resolvePidVpQrCredential } from './resolvePidVpQrCredential'

const drivingLicence: VerifiableCredentialRecord = {
  id: 'dl-1',
  type: 'DLTDrivingLicence',
  rawVc: 'issuer.jwt~d~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

const thaiId: VerifiableCredentialRecord = {
  id: 'thai-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~d~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

test('prefers dual-format-ready driving licence over ThaID', async () => {
  jest.mocked(isMyQrDualFormatReady).mockImplementation(async (record) => record.id === 'dl-1')
  jest.mocked(resolvePidVpQrCredential).mockReturnValue(thaiId)

  await expect(resolveMyQrPresentationCredential([thaiId, drivingLicence])).resolves.toEqual(drivingLicence)
})

test('falls back to ThaID when driving licence is not dual-format ready', async () => {
  jest.mocked(isMyQrDualFormatReady).mockResolvedValue(false)
  jest.mocked(resolvePidVpQrCredential).mockReturnValue(thaiId)

  await expect(resolveMyQrPresentationCredential([thaiId, drivingLicence])).resolves.toEqual(thaiId)
})

test('returns undefined when no eligible credential', async () => {
  jest.mocked(isMyQrDualFormatReady).mockResolvedValue(false)
  jest.mocked(resolvePidVpQrCredential).mockReturnValue(undefined)

  await expect(resolveMyQrPresentationCredential([])).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/credentials/resolveMyQrPresentationCredential.test.ts --runInBand`  
Expected: FAIL

- [ ] **Step 3: Implement resolver**

```ts
// src/services/credentials/resolveMyQrPresentationCredential.ts
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isMyQrDualFormatReady } from './isMyQrDualFormatReady'
import { resolvePidVpQrCredential } from './resolvePidVpQrCredential'

const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'

export async function resolveMyQrPresentationCredential(
  credentials: VerifiableCredentialRecord[],
): Promise<VerifiableCredentialRecord | undefined> {
  const drivingLicenceCandidates = credentials.filter((record) => record.type === DRIVING_LICENCE_TYPE)

  for (const candidate of drivingLicenceCandidates) {
    if (await isMyQrDualFormatReady(candidate)) {
      return candidate
    }
  }

  return resolvePidVpQrCredential(credentials)
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/resolveMyQrPresentationCredential.test.ts --runInBand`  
Expected: PASS

---

### Task 3: Wire My QR screen

**Files:**
- Modify: `app/(tabs)/qr.tsx`
- Modify: `src/services/credentials/walletHomeCopy.ts`

**Interfaces:**
- Consumes: `resolveMyQrPresentationCredential`, existing `useWalletInitiatedVpQrSession`, `Oid4VpDisclosureFlow`
- Produces: My QR tab uses async resolver; subtitle reflects `credential.type` via `getCardSchema(credential.type).title`

- [ ] **Step 1: Add copy keys**

```ts
// walletHomeCopy.ts — add:
myQrScanHintDrivingLicence: 'สแกน QR Code ของฉัน\nเพื่อตรวจสอบใบขับขี่',
myQrScanHintDefault: 'สแกน QR Code ของฉัน\nเพื่อตรวจดูเอกสาร',
myQrNoEligibleDocumentTitle: 'ไม่สามารถแสดง QR ได้',
myQrNoEligibleDocumentMessage: 'ยังไม่มีเอกสารที่พร้อมสำหรับการนำเสนอ',
```

- [ ] **Step 2: Update qr.tsx**

Replace sync `resolvePidVpQrCredential` with async resolution:

```tsx
// Pattern — use state + useEffect:
const [presentationCredential, setPresentationCredential] = useState<VerifiableCredentialRecord | undefined>()
const [resolverStatus, setResolverStatus] = useState<'loading' | 'ready' | 'missing'>('loading')

useEffect(() => {
  let cancelled = false
  void (async () => {
    setResolverStatus('loading')
    const resolved = await resolveMyQrPresentationCredential(credentials)
    if (cancelled) return
    setPresentationCredential(resolved)
    setResolverStatus(resolved ? 'ready' : 'missing')
  })()
  return () => { cancelled = true }
}, [credentials])

// Pass presentationCredential to useWalletInitiatedVpQrSession
// Subtitle:
const scanHint =
  presentationCredential?.type === 'DLTDrivingLicence'
    ? WALLET_HOME_COPY.myQrScanHintDrivingLicence
    : WALLET_HOME_COPY.myQrScanHintDefault
```

Keep ThaID gate panels (`pidGateStatus`) only when resolver returns ThaID path or no driving licence — do not block My QR when driving licence is dual-format ready without ThaID.

- [ ] **Step 3: Manual smoke**

Run: `yarn start` → open My QR with fixture/dev credentials  
Expected: QR renders when driving licence dual-format ready; no proximity/NFC logs

- [ ] **Step 4: Run lint + typecheck**

Run: `yarn lint` and `yarn tsc --noEmit`  
Expected: exit 0 (or only pre-existing unrelated errors — note in TASKS if any)

---

### Task 4: Dual-format VP token regression (Driving Licence)

**Files:**
- Modify: `src/services/vp/dualFormatVpToken.test.ts`

**Interfaces:**
- Consumes: existing `buildDualFormatDcqlVpToken`
- Produces: test proving DLT record id flows to `readMdocEntry(credentialId)`

- [ ] **Step 1: Add driving licence fixture test**

```ts
test('buildDualFormatDcqlVpToken assembles driving licence dual-format tokens', async () => {
  const request: ResolvedPresentationRequest = {
    ...baseRequest,
    matchedCredential: {
      id: 'dl-credential-1',
      type: 'DLTDrivingLicence',
      rawVc: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQm9iIl0~',
      claims: { vct: 'Iso18013DriversLicenseCredential' },
      issuedAt: '2026-06-01T10:00:00.000Z',
    },
    dcqlQuery: {
      credentials: [
        {
          id: 'driving_licence_sd_jwt',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['Iso18013DriversLicenseCredential'] },
        },
        { id: 'driving_licence_mdoc', format: 'mso_mdoc', meta: { type_values: ['org.iso.18013.5.1.mDL'] } },
      ],
    },
  }

  const readMdocEntry = jest.fn().mockResolvedValue('b64mdoc')
  const vpToken = await buildDualFormatDcqlVpToken(request, {
    signSdJwtKb: jest.fn().mockResolvedValue('sd-jwt~kb.jwt'),
    readMdocEntry,
  })

  expect(readMdocEntry).toHaveBeenCalledWith('dl-credential-1')
  expect(vpToken).toContain('driving_licence_mdoc')
})
```

- [ ] **Step 2: Run test**

Run: `yarn test src/services/vp/dualFormatVpToken.test.ts --runInBand`  
Expected: PASS

---

### Task 5: Documentation and NFC pause record

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/superpowers/specs/2026-07-27-my-qr-driving-licence-dual-format-design.md` (Status: Approved)

- [ ] **Step 1: Add TASKS session block**

```markdown
### Session 2026-07-27 (My QR — Driving Licence dual-format OID4VP)

- **Spec:** `docs/superpowers/specs/2026-07-27-my-qr-driving-licence-dual-format-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-27-my-qr-driving-licence-dual-format.md`
- **Done:** `resolveMyQrPresentationCredential`, My QR wiring, dual-format VP regression tests.
- **Paused:** mDL NFC v1 (Multipaz engagement) until My QR + Verifier E2E passes — see spec §8.
- **Verifier E2E (manual):** Broker scan → DCQL dual-format → `direct_post` with sd-jwt + mso_mdoc.
- **Open:** Verifier `docType` for driving licence scan; canonical DCQL `vct_values`.
```

- [ ] **Step 2: Mark spec Approved**

Update spec header `Status: Approved (2026-07-27)`.

---

### Task 6: Verifier E2E checklist (manual — no app code)

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-my-qr-driving-licence-dual-format.md` (append checklist) OR add section to `docs/TASKS.md`

- [ ] **Step 1: Record manual test steps**

1. Claim driving licence with both `dc+sd-jwt` and `mso_mdoc` on dev issuer.
2. Open My QR → broker QR visible.
3. Verifier scans with agreed `docType` (e.g. `DrivingLicence`).
4. Wallet completes disclosure → biometric once.
5. Verifier verify endpoint returns success; `vp_token` contains both DCQL ids.
6. Confirm NFC was not required (airplane mode optional sanity check after scan deposit only if broker allows).

| Field | Value |
|---|---|
| Wallet commit | |
| Verifier commit | |
| docType used | |
| DCQL credential ids | |
| vp_token dual-format | PASS / FAIL |
| **Overall** | PASS / FAIL |

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
|---|---|
| §5 credential resolver driving-licence-first | Task 1–2 |
| §9 My QR UI | Task 3 |
| §7 VP token assembly | Task 4 (regression); existing builders unchanged |
| §8 NFC pause documented | Task 5 |
| §12 acceptance E2E | Task 6 |
| No NFC in My QR | Task 3 constraint + code review |
| ThaID regression | Task 2 tests + Task 3 |

No placeholder steps remain.

---

## Execution order

1. Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 (manual, after deploy)

**Plan saved to:** `docs/superpowers/plans/2026-07-27-my-qr-driving-licence-dual-format.md`
