# First-party vs third-party ISO mDL identity

Status: Draft (awaiting review)  
Date: 2026-08-24

## Relationship To Prior Specs

| Document | Relationship |
|---|---|
| [2026-08-21 unregistered issuer claim display](2026-08-21-unregistered-issuer-claim-display-design.md) | Display-time first-party chrome already uses an exact allowlist plus first-party issuer hostname. This spec closes leftover **persist, replace, cleanup, and P3 pairing** that still treat `org.iso.18013.5.1.mDL` as first-party DLT regardless of issuer. |
| P1–P6 canvases | Unchanged. First-party Driving Licence portal request / receive stays P1. Third-party Scan claim stays an extra Digital Document. |
| Session 2026-08-24 standalone third-party `mso_mdoc` OID4VP | Presentation matching already keys mDOC by doctype, not first-party type. This spec does not change VP. |

## 1. Summary

`org.iso.18013.5.1.mDL` is the ISO 18013-5 mDL **doctype**. Any issuer may use it. The wallet still collapses that doctype to stored type `DLTDrivingLicence` and then treats “same stored type” as “same document.”

Observed Holder path:

1. First-party Driving Licence calendar-expires.
2. Holder claims a third-party credential whose configuration id / doctype is `org.iso.18013.5.1.mDL`.
3. Wallet prompts to delete the **first-party** expired document.
4. Home Driving Licence row stays expired (catalog already uses issuer-gated `resolveFirstPartyType`).
5. Third-party detail is usable (unregistered extra row).
6. Holder can still portal-request a first-party Driving Licence and the request succeeds.

Steps 4–6 are the **correct** split once identity is issuer-aware. Step 3 (and any P3 cleanup pairing) is the defect.

This slice makes document identity **issuer origin + document family**, not doctype or stored type alone.

## 2. Scope

### In scope

- Persist: map wire ids to `DLTDrivingLicence` only when the offer issuer is the first-party origin.
- Storage replace: do not drop a first-party DLT row when saving a third-party mDL.
- After-claim expiry cleanup dialog: match only the same issuer family.
- P3 renewal intake / replacement pairing: do not infer DLT or attach pending `k_cred` from a third-party mDL offer.
- Display-time `resolveFirstPartyType`: doctype-only records without a first-party issuer host are not Home DLT.
- Tests for the paths above.

### Out of scope

- Changing calendar-expiry portal reissue for a true first-party DLT (step 6 stays allowed).
- NFC / DLT artwork for third-party mDL (already unregistered).
- Dual-format grouping **inside one first-party offer** (`Iso18013DriversLicenseCredential_*` + mDL doctype).
- OID4VP doctype matching (already doctype-based).
- Migrating historical stored `type` strings except where matching already consults issuer (cleanup / pairing / catalog). New claims persist the correct type; old third-party rows stored as `DLTDrivingLicence` stay extra Home rows via issuer gate and must not trigger first-party cleanup.

## 3. Identity rules

First-party issuer hostname: from `EXPO_PUBLIC_ISSUER_CREDENTIAL_ISSUER`, default `issuer.zenithcomp.co.th`. Compare hostname only (`isFirstPartyIssuerOrigin`).

**Wire hint (unchanged):** `canonicalFirstPartyType('org.iso.18013.5.1.mDL')` may still return `DLTDrivingLicence`. Callers must not apply that mapping without an issuer check.

A credential is first-party DLT only when:

- Issuer origin is first-party (from `issuerUrl`, `claims.iss`, or http(s) `vct`), **and**
- A wire id or stored type maps to `DLTDrivingLicence`.

Otherwise it is an unregistered document. Group key remains `readUnregisteredDocumentGroupKey` (vct, then configuration id, then doctype, then type), which already separates issuers when `vct` / `issuerUrl` differ. Cleanup and replace must not use stored type alone. If either record has an issuer hostname, those hostnames must be equal.

Doctype-only, **no** issuer host: **not** first-party DLT. Trust stored `type: DLTDrivingLicence` only when there is no conflicting third-party issuer or third-party `vct` (existing tonyhere cases stay unregistered).

Two records are the **same reissue family** only when:

1. They resolve to the same first-party type **and** both are first-party origin, or
2. Neither is first-party and they share the same unregistered group key **and** the same issuer hostname.

First-party DLT and third-party `org.iso.18013.5.1.mDL` are never the same family.

## 4. Persist and replace

Files: [`src/services/vci/exchangeService.ts`](../../../src/services/vci/exchangeService.ts) (`canonicalCredentialType`, `readCredentialType`, `finalizeMdocCredentialRecord`, `isReplaceableCredentialId`).

`canonicalCredentialType(type, issuer)`:

- If `canonicalFirstPartyType(type)` is set **and** `isFirstPartyIssuerOrigin(issuer)`, return the first-party type.
- Else return the original wire id (for mDOC, `org.iso.18013.5.1.mDL` or the configuration id).

Pass `resolvedOffer.issuer` from JWT and mDOC persist paths. Claims always store `issuerUrl` when the offer has an issuer (already true for mDOC finalize).

`isReplaceableCredentialId`:

- Keep withdrawn-credential and same holder DID checks.
- Replace only when the existing and new records are the same reissue family (section 3), not when `existing.type === replacement.type` alone.

A third-party mDL claim must not remove an expired first-party DLT from the credential index.

## 5. After-claim cleanup UI

Files: [`src/services/credentials/credentialDocumentExpiry.ts`](../../../src/services/credentials/credentialDocumentExpiry.ts) (`findExpiredCredentialsOfSameType`), [`src/services/credentials/documentExpiryCleanup.ts`](../../../src/services/credentials/documentExpiryCleanup.ts), [`src/screens/CredentialOfferClaimScreen.tsx`](../../../src/screens/CredentialOfferClaimScreen.tsx).

`findExpiredCredentialsOfSameType` must filter by reissue family (section 3), not `credential.type === newRecord.type` only.

After a successful third-party mDL claim:

- Do **not** show `documentExpiredCleanupTitle` / delete CTA for the expired first-party DLT.
- Do not call `deleteExpiredCredentialAfterReissue` on the first-party id.

After a successful **first-party** DLT reissue, the expired first-party sibling of the same issuer still appears in that dialog (current product).

## 6. Portal inference and P3 pairing

Files: [`src/services/credentials/inferPortalCredentialType.ts`](../../../src/services/credentials/inferPortalCredentialType.ts), [`src/config/sameDeviceIssuance.ts`](../../../src/config/sameDeviceIssuance.ts), [`src/services/credentials/renewalIssuerIntake.ts`](../../../src/services/credentials/renewalIssuerIntake.ts).

`CREDENTIAL_TYPE_TO_CONFIGURATION_IDS.DLTDrivingLicence` may still list `org.iso.18013.5.1.mDL` for **first-party** same-device offers.

`inferPortalCredentialTypeFromOffer`:

- Return `DLTDrivingLicence` only when the offer’s `issuer` is first-party **and** configuration ids match the DLT set.
- Third-party issuer + `org.iso.18013.5.1.mDL` → `undefined`.

`readRenewalIntakePendingKeyForOffer` therefore must not bind a third-party claim to a first-party pending hardware key.

`pairRenewalReplacementForSavedCredential`:

- Pair only when replacement and intake credential are the same reissue family.
- Do not pair a third-party mDL (even if a historical row has `type: DLTDrivingLicence`) onto first-party `renewal-required`.

## 7. Display-time classifier

File: [`src/config/firstPartyCredential.ts`](../../../src/config/firstPartyCredential.ts).

Keep `canonicalFirstPartyType` as a wire hint.

Change `resolveFirstPartyType` so `claims.doctype` / configuration id `org.iso.18013.5.1.mDL` does **not** yield `DLTDrivingLicence` unless the issuer host is first-party.

Flip the current test that keeps ISO mDL as DLT when the offer id is not on the allowlist and **no issuer** is present.

Home catalog (`isCatalogFirstPartyMatch`) already calls `resolveFirstPartyType`. After this change, a doctype-only third-party mDL cannot occupy the Driving Licence row even if `issuerUrl` was missing. First-party issuer + doctype still occupies that row.

## 8. Expected Holder outcomes

Given expired first-party DLT **and** a newly claimed third-party `org.iso.18013.5.1.mDL`:

| Surface | Expected |
|---|---|
| After-claim dialog | No “delete old document” targeting first-party DLT |
| Home Driving Licence | Still expired first-party (badge / ขอเอกสาร) |
| Extra Home row | Third-party document, usable |
| Third-party detail | Usable, generic Digital Document chrome |
| First-party ขอเอกสาร | Still allowed; portal request can succeed |
| First-party DLT reissue of the **same** issuer | Cleanup dialog **does** target the expired first-party sibling |

## 9. Verification

Focused Jest (no coverage flag required in this spec):

- `canonicalCredentialType` / persist: third-party issuer + `org.iso.18013.5.1.mDL` does not store `type: DLTDrivingLicence`. First-party issuer still does.
- `findExpiredCredentialsOfSameType`: expired first-party DLT + new third-party mDL → empty; same-issuer DLT reissue → expired sibling.
- `inferPortalCredentialTypeFromOffer`: non-first-party issuer + mDL id → `undefined`; first-party issuer → `DLTDrivingLicence`.
- `pairRenewalReplacementForSavedCredential`: third-party mDL does not pair onto DLT `renewal-required`.
- `resolveFirstPartyType` / `isCatalogFirstPartyMatch`: doctype-only without issuer is not Home DLT; first-party issuer + doctype is; tonyhere + mDL stays an extra row.
- Update [`src/services/vci/exchangeService.oid4vci10.test.ts`](../../../src/services/vci/exchangeService.oid4vci10.test.ts) cases that map mDL → DLT without a first-party issuer.
- Update [`src/config/firstPartyCredential.test.ts`](../../../src/config/firstPartyCredential.test.ts) and [`src/services/credentials/unregisteredHomeDocuments.test.ts`](../../../src/services/credentials/unregisteredHomeDocuments.test.ts) doctype-without-issuer catalog expectations.

`yarn tsc --noEmit` after the slice.

## 10. Error handling

No new Holder-facing error. If pairing or cleanup would have crossed issuers, skip the action and leave both credentials stored. Log at existing `oid4vci` / `renewal` steps with type, issuer host, and credential ids (no claims/PII).
