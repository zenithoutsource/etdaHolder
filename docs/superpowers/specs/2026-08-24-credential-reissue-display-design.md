# Credential reissue — Home display and superseded old document

Status: Draft (awaiting review)  
Date: 2026-08-24

## Relationship To Prior Specs

| Document | Relationship |
|---|---|
| [2026-08-24 first-party vs third-party mDL identity](2026-08-24-first-party-third-party-mdl-identity-design.md) | Reissue **family** rules (issuer + document family). This spec applies those rules to **Home picker**, **post-claim finalize**, and **“ดูเอกสาร (เอกสารเดิม)”** for Scan/Deeplink reissue without P3 intake. |
| [2026-06-25 P3 wallet key renewal](2026-06-25-p3-wallet-key-renewal-design.md) | P3 `cleanup-pending` + explicit Holder delete unchanged. This spec **extends** the same Home UX pattern to plain Scan reissue when an active old VC coexists with a newer same-family VC. |
| P1–P6 canvases | Unchanged journey outcomes. Scan (A) and Deeplink (D) both route through `CredentialOfferClaimScreen`. |

## 1. Problem

Holder receives a new credential via **Scan QR** or **Deeplink offer** while an older credential of the same document family already exists.

Observed:

- `credentialCount` in logs (e.g. 8) exceeds visible Home rows (e.g. 6) — expected when multiple records share one catalog slot or unregistered group.
- The **new** record is saved to MMKV but Home still shows the **old** record as the main row.

Root cause:

1. Scan and Deeplink save through `saveScannedCredential` → `saveCredentialRecord`.
2. `pairRenewalReplacementForSavedCredential` runs only when an old record has P3 `renewal-required` intake — not for a plain Scan reissue.
3. `isReplaceableCredentialId` auto-removes old records only when Holder DID matches (or old is withdrawn). Per-credential hardware `k_cred` (ADR 0011) issues a **new** Holder DID → no silent replace.
4. `pickPreferredHomeCredential` picks the first “normal active” match in index order → **older** record wins when both lack renewal metadata.

## 2. Goals

1. After a successful claim, Home’s **main row** for a catalog type (or unregistered group) shows the **preferred newest** credential in the same reissue family.
2. An **active** superseded old credential stays in MMKV until the Holder deletes it — not silent auto-delete.
3. Home offers **“ดูเอกสาร (เอกสารเดิม)”** on the catalog row when a superseded active sibling exists — same pattern as P3 cleanup-pending (Holder choice **A**).
4. A **calendar-expired** same-family sibling is removed on successful new claim (existing product intent; family-aware matching).
5. Third-party vs first-party documents never merge or supersede each other.

## 3. Reissue family (shared rules)

Implement `areSameReissueFamily(a, b)` in `src/services/credentials/credentialReissueFamily.ts` (or extend the mDL identity slice if landed first). Rules match [2026-08-24 first-party vs third-party mDL identity](2026-08-24-first-party-third-party-mdl-identity-design.md) section 3:

1. Both resolve to the same first-party type **and** both have first-party issuer origin → same family.
2. Neither is first-party **and** they share the same unregistered group key (`readUnregisteredDocumentGroupKey`) **and** the same issuer hostname.
3. First-party DLT and third-party `org.iso.18013.5.1.mDL` are **never** the same family.

All matching in this spec uses **family**, not `credential.type` alone.

## 4. Home display — `pickPreferredHomeCredential`

File: [`src/services/credentials/credentialGuard.ts`](../../../src/services/credentials/credentialGuard.ts)

When multiple candidates remain after existing filters (non-withdrawn, not `old-revoked`, prefer non-expired, hardware-ready, renewal-state ordering):

| Priority (unchanged first) | Rule |
|---|---|
| 1 | `renewed-active` |
| 2 | Normal active mDOC (`renewal` undefined, `rawVc` mdoc) |
| 3 | Normal active (renewal undefined) — **tie-break: highest `issuedAt`** |
| 4 | `renewal-required` / `renewal-processing` |
| 5 | `cleanup-pending` |
| 6 | Fallback first in ranked set |

Apply family grouping **before** picking: catalog Home passes only same-catalog matches today; unregistered list already groups by unregistered key. The `issuedAt` tie-break fixes plain Scan reissue when old and new are both “normal active” with different `k_cred` DIDs.

Callers unchanged: [`app/(tabs)/index.tsx`](../../../app/(tabs)/index.tsx), [`unregisteredHomeDocuments.ts`](../../../src/services/credentials/unregisteredHomeDocuments.ts).

## 5. Superseded old document on Home (option A)

### 5.1 When to show “ดูเอกสาร (เอกสารเดิม)”

Extend [`renewalCleanupNotification.ts`](../../../src/services/credentials/renewalCleanupNotification.ts) (or add `credentialSupersededSibling.ts`) with:

```ts
findSupersededOldCredentialForDisplay({
  preferredCredential,      // current Home pick for catalog type or unregistered row
  credentials,
  renewalStatuses,
}): { oldCredentialId: string } | undefined
```

Return an old sibling when:

1. **P3 path (existing):** `findCleanupPendingForCredentialType` / `isRenewalAwaitingHolderCleanup` — keep current behavior.
2. **Plain reissue path (new):** There exists another credential `old` such that:
   - `areSameReissueFamily(old, preferredCredential)`
   - `old.id !== preferredCredential.id`
   - `old` is **not** withdrawn and renewal state is not `old-revoked`
   - `old` is **not** calendar-expired (`isCredentialDocumentExpired` false)
   - `old.issuedAt < preferredCredential.issuedAt` (strictly older)
   - `preferredCredential` is the family winner (the record Home would pick without the old sibling blocking)

Do **not** show the link when old is calendar-expired (wallet removes or prompts delete via expiry cleanup, not “view old”).

### 5.2 Home UI

File: [`app/(tabs)/index.tsx`](../../../app/(tabs)/index.tsx)

Reuse existing `WalletDocumentMenuItem` props:

- `oldCredentialLabel`: `WALLET_HOME_COPY.viewCredential + ' (เอกสารเดิม)'` (existing string pattern)
- `onViewOldCredential`: navigate to `/(tabs)/credential/[id]` for `oldCredentialId`

Same for unregistered extra rows when a superseded active sibling exists.

Copy/layout home: [`src/services/credentials/walletHomeCopy.ts`](../../../src/services/credentials/walletHomeCopy.ts) — no new strings required.

### 5.3 Old credential detail screen

When Holder opens superseded old VC (not P3 `cleanup-pending`):

- Show **superseded** inactive styling: grey ribbon / Inactive pill (reuse inactive panel patterns where applicable).
- Panel message (new copy in `walletHomeCopy.ts`): Holder has a newer document; this one is kept until deleted.
- **ลบเอกสารนี้** in action menu remains available (existing delete flow destroys `k_cred` and removes from MMKV).
- Do **not** set P3 `cleanup-pending` renewal state for plain reissue — no fake P3 metadata.

P3 `cleanup-pending` detail behavior unchanged.

## 6. Post-claim finalize

### 6.1 Central hook

Add `finalizeCredentialClaim(record)` in `src/services/credentials/finalizeCredentialClaim.ts`:

```
1. pairRenewalReplacementForSavedCredential(record)     // P3 intake if present
2. removeExpiredSameFamilySiblings(record)              // calendar-expired only
3. (no silent delete of active superseded siblings)
```

Call from:

- [`scannedCredentialSave.ts`](../../../src/services/credentials/scannedCredentialSave.ts) after `saveCredentialRecord`
- [`exchangeService.ts`](../../../src/services/vci/exchangeService.ts) `claimCredential` after successful save (if not already saved via scanned path)
- Dual-format finalize path in [`dualFormatIssuance.ts`](../../../src/services/credentials/dualFormatIssuance.ts) when appropriate

Scan (A) and Deeplink (D) both benefit because they share `CredentialOfferClaimScreen` → `saveScannedCredential`.

### 6.2 Expired sibling removal

`removeExpiredSameFamilySiblings(newRecord)`:

- Find credentials where `areSameReissueFamily(c, newRecord)`, `c.id !== newRecord.id`, and `isCredentialDocumentExpired(c)`.
- Remove via `removeStoredCredential` / existing delete helper (destroy key, clear renewal/lifecycle sidecars).
- Align with family-aware `findExpiredCredentialsOfSameType` from mDL identity spec — do not remove first-party DLT when claiming third-party mDL.

After removal, skip the redundant after-claim cleanup dialog for records already removed in step 2.

### 6.3 Active old sibling

**No** MMKV removal. Holder deletes via old detail or future cleanup CTA. Home shows new + “ดูเอกสาร (เอกสารเดิม)”.

### 6.4 Persist replace (`isReplaceableCredentialId`)

Out of scope for this slice unless mDL identity spec lands in the same PR. When that spec lands, family-aware replace must still **not** remove an active first-party row when saving a third-party mDL.

This slice does **not** change same-Holder-DID silent replace (already works).

## 7. MMKV count vs Home rows

| Stored records | Home rows |
|---|---|
| One per catalog type / unregistered group (picker winner) | One main row |
| Extra same-family siblings (active, superseded) | Hidden from main row; reachable via “เอกสารเดิม” |
| P3 cleanup-pending old | Same link (existing) |
| Different families (e.g. first-party DLT + third-party mDL) | Separate rows |

`credentialCount` in logs may exceed visible rows — that is expected.

## 8. Out of scope

- OID4VP / My QR credential resolution order (separate matcher work if old VC must not be presentable when superseded).
- NFC presentation credential pick.
- Migrating historical mis-typed stored `type` values.
- Auto-delete active old VC without Holder confirm (except calendar-expired removal).
- Changing P3 state machine or `wallet.key_rotation` lifecycle.

## 9. Tests

| Case | Expected |
|---|---|
| Two same-family creds, different DIDs, no renewal metadata | Home picks newer `issuedAt`; “ดูเอกสาร (เอกสารเดิม)” → old id |
| New claim with calendar-expired same-family sibling | Expired removed on finalize; no “เอกสารเดิม” for that old |
| P3 cleanup-pending | Existing link + renewed-active badge unchanged |
| Third-party mDL + first-party expired DLT | No expired DLT removal; no supersede link between families |
| Unregistered group: two same issuer extras | Newer shown in extras; link to older active sibling |
| Old detail for superseded VC | Inactive/superseded copy; delete still works |

Files: `credentialGuard.test.ts`, `renewalCleanupNotification.test.ts` or new `credentialSupersededSibling.test.ts`, `finalizeCredentialClaim.test.ts`, `CredentialOfferClaimScreen.test.tsx` (finalize invoked).

## 10. Verification

```bash
yarn test src/services/credentials/credentialGuard.test.ts
yarn test src/services/credentials/renewalCleanupNotification.test.ts
yarn test src/services/credentials/finalizeCredentialClaim.test.ts
yarn tsc --noEmit
```

Manual: Scan reissue with hardware `k_cred` → Home shows new row; tap “ดูเอกสาร (เอกสารเดิม)” → old detail; delete old → link disappears and count drops.
