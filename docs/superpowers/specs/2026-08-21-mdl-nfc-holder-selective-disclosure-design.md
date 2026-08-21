# mDL NFC Holder Selective Disclosure

Status: Approved (brainstorming 2026-08-21)  
Date: 2026-08-21

## Relationship To Prior Specs

| Document | Relationship |
|---|---|
| [`2026-08-17-mdl-nfc-static-handover-tap-only-design.md`](./2026-08-17-mdl-nfc-static-handover-tap-only-design.md) | Parent NFC path. This spec **replaces** all-or-nothing pre-tap consent with holder toggles. Tap-only static handover, no post-`DeviceRequest` UI, and one biometric at sign time stay. |
| [`2026-07-20-same-device-vp-holder-selective-disclosure-design.md`](./2026-07-20-same-device-vp-holder-selective-disclosure-design.md) | OID4VP SD-JWT toggles. **Out of scope** here. Do not reuse `md` / `sd` issuer metadata for mdoc NFC. |
| ADR 0003 | ISO 18013-5 NFC proximity — unchanged. |
| ADR 0006 | Multipaz remains the engine. |

P1–P6 canvases stay online VP. This slice is ADR 0003 proximity only.

## 1. Summary

ISO 18013-5 mdoc already sends `DeviceRequest ∩` a disclosure set. Today that set is the **entire** reader-profile list and the holder cannot turn fields off.

This slice:

1. Lets the holder **toggle every listed mDL field** on NFC Presentment Consent **before** Accept.
2. Arms HCE with two lists: **profile ceiling** (max) and **holder selection** (what may be sent).
3. Sends `DeviceRequest ∩ holder selection`. Requested fields the holder turned off are **omitted**, not a failed tap.
4. Fail-closes only when `DeviceRequest` contains an identifier **outside the profile ceiling**.
5. Wallet Success is verification-complete only (no claim list). The ACR1311 page shows received claims vs omitted + Thai reason.

There is still **no consent after `DeviceRequest`**. Accept still requires **at least one** field on.

## 2. Scope

### In scope

- `PreTapConsentPanel` toggles via existing `PresentationDisclosureList` (`variant="consent"`, `toggleable`, `onToggle`).
- Arm payload: profile ceiling + selected `approvedMdocFields`.
- Native: `DISCLOSURE_CEILING_EXCEEDED` vs **profile ceiling**; Multipaz disclosure filtered to holder selection.
- Complete event: fields sent + omitted `{ key, reason }` (history uses sent labels; Wallet Success does not list them).
- ACR1311 page lists received claims (including `birth_date` when sent, plus derived อายุเกิน 18) and requested identifiers missing from claims, with holder-decline copy. Top-level วันที่ออกใบอนุญาต / วันหมดอายุ come only from those mDL identifiers — nested dates inside `driving_privileges` must not fill those rows.
- Tests, `docs/CODEMAPS/frontend.md`, `docs/ui-reference/nfc-presentment-consent.html`, parent NFC spec.

### Out of scope

- OID4VP mdoc holder toggles.
- Consent or toggles after `DeviceRequest`.
- Expanding the ISO mandatory mDL set (`portrait`, `age_over_18`, …).
- Custom ISO `Errors` codes on the wire (lab host infers absence).
- BLE, TNEP, iOS, making the browser the NFC endpoint.

## 3. Holder flow

```text
Home
  → Driving Licence detail
  → NFC
  → Consent: all profile fields start ON; holder may turn any off
  → Accept (disabled if none selected) arms HCE
  → Waiting for tap (no field list, no QR)
  → hold on ACR1311
  → sign-time biometric once
  → Success: verification complete (no claim list)
```

Decline, Cancel, and arm-window behaviour stay as in the 2026-08-17 spec.

## 4. Disclosure rule

Three lists:

| List | Source |
|---|---|
| **Profile ceiling** | `mdl-acr1311u-n2-mdoc-only` `mdocFields` (current: `family_name`, `given_name`, `birth_date`, `driving_privileges`, `issue_date`, `expiry_date`) |
| **Holder selection** | Consent toggles; subset of the ceiling; at least one identifier |
| **DeviceRequest** | Verifier request on the tap |

Send:

```text
DeviceRequest ∩ holder selection
```

Do **not** send identifiers the Verifier did not ask for.

| DeviceRequest identifier | Wallet |
|---|---|
| Outside profile ceiling | Fail closed `DISCLOSURE_CEILING_EXCEEDED`. UI: `Presentation failed — try again`. |
| In ceiling, holder turned **off** | Omit. Do not abort the session. |
| In ceiling, holder left **on** | Disclose if present on the stored mDL. |

Religion remains hidden on the consent list (`prepareHolderFacingDisclosureItems`). Given name stays above family name. Wire order stays match order.

## 5. Architecture

```text
JS consent toggles
  → onAccept(selectedKeys)
  → arm: profileCeiling + approvedMdocFields=selectedKeys
  → tap DeviceRequest
  → extra vs profileCeiling? fail closed
  → filter Multipaz CredentialSelection to selectedKeys
  → DeviceResponse
  → JS Success + host page: sent vs omitted
```

### Consent UI

- Reuse `PresentationDisclosureList`. Every visible profile row: `toggleable: true`, starts `selected: true`.
- `onAccept(selectedKeys: string[])` where keys are `namespace.identifier` (same as `listMdocFieldKeysFromProfile`).
- Accept disabled when `selectedKeys.length === 0`.
- Face ID note unchanged. One biometric at device-auth sign time only.

`present.tsx` must pass `selectedKeys` into `approvePresentation`, not the full profile list from `openPresentation`.

### Native arm

Extend `ProximityArmState` / `armProximitySession`:

- `profileCeiling: List<String>` — fail-closed max (from the reader profile at arm).
- `approvedMdocFields: List<String>` — holder selection (non-empty, subset of ceiling).

`ApprovedMdocFieldCeiling.extraFieldCount` uses **`profileCeiling`**, not `approvedMdocFields`.

`enforceConsentCeiling`:

1. Parse Multipaz silent-consent `CredentialSelection`.
2. If any requested mdoc identifier is outside `profileCeiling` → `DISCLOSURE_CEILING_EXCEEDED`.
3. Drop claims not in `approvedMdocFields` from the selection returned to Multipaz.
4. Build omitted list for the complete event (keys only, no values).

### Multipaz omit spike (implementation gate)

If Multipaz still terminates with **session status 20** when `DeviceRequest` includes an identifier that is on the mDL but **not** in the filtered selection, stop and fix omit (ISO `Errors` / engine consent) before shipping toggles. Shipping toggles that fail the tap when this lab host still requests the full list is approach 2 from brainstorming and is rejected.

### Complete event

Extend `onPresentationComplete`:

```ts
{
  sharedFields: string[]
  omittedFields: { key: string; reason: OmittedReason }[]
}
```

`OmittedReason`:

| Code | When | Holder / host copy |
|---|---|---|
| `holder_declined` | In DeviceRequest and profile ceiling; not in holder selection | ผู้ถือบัตรไม่ยินยอมเปิดเผย |
| `not_in_document` | Holder selected it; not present in the produced DeviceResponse (if detectable) | ไม่มีในเอกสารที่ส่ง |

Do not log claim values. Keys and reason codes only.

### Wallet Success

NFC `PresentationResultPanel` shows verification-complete copy only. Do **not** list sent or omitted claim fields on the Wallet success screen. Received vs omitted claims belong on the ACR1311 page.

History (`recordNfcPresentationSuccess`) still records **sent** labels only.

### ACR1311 host

Keep `MDL_REQUEST_FIELDS` unchanged. After decrypt:

- Show claims that arrived, including the `birth_date` value when that identifier is in DeviceResponse, privilege-nested dates, and derived อายุเกิน 18 from `birth_date`. Do not treat a sent `birth_date` as omitted just because the host also derives `age_over_18`.
- For each requested identifier with no claim row, show **ไม่ได้ส่ง** and **ผู้ถือบัตรไม่ยินยอมเปิดเผย**.
- If `birth_date` is absent, do not show อายุเกิน 18 (derived). Do not list `age_over_18` as a requested identifier.
- Do not add a custom error code to the ISO session. Lab inference from request vs claims is enough.
- Issuer-attestation banner stays hidden.

## 6. Error handling

| Condition | Holder | Host |
|---|---|---|
| Zero fields selected | Accept disabled | — |
| DeviceRequest outside profile ceiling | `Presentation failed — try again` | No claims |
| Requested field holder turned off | Success (no claim list) | Requested row: ไม่ได้ส่ง + same copy |
| Holder selected field missing on mDL | Omit `not_in_document` if detectable; do not status-20 if the engine can omit | Missing requested row as above |
| Multipaz status 20 on omit | Stay on Waiting for tap | `EMPTY_RESPONSE` — engine gate failed |
| Other tap errors | Unchanged from 2026-08-17 | Unchanged |

## 7. Testing

- `PreTapConsentPanel`: toggles; Accept disabled when none selected; Accept passes selected keys only.
- `proximityStore`: arm uses selected keys; complete stores omitted.
- Native `ApprovedMdocFieldCeiling`: extra vs profile ceiling; filter to selection; omitted `holder_declined`.
- Host: missing requested identifier renders ไม่ได้ส่ง; sent `birth_date` shows the date value, not omitted copy.
- Physical: one tap with all on (today’s claims, including วันเดือนปีเกิด); one tap with e.g. `family_name` off — session succeeds, that row omitted on the host only. Wallet Success has no claim list.

Native Kotlin changes require `npx expo run:android`. Host Kotlin/JS: restart `.\gradlew.bat run` and hard-refresh.

## 8. Definition of done

1. Consent toggles; Accept requires ≥1 field.  
2. Tap sends `DeviceRequest ∩ holder selection`.  
3. Reader identifiers outside the profile ceiling still fail closed.  
4. Wallet Success has no claim list. ACR1311 page shows received claims (including sent `birth_date`) and omitted + ผู้ถือบัตรไม่ยินยอมเปิดเผย.  
5. Multipaz omit does not status-20 for holder-declined fields.  
6. Parent NFC spec, CODEMAP, and NFC consent UI reference no longer say all-or-nothing.  
7. Focused Jest + host tests pass; physical note in `docs/TASKS.md`.

## 9. Implementation notes

- Reuse `PresentationDisclosureList` / `prepareHolderFacingDisclosureItems`. Do not add a second consent list.  
- No new `EXPO_PUBLIC_*` window.  
- No new identifiers using the customer organization name.  
- Update [`docs/ui-reference/nfc-presentment-consent.html`](../../ui-reference/nfc-presentment-consent.html) so it no longer says the holder can only accept or reject the whole ceiling.
