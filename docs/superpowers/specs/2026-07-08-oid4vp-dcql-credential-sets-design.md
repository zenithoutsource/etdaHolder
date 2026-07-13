# OID4VP DCQL `credential_sets` (v1 — Single-Credential OR)

**Date:** 2026-07-08  
**Status:** Approved for implementation planning  
**Related:** `docs/TASKS.md` (OID4VP remaining), `docs/SPEC_COMPLIANCE_OID4VC.md`, `src/services/vp/presentationService.ts`, OID4VP 1.0 DCQL §6.1 / §6.4.2, `docs/oid 1.0/VP/examples/query_lang/credentials_alternatives.json`

## Summary

Parse and apply DCQL `credential_sets` so the wallet can satisfy Verifier requests that mean **“present one of these credentials”** instead of treating every entry in `dcql_query.credentials` as mandatory. v1 keeps the existing **single-`matchedCredential`** architecture: auto-select the first satisfiable single-ID option, filter the effective DCQL query to that credential, then run the current match / consent / sign / `direct_post` path unchanged.

This slice also **unifies DCQL satisfiability** for all requests (with or without `credential_sets`) via one shared predicate, so claim-presence rules are not weaker on no-set requests.

## Goals

1. **Spec compliance** — Stop ignoring `credential_sets`; implement OID4VP §6.4.2 selection for the narrow OR slice.
2. **the customer journeys** — Support realistic requests such as ThaiNationalID **or** Driving Licence without requiring both.
3. **Minimal diff** — No `matchedCredentials[]`, no multi-key `vp_token` refactor, no new consent UI in v1.
4. **Consistent DCQL semantics** — One `canWalletSatisfyDcqlCredentialQuery()` used for credential-set selection **and** final matching on `effectiveDcqlQuery` (including when `credential_sets` is absent).

## Non-goals (v1)

- Multi-credential options (one `options` entry listing **two or more** credential query IDs to present together).
- Multiple `credential_sets` entries (only **one** top-level entry supported).
- Optional sets (`required: false`) — **rejected** until the wallet can represent “present nothing for this set” without breaking single-credential flow (see §Product decisions).
- End-User choice UI when multiple options are satisfiable (auto-pick first; see §UI).
- `claim_sets` inside credential queries (separate future work).
- **Nested DCQL claim paths** (`path` with more than one segment, e.g. `["address", "street_address"]`) — rejected in v1; no partial first-segment matching.
- **Omitted `format`** on credential queries — rejected in v1 for non-dual-format queries; keeps `readPresentationTokenMode()` unambiguous. **Dual-format `mso_mdoc` queries are exempt** — see §Dual-format short-circuit.
- Changes to dual-format pairing semantics — **entirely out of scope**. Exact dual-format pairs are detected and short-circuited **before** any new v1 rule (`format` required, meta guard, claim-path guard, cardinality guard) runs, so this slice cannot tighten or loosen the existing dual-format contract or its tests.

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Absent `credential_sets` | `effectiveDcqlQuery = dcqlQuery`. **Single-credential constraint:** MUST contain exactly **one** credential query entry, **unless** the query is an intentional **exact dual-format pair** (`isExactDualFormatPair` — exactly two format queries, one SD-JWT-family and one `mso_mdoc`, satisfied by one logical credential). Multiple distinct credential IDs without `credential_sets` that are not an exact dual-format pair → **`PresentationRequestUnsupported`** (wallet presents one `matchedCredential`, not OID4VP “present all entries” semantics). |
| Present `credential_sets` | Apply selection **before** matching; downstream code sees a filtered `DcqlQuery` with one selected credential query. |
| Supported shape | **One** `credential_sets` array entry only. |
| Required set | `required` omitted or `true` — must be satisfiable or resolution fails. |
| Optional set | `required: false` — **`PresentationRequestUnsupported`** in v1. |
| Option size | Each option MUST contain **exactly one** credential query ID. |
| Selection policy | **First satisfiable option** in array order (deterministic auto-pick). |
| Type / claim validation timing | Run **`assertSupportedDcqlRequest()` on the effective (post-selection) query only** — unselected alternatives MUST NOT cause failure. |
| DCQL claim validation | **Unified** — `canWalletSatisfyDcqlCredentialQuery()` replaces DCQL use of `hasRequiredClaimForRequest()` + `isCredentialCompatibleWithRequest()` for non-dual-format paths on `effectiveDcqlQuery`. |
| `type_values` vs `vct_values` | **Separate rules** — `type_values` use local wallet-type mapping; `vct_values` require **exact** signed SD-JWT `vct` match (no alias mapping on vct strings). |
| `format` | **Required** on every `DcqlCredentialQuery` in v1, **except inside an exact dual-format pair** (see below). Omitted `format` on a non-dual-format query → `PresentationRequestInvalid: dcql credential format is required`. Avoids ambiguous `readPresentationTokenMode()` / SD-JWT vs JWT-VC wrapping when format is absent (`presentationService.ts:271-291`). |
| DCQL claim `path` | **Single-segment only** in v1 (`path.length === 1`), **except inside an exact dual-format pair**. Multi-segment paths on non-dual-format queries → `PresentationRequestUnsupported`. |
| Output cardinality | Exactly **one** credential query ID selected when `credential_sets` present → one `matchedCredential` → one `vp_token` key. |
| Dual-format short-circuit | An **exact dual-format pair** is `query.credentials.length === 2` AND one credential's format is `dc+sd-jwt`/`vc+sd-jwt` and the other's is `mso_mdoc` (order-independent; `mso_mdoc` credential MAY omit `meta` entirely). When true, **skip** `assertSupportedDcqlCredentialQuery` per-credential checks (format-required, meta guard, claim-path guard) and the no-set cardinality guard entirely — hand off directly to the existing `isDualFormatDcqlRequest` / `assertDualFormatPresentationReady` path, unchanged from today. This is a **narrower** test than `isDualFormatDcqlRequest` (which only checks format membership, not exact pairing), used specifically to gate the short-circuit so a 3-entry query cannot slip through as "dual-format" and bypass the no-set multi-credential guard. |
| Logging | `logWalletStep` with selected credential query id(s) and set index only; no claim values or tokens. |

## Background: current vs desired behavior

**Today (no `credential_sets`):** `readOptionalDcqlQuery()` parses `credentials` only. `resolvePresentationRequest()` finds **one** wallet record that satisfies every credential query in the array (dual-format: two format queries, one logical credential). This is **not** full OID4VP “present all credentials” semantics for multiple distinct types — that requires `credential_sets` or a future multi-credential architecture.

**OID4VP §6.4.2 (with `credential_sets`):** Verifier requests satisfaction of required credential sets by picking **one** `options` entry per set. Credentials not selected MUST NOT be returned.

**v1 slice:** One required set, single-ID options, first match wins. Unselected branches are ignored for support and satisfiability checks. **Exact dual-format pairs never enter `credential_sets` selection or the new support/cardinality rules** — they are detected up front and routed to the existing dual-format path unchanged.

### Example (the customer-relevant)

```json
{
  "credentials": [
    { "id": "thai_id", "format": "jwt_vc_json", "meta": { "type_values": ["IDCardCredential"] } },
    { "id": "driving_licence", "format": "jwt_vc_json", "meta": { "type_values": ["DrivingLicenceCredential"] } }
  ],
  "credential_sets": [
    {
      "options": [
        ["thai_id"],
        ["driving_licence"]
      ]
    }
  ]
}
```

Wallet holds ThaiNationalID only → selects `thai_id`, effective query contains one credential entry, existing DCQL path runs. Request does **not** fail because `driving_licence` is unsupported or missing.

## Architecture

### New module: `src/services/vp/dcqlCredentialMatch.ts`

Extract shared DCQL per-credential matching logic from `presentationService.ts` so the resolver and main flow share one implementation.

**Exports (required):**

| Function | Purpose |
|----------|---------|
| `readCredentialTypeFromDcqlTypeValue(value: string): string \| undefined` | Map **`meta.type_values` entry only** → wallet credential type (`IDCardCredential` → `ThaiNationalID`, etc.). Move from private `readCredentialTypeFromDcqlValue`; **do not** call this on `vct_values`. |
| `assertSupportedDcqlCredentialQuery(credential: DcqlCredentialQuery): void` | Request-shape support check (see below). **Callers MUST NOT invoke this on a credential that is part of an exact dual-format pair** — see `isExactDualFormatPair`. |
| `assertSupportedDcqlRequest(query: DcqlQuery): void` | If `isExactDualFormatPair(query)` → **no-op**, returns immediately. Otherwise every credential in query must pass `assertSupportedDcqlCredentialQuery` (used on **effective** query). Does **not** enforce no-set cardinality — see pre-selection guard below. |
| `canWalletSatisfyDcqlCredentialQuery(record, credential: DcqlCredentialQuery): boolean` | **Authoritative satisfiability predicate** for credential-set selection **and** final DCQL matching (non-dual-format). Not used for dual-format matching — that keeps its existing `isSdJwtSideCompatibleWithDualFormatRequest` check. |
| `isCredentialCompatibleWithDcqlFormat(...)` | Move from `presentationService.ts` (private). |
| `isCredentialCompatibleWithDcqlMetadata(...)` | Move from `presentationService.ts` — **exact `vct_values` match** against stored credential `vct`. |
| `assertNoSetDcqlCardinality(query: DcqlQuery): void` | Pre-selection no-set multi-credential guard (export for tests). If `isExactDualFormatPair(query)` → no-op. |

### Modified: `src/services/vp/dualFormatPresentationMatch.ts`

**Only** change: add the `isExactDualFormatPair` export described below, implemented via `readRequestedDcqlFormats(query)` plus a `query.credentials.length === 2` check. No existing export (`isDualFormatDcqlRequest`, `isSdJwtSideCompatibleWithDualFormatRequest`, `readRequestedDcqlFormats`) changes behavior or signature.

**Imported (not redefined):** `isExactDualFormatPair(query: DcqlQuery): boolean` — new export added to `src/services/vp/dualFormatPresentationMatch.ts` (co-located with `isDualFormatDcqlRequest` and `readRequestedDcqlFormats`, which it reuses). Stricter than `isDualFormatDcqlRequest`: requires `query.credentials.length === 2` **and** the two entries' formats are exactly one of `dc+sd-jwt`/`vc+sd-jwt` and one `mso_mdoc` (no third entry, no duplicate formats). `dcqlCredentialMatch.ts` and `dcqlCredentialSetResolver.ts` import this from `dualFormatPresentationMatch.ts` rather than duplicating pairing logic.

#### `assertSupportedDcqlCredentialQuery` (request-only, no wallet record)

**Never called on a credential belonging to an exact dual-format pair** (`isExactDualFormatPair(query)` — checked by the caller first; see `assertSupportedDcqlRequest` short-circuit and the resolver's support pre-pass, which also excludes exact dual-format pairs since they cannot reach `credential_sets` selection — see Non-goals). `mso_mdoc` therefore never needs to appear in the format allow-list below, and its `meta`-optional test shape (`dualFormatPresentationMatch.test.ts:21`, `presentationApproval.test.ts:179`) never reaches this function.

Run **before** wallet satisfiability, on non-dual-format credential queries only. Checks credential query shape:

- **`format` required:** if `credential.format` is missing or empty → `PresentationRequestInvalid: dcql credential format is required`.
- **`format` value:** MUST be a wallet-handled DCQL format (`jwt_vc_json`, `jwt_vc`, `dc+sd-jwt`, `vc+sd-jwt`); otherwise → `PresentationRequestUnsupported: requested DCQL credential format is not supported`. (`mso_mdoc` is intentionally **not** in this list — it is only ever valid inside an exact dual-format pair, which bypasses this function entirely.)
- **Claims path guard:** if any `claims[].path` has `length > 1` → `PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1`.
- **Meta guard:** at least one of `meta.type_values` or `meta.vct_values` MUST be non-empty.
- If `meta.type_values` is non-empty: at least one entry MUST map via `readCredentialTypeFromDcqlTypeValue`.
- If only `meta.vct_values` is non-empty: supported when `format` is `dc+sd-jwt` or `vc+sd-jwt` (vct exact match deferred to satisfiability).
- Otherwise → `PresentationRequestUnsupported: requested DCQL credential type is not supported`.

#### `assertSupportedDcqlRequest` (effective query)

- **First:** if `isExactDualFormatPair(query)` → return immediately (no-op). The existing dual-format path validates its own shape downstream exactly as it does today; this slice adds no new checks to it.
- Otherwise: every credential in the effective query MUST pass `assertSupportedDcqlCredentialQuery`.
- Does **not** inspect whether `credential_sets` was originally present (cleared after selection).

#### `assertNoSetDcqlCardinality(query: DcqlQuery): void` (pre-selection guard)

Called in `resolvePresentationRequest()` **only when `credentialSets` is absent**, **before** producing `effectiveDcqlQuery`:

- **First:** if `isExactDualFormatPair(query)` → return immediately (no-op) — this is the **only** dual-format exemption, replacing the previous broader `isDualFormatDcqlRequest(query)` check. A 3-entry query containing both `dc+sd-jwt` and `mso_mdoc` formats plus a third credential is **not** an exact pair (`credentials.length !== 2`), so it falls through to the next rule and is rejected.
- Otherwise: if `query.credentials.length > 1` → `PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1`.

#### `canWalletSatisfyDcqlCredentialQuery` (wallet record required)

Checks **in order**:

1. **`meta.type_values`** (if non-empty): `record.type` MUST equal `readCredentialTypeFromDcqlTypeValue(tv)` for at least one `tv`. Do **not** derive type from `vct_values`.
2. **`meta.vct_values`** (if non-empty): `isCredentialCompatibleWithDcqlMetadata(record, credential)` MUST pass — stored signed `vct` must be included in `vct_values` exactly (`presentationService.ts:738-746` behavior).
3. **Format** — `isCredentialCompatibleWithDcqlFormat(record, credential.format)` (`format` is always present after assert).
4. **DCQL claims** — only when every `claims[].path` has exactly **one** segment (enforced earlier in `assertSupportedDcqlCredentialQuery`). If `credential.claims` is non-empty, **every** claim query must resolve to a non-empty top-level stored claim value (segment + alias normalization, same rules as `readDcqlClaimDisclosures` today). If any requested claim is missing → not satisfiable. If `claims` omitted/empty → skip claim check (generic credential disclosure allowed).

Do **not** use `hasRequiredClaimForRequest()` for DCQL paths after this slice.

### New module: `src/services/vp/dcqlCredentialSetResolver.ts`

Responsibilities:

- `parseDcqlCredentialSets(value: unknown): DcqlCredentialSetQuery[] | undefined`
- `resolveDcqlCredentialSelection(query: DcqlQuery, credentials: VerifiableCredentialRecord[]): DcqlQuery`
  - Shape validation → **support pre-pass** → satisfiability selection → filtered output.
  - Uses `canWalletSatisfyDcqlCredentialQuery` and `assertSupportedDcqlCredentialQuery` from `dcqlCredentialMatch.ts`.
  - **No dual-format interaction:** because every `credential_sets` option MUST reference exactly one credential id (Non-goals — multi-credential options rejected), no option can ever resolve to an exact dual-format pair. The support pre-pass therefore always calls `assertSupportedDcqlCredentialQuery` on genuinely single-format candidates; `isExactDualFormatPair` is not consulted here.

**Selection algorithm (explicit):**

1. `assertSupportedCredentialSetsShape(sets)`.
2. Reject `required: false`, multiple entries, multi-id options (see error table).
3. **ID resolution:** For every credential query ID referenced in any `options` entry, resolve to `DcqlCredentialQuery` in `query.credentials`. If any ID is unknown → `PresentationRequestInvalid: credential_sets option references unknown credential id` (before support or satisfiability passes).
4. **Support pre-pass:** Among resolved option credential queries, at least one MUST pass `assertSupportedDcqlCredentialQuery`. If **none** → `PresentationRequestUnsupported: requested DCQL credential type is not supported`.
5. **Satisfiability pass:** Among supported options, pick the first ID where `canWalletSatisfyDcqlCredentialQuery` succeeds for some wallet record.
6. If step 4 passed but step 5 found no match → `PresentationCredentialMissing: no credential satisfies the required credential set`.
7. Return `DcqlQuery` with `credentials` filtered to the selected ID; clear `credentialSets`.

### Modified: `src/services/vp/presentationService.ts`

Extend types:

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

**Reordered DCQL branch inside `resolvePresentationRequest()`:**

1. Parse `credential_sets` in `readOptionalDcqlQuery()`.
2. If `credentialSets` present → `resolveDcqlCredentialSelection(dcqlQuery, credentials)` → `effectiveDcqlQuery`.
3. Else → `assertNoSetDcqlCardinality(dcqlQuery)` then `effectiveDcqlQuery = dcqlQuery`.
4. **`assertSupportedDcqlRequest(effectiveDcqlQuery)`** — effective query only; no-ops on an exact dual-format pair (format required, meta/type/vct rules apply to everything else).
5. **Matching on `effectiveDcqlQuery`:**
   - If `isDualFormatDcqlRequest(effectiveDcqlQuery)` → existing dual-format path (unchanged — same broader format-membership check used today, kept as-is for this final routing decision since step 4 already ran the stricter exact-pair short-circuit).
   - Else → find `record` where `effectiveDcqlQuery.credentials.every((cq) => canWalletSatisfyDcqlCredentialQuery(record, cq))`.
6. Disclosures, `ResolvedPresentationRequest.dcqlQuery` (= `effectiveDcqlQuery`), `formatVpTokenForResponse` — unchanged aside from stricter match in step 5.

**Behavior change (intentional):** No-set DCQL requests with explicit `claims` that the stored credential cannot satisfy will now fail at match time (or credential-set selection) instead of falling back to generic credential disclosure.

## Error mapping

| Condition | Error |
|-----------|-------|
| `credential_sets` present but empty | `PresentationRequestInvalid: credential_sets must be a non-empty array` |
| More than one `credential_sets` entry | `PresentationRequestUnsupported: multiple credential_sets entries are not supported in v1` |
| `required: false` on the sole entry | `PresentationRequestUnsupported: optional credential_sets are not supported in v1` |
| Option references unknown credential id | `PresentationRequestInvalid: credential_sets option references unknown credential id` |
| Omitted `format` on credential query | `PresentationRequestInvalid: dcql credential format is required` |
| Unsupported `format` value | `PresentationRequestUnsupported: requested DCQL credential format is not supported` |
| Option has zero ids | `PresentationRequestInvalid: credential_sets option must not be empty` |
| Option has more than one id | `PresentationRequestUnsupported: multi-credential credential_sets options are not supported in v1` |
| Nested DCQL claim path (`path.length > 1`) | `PresentationRequestUnsupported: nested DCQL claim paths are not supported in v1` |
| No-set DCQL with multiple credential queries, **not** an exact dual-format pair (incl. a 3-entry query containing both `dc+sd-jwt` and `mso_mdoc` plus another credential) | `PresentationRequestUnsupported: multi-credential DCQL requests require credential_sets in v1` (via `assertNoSetDcqlCardinality` before selection) |
| **No option references a supported credential query** (support pre-pass) | `PresentationRequestUnsupported: requested DCQL credential type is not supported` |
| Supported options exist but none satisfiable by wallet | `PresentationCredentialMissing: no credential satisfies the required credential set` |
| No-set DCQL: effective query unsupported (post-selection assert) | `PresentationRequestUnsupported: requested DCQL credential type is not supported` |
| No-set DCQL: supported but no record satisfies all queries | Existing `PresentationCredentialMissing` / format / metadata errors |

## User interface (v1)

OID4VP §6.4.2 notes that wallets **should** let End-Users choose among satisfiable options. v1 **auto-picks the first** satisfiable option for deterministic, hardware-free behavior. Document as accepted deviation until a follow-up spec adds consent UI for multi-option choice.

## Testing

### `dcqlCredentialMatch.test.ts`

- `canWalletSatisfyDcqlCredentialQuery` returns false when requested DCQL `claims` are absent on the stored credential.
- Returns true when claims omitted and type/format/metadata match.
- **Rejects nested claim paths** via `assertSupportedDcqlCredentialQuery` before satisfiability runs.
- **`vct_values`:** exact `vct` match required; alias/substring in vct URL does not satisfy without exact include.
- **`type_values`:** local type mapping only (e.g. `IDCardCredential` → `ThaiNationalID`).
- **Omitted `format`:** `PresentationRequestInvalid: dcql credential format is required`.
- `assertSupportedDcqlRequest` fails only for credentials in the passed query (not unlisted alternatives).
- **`assertNoSetDcqlCardinality`:** two credential IDs without `credential_sets` (non-dual-format) → `PresentationRequestUnsupported`.
- **`assertNoSetDcqlCardinality` dual-format exemption is exact-pair only:** two credentials (`dc+sd-jwt` + `mso_mdoc`) → no-op (existing behavior preserved); **three** credentials including that same `dc+sd-jwt` + `mso_mdoc` pair plus a third entry → `PresentationRequestUnsupported` (regression test for the reviewed gap).
- **`assertSupportedDcqlRequest` dual-format short-circuit:** exact pair where the `mso_mdoc` entry omits `meta` and the `dc+sd-jwt` entry has no `format`-adjacent issue → no-op, no `PresentationRequestInvalid`/`PresentationRequestUnsupported` thrown (mirrors `dualFormatPresentationMatch.test.ts:21` and `presentationApproval.test.ts:179` shapes).

### `dualFormatPresentationMatch.test.ts` (extended, existing file)

- **`isExactDualFormatPair`:** true for exactly `[dc+sd-jwt, mso_mdoc]` or `[mso_mdoc, dc+sd-jwt]`; false for `[dc+sd-jwt, mso_mdoc, jwt_vc_json]` (three entries) and false for `[dc+sd-jwt, dc+sd-jwt]` (duplicate formats).
- All existing tests in this file (`isDualFormatDcqlRequest`, `isSdJwtSideCompatibleWithDualFormatRequest`, `readRequestedDcqlFormats`) are untouched — this slice only adds the new export.

### `dcqlCredentialSetResolver.test.ts`

- Parses valid `credential_sets` shape.
- Rejects empty array, unknown ids (**before** support pre-pass), multi-id options, multiple top-level entries, `required: false`, omitted `format`.
- Picks first satisfiable option when wallet holds first alternative.
- Falls through to second option when first is missing or missing required claims.
- **All options unsupported types** → `PresentationRequestUnsupported` (not `PresentationCredentialMissing`).
- **Supported type but no wallet record** → `PresentationCredentialMissing`.
- Filters output `credentials` to selected id only.
- **OR with unsupported alternative:** wallet holds ThaiNationalID; query ORs `thai_id` with unsupported verifier-specific type → succeeds via `thai_id`.

### `presentationService.test.ts`

- Resolves DCQL `credential_sets` OR between ThaiNationalID and Driving Licence when wallet holds ThaiNationalID only.
- **No-set DCQL regression:** existing claim-path tests still pass when claims are present on the credential.
- **No-set DCQL tightening:** request with explicit `claims` missing on stored credential → `PresentationCredentialMissing` (or no match), not generic credential-fallback disclosure.
- No `credential_sets` multi-credential-required behavior unchanged for dual-format tests.

## Documentation

- Update `docs/TASKS.md` OID4VP checkbox when implemented.
- No new env vars required.

## Verification (Definition of Done)

- `yarn tsc --noEmit` passes.
- `yarn test --runInBand` focused VP suites pass (`dcqlCredentialMatch.test.ts`, `dualFormatPresentationMatch.test.ts`, `dcqlCredentialSetResolver.test.ts`, `presentationService.test.ts`, `presentationApproval.test.ts`).
- `yarn lint` passes or only pre-existing warnings.

## Future work (explicit deferrals)

| Item | Trigger |
|------|---------|
| Multi-credential options (`["a","b"]` in one option) | Verifier + journey require combined presentation |
| Multiple required sets | Verifier sends >1 required set |
| Optional sets (`required: false`) | Wallet can represent zero-credential presentation or multi-credential architecture exists |
| End-User option picker | Product / UX spec for multi-option consent |
| Nested DCQL claim path traversal | Wallet implements claims path pointer evaluator per OID4VP §7 |
| True multi-credential no-set / multi-`matchedCredential` presentation | Verifier requires presenting multiple distinct credentials without `credential_sets` OR |
| Omitted `format` + token-mode inference from `rawVc` | Verifier requires formatless DCQL queries; needs `readPresentationTokenMode` changes |
