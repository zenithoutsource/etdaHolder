# First-party vs Third-party ISO mDL Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop treating third-party `org.iso.18013.5.1.mDL` claims as the same document as first-party `DLTDrivingLicence` during persist, storage replace, after-claim expiry cleanup, and P3 renewal pairing.

**Architecture:** Introduce one shared **reissue family** helper keyed on first-party issuer hostname (`issuer.zenithcomp.co.th`) plus document family (`resolveFirstPartyType` or `readUnregisteredDocumentGroupKey`). Gate `canonicalCredentialType` on offer issuer at claim time. Reuse the helper in expiry cleanup, storage replace, and renewal pairing so stored `type` alone never links issuers.

**Tech Stack:** Expo SDK 54, TypeScript, Jest, Yarn, existing `firstPartyCredential.ts` / `exchangeService.ts` OID4VCI paths.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-first-party-third-party-mdl-identity-design.md`
- English-only new identifiers, comments, and docs.
- Do not add the customer organization name in new identifiers, files, or docs.
- First-party issuer hostname from `EXPO_PUBLIC_ISSUER_CREDENTIAL_ISSUER`, default `issuer.zenithcomp.co.th` (`isFirstPartyIssuerOrigin`).
- `canonicalFirstPartyType('org.iso.18013.5.1.mDL')` stays a wire hint; callers must pass issuer before mapping to `DLTDrivingLicence`.
- No new Holder-facing errors; skip cross-issuer pairing/cleanup silently.
- Do not log claims, VC payloads, or PII — credential ids and issuer host only.
- OID4VP mdoc matching is out of scope (already doctype-based).
- Dual-format grouping inside one first-party offer stays unchanged.
- Calendar-expiry first-party portal **ขอเอกสาร** stays allowed.
- Yarn only. Run `yarn tsc --noEmit` before closing the slice.

## File map

| File | Responsibility |
|---|---|
| `src/services/credentials/credentialReissueFamily.ts` | **New.** `readCredentialIssuerHostname`, `areCredentialsSameReissueFamily` |
| `src/services/credentials/credentialReissueFamily.test.ts` | **New.** Unit tests for family matching |
| `src/config/firstPartyCredential.ts` | Doctype-only mDL without first-party host → not Home DLT |
| `src/config/firstPartyCredential.test.ts` | Flip doctype-without-issuer expectations |
| `src/services/vci/exchangeService.ts` | Issuer-gated `canonicalCredentialType`; family-aware `isReplaceableCredentialId` |
| `src/services/vci/exchangeService.oid4vci10.test.ts` | Third-party issuer mDL persist expectations |
| `src/services/credentials/credentialDocumentExpiry.ts` | Family-aware `findExpiredCredentialsOfSameType` |
| `src/services/credentials/credentialDocumentExpiry.test.ts` | Cross-issuer cleanup cases |
| `src/services/credentials/inferPortalCredentialType.ts` | First-party issuer gate on DLT inference |
| `src/services/credentials/inferPortalCredentialType.test.ts` | Third-party mDL offer → `undefined` |
| `src/services/credentials/renewalIssuerIntake.ts` | Family-aware `pairRenewalReplacementForSavedCredential` |
| `src/services/credentials/renewalIssuerIntake.test.ts` | Third-party mDL must not pair onto DLT intake |
| `src/services/credentials/unregisteredHomeDocuments.test.ts` | Doctype-only DLT not on catalog row |
| `docs/TASKS.md` | Mark implementation done + verification commands |

`CredentialOfferClaimScreen.tsx` and `documentExpiryCleanup.ts` need **no** logic changes if `findExpiredCredentialsOfSameType` is fixed (they already delegate).

---

### Task 1: Shared reissue-family helper

**Files:**
- Create: `src/services/credentials/credentialReissueFamily.ts`
- Create: `src/services/credentials/credentialReissueFamily.test.ts`

**Interfaces:**
- Consumes: `resolveFirstPartyType`, `readUnregisteredDocumentGroupKey`, `isFirstPartyIssuerOrigin` from `src/config/firstPartyCredential.ts`
- Produces:
  - `readCredentialIssuerHostname(record: Pick<VerifiableCredentialRecord, 'issuerUrl' | 'claims'>): string | undefined`
  - `areCredentialsSameReissueFamily(left: VerifiableCredentialRecord, right: VerifiableCredentialRecord): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
import {
  areCredentialsSameReissueFamily,
  readCredentialIssuerHostname,
} from './credentialReissueFamily'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const FIRST_PARTY_ISSUER = 'https://issuer.zenithcomp.co.th:455/'
const THIRD_PARTY_ISSUER = 'https://demo.tonyhere.work/'

function record(overrides: Partial<VerifiableCredentialRecord>): VerifiableCredentialRecord {
  return {
    id: 'cred-1',
    type: 'DLTDrivingLicence',
    rawVc: 'mdoc:abc',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('credentialReissueFamily', () => {
  test('reads issuer hostname from issuerUrl', () => {
    expect(
      readCredentialIssuerHostname({ issuerUrl: FIRST_PARTY_ISSUER, claims: {} }),
    ).toBe('issuer.zenithcomp.co.th')
  })

  test('first-party DLT siblings with same issuer are the same family', () => {
    const expired = record({
      id: 'old',
      issuerUrl: FIRST_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const fresh = record({
      id: 'new',
      issuerUrl: FIRST_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    expect(areCredentialsSameReissueFamily(expired, fresh)).toBe(true)
  })

  test('first-party expired DLT and third-party mDL are not the same family', () => {
    const firstParty = record({
      id: 'fp-old',
      issuerUrl: FIRST_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const thirdParty = record({
      id: 'tp-new',
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: THIRD_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      credentialConfigurationId: 'org.iso.18013.5.1.mDL',
    })
    expect(areCredentialsSameReissueFamily(firstParty, thirdParty)).toBe(false)
  })

  test('third-party credentials with different issuers are not the same family', () => {
    const a = record({
      id: 'a',
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: THIRD_PARTY_ISSUER,
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const b = record({
      id: 'b',
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: 'https://issuer.example.com',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    expect(areCredentialsSameReissueFamily(a, b)).toBe(false)
  })

  test('matching stored type alone is not enough across issuers', () => {
    const firstParty = record({ id: 'fp', issuerUrl: FIRST_PARTY_ISSUER })
    const thirdParty = record({
      id: 'tp',
      type: 'DLTDrivingLicence',
      issuerUrl: THIRD_PARTY_ISSUER,
      claims: { vct: 'https://demo.tonyhere.work/credentials/DrivingLicense' },
    })
    expect(areCredentialsSameReissueFamily(firstParty, thirdParty)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/credentials/credentialReissueFamily.test.ts --no-coverage`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal helper**

```typescript
import {
  isFirstPartyIssuerOrigin,
  readUnregisteredDocumentGroupKey,
  resolveFirstPartyType,
} from '@/src/config/firstPartyCredential'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

function readHostname(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed?.includes('://')) return undefined
  try {
    return new URL(trimmed).hostname.toLowerCase() || undefined
  } catch {
    return undefined
  }
}

export function readCredentialIssuerHostname(
  record: Pick<VerifiableCredentialRecord, 'issuerUrl' | 'claims'>,
): string | undefined {
  const claims = record.claims ?? {}
  const candidates = [record.issuerUrl, claims.iss, claims.vct]
  for (const value of candidates) {
    if (typeof value !== 'string') continue
    const hostname = readHostname(value)
    if (hostname) return hostname
  }
  return undefined
}

export function areCredentialsSameReissueFamily(
  left: VerifiableCredentialRecord,
  right: VerifiableCredentialRecord,
): boolean {
  const leftFirstParty = resolveFirstPartyType(left)
  const rightFirstParty = resolveFirstPartyType(right)

  const leftHost = readCredentialIssuerHostname(left)
  const rightHost = readCredentialIssuerHostname(right)
  if (leftHost && rightHost && leftHost !== rightHost) return false
  if ((leftHost && !rightHost) || (!leftHost && rightHost)) return false

  if (leftFirstParty && rightFirstParty) {
    return leftFirstParty === rightFirstParty
  }
  if (leftFirstParty || rightFirstParty) return false

  return (
    readUnregisteredDocumentGroupKey(left) === readUnregisteredDocumentGroupKey(right)
  )
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/credentialReissueFamily.test.ts --no-coverage`  
Expected: PASS (Task 1 tests only — `resolveFirstPartyType` doctype fix lands in Task 2; if the cross-issuer DLT test fails early, land Task 2 first or temporarily expect `false` for all cross-issuer cases and tighten after Task 2)

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/credentialReissueFamily.ts src/services/credentials/credentialReissueFamily.test.ts
git commit -m "feat(credentials): add reissue family helper for issuer-aware matching"
```

---

### Task 2: Display-time doctype classifier

**Files:**
- Modify: `src/config/firstPartyCredential.ts`
- Modify: `src/config/firstPartyCredential.test.ts`
- Modify: `src/services/credentials/unregisteredHomeDocuments.test.ts`

**Interfaces:**
- Consumes: existing `readWireIdentifiers`, `readRecordIssuerHostnames`
- Produces: updated `resolveFirstPartyType` — ISO mDL doctype / config id is DLT **only** when a first-party issuer host is present on the record

- [ ] **Step 1: Update failing classifier test**

In `src/config/firstPartyCredential.test.ts`, replace test `keeps ISO mDL as DLT even when the offer id is not on the allowlist`:

```typescript
test('does not treat doctype-only ISO mDL without issuer as first-party DLT', () => {
  expect(
    resolveFirstPartyType({
      type: 'TestMdocDrivingLicence',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      credentialConfigurationId: 'TestMdocDrivingLicence',
    }),
  ).toBeUndefined()
  expect(
    resolveFirstPartyType({
      type: 'DLTDrivingLicence',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      credentialConfigurationId: 'org.iso.18013.5.1.mDL',
      issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
    }),
  ).toBe('DLTDrivingLicence')
})
```

In `unregisteredHomeDocuments.test.ts`, change the `dlt` fixture to include `issuerUrl: 'https://issuer.zenithcomp.co.th:455/'` and add a case where doctype-only mDL is **not** a catalog match:

```typescript
test('keeps doctype-only third-party mDL off the DLT catalog row', () => {
  const doctypeOnly = record({
    id: 'mdl-1',
    type: 'DLTDrivingLicence',
    claims: { doctype: 'org.iso.18013.5.1.mDL' },
    credentialConfigurationId: 'org.iso.18013.5.1.mDL',
  })
  expect(isCatalogFirstPartyMatch(doctypeOnly, 'DLTDrivingLicence')).toBe(false)
  expect(listUnregisteredHomeDocuments([doctypeOnly], {})).toHaveLength(1)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `yarn test src/config/firstPartyCredential.test.ts src/services/credentials/unregisteredHomeDocuments.test.ts --no-coverage`  
Expected: FAIL on new/updated expectations

- [ ] **Step 3: Implement classifier change**

In `resolveFirstPartyType`, after `readCandidateFirstPartyType` returns a candidate, add a doctype-wire guard before the existing hostname rejection:

```typescript
function isIsoMdlWireRecord(record: FirstPartyRecordLike): boolean {
  return readWireIdentifiers(record).some(
    (id) => canonicalFirstPartyType(id) === 'DLTDrivingLicence'
      && normalizeIdentifier(id).includes('org.iso')
      && normalizeIdentifier(id).endsWith('mdl'),
  )
}

export function resolveFirstPartyType(record: FirstPartyRecordLike): FirstPartyCredentialType | undefined {
  const candidate = readCandidateFirstPartyType(record)
  if (!candidate) return undefined

  const hostnames = readRecordIssuerHostnames(record)
  const firstPartyHost = readFirstPartyIssuerHostname()

  if (candidate === 'DLTDrivingLicence' && isIsoMdlWireRecord(record)) {
    if (!hostnames.includes(firstPartyHost)) return undefined
  }

  if (hostnames.length > 0 && !hostnames.includes(firstPartyHost)) {
    return undefined
  }

  return candidate
}
```

Export `readFirstPartyIssuerHostname` only if tests need it; otherwise keep it private.

- [ ] **Step 4: Run tests**

Run: `yarn test src/config/firstPartyCredential.test.ts src/services/credentials/unregisteredHomeDocuments.test.ts src/services/credentials/credentialReissueFamily.test.ts --no-coverage`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/firstPartyCredential.ts src/config/firstPartyCredential.test.ts src/services/credentials/unregisteredHomeDocuments.test.ts
git commit -m "fix(first-party): gate ISO mDL doctype on issuer host for Home DLT"
```

---

### Task 3: Issuer-gated persist type

**Files:**
- Modify: `src/services/vci/exchangeService.ts` (`canonicalCredentialType`, `readCredentialType`)
- Modify: `src/services/vci/exchangeService.oid4vci10.test.ts`

**Interfaces:**
- Consumes: `isFirstPartyIssuerOrigin`, `canonicalFirstPartyType` from `firstPartyCredential.ts`
- Produces: `canonicalCredentialType(type: string, issuer?: string): string` used by `readCredentialType` with `resolvedOffer?.issuer`

- [ ] **Step 1: Add/adjust failing persist test**

In `exchangeService.oid4vci10.test.ts`, locate `maps org.iso.18013.5.1.mDL to DLTDrivingLicence`. Split into two cases:

```typescript
test('stores third-party org.iso.18013.5.1.mDL without folding to DLTDrivingLicence', async () => {
  const issuer = 'https://demo.tonyhere.work/'
  // ... existing mdoc claim setup with issuer ...
  expect(record.type).toBe('org.iso.18013.5.1.mDL')
})

test('stores first-party org.iso.18013.5.1.mDL as DLTDrivingLicence', async () => {
  const issuer = 'https://issuer.zenithcomp.co.th:455/'
  // ... same setup, first-party issuer ...
  expect(record.type).toBe('DLTDrivingLicence')
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `yarn test src/services/vci/exchangeService.oid4vci10.test.ts --no-coverage -t "org.iso.18013.5.1.mDL"`  
Expected: FAIL — third-party case stores `DLTDrivingLicence`

- [ ] **Step 3: Gate canonicalCredentialType**

```typescript
import { canonicalFirstPartyType, isFirstPartyIssuerOrigin } from '../../config/firstPartyCredential'

function canonicalCredentialType(type: string, issuer?: string): string {
  const firstParty = canonicalFirstPartyType(type)
  if (firstParty && isFirstPartyIssuerOrigin(issuer)) return firstParty
  return type
}

function readCredentialType(
  claims: Record<string, unknown>,
  vc: Record<string, unknown> | undefined,
  resolvedOffer?: Pick<ResolvedCredentialOffer, 'credentialConfigurations' | 'issuer' | 'issuerDisplay'>,
): string {
  const issuer = resolvedOffer?.issuer
  const vcType = readTypeValue(vc?.type)
  if (vcType) return canonicalCredentialType(vcType, issuer)

  const sdJwtType = readString(claims.vct)
  if (sdJwtType) return canonicalCredentialType(sdJwtType, issuer)

  const claimType = readTypeValue(claims.type)
  if (claimType) return canonicalCredentialType(claimType, issuer)

  const offeredType = resolvedOffer?.credentialConfigurations[0]?.id
  if (offeredType) return canonicalCredentialType(offeredType, issuer)

  return 'VerifiableCredential'
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/vci/exchangeService.oid4vci10.test.ts --no-coverage -t "org.iso.18013.5.1.mDL"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vci/exchangeService.ts src/services/vci/exchangeService.oid4vci10.test.ts
git commit -m "fix(oid4vci): gate mDL to DLT type mapping on first-party issuer"
```

---

### Task 4: Family-aware expiry cleanup and storage replace

**Files:**
- Modify: `src/services/credentials/credentialDocumentExpiry.ts`
- Modify: `src/services/credentials/credentialDocumentExpiry.test.ts`
- Modify: `src/services/vci/exchangeService.ts` (`isReplaceableCredentialId`)

**Interfaces:**
- Consumes: `areCredentialsSameReissueFamily` from Task 1
- Produces: updated `findExpiredCredentialsOfSameType`; updated `isReplaceableCredentialId` using family check instead of `existing.type !== replacement.type`

- [ ] **Step 1: Write failing expiry cleanup tests**

Append to `credentialDocumentExpiry.test.ts`:

```typescript
test('does not return expired first-party DLT when new claim is third-party mDL', () => {
  const expiredFirstParty = buildRecord('2020-01-01T00:00:00.000Z')
  expiredFirstParty.id = 'fp-old'
  expiredFirstParty.type = 'DLTDrivingLicence'
  expiredFirstParty.issuerUrl = 'https://issuer.zenithcomp.co.th:455/'
  expiredFirstParty.claims = { doctype: 'org.iso.18013.5.1.mDL' }

  const thirdPartyFresh = buildRecord('2035-01-01T00:00:00.000Z')
  thirdPartyFresh.id = 'tp-new'
  thirdPartyFresh.type = 'org.iso.18013.5.1.mDL'
  thirdPartyFresh.issuerUrl = 'https://demo.tonyhere.work/'
  thirdPartyFresh.claims = { doctype: 'org.iso.18013.5.1.mDL' }

  expect(
    findExpiredCredentialsOfSameType(
      thirdPartyFresh,
      [expiredFirstParty, thirdPartyFresh],
      new Date('2026-06-01T00:00:00.000Z'),
    ),
  ).toEqual([])
})

test('still returns expired first-party sibling on same-issuer reissue', () => {
  const expired = buildRecord('2020-01-01T00:00:00.000Z')
  expired.id = 'old'
  expired.type = 'DLTDrivingLicence'
  expired.issuerUrl = 'https://issuer.zenithcomp.co.th:455/'
  expired.claims = { doctype: 'org.iso.18013.5.1.mDL' }

  const fresh = buildRecord('2035-01-01T00:00:00.000Z')
  fresh.id = 'new'
  fresh.type = 'DLTDrivingLicence'
  fresh.issuerUrl = 'https://issuer.zenithcomp.co.th:455/'
  fresh.claims = { doctype: 'org.iso.18013.5.1.mDL' }

  expect(
    findExpiredCredentialsOfSameType(fresh, [expired, fresh], new Date('2026-06-01T00:00:00.000Z')),
  ).toEqual([expired])
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test src/services/credentials/credentialDocumentExpiry.test.ts --no-coverage`  
Expected: FAIL on cross-issuer case

- [ ] **Step 3: Update findExpiredCredentialsOfSameType**

```typescript
import { areCredentialsSameReissueFamily } from './credentialReissueFamily'

export function findExpiredCredentialsOfSameType(
  newRecord: VerifiableCredentialRecord,
  credentials: VerifiableCredentialRecord[],
  now = new Date(),
): VerifiableCredentialRecord[] {
  return credentials.filter(
    (credential) =>
      credential.id !== newRecord.id &&
      areCredentialsSameReissueFamily(credential, newRecord) &&
      isCredentialDocumentExpired(credential, now),
  )
}
```

- [ ] **Step 4: Update isReplaceableCredentialId**

Replace the `existing.type !== replacement.type` guard:

```typescript
import { areCredentialsSameReissueFamily } from '../credentials/credentialReissueFamily'

// inside isReplaceableCredentialId, after JSON.parse:
if (!areCredentialsSameReissueFamily(existing as VerifiableCredentialRecord, replacement)) {
  return false
}
```

Remove the old `if (existing.type !== replacement.type) return false` line.

- [ ] **Step 5: Run tests**

Run: `yarn test src/services/credentials/credentialDocumentExpiry.test.ts --no-coverage`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/credentials/credentialDocumentExpiry.ts src/services/credentials/credentialDocumentExpiry.test.ts src/services/vci/exchangeService.ts
git commit -m "fix(credentials): scope expiry cleanup and storage replace to reissue family"
```

---

### Task 5: Portal inference and P3 pairing

**Files:**
- Modify: `src/services/credentials/inferPortalCredentialType.ts`
- Modify: `src/services/credentials/inferPortalCredentialType.test.ts`
- Modify: `src/services/credentials/renewalIssuerIntake.ts`
- Modify: `src/services/credentials/renewalIssuerIntake.test.ts`

**Interfaces:**
- Consumes: `isFirstPartyIssuerOrigin`; `areCredentialsSameReissueFamily`
- Produces: issuer-gated `inferPortalCredentialTypeFromOffer`; family-aware `pairRenewalReplacementForSavedCredential`

- [ ] **Step 1: Write failing portal inference test**

```typescript
test('does not infer DLT from third-party mDL configuration id', () => {
  const offer = buildOffer(['org.iso.18013.5.1.mDL'])
  offer.issuer = 'https://demo.tonyhere.work/'
  expect(inferPortalCredentialTypeFromOffer(offer)).toBeUndefined()
})

test('still infers DLT for first-party mDL offer', () => {
  const offer = buildOffer([
    'Iso18013DriversLicenseCredential_dc+sd-jwt',
    'org.iso.18013.5.1.mDL',
  ])
  offer.issuer = 'https://issuer.zenithcomp.co.th:455/'
  expect(inferPortalCredentialTypeFromOffer(offer)).toBe('DLTDrivingLicence')
})
```

- [ ] **Step 2: Write failing renewal pairing test**

In `renewalIssuerIntake.test.ts`, add:

```typescript
test('does not pair third-party mDL onto first-party DLT renewal-required', () => {
  const { values } = mockStorage()
  const firstPartyDlt = {
    ...mockCredential,
    id: 'dlt-old',
    type: 'DLTDrivingLicence',
    issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
    claims: { doctype: 'org.iso.18013.5.1.mDL' },
  }
  seedCredential(values, firstPartyDlt)
  writeCredentialRenewal({
    credentialId: firstPartyDlt.id,
    previousHolderDid: 'did:key:old',
    state: 'renewal-required',
    updatedAt: new Date().toISOString(),
  })

  const thirdPartyReplacement: VerifiableCredentialRecord = {
    id: 'tp-mdl',
    type: 'org.iso.18013.5.1.mDL',
    rawVc: 'mdoc:new',
    issuerUrl: 'https://demo.tonyhere.work/',
    claims: { doctype: 'org.iso.18013.5.1.mDL' },
    issuedAt: '2026-08-24T00:00:00.000Z',
  }

  expect(pairRenewalReplacementForSavedCredential(thirdPartyReplacement)).toBe(false)
  expect(readCredentialRenewal(firstPartyDlt.id)?.state).toBe('renewal-required')
})
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `yarn test src/services/credentials/inferPortalCredentialType.test.ts src/services/credentials/renewalIssuerIntake.test.ts --no-coverage`  
Expected: FAIL

- [ ] **Step 4: Implement portal inference gate**

```typescript
import { isFirstPartyIssuerOrigin } from '../../config/firstPartyCredential'

export function inferPortalCredentialTypeFromOffer(
  offer: ResolvedCredentialOffer,
): IssuerPortalCredentialType | undefined {
  if (!isFirstPartyIssuerOrigin(offer.issuer)) return undefined
  // ... existing loop unchanged ...
}
```

- [ ] **Step 5: Implement family-aware pairing**

```typescript
import { areCredentialsSameReissueFamily } from './credentialReissueFamily'

export function pairRenewalReplacementForSavedCredential(
  replacement: VerifiableCredentialRecord,
  now = new Date(),
): boolean {
  const credentials = readStoredCredentials()
  for (const credential of credentials) {
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state !== 'renewal-required') continue
    if (credential.id === replacement.id) continue
    if (!areCredentialsSameReissueFamily(credential, replacement)) continue
    pairRenewalReplacement(credential.id, replacement, now)
    return true
  }
  return false
}
```

Remove the `findRenewalRequiredIntakeForType(replacement.type)` call from this function (keep `findRenewalRequiredIntakeForType` for portal pending-key lookup).

- [ ] **Step 6: Run tests**

Run: `yarn test src/services/credentials/inferPortalCredentialType.test.ts src/services/credentials/renewalIssuerIntake.test.ts --no-coverage`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/credentials/inferPortalCredentialType.ts src/services/credentials/inferPortalCredentialType.test.ts src/services/credentials/renewalIssuerIntake.ts src/services/credentials/renewalIssuerIntake.test.ts
git commit -m "fix(renewal): gate portal DLT inference and pairing on issuer family"
```

---

### Task 6: Close slice — full verification and TASKS

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/superpowers/specs/2026-08-24-first-party-third-party-mdl-identity-design.md` (Status → Approved)

- [ ] **Step 1: Run focused test bundle**

```bash
yarn test src/services/credentials/credentialReissueFamily.test.ts src/config/firstPartyCredential.test.ts src/services/credentials/unregisteredHomeDocuments.test.ts src/services/credentials/credentialDocumentExpiry.test.ts src/services/vci/exchangeService.oid4vci10.test.ts src/services/credentials/inferPortalCredentialType.test.ts src/services/credentials/renewalIssuerIntake.test.ts --no-coverage
```

Expected: all PASS

- [ ] **Step 2: Typecheck**

```bash
yarn tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Update TASKS.md**

Under `Session 2026-08-24 (First-party vs third-party ISO mDL identity)`:

- Change `Implementation not started` → done summary
- Add verification command from Step 1
- Note: third-party mDL claim no longer triggers delete-old-document for expired first-party DLT

- [ ] **Step 4: Mark spec approved**

In the spec file, set `Status: Approved`.

- [ ] **Step 5: Commit**

```bash
git add docs/TASKS.md docs/superpowers/specs/2026-08-24-first-party-third-party-mdl-identity-design.md
git commit -m "docs: close first-party vs third-party mDL identity slice"
```

---

## Spec coverage checklist

| Spec section | Task |
|---|---|
| §3 Identity rules | Task 1 (`credentialReissueFamily`) |
| §4 Persist and replace | Task 3 + Task 4 (`isReplaceableCredentialId`) |
| §5 After-claim cleanup | Task 4 (`findExpiredCredentialsOfSameType`) |
| §6 Portal inference / P3 pairing | Task 5 |
| §7 Display classifier | Task 2 |
| §9 Verification | Task 6 |
| §10 Error handling | Tasks 4–5 (silent skip; existing log tags) |

## Manual smoke (optional)

1. Expire first-party DLT (or use a test credential with past `expiresAt`).
2. Scan-claim third-party `org.iso.18013.5.1.mDL` from a non-`issuer.zenithcomp.co.th` issuer.
3. Confirm: no delete-old-document dialog for first-party DLT; Home DLT still expired; extra row usable.
4. Portal-request first-party DLT — confirm **ขอเอกสาร** still works.
