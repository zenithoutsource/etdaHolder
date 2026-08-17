# mDL NFC Static Handover (Tap-Only) Presentment

Status: Approved (brainstorming 2026-08-17)  
Date: 2026-08-17

## Relationship To Prior Specs

This spec **replaces QR DeviceEngagement** for the holder golden path of driving-licence NFC presentment. It does not replace dual-format / companion designs.

| Document | Relationship |
|---|---|
| [`2026-07-27-mdl-mdoc-only-nfc-v1-design.md`](./2026-07-27-mdl-mdoc-only-nfc-v1-design.md) | v1 delivered QR engagement + NFC data retrieval and a pre-tap consent panel. Physical QR path **PASS** on A26 + ACR1311U-N2 (2026-08-17). This spec keeps the mdoc data path and ceiling; it changes engagement and holder UX. |
| [`2026-07-09-mdoc-proximity-production-design.md`](./2026-07-09-mdoc-proximity-production-design.md) | Named NFC negotiated handover as a follow-up if the verifier requires tap-only. This spec implements **static** NFC handover + NFC data retrieval (not TNEP negotiated handover, not BLE). |
| [`2026-07-03-android-hce-dual-format-presentation-design.md`](./2026-07-03-android-hce-dual-format-presentation-design.md) | Parent HCE architecture; companion / dual-format stay out of this slice. |
| ADR 0003 | ISO 18013-5 for NFC proximity — unchanged. |
| ADR 0006 | Multipaz remains the engine. |

**Explicit non-goals:** [mdoc-web-verifier](https://github.com/stelauconseil/mdoc-web-verifier) (BLE), online P4 OID4VP (Scan / My QR / Trust Registry), iOS proximity.

P1–P6 journey canvases are **unchanged**: those diagrams describe online VP. This slice is ADR 0003 proximity only.

## 1. Summary

Holder golden path, no wallet QR and no test mDL:

1. Open the app.  
2. Open Driving Licence (OID4VCI-issued `mso_mdoc`, already claimed).  
3. Press **NFC**.  
4. Hold the phone on the ACR1311U-N2 (Waiting for tap, **no engagement QR**).  
5. Wallet completes ISO 18013-5 presentment.  
6. Verifier (ACR1311 host) receives encrypted `DeviceResponse` and shows the requested mDL claims.

Engagement is **ISO 18013-5 static NFC handover**: the reader reads `DeviceEngagement` from a Type 4 NDEF HCE application, then continues **NFC data retrieval** on the existing mdoc AID. Disclosure is the **intersection** of the Verifier `DeviceRequest` and the mDL field ceiling. Remove the debug **Add test mDL** path.

## 2. Scope

### In scope

- Remove wallet test-mDL inject: Home button, `injectTestMdl` service/tests, native `generateTestMdl` / `TestMdlGenerator.kt` in `expo-mdoc-proximity`.
- Tap-first UX: NFC press arms HCE and opens Waiting for tap; no `PreTapConsentPanel` before the hold.
- Static NFC handover HCE (AID `D2760000850101`) plus existing mdoc data AID `A0000002480400`.
- `Iso18013Presentment` session transcript uses the **NFC handover** structure, not `Simple.NULL`.
- Host default: wait for card, read NDEF static handover, then mdoc retrieval (no QR paste on the golden path).
- Keep host `generate-mdl` CLI and QR/`mdoc:` paste as **lab fallback** only.
- Disclosure: DeviceRequest ∩ ceiling (`family_name`, `given_name`, `birth_date` on `org.iso.18013.5.1`). Extra fields fail closed.
- Physical validation on Samsung Galaxy A26 + ACR1311U-N2.

### Out of scope

- Negotiated handover (TNEP).
- BLE data transfer / BLE static handover flags.
- Dual-format companion on the same tap.
- Auto-purge of leftover TEST cards (`issuerName` `Wallet TEST IACA`); holder deletes them in the existing credential UX.
- Changing the three-field ceiling to the full mDL namespace.
- Online OID4VP, Trust Registry, DID Resolver.
- iOS.
- NFC NDEF **issuance** (offer URI on a tag).

## 3. Holder flow

```text
Home
  → Driving Licence detail
  → NFC
  → present.tsx Waiting for tap (instruction + ceiling copy + Cancel; no QR)
  → hold on ACR1311
  → sign-time biometric once (the only auth prompt for this NFC action)
  → PresentationResultPanel (fields actually sent)
```

Pressing NFC **is** the presentment act. There is no second consent screen after `DeviceRequest` (the phone is on the reader). Cancel on Waiting for tap disarms both AIDs.

Waiting for tap shows non-blocking copy of the **maximum** this tap may share (family name, given name, date of birth). Fields actually sent appear on Success.

Prerequisite: `hasStoredMdoc(credentialId)` from a real OID4VCI claim. If missing, fail closed with a presentment error; do not mint a TEST mDL.

## 4. Architecture

```text
Holder                 Wallet HCE                         ACR1311 host
  NFC press    →  arm NDEF + mdoc AIDs
  hold still   →  Type 4 NDEF  D2760000850101  →  read Handover Select
               →    DeviceEngagement + NFC carrier                    + eDeviceKey
               →  mdoc AID A0000002480400      →  SELECT, DeviceRequest
               →  DeviceResponse (intersection) ←  decrypt, show claims
```

### Wallet native

- One `HostApduService` (extend `CompanionHostApduService` or Multipaz `CombinedNfcService`) routing:
  - `D2760000850101` → Multipaz `MdocNdefService` with `useNegotiatedHandover=false`, `staticHandoverNfcDataTransferEnabled=true`, BLE static/negotiated handover **off**.
  - `A0000002480400` → existing `NfcTransportMdoc` path (keep APDU crash shield, listen-again loop, response drain grace).
- `setPreferredService` targets that **one** component. Two separate HCE services cannot both be preferred; NDEF AID is heavily used by OEM wallets — same class of `6A82` risk as mdoc AID.
- Do not publish DeviceEngagement to JS as a holder QR. JS does not need `deviceEngagementUri` for the golden path.
- Keep `eDeviceKey` stable for the arm window so a missed tap can retry without a new engagement.

### Session transcript

QR v1 used `handover = Simple.NULL`. Static NFC handover **must** use the ISO 18013-5 NFC handover CBOR so the reader and wallet derive the same transcript. Host and wallet must agree; mixing QR-null handover with NFC engagement fails decrypt.

### Host (`tools/acr1311u-n2`)

- Default `/api/present` (or equivalent wait-for-tap): **no engagement body required**. Wait for PC/SC card → SELECT NDEF AID → parse static Handover Select / DeviceEngagement → SELECT mdoc AID → DeviceRequest / wait DeviceResponse.
- Requested fields stay the three mDL identifiers unless a future host option narrows them (intersection still applies).
- Retain QR/`mdoc:` POST as a **dev fallback** so the 2026-08-17 QR golden path remains a lab tool.
- Retain `generate-mdl` and `testdata/test-iaca.pem` for optional IACA banner checks. Production trust is real issuer IACA, not this PEM.

### Disclosure rule

Two lists:

1. **Ceiling** — reader profile `mdl-acr1311u-n2-mdoc-only`: `family_name`, `given_name`, `birth_date`.
2. **DeviceRequest** — what the Verifier asked during the tap.

Send the intersection. If DeviceRequest contains any identifier outside the ceiling, fail closed (`DISCLOSURE_CEILING_EXCEEDED`); UI copy remains `Presentation failed — try again`. Do not send fields the Verifier did not ask for.

One biometric prompt per NFC action, at device-auth sign time only.

## 5. Remove test mDL

Delete from the wallet (not the host CLI):

- `InjectTestMdlButton` and its use on Home (`app/(tabs)/index.tsx`).
- `src/services/proximity/injectTestMdl.ts` and `injectTestMdl.test.ts`.
- `generateTestMdl` on `NativeProximityModule` and `ExpoMdocProximityModule`.
- `modules/expo-mdoc-proximity/.../TestMdlGenerator.kt`.

NFC runbooks that say “Home → Add test mDL” switch to “claim Driving Licence from the Issuer, then NFC.”

Already-injected TEST cards stay on device until the holder deletes them. No startup purge.

## 6. Error handling

| Condition | Holder | Host |
|---|---|---|
| No stored mdoc | Fail closed; no TEST inject | — |
| Unarmed / NDEF AID routed elsewhere | Stay on Waiting for tap | NDEF SELECT `6A82` / empty NDEF; armed/routing copy |
| Field drop between NDEF and mdoc SELECT | Stay armed | Retry inside tap window |
| DeviceRequest above ceiling | `Presentation failed — try again` | No claims |
| Mid-drain after first response chunk | Drain grace; possible re-serve | Retry until full response or window |
| Cancel / leave screen | Disarm both AIDs | Timeout |
| Sign/session failure | Generic presentment error | — |

Log raw diagnostics with existing redacting logger. No credential claims, VC/mdoc payloads, or key material.

## 7. One hold vs two taps

**Goal:** one physical hold: host reads NDEF then SELECTs mdoc without dropping the field.

Multipaz samples often use two taps (engagement, then data). If A26 + ACR1311 drops the field between those SELECTs, the wallet stays armed and the host retries (existing missed-tap + drain-grace behaviour).

**Success metric:** host page shows decrypted claims without a holder QR. A second hold after a drop is acceptable; requiring the holder to scan or paste `mdoc:` is not.

## 8. Testing

- Jest: remove inject-test-mDL coverage; Home snapshot/tests must not render Add test mDL.
- Host unit tests: parse a static-handover NDEF into DeviceEngagement; QR paste path still passes.
- Native: arm does not require JS engagement URI; presentment uses NFC handover in the transcript.
- Physical (release gate for this spec): three successful tap-only runs on A26 + ACR1311 with an **issued** driving licence. Host default path (no QR paste). Record in `docs/TASKS.md`.

## 9. Definition of done

1. Test mDL button and native generator are gone from the wallet.  
2. Holder golden path is static NFC handover + NFC data retrieval; Waiting for tap has no engagement QR.  
3. Disclosure remains DeviceRequest ∩ three-field ceiling.  
4. Host default is wait-for-card + NDEF; QR paste is lab-only.  
5. Physical tap-only PASS on A26 + ACR1311 with an issued mDL.

## 10. Implementation notes

- Package manager: Yarn; native rebuild via `npx expo run:android` after HCE/AID XML changes.
- Do not add identifiers, files, or docs using the customer organization name; keep existing wire AIDs as opaque constants.
- Configurable durations already used (`EXPO_PUBLIC_HCE_ARM_WINDOW_MS`, `EXPO_PUBLIC_HCE_RESPONSE_DRAIN_GRACE_MS`) stay env-driven; add a new `EXPO_PUBLIC_*` only if a new policy window is introduced.
