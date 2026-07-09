# OID4VP DCQL `credential_sets` (v1 — Single-Credential OR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse DCQL `credential_sets` so the wallet can satisfy "present one of credential A or B" requests, auto-select the first satisfiable single-ID option, and unify DCQL satisfiability via one shared predicate — without changing the existing dual-format path.

**Architecture:** New `dcqlCredentialMatch.ts` centralizes per-credential DCQL support/satisfiability checks extracted from `presentationService.ts`. New `dcqlCredentialSetResolver.ts` handles `credential_sets` shape validation and first-match selection. `isExactDualFormatPair()` added to `dualFormatPresentationMatch.ts` short-circuits all new v1 rules before they can tighten dual-format behavior. `resolvePresentationRequest()` reorders the DCQL branch: selection → cardinality guard → support assert → match.

**Tech Stack:** Expo SDK 54, Hermes, Jest, existing `presentationService` types, `dualFormatPresentationMatch` helpers.

**Spec:** `docs/superpowers/specs/2026-07-08-oid4vp-dcql-credential-sets-design.md`

## Global Constraints

- Keep **single-`matchedCredential`** architecture — no multi-key `vp_token` refactor.
- **Exact dual-format pairs** (`credentials.length === 2`, one SD-JWT-family + one `mso_mdoc`) bypass all new v1 rules via `isExactDualFormatPair()` — existing dual-format tests must pass unchanged.
- Run `assertSupportedDcqlRequest()` on **effective (post-selection) query only** — unselected OR alternatives must not cause failure.
- Replace DCQL use of `hasRequiredClaimForRequest()` with `canWalletSatisfyDcqlCredentialQuery()` on non-dual-format paths.
- `type_values` use local wallet-type mapping; `vct_values` require exact signed SD-JWT `vct` match.
- Reject nested claim paths (`path.length > 1`), omitted `format` (non-dual-format), optional sets (`required: false`), multi-id options, multiple top-level sets.
- No logging of claim values or tokens — `logWalletStep` with selected credential query id only.
- Run `yarn tsc --noEmit`, focused tests after each task; update `docs/TASKS.md` when complete.
- Do not commit unless the user explicitly requests.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/services/vp/dualFormatPresentationMatch.ts` | **Modify** — add `isExactDualFormatPair` export |
| `src/services/vp/dualFormatPresentationMatch.test.ts` | **Modify** — tests for `isExactDualFormatPair` |
| `src/services/vp/dcqlCredentialMatch.ts` | **Create** — shared DCQL support + satisfiability predicates |
| `src/services/vp/dcqlCredentialMatch.test.ts` | **Create** — unit tests for match module |
| `src/services/vp/dcqlCredentialSetResolver.ts` | **Create** — `credential_sets` parse + selection |
| `src/services/vp/dcqlCredentialSetResolver.test.ts` | **Create** — unit tests for resolver |
| `src/services/vp/presentationService.ts` | **Modify** — types, parse `credential_sets`, reorder DCQL branch, import shared match logic |
| `src/services/vp/presentationService.test.ts` | **Modify** — `credential_sets` OR integration + no-set tightening |
| `docs/TASKS.md` | **Modify** — mark `credential_sets` checkbox `[x]` |

---

### Task 1: `isExactDualFormatPair` (dual-format short-circuit gate)

**Files:**
- Modify: `src/services/vp/dualFormatPresentationMatch.ts`
- Modify: `src/services/vp/dualFormatPresentationMatch.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// Append to src/services/vp/dualFormatPresentationMatch.test.ts
import { isDualFormatDcqlRequest, isExactDualFormatPair, isSdJwtSideCompatibleWithDualFormatRequest, readRequestedDcqlFormats } from './dualFormatPresentationMatch'

test('isExactDualFormatPair is true for exactly two credentials with sd-jwt and mso_mdoc', () => {
  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-1', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
        { id: 'cred-2', format: 'mso_mdoc' },
      ],
    }),
  ).toBe(true)

  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-2', format: 'mso_mdoc' },
        { id: 'cred-1', format: 'vc+sd-jwt', meta: { vct_values: ['Transcript'] } },
      ],
    }),
  ).toBe(true)
})

test('isExactDualFormatPair is false for three credentials even when dual formats are present', () => {
  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-1', format: 'dc+sd-jwt' },
        { id: 'cred-2', format: 'mso_mdoc' },
        { id: 'cred-3', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
      ],
    }),
  ).toBe(false)
})

test('isExactDualFormatPair is false for duplicate sd-jwt formats', () => {
  expect(
    isExactDualFormatPair({
      credentials: [
        { id: 'cred-1', format: 'dc+sd-jwt' },
        { id: 'cred-2', format: 'dc+sd-jwt' },
      ],
    }),
  ).toBe(false)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test --runInBand src/services/vp/dualFormatPresentationMatch.test.ts`  
Expected: FAIL — `isExactDualFormatPair` is not defined

- [ ] **Step 3: Implement `isExactDualFormatPair`**

```typescript
// Add to src/services/vp/dualFormatPresentationMatch.ts after isDualFormatDcqlRequest

const SD_JWT_DCQL_FORMATS = new Set(['dc+sd-jwt', 'vc+sd-jwt'])

export function isExactDualFormatPair(dcqlQuery: DcqlQuery): boolean {
  if (dcqlQuery.credentials.length !== 2) return false

  const formats = readRequestedDcqlFormats(dcqlQuery)
  if (formats.length !== 2) return false

  const hasSdJwtFormat = formats.some((format) => SD_JWT_DCQL_FORMATS.has(format))
  const hasMdocFormat = formats.includes('mso_mdoc')
  return hasSdJwtFormat && hasMdocFormat
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test --runInBand src/services/vp/dualFormatPresentationMatch.test.ts`  
Expected: PASS (all existing + new tests)

---

### Task 2: `dcqlCredentialMatch` module (support + satisfiability predicates)

**Files:**
- Create: `src/services/vp/dcqlCredentialMatch.ts`
- Create: `src/services/vp/dcqlCredentialMatch.test.ts`

- [ ] **Step 1: Write failing tests for support guards**

```typescript
// src/services/vp/dcqlCredentialMatch.test.ts
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  assertNoSetDcqlCardinality,
  assertSupportedDcqlCredentialQuery,
  assertSupportedDcqlRequest,
  canWalletSatisfyDcqlCredentialQuery,
} from './dcqlCredentialMatch'
import type { DcqlCredentialQuery, DcqlQuery } from './presentationService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-id-1',
  type: 'ThaiNationalID',
  rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6eyJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRDYXJkQ3JlZGVudGlhbCJdfX0.signature',
  claims: { id_number: '1234567890123', birthdate: '2001-05-15' },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

describe('assertSupportedDcqlCredentialQuery', () => {
  test('rejects omitted format', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      meta: { type_values: ['IDCardCredential'] },
    }

    expect(() => assertSupportedDcqlCredentialQuery(credential)).toThrow(
      'PresentationRequestInvalid: dcql credential format is required',
    )
  })

  test('rejects nested claim paths', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [{ path: ['address', 'street_address'] }],
    }

    expect(() => assertSupportedDcqlCredentialQuery(credential)).toThrow(
      'PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1',
    )
  })

  test('accepts supported jwt_vc_json type_values credential', () => {
    expect(() =>
      assertSupportedDcqlCredentialQuery({
        id: 'thai_id',
        format: 'jwt_vc_json',
        meta: { type_values: ['IDCardCredential'] },
      }),
    ).not.toThrow()
  })
})

describe('assertSupportedDcqlRequest', () => {
  test('no-ops for exact dual-format pair with meta-less mso_mdoc', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'transcript_sd_jwt', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
        { id: 'transcript_mdoc', format: 'mso_mdoc' },
      ],
    }

    expect(() => assertSupportedDcqlRequest(query)).not.toThrow()
  })

  test('rejects unsupported type on non-dual-format query', () => {
    const query: DcqlQuery = {
      credentials: [
        {
          id: 'unknown',
          format: 'jwt_vc_json',
          meta: { type_values: ['VerifierSpecificCredential'] },
        },
      ],
    }

    expect(() => assertSupportedDcqlRequest(query)).toThrow(
      'PresentationRequestUnsupported: requested DCQL credential type is not supported',
    )
  })
})

describe('assertNoSetDcqlCardinality', () => {
  test('rejects two single-format credentials without credential_sets', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        { id: 'driving_licence', format: 'jwt_vc_json', meta: { type_values: ['DrivingLicenceCredential'] } },
      ],
    }

    expect(() => assertNoSetDcqlCardinality(query)).toThrow(
      'PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1',
    )
  })

  test('no-ops for exact dual-format pair', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'transcript_sd_jwt', format: 'dc+sd-jwt' },
        { id: 'transcript_mdoc', format: 'mso_mdoc' },
      ],
    }

    expect(() => assertNoSetDcqlCardinality(query)).not.toThrow()
  })

  test('rejects three credentials even when dual formats are present', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'transcript_sd_jwt', format: 'dc+sd-jwt' },
        { id: 'transcript_mdoc', format: 'mso_mdoc' },
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
      ],
    }

    expect(() => assertNoSetDcqlCardinality(query)).toThrow(
      'PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1',
    )
  })
})

describe('canWalletSatisfyDcqlCredentialQuery', () => {
  test('returns false when requested DCQL claim is missing on stored credential', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
      claims: [{ path: ['religion'] }],
    }

    expect(canWalletSatisfyDcqlCredentialQuery(thaiIdRecord, credential)).toBe(false)
  })

  test('returns true when claims omitted and type/format match', () => {
    const credential: DcqlCredentialQuery = {
      id: 'thai_id',
      format: 'jwt_vc_json',
      meta: { type_values: ['IDCardCredential'] },
    }

    expect(canWalletSatisfyDcqlCredentialQuery(thaiIdRecord, credential)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test --runInBand src/services/vp/dcqlCredentialMatch.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement `dcqlCredentialMatch.ts`**

```typescript
// src/services/vp/dcqlCredentialMatch.ts
import { getCardSchema } from '../../config/cardSchemas'
import { decodeJwtPayload, isRecord, readString } from '@/src/utils/jwtUtils'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isExactDualFormatPair } from './dualFormatPresentationMatch'
import type { DcqlCredentialQuery, DcqlQuery } from './presentationService'

const THAI_ID_TYPE = 'ThaiNationalID'
const TRANSCRIPT_TYPE = 'BangkokUniversityTranscript'
const DRIVING_LICENCE_TYPE = 'DLTDrivingLicence'

const SUPPORTED_DCQL_FORMATS = new Set(['jwt_vc_json', 'jwt_vc', 'dc+sd-jwt', 'vc+sd-jwt'])

export function readCredentialTypeFromDcqlTypeValue(value: string): string | undefined {
  const normalized = normalizeCredentialType(value)
  if (normalized.includes('idcard') || normalized.includes('nationalid')) return THAI_ID_TYPE
  if (normalized.includes('transcript')) return TRANSCRIPT_TYPE
  if (normalized.includes('drivinglicence') || normalized.includes('drivinglicense') || normalized.includes('dlt')) {
    return DRIVING_LICENCE_TYPE
  }
  return undefined
}

export function assertSupportedDcqlCredentialQuery(credential: DcqlCredentialQuery): void {
  if (!credential.format || credential.format.length === 0) {
    throw new Error('PresentationRequestInvalid: dcql credential format is required')
  }

  if (!SUPPORTED_DCQL_FORMATS.has(credential.format)) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential format is not supported')
  }

  for (const claim of credential.claims ?? []) {
    if (claim.path.length > 1) {
      throw new Error('PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1')
    }
  }

  const typeValues = credential.meta?.type_values ?? []
  const vctValues = credential.meta?.vct_values ?? []
  if (typeValues.length === 0 && vctValues.length === 0) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }

  if (typeValues.length > 0) {
    if (!typeValues.some((value) => readCredentialTypeFromDcqlTypeValue(value))) {
      throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
    }
    return
  }

  if (credential.format !== 'dc+sd-jwt' && credential.format !== 'vc+sd-jwt') {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }
}

export function assertSupportedDcqlRequest(query: DcqlQuery): void {
  if (isExactDualFormatPair(query)) return

  for (const credential of query.credentials) {
    assertSupportedDcqlCredentialQuery(credential)
  }
}

export function assertNoSetDcqlCardinality(query: DcqlQuery): void {
  if (isExactDualFormatPair(query)) return
  if (query.credentials.length > 1) {
    throw new Error('PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1')
  }
}

export function canWalletSatisfyDcqlCredentialQuery(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const typeValues = credential.meta?.type_values ?? []
  if (typeValues.length > 0) {
    const typeMatches = typeValues.some((value) => record.type === readCredentialTypeFromDcqlTypeValue(value))
    if (!typeMatches) return false
  }

  const vctValues = credential.meta?.vct_values ?? []
  if (vctValues.length > 0 && !isCredentialCompatibleWithDcqlMetadata(record, credential)) {
    return false
  }

  if (!isCredentialCompatibleWithDcqlFormat(record, credential.format)) {
    return false
  }

  const claims = credential.claims ?? []
  if (claims.length === 0) return true

  const schema = getCardSchema(record.type)
  const normalizedClaimKeys = new Map(Object.keys(record.claims).map((key) => [normalizeClaimKey(key), key]))

  return claims.every((claimQuery) => {
    const requestedKey = claimQuery.path[0]
    if (!requestedKey) return false

    const normalizedRequestedKey = normalizeClaimKey(requestedKey)
    const matchedKey = normalizedClaimKeys.get(normalizedRequestedKey)
    if (!matchedKey) return false

    const value = readClaimValueAsString(record.claims[matchedKey])
    if (value === undefined) return false

    const field = schema.displayFields.find(
      (displayField) =>
        normalizeClaimKey(displayField.key) === normalizedRequestedKey ||
        (displayField.aliases ?? []).some((alias) => normalizeClaimKey(alias) === normalizedRequestedKey),
    )

    return Boolean(field ?? matchedKey)
  })
}

export function isCredentialCompatibleWithDcqlFormat(
  record: VerifiableCredentialRecord,
  format: string | undefined,
): boolean {
  if (!format) return false
  if (format === 'jwt_vc_json' || format === 'jwt_vc') return isCompactJwtVc(record.rawVc)
  if (format === 'dc+sd-jwt' || format === 'vc+sd-jwt') return isCompactSdJwt(record.rawVc)
  return false
}

export function isCredentialCompatibleWithDcqlMetadata(
  record: VerifiableCredentialRecord,
  credential: DcqlCredentialQuery,
): boolean {
  const requestedVctValues = credential.meta?.vct_values ?? []
  if (requestedVctValues.length === 0) return true

  const credentialVct = readCredentialVct(record)
  return Boolean(credentialVct && requestedVctValues.includes(credentialVct))
}

function readCredentialVct(record: VerifiableCredentialRecord): string | undefined {
  const claimVct = readString(record.claims.vct)
  if (claimVct) return claimVct

  const issuerJwt = record.rawVc.split('~')[0] ?? record.rawVc
  return readString(decodeJwtPayload(issuerJwt)?.vct)
}

function isCompactJwtVc(rawVc: string): boolean {
  if (isCompactSdJwt(rawVc)) return false
  const payload = decodeJwtPayload(rawVc)
  return isRecord(payload?.vc)
}

function isCompactSdJwt(rawVc: string): boolean {
  return rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3
}

function readClaimValueAsString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function normalizeClaimKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeCredentialType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9]/g, '')
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test --runInBand src/services/vp/dcqlCredentialMatch.test.ts`  
Expected: PASS

---

### Task 3: `dcqlCredentialSetResolver` (parse + first-match selection)

**Files:**
- Create: `src/services/vp/dcqlCredentialSetResolver.ts`
- Create: `src/services/vp/dcqlCredentialSetResolver.test.ts`

- [ ] **Step 1: Write failing resolver tests**

```typescript
// src/services/vp/dcqlCredentialSetResolver.test.ts
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { resolveDcqlCredentialSelection } from './dcqlCredentialSetResolver'
import type { DcqlQuery } from './presentationService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'thai-id-1',
  type: 'ThaiNationalID',
  rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6eyJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiSWRDYXJkQ3JlZGVudGlhbCJdfX0.signature',
  claims: { id_number: '1234567890123' },
  issuedAt: '2026-06-01T10:00:00.000Z',
}

describe('resolveDcqlCredentialSelection', () => {
  test('picks first satisfiable OR option and filters credentials', () => {
    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        { id: 'driving_licence', format: 'jwt_vc_json', meta: { type_values: ['DrivingLicenceCredential'] } },
      ],
      credentialSets: [{ options: [['thai_id'], ['driving_licence']] }],
    }

    const effective = resolveDcqlCredentialSelection(query, [thaiIdRecord])

    expect(effective.credentials).toHaveLength(1)
    expect(effective.credentials[0]?.id).toBe('thai_id')
    expect(effective.credentialSets).toBeUndefined()
  })

  test('falls through to second option when first is missing from wallet', () => {
    const drivingRecord: VerifiableCredentialRecord = {
      id: 'driving-1',
      type: 'DLTDrivingLicence',
      rawVc: 'eyJhbGciOiJFUzI1NiJ9.eyJ2YyI6eyJ0eXBlIjpbIkRyaXZpbmdMaWNlbmNlQ3JlZGVudGlhbCJdfX0.signature',
      claims: { licence_number: 'DL-123' },
      issuedAt: '2026-06-01T10:00:00.000Z',
    }

    const query: DcqlQuery = {
      credentials: [
        { id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } },
        { id: 'driving_licence', format: 'jwt_vc_json', meta: { type_values: ['DrivingLicenceCredential'] } },
      ],
      credentialSets: [{ options: [['thai_id'], ['driving_licence']] }],
    }

    const effective = resolveDcqlCredentialSelection(query, [drivingRecord])

    expect(effective.credentials[0]?.id).toBe('driving_licence')
  })

  test('rejects unknown credential id before support pre-pass', () => {
    const query: DcqlQuery = {
      credentials: [{ id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      credentialSets: [{ options: [['missing_id']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [thaiIdRecord])).toThrow(
      'PresentationRequestInvalid: credential_sets option references unknown credential id',
    )
  })

  test('rejects required:false sets', () => {
    const query: DcqlQuery = {
      credentials: [{ id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      credentialSets: [{ required: false, options: [['thai_id']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [thaiIdRecord])).toThrow(
      'PresentationRequestUnsupported: optional credential_sets are not supported in v1',
    )
  })

  test('returns PresentationCredentialMissing when supported but no wallet record satisfies', () => {
    const query: DcqlQuery = {
      credentials: [{ id: 'thai_id', format: 'jwt_vc_json', meta: { type_values: ['IDCardCredential'] } }],
      credentialSets: [{ options: [['thai_id']] }],
    }

    expect(() => resolveDcqlCredentialSelection(query, [])).toThrow(
      'PresentationCredentialMissing: no credential satisfies the required credential set',
    )
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test --runInBand src/services/vp/dcqlCredentialSetResolver.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement resolver**

```typescript
// src/services/vp/dcqlCredentialSetResolver.ts
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  assertSupportedDcqlCredentialQuery,
  canWalletSatisfyDcqlCredentialQuery,
} from './dcqlCredentialMatch'
import type { DcqlCredentialSetQuery, DcqlQuery } from './presentationService'

export function parseDcqlCredentialSets(value: unknown): DcqlCredentialSetQuery[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined

  return value.map(readDcqlCredentialSetQuery).filter((set): set is DcqlCredentialSetQuery => Boolean(set))
}

function readDcqlCredentialSetQuery(value: unknown): DcqlCredentialSetQuery | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.options)) return undefined

  const options = record.options
    .map((option) => (Array.isArray(option) ? option.filter((id): id is string => typeof id === 'string') : []))
    .filter((option) => option.length > 0)

  if (options.length === 0) return undefined

  return {
    options,
    ...(typeof record.required === 'boolean' ? { required: record.required } : {}),
  }
}

export function resolveDcqlCredentialSelection(
  query: DcqlQuery,
  credentials: VerifiableCredentialRecord[],
): DcqlQuery {
  const sets = query.credentialSets
  if (!sets || sets.length === 0) return query

  assertSupportedCredentialSetsShape(sets)

  const credentialById = new Map(query.credentials.map((credential) => [credential.id, credential]))
  const referencedIds = [...new Set(sets[0]!.options.flat())]

  for (const id of referencedIds) {
    if (!credentialById.has(id)) {
      throw new Error('PresentationRequestInvalid: credential_sets option references unknown credential id')
    }
  }

  const supportedOptionIds = sets[0]!.options
    .filter((option) => option.length === 1)
    .map((option) => option[0]!)
    .filter((id) => {
      const credential = credentialById.get(id)
      if (!credential) return false
      try {
        assertSupportedDcqlCredentialQuery(credential)
        return true
      } catch {
        return false
      }
    })

  if (supportedOptionIds.length === 0) {
    throw new Error('PresentationRequestUnsupported: requested DCQL credential type is not supported')
  }

  const selectedId = supportedOptionIds.find((id) => {
    const credential = credentialById.get(id)
    if (!credential) return false
    return credentials.some((record) => canWalletSatisfyDcqlCredentialQuery(record, credential))
  })

  if (!selectedId) {
    throw new Error('PresentationCredentialMissing: no credential satisfies the required credential set')
  }

  return {
    credentials: query.credentials.filter((credential) => credential.id === selectedId),
    credentialSets: undefined,
  }
}

function assertSupportedCredentialSetsShape(sets: DcqlCredentialSetQuery[]): void {
  if (sets.length === 0) {
    throw new Error('PresentationRequestInvalid: credential_sets must be a non-empty array')
  }

  if (sets.length > 1) {
    throw new Error('PresentationRequestUnsupported: multiple credential_sets entries are not supported in v1')
  }

  const set = sets[0]!
  if (set.required === false) {
    throw new Error('PresentationRequestUnsupported: optional credential_sets are not supported in v1')
  }

  for (const option of set.options) {
    if (option.length === 0) {
      throw new Error('PresentationRequestInvalid: credential_sets option must not be empty')
    }
    if (option.length > 1) {
      throw new Error('PresentationRequestUnsupported: multi-credential credential_sets options are not supported in v1')
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test --runInBand src/services/vp/dcqlCredentialSetResolver.test.ts`  
Expected: PASS

---

### Task 4: Wire `presentationService.ts` (parse, reorder DCQL branch, import shared logic)

**Files:**
- Modify: `src/services/vp/presentationService.ts`

- [ ] **Step 1: Extend types and parse `credential_sets`**

Add to types section:

```typescript
export type DcqlCredentialSetQuery = {
  options: string[][]
  required?: boolean
}

export type DcqlQuery = {
  credentials: DcqlCredentialQuery[]
  credentialSets?: DcqlCredentialSetQuery[]
}
```

Update `readOptionalDcqlQuery`:

```typescript
import { parseDcqlCredentialSets, resolveDcqlCredentialSelection } from './dcqlCredentialSetResolver'
import {
  assertNoSetDcqlCardinality,
  assertSupportedDcqlRequest,
  canWalletSatisfyDcqlCredentialQuery,
  isCredentialCompatibleWithDcqlFormat,
  isCredentialCompatibleWithDcqlMetadata,
  readCredentialTypeFromDcqlTypeValue,
} from './dcqlCredentialMatch'

function readOptionalDcqlQuery(request: JsonRecord): DcqlQuery | undefined {
  if (!isRecord(request.dcql_query)) return undefined

  const credentials = Array.isArray(request.dcql_query.credentials)
    ? request.dcql_query.credentials
      .map(readDcqlCredentialQuery)
      .filter((query): query is DcqlCredentialQuery => Boolean(query))
    : []

  if (credentials.length === 0) {
    throw new Error('PresentationRequestInvalid: dcql_query.credentials is required')
  }

  const credentialSets = parseDcqlCredentialSets(request.dcql_query.credential_sets)

  return {
    credentials,
    ...(credentialSets ? { credentialSets } : {}),
  }
}
```

- [ ] **Step 2: Reorder DCQL branch in `resolvePresentationRequest`**

Replace the block from `if (dcqlQuery) { assertSupportedDcqlRequest(dcqlQuery) }` through credential matching with:

```typescript
let effectiveDcqlQuery = dcqlQuery

if (dcqlQuery) {
  if (dcqlQuery.credentialSets && dcqlQuery.credentialSets.length > 0) {
    effectiveDcqlQuery = resolveDcqlCredentialSelection(dcqlQuery, credentials)
    logWalletStep('oid4vp', 'dcql-credential-set-selected', {
      selectedCredentialQueryId: effectiveDcqlQuery.credentials[0]?.id,
    })
  } else {
    assertNoSetDcqlCardinality(dcqlQuery)
    effectiveDcqlQuery = dcqlQuery
  }

  assertSupportedDcqlRequest(effectiveDcqlQuery)
}

const requestedTypes = effectiveDcqlQuery
  ? readRequestedCredentialTypes(effectiveDcqlQuery)
  : [THAI_ID_TYPE]

const matchedCredential = credentials.find((record) => {
  if (presentationDefinition) {
    return (
      requestedTypes.includes(record.type) &&
      hasRequiredClaimForRequest(record, { presentationDefinition, dcqlQuery: effectiveDcqlQuery })
    )
  }

  if (!effectiveDcqlQuery) return false

  if (isDualFormatDcqlRequest(effectiveDcqlQuery)) {
    return isSdJwtSideCompatibleWithDualFormatRequest(record, effectiveDcqlQuery)
  }

  return effectiveDcqlQuery.credentials.every((credential) =>
    canWalletSatisfyDcqlCredentialQuery(record, credential),
  )
})
```

Update error-path candidate filtering to use `effectiveDcqlQuery` and `canWalletSatisfyDcqlCredentialQuery` / `isCredentialCompatibleWithDcqlFormat` instead of the removed private helpers for DCQL paths.

Update downstream references:
- `if (dcqlQuery && isDualFormatDcqlRequest(dcqlQuery))` → use `effectiveDcqlQuery`
- `readDcqlClaimDisclosures(matchedCredential, dcqlQuery)` → `effectiveDcqlQuery`
- `ResolvedPresentationRequest.dcqlQuery` → store `effectiveDcqlQuery`

- [ ] **Step 3: Remove duplicated private DCQL helpers from `presentationService.ts`**

Delete (now in `dcqlCredentialMatch.ts`):
- `assertSupportedDcqlRequest` (private)
- `readCredentialTypeFromDcqlValue` → use imported `readCredentialTypeFromDcqlTypeValue` in `readRequestedCredentialTypes`
- `isCredentialCompatibleWithDcqlFormat`
- `isCredentialCompatibleWithDcqlMetadata`

Update `readRequestedCredentialTypes` to map **only** `meta.type_values` through `readCredentialTypeFromDcqlTypeValue` (not `vct_values`).

Keep `hasRequiredClaimForRequest` for Presentation Exchange only.

- [ ] **Step 4: Run typecheck + existing tests**

Run: `yarn tsc --noEmit`  
Run: `yarn test --runInBand src/services/vp/presentationService.test.ts src/services/vp/presentationApproval.test.ts src/services/vp/dualFormatPresentationMatch.test.ts`  
Expected: PASS (no regressions on dual-format / existing DCQL tests)

---

### Task 5: Integration tests + `docs/TASKS.md`

**Files:**
- Modify: `src/services/vp/presentationService.test.ts`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Add `credential_sets` OR integration test**

```typescript
test('resolves DCQL credential_sets OR when wallet holds only the second alternative', async () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new Response(
        unsignedRequestJwt({
          response_type: 'vp_token',
          client_id: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
          response_mode: 'direct_post',
          state: 'request-123',
          nonce: 'request-123',
          response_uri: 'http://192.100.10.48/openid4vc/verify/request-123',
          dcql_query: {
            credentials: [
              {
                id: 'thai_id',
                format: 'jwt_vc_json',
                meta: { type_values: ['IDCardCredential'] },
              },
              {
                id: 'driving_licence',
                format: 'jwt_vc_json',
                meta: { type_values: ['DrivingLicenceCredential'] },
              },
            ],
            credential_sets: [{ options: [['thai_id'], ['driving_licence']] }],
          },
        }),
        { status: 200 },
      ),
  )

  const request = await resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
    fetchImpl: fetchMock as unknown as typeof fetch,
    trustedVerifiers: [/* existing verifier fixture */],
  })

  expect(request.dcqlQuery?.credentials).toHaveLength(1)
  expect(request.dcqlQuery?.credentials[0]?.id).toBe('thai_id')
  expect(request.matchedCredential.id).toBe('thai-id-1')
})
```

- [ ] **Step 2: Add no-set DCQL tightening test**

```typescript
test('rejects no-set DCQL request when explicit claims are missing on stored credential', async () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new Response(
        unsignedRequestJwt({
          // ... standard trusted verifier fields ...
          dcql_query: {
            credentials: [
              {
                id: 'idcard_credential',
                format: 'jwt_vc_json',
                meta: { type_values: ['IDCardCredential'] },
                claims: [{ path: ['religion'] }],
              },
            ],
          },
        }),
        { status: 200 },
      ),
  )

  await expect(
    resolvePresentationRequest(verifierRequestUri(), [thaiIdRecord], {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [/* existing verifier fixture */],
    }),
  ).rejects.toThrow('PresentationCredentialMissing')
})
```

- [ ] **Step 3: Run full focused VP suite**

Run: `yarn test --runInBand src/services/vp/dcqlCredentialMatch.test.ts src/services/vp/dcqlCredentialSetResolver.test.ts src/services/vp/dualFormatPresentationMatch.test.ts src/services/vp/presentationService.test.ts src/services/vp/presentationApproval.test.ts`  
Expected: PASS

Run: `yarn tsc --noEmit`  
Expected: PASS

Run: `yarn lint`  
Expected: PASS or only pre-existing warnings

- [ ] **Step 4: Update `docs/TASKS.md`**

Change:
```markdown
[ ] DCQL `credential_sets` grouping — ...
```
to:
```markdown
[x] DCQL `credential_sets` grouping — `dcqlCredentialSetResolver.ts` + `dcqlCredentialMatch.ts`; single-credential OR v1; first satisfiable option; unified DCQL claim validation; exact dual-format short-circuit unchanged.
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Parse `credential_sets` | Task 4 (`readOptionalDcqlQuery`) |
| `isExactDualFormatPair` short-circuit | Task 1 + Task 2 (`assertSupportedDcqlRequest`, `assertNoSetDcqlCardinality`) |
| `assertSupportedDcqlCredentialQuery` (format, meta, claim path) | Task 2 |
| `canWalletSatisfyDcqlCredentialQuery` unified satisfiability | Task 2 + Task 4 matching |
| `resolveDcqlCredentialSelection` algorithm (ID → support → satisfiability) | Task 3 |
| No-set cardinality guard (exact dual-format only) | Task 2 |
| Error mapping table | Tasks 2–3 throw messages match spec |
| Dual-format path unchanged | Task 1 short-circuit + Task 4 keeps `isDualFormatDcqlRequest` routing |
| Tests per spec §Testing | Tasks 1–5 |
| `docs/TASKS.md` update | Task 5 |

No placeholder steps remain.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-oid4vp-dcql-credential-sets.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
