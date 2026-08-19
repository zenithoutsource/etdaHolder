# My QR — Driving Licence Dual-Format OID4VP

Status: Approved (2026-07-27)
Date: 2026-07-27

## Relationship To Prior Specs

| Document | Relationship |
|---|---|
| [`2026-07-16-my-qr-broker-oid4vp-design.md`](./2026-07-16-my-qr-broker-oid4vp-design.md) | Parent My QR flow — broker QR, poll, reuse `Oid4VpDisclosureFlow` |
| [`2026-07-03-android-hce-dual-format-presentation-design.md`](./2026-07-03-android-hce-dual-format-presentation-design.md) | Dual-format data model; online OID4VP may return both `dc+sd-jwt` and `mso_mdoc` |
| [`2026-07-27-wallet-channel-matrix-design.md`](./2026-07-27-wallet-channel-matrix-design.md) | My QR = online VP; NFC Present = separate proximity channel |
| [`2026-07-27-mdl-mdoc-only-nfc-v1-design.md`](./2026-07-27-mdl-mdoc-only-nfc-v1-design.md) | NFC proximity slice — **paused** until My QR slice ships; not replaced |

**Explicit non-goal:** [mdoc-web-verifier](https://github.com/stelauconseil/mdoc-web-verifier). It uses Device Engagement QR + Web Bluetooth (mdoc only). This spec uses **broker QR + OID4VP over the network**, matching production Verifier/Broker infrastructure.

## 1. Summary

Extend **My QR** from ThaID-only to **Driving Licence (`DLTDrivingLicence`)** when the holder has a **linked dual-format credential** (`dc+sd-jwt` + `mso_mdoc`). Verifier scans the broker QR; wallet receives a standard OID4VP Authorization Request; wallet submits a `vp_token` containing **both formats** when DCQL requests both.

**Holder UX (unchanged pattern):**

1. Open **My QR** tab (or credential-detail VP QR entry when extended).
2. Wallet shows **broker `qr_payload`** (HTTP URL — not `mdoc://`).
3. Checkpoint Verifier scans QR.
4. Wallet enters existing **`Oid4VpDisclosureFlow`** (consent → sign → `direct_post`).
5. Verifier verifies `vp_token` (SD-JWT KB-JWT + `mso_mdoc` entry).

**No NFC tap** in this flow. **No BLE** on the phone. **No engagement QR** (`mdoc://`) on My QR.

## 2. Problem

Stakeholders reference mdoc-web-verifier (“verifier scans holder QR”) but need:

- Both **dc+sd-jwt** and **mso_mdoc** in one presentation.
- **My QR** as the holder-initiated channel.
- Driving licence mdoc delivered as **`mso_mdoc` in OID4VP `vp_token`**, not ISO 18013-5 NFC `DeviceResponse`.

Recent NFC proximity work (`mdl-mdoc-only-nfc-v1`) targets **ACR1311U-N2 tap** — a different channel. That work must not be mistaken for My QR requirements.

## 3. Scope

### In scope

- My QR credential resolution for `DLTDrivingLicence` with dual-format readiness gate.
- Reuse `useWalletInitiatedVpQrSession` + `Oid4VpDisclosureFlow` without forking disclosure UI.
- Dual-format DCQL matching and `buildDualFormatDcqlVpToken` for driving licence logical credentials.
- `mso_mdoc` VP entry via existing `readMdocVpTokenEntry()` (stored mdoc bytes, base64url).
- Verifier/Broker contract note: checkpoint `docType` for driving licence (coordinate with Verifier team).
- Tests: credential resolver, dual-format gate, My QR phase handoff, VP token shape.
- Document NFC slice status (§8).

### Out of scope

- mdoc-web-verifier integration or BLE Server Peripheral on the phone.
- NFC Present tab / Multipaz / HCE changes for My QR.
- Changing `readMdocVpTokenEntry` to native `DeviceResponse` builder (future ADR 0006 follow-up).
- My QR for credentials without linked `mso_mdoc` when Verifier requests dual-format DCQL.
- Backend wallet sync of mdoc bytes.

## 4. Architecture

```text
My QR tab
  → resolveMyQrCredential()  [NEW: DLTDrivingLicence + dual-format ready]
  → useWalletInitiatedVpQrSession (broker POST /broker/session)
  → show qr_payload QR
  → poll GET .../request
  → Oid4VpDisclosureFlow
       → resolvePresentationRequest
       → dcqlCredentialMatch + assertDualFormatPresentationReady
       → dualFormatDcqlPresentationBuilder
            → dc+sd-jwt: signSdJwtKbPresentationToken
            → mso_mdoc: readMdocVpTokenEntry(credentialId)
       → submitPresentationResponse (direct_post)
```

### Channel boundary

| QR on screen | Protocol after scan | mdoc delivery |
|---|---|---|
| Broker URL (`qr_payload`) | OID4VP online | `mso_mdoc` in `vp_token` JSON |
| `mdoc://` engagement (Present NFC only) | ISO 18013-5 NFC HCE | `DeviceResponse` over APDU |

## 5. Credential selection

### Current behavior

`resolvePidVpQrCredential()` returns presentable `ThaiNationalID` SD-JWT only.

### New behavior

Introduce neutral resolver (e.g. `resolveMyQrPresentationCredential`) with policy:

1. **v1 My QR tab is document-agnostic:** the engagement QR is a broker session only. The wallet does **not** pre-select driving licence, ThaID, or any other document. Verifier `POST /verifier/scan` `docType` + deposited DCQL choose the credential after scan. `Oid4VpDisclosureFlow` matches against **all** presentable wallet credentials. Credential-detail **My QR** opens `VpQrModal` for every document; the My QR tab remains the disclosure host after scan.
2. **Dual-format ready** (used at presentation match time, not QR create) means:
   - `findLogicalCredentialBySdJwtRecordId(record.id)` has both `formats['dc+sd-jwt']` and `formats['mso_mdoc']`.
   - `hasStoredMdoc(record.id)` is true.
   - `isCredentialPresentable(record)` is true.
   - SD-JWT record `type === 'DLTDrivingLicence'`.
3. **Partial issuance:** if only one format exists, My QR may still show for SD-JWT-only requests; dual-format DCQL must fail closed via `assertDualFormatPresentationReady`.

Optional later: credential picker on My QR when multiple eligible documents exist. **Not v1** — single resolver priority list only.

## 6. Verifier / Broker contract

Wallet does **not** call `/verifier/scan`. Verifier posts scan after reading broker QR.

| Field | ThaID (today) | Driving licence (v1) |
|---|---|---|
| Broker `POST /broker/session` | unchanged | unchanged |
| Verifier `POST /verifier/scan` `docType` | `IDCard` | **`DrivingLicence`** or team-agreed value — **confirm with Verifier** |
| OID4VP DCQL | SD-JWT credentials | **Two credentials:** `dc+sd-jwt` + `mso_mdoc` |
| mDL doctype meta | n/a | `org.iso.18013.5.1.mDL` in `mso_mdoc` query `meta.type_values` when Verifier uses it |

**Sample DCQL shape (illustrative — Verifier owns canonical query):**

```json
{
  "credentials": [
    {
      "id": "driving_licence_sd_jwt",
      "format": "dc+sd-jwt",
      "meta": { "vct_values": ["<issuer-driving-licence-vct>"] },
      "require_cryptographic_holder_binding": true
    },
    {
      "id": "driving_licence_mdoc",
      "format": "mso_mdoc",
      "meta": { "type_values": ["org.iso.18013.5.1.mDL"] }
    }
  ]
}
```

Wallet matching reuses `dualFormatPresentationMatch.ts` and `dcqlCredentialMatch.ts`.

## 7. VP token assembly

Reuse existing builders — no new crypto path.

| Format | Builder | Notes |
|---|---|---|
| `dc+sd-jwt` | `signSdJwtKbPresentationToken` | Selective disclosure from consent; one Keychain sign |
| `mso_mdoc` | `readMdocVpTokenEntry` | Reads native `mdocStorage` bytes; base64url in envelope |

`buildDualFormatDcqlVpToken` returns JSON map keyed by DCQL credential `id`. Shape controlled by `readVerifierDcqlVpTokenShape()` (existing runtime flag).

**One biometric per user action:** sign-time Keychain gate only when building tokens — no extra app prompt before broker session create.

## 8. NFC proximity slice — keep vs pause

The **mdl-mdoc-only NFC v1** slice (uncommitted on `dev` at brainstorming time) remains valid for **ACR1311U-N2 production proximity** but is **not required** for My QR delivery.

### Keep (do not delete)

| Area | Reason |
|---|---|
| `modules/expo-mdoc-proximity` HCE scaffold (`CompanionHostApduService`, companion APDU) | ADR 0003; dual-format NFC companion later |
| `mdocStorage` + `storeMdocCredential` at claim | Required for **online** `mso_mdoc` VP entry and offline mdoc |
| `present.tsx` + proximity UX shell | Future NFC validation |
| `readerProfiles.ts` `mdl-acr1311u-n2-mdoc-only` | Part G NFC checklist |
| Companion protocol constants / tests | Customer dual-format NFC extension |

### Pause (no further work until My QR slice + Verifier E2E pass)

| Area | Reason |
|---|---|
| `MultipazPresentmentSession`, `DeviceAuthBridge`, `installMdocDeviceKey` | NFC-only; confuses My QR scope |
| `WaitingForTapPanel` engagement QR wiring for mDL v1 | Different QR semantics (`mdoc://` vs broker URL) |
| `prepareMdocDeviceAuthForArm` / proximity arm for mDL v1 | NFC arm path |
| Part G physical validation run | Blocked on prioritization; resume when NFC gate reopens |
| `presentationReady` Multipaz probe gating for mDL | NFC-only readiness signal |

### Rule

**My QR must not call** `armProximityPresentation`, `prepareMdocDeviceAuthForArm`, or native engagement URI APIs. mdoc for My QR flows only through **`readMdocVpTokenEntry`** at OID4VP submit time.

## 9. UI

### My QR tab (`app/(tabs)/qr.tsx`)

- Engagement QR is document-agnostic (no driving-licence-first resolver at QR create).
- Copy is generic (`สแกน QR Code ของฉัน`); do not name the document type.
- After scan, `Oid4VpDisclosureFlow` matches Verifier DCQL against all stored credentials (dual-format DL included when requested).
- Phases unchanged: `loading` → `waiting_scan` → `request_ready` → `Oid4VpDisclosureFlow`.

### Credential detail VP QR

Document-detail **My QR** navigates to the My QR tab. It does not open a document-scoped QR modal and does not pass `credentialId`.

## 10. Error handling

| Condition | User message (generic) | Log tag |
|---|---|---|
| No eligible credential | Same as ThaID missing / “no document” pattern | `[my-qr]` |
| Dual-format DCQL but mdoc missing | Presentation credential missing | `[oid4vp]` |
| Broker session fail | Retry pattern (existing) | `[vp-broker]` |
| Verifier untrusted | Existing OID4VP trust gate | `[oid4vp]` |

No raw mdoc bytes, VP bodies, or claims in logs.

## 11. Testing

| Test | Assert |
|---|---|
| `resolveMyQrPresentationCredential` | Returns DLT when dual-format ready; falls back to ThaID |
| Dual-format DCQL + driving licence fixtures | `buildDualFormatDcqlVpToken` includes both ids |
| `assertDualFormatPresentationReady` | Throws when mdoc storage empty |
| My QR hook integration (mock broker) | `request_ready` hands URI to disclosure flow |
| Regression | ThaID-only My QR still works when no driving licence |

## 12. Acceptance

- [ ] Holder with linked driving licence opens My QR → broker QR displays.
- [ ] Verifier scan → wallet disclosure → `direct_post` succeeds.
- [ ] Verifier receives `vp_token` with both `dc+sd-jwt` and `mso_mdoc` entries when DCQL requests both.
- [ ] Flow completes without NFC enabled or proximity arm.
- [ ] ThaID-only holders unaffected when driving licence absent.
- [ ] NFC v1 slice documented as paused (§8); no new NFC dependency in My QR code.

## 13. Open items

1. **Verifier team:** exact `docType` for `/verifier/scan` when checkpoint scans driving licence My QR.
2. **Verifier team:** canonical DCQL credential ids and `vct_values` for driving licence SD-JWT side.
3. **Product:** My QR priority — driving licence first vs ThaID first when both present.
4. **Future:** replace `readMdocVpTokenEntry` raw bytes with selective native `DeviceResponse` when ADR 0006 module matures (online selective mdoc fields).
