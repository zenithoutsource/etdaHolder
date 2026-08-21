# Unregistered issuer claim display

Status: Approved (brainstorming 2026-08-21)  
Date: 2026-08-21

## Relationship To Prior Specs

| Document | Relationship |
|---|---|
| P1–P6 canvases | Unchanged. This is Scan/deeplink interop display, not portal issuance. |
| Session 2026-08-20 third-party OID4VCI trust | Claiming unlisted issuers already works. This spec is display and classification after claim. |

## 1. Summary

The Wallet already stores issuer claim keys as-is. Display then folds unknown `vct` / configuration ids into first-party chrome when the id contains `licence`, `license`, `mdl`, or `thai`.

This slice:

1. Brands first-party cards only via an **exact allowlist**.
2. Treats every other claimed credential as an **extra Home document** after the four first-party rows.
3. Lists the claims the issuer sent, labeled from persisted OID4VCI metadata.

## 2. Scope

### In scope

- Exact first-party allowlist and display-time reclassify.
- Persist `credentialDisplayName` and `claimDisplayLabels` at claim time.
- Generic Digital Document detail for unregistered credentials.
- Home extra rows after ID Card / Driving License / Transcript / Medical certificate.
- Gate DLT artwork, DLT receive chrome, and DLT NFC presentment on the same classifier.

### Out of scope

- P1 portal issuance sequence.
- Per-issuer formatters beyond flatten / summarize / image.
- Rewriting OID4VP disclosure UI from metadata. VP still matches stored SD-JWT/JWT by `vct`. A mis-folded stored type must not satisfy a DLT DCQL type query.

## 3. Classification

Wire identifiers: `claims.vct`, `claims.doctype`, `credentialConfigurationId`.

Match **case-insensitive exact** strings, or the last URL path segment of an identifier (so `https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense` maps to DLT). Do not substring-match `licence` inside unrelated ids.

Allowlist:

- Types: `ThaiNationalID`, `DLTDrivingLicence`, `ChulalongkornUniversityTranscript`, `MedicalCertificate`
- Wire ids: `org.iso.18013.5.1.mDL`, `idcard`, `IdCard_dc+sd-jwt`, `DrivingLicense`, `DrivingLicence`, `Iso18013DriversLicenseCredential`, `TranscriptCredential`, plus the four type names
- OID4VCI format suffixes (`_dc+sd-jwt`, `_vc+sd-jwt`, `_mso_mdoc`, `_jwt_vc_json`) are stripped before matching, so `TranscriptCredential_dc+sd-jwt` maps to transcript

Issuer origin gate (hostname only, from `EXPO_PUBLIC_ISSUER_CREDENTIAL_ISSUER`, default `issuer.zenithcomp.co.th`):

- Origins from `issuerUrl`, `claims.iss`, and http(s) `vct`.
- If any origin is present and **none** is the first-party host, the credential is unregistered even when the last path segment is `DrivingLicense`.
- `https://demo.tonyhere.work/` is never first-party. `wallet.` / `verifier.` hosts are not first-party.
- Unknown origin (legacy PID with no issuer URL) keeps the wire-id allowlist.

Algorithm:

1. If any wire id maps to a first-party type, that is the candidate type.
2. Else if any wire id is present, the credential is unregistered (ignore stored type).
3. Else if stored `type` is on the allowlist, that is the candidate type.
4. Else unregistered.
5. If a candidate type exists and a known origin is not the first-party host, unregistered.

`TestMdocDrivingLicence` is not first-party unless the mdoc doctype is `org.iso.18013.5.1.mDL` (and origin is first-party or unknown).

## 4. Persistence

At claim, keep decoded `claims` unchanged. Persist:

- `type` from `vct` / `vc.type` / config id through the allowlist (unregistered ids stay as the original string).
- `credentialDisplayName` from configuration `display[].name`.
- `claimDisplayLabels` from configuration `claims` (`display[].name`; prefer `th`, then `en`, then first).
- Existing `issuerName`, `issuerUrl`, `credentialConfigurationId`.

Do not re-fetch issuer metadata to render a card.

## 5. Home

Keep the four first-party catalog rows and the PID hero. After those rows, append one `WalletDocumentMenuItem` per unregistered stored credential (preferred record if duplicates share `vct` / type). Extra rows appear only after a successful claim: no empty placeholder, no portal **ขอเอกสาร**. Label is the persisted credential display name.

## 6. Generic display

- Title = credential display name (else Digital Document / Credential).
- Issuer name from persisted issuer display.
- `primaryRows` = every non-protocol claim. Labels: metadata name, else humanized key (`given_name` → `Given Name`). Hide `iss`, `vct`, `cnf`, `status`, JWT registered claims.
- Primitives as text; booleans Yes/No; objects flattened one level; arrays summarized; `portrait` / `photo` / `image` as an image when the value looks like a picture.
- Detail uses generic `imageKey: "profile"` layout, not DLT / ID / transcript slots.

## 7. Verification

- tonyhere `urn:tonyhere:demo:pid-age:1` → generic rows and an extra Home row, not Driving License.
- A `vct` containing `licence` that is not allowlisted → generic.
- `org.iso.18013.5.1.mDL` still DLT.
- Stored `type: DLTDrivingLicence` + tonyhere `vct` → generic at display time; does not satisfy DLT DCQL type matching.
- First-party URL vct ending in `/idcard` still PID.
- First-party URL vcts ending in `/DrivingLicense`, `/DrivingLicence`, or `/TranscriptCredential` stay on the catalog rows **only when the issuer host is `issuer.zenithcomp.co.th`**.
- `https://demo.tonyhere.work/.../DrivingLicense` is an extra Home row and does not occupy the Driving License catalog slot.
