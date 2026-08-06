# mDL mdoc-Only NFC Presentation v1

Status: Approved (brainstorming 2026-07-27)
Date: 2026-07-27

## Relationship To Prior Specs

This spec narrows the production proximity backlog to a deliverable v1 slice. It does not replace the broader dual-format or companion designs.

| Document | Relationship |
|---|---|
| [`2026-07-03-android-hce-dual-format-presentation-design.md`](./2026-07-03-android-hce-dual-format-presentation-design.md) | Parent HCE architecture; v1 uses NFC data retrieval only (no BLE on phone) |
| [`2026-07-09-mdoc-proximity-production-design.md`](./2026-07-09-mdoc-proximity-production-design.md) | Production native module plan; v1 defers companion and dual-format |
| [`2026-07-13-a26-acr1311-hardware-validation.md`](../plans/2026-07-13-a26-acr1311-hardware-validation.md) | Physical validation checklist; v1 adds Part G (mdoc-only mDL) |
| ADR 0003 | ISO 18013-5 for NFC proximity — unchanged |
| ADR 0006 | Engine selection; Multipaz spike required before full integration |

**Explicit non-goal:** [mdoc-web-verifier](https://github.com/stelauconseil/mdoc-web-verifier) (BLE Web Bluetooth verifier). It is not part of the production or v1 validation path.

## 1. Summary

Deliver the first end-to-end **mdoc-only** NFC presentation for **Driving Licence mDL** (`org.iso.18013.5.1.mDL`) on **Samsung Galaxy A26 + ACR1311U-N2**, with a **minimal interop field set** (three ISO 18013-5 data elements).

The wallet already has:

- OID4VCI issuance path for customer issuer `mso_mdoc` (doctype resolver for `org.iso.18013.5.1.mDL`)
- HCE routing for ISO mdoc AID `A0000002480400` and companion AID (companion unused in v1)
- Physical **PASS** for mDL on ACR1311U-N2 (2026-07-16, `docs/TASKS.md`)
- Proximity UX scaffold (`present.tsx`, `PreTapConsentPanel`, `WaitingForTapPanel`)

v1 closes the gap between the native scaffold and a holder-facing flow: Multipaz-backed `DeviceResponse`, mDL reader profile, engagement QR in UI, `presentationReady: true`, and recorded Part G validation.

## 2. Scope

### In scope

- `mdoc-only` sharing mode for `DLTDrivingLicence`
- Reader profile `mdl-acr1311u-n2-mdoc-only` with three mDL fields
- QR engagement + NFC data retrieval (wallet shows engagement QR before tap)
- Pre-tap consent with single biometric gate
- Multipaz integration in `expo-mdoc-proximity` (or documented engine blocker)
- ACR1311 Part G physical validation runbook
- `presentationReady: true` on A26 when engine and NFC are available

### Out of scope (v1)

- Companion SD-JWT / dual-format single-tap
- BLE data transfer on the phone / mdoc-web-verifier
- iOS proximity
- NFC NDEF issuance
- Chulalongkorn transcript reader profile
- Full mDL field surface beyond the three interop fields
- Online OID4VP `DeviceResponse` builder
- Hand-rolled ISO 18013-5 session crypto (unless Multipaz fails — then stop and revise ADR 0006)

## 3. Architecture

```text
Credential Detail [NFC]
  → app/(tabs)/present.tsx
  → PreTapConsentPanel (mdl profile, 3 fields)
  → approve → armProximitySession(sharingMode: 'mdoc-only')
  → WaitingForTapPanel + Device Engagement QR
  → reader scans QR → NFC tap (ACR1311U-N2)
  → expo-mdoc-proximity (Multipaz engine)
  → Android HostApduService (AID A0000002480400)
  → PresentationResultPanel
```

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| React Native UI | Consent, engagement QR display, arm window, result UX |
| `src/services/proximity/*` | Orchestration, reader profile resolution, redacted logging |
| `expo-mdoc-proximity` | HCE, session state, mdoc bytes, Multipaz engine, buffer lifecycle |
| Host tool (`tools/acr1311u-n2/`) | Reader-side repeatable validation (not mdoc-web-verifier) |

### Engagement

First slice uses **QR engagement + NFC data retrieval**. The reader obtains `DeviceEngagement` / `EDeviceKey` from the wallet QR before the NFC tap. NFC negotiated handover is deferred.

Engagement QR reuses existing QR panel patterns (`react-native-qrcode-svg`, My QR flow) — no second QR renderer.

## 4. Reader Profile

Add to `src/config/readerProfiles.ts`:

| Field | Value |
|---|---|
| `profileId` | `mdl-acr1311u-n2-mdoc-only` |
| `documentType` | `DLTDrivingLicence` |
| `sharingMode` | `mdoc-only` |
| `vendorId` | `reference` |
| `vendorDisplayName` | Reference Verifier |
| `profileDisplayName` | mDL (ACR1311U-N2, mdoc-only) |

**mDL namespace** `org.iso.18013.5.1` — v1 fields:

| Identifier | Purpose |
|---|---|
| `family_name` | Interop |
| `given_name` | Interop |
| `birth_date` | Interop |

Pre-tap consent uses this profile as the **disclosure ceiling**. Native code rejects any `DeviceRequest` element outside the approved list (fail closed).

### Credential prerequisite

- Holder must have claimed `mso_mdoc` for `DLTDrivingLicence` via OID4VCI (customer issuer).
- Bytes stored in native encrypted mdoc store keyed by `credentialId`.
- SD-JWT sibling credential is not required for v1.

### UI gating

- NFC button on credential detail when `hasStoredMdoc(credentialId)` and `isProximityPresentationSupported()`.
- `logicalCredentialGrouping` already pairs `org.iso.18013.5.1.mDL` with `Iso18013DriversLicenseCredential_mso_mdoc`.

## 5. Device Key and Signing

### One biometric prompt per action

1. User taps **NFC** on credential detail → navigates to `present.tsx`.
2. `PreTapConsentPanel` shows the three fields; user approves once.
3. On approve: arm session and **pre-authorize device authentication signing** (Keychain-gated `signProof` or native equivalent).
4. **No biometric prompt during APDU handling.**

### Device key decision (gate #2)

- **Preferred:** Ed25519 holder seed via existing `deviceAuth.ts` → `signProof`, if Multipaz accepts COSE Ed25519 device keys.
- **Fallback:** P-256 AndroidKeyStore device key separate from OID4VCI Ed25519 holder identity, if the engine requires it.
- Spike must record the chosen path before engine integration is treated as committed.

## 6. Native Module and Engine

### Current state (2026-07-16 baseline)

- `approvePresentation` bridge wired to `MdocProximityEngine`.
- ISO mdoc AID registered; `CompanionHostApduService` routes mdoc vs companion.
- `MdocApduHandler` + `StoredMdocPresentationEngine` scaffold present.
- Physical mDL interop **PASS** on A26 + ACR1311U-N2.
- **Open:** Multipaz-backed `processApdu` producing verifiable encrypted `DeviceResponse`; engagement QR exposure to JS; `presentationReady: true`.

### Multipaz spike verdict (2026-07-27)

- **Compile:** PASS — `org.multipaz:multipaz:0.100.0` + `org.multipaz:multipaz-compose:0.100.0`; `:expo-mdoc-proximity:compileDebugKotlin` succeeds.
- **API evidence:** `org.multipaz.mdoc.transport.NfcTransportMdoc.processCommandApdu`, `org.multipaz.compose.mdoc.MdocNfcDataTransferService` (AID `A0000002480400`).
- **Runtime / physical:** PENDING — A26 + ACR1311 Part G; `presentationReady` is true when Multipaz probe passes on device; E2E DeviceResponse still requires Part G.
- **Integration:** `MultipazPresentmentSession` builds QR engagement + runs `Iso18013Presentment`; APDUs delegate to `NfcTransportMdoc.processCommandApdu`. Pre-tap device auth via `installMdocDeviceKey` (one Keychain unlock at arm).


1. Add Multipaz Android dependency to `expo-mdoc-proximity`.
2. Adapter: load `mso_mdoc` bytes from native encrypted store by `credentialId`.
3. Delegate `processApdu()` to Multipaz session — no hand-rolled CBOR/COSE.
4. Pre-tap native device-auth signing callback (no JS round-trip during APDU).
5. Record verdict in this spec. On failure: stop integration, update ADR 0006, choose alternate engine.

### Phase 2 — Native wiring

| Component | v1 change |
|---|---|
| HCE service | mdoc-only arm: companion handler inactive when `sharingMode === 'mdoc-only'` |
| `MdocProximityEngine` | Multipaz lifecycle; set `presentationReady: true` when ready |
| `armProximitySession` | Pass `approvedMdocFields` + `profileId: 'mdl-acr1311u-n2-mdoc-only'` |
| Engagement QR | Native exposes `deviceEngagementUri` for `WaitingForTapPanel` |
| Buffers | Clear on complete, cancel, timeout, disconnect |

### Fail-closed rules

- Unarmed tap → no credential data (`6A82` / no response).
- Screen off → no response (`requireDeviceScreenOn="true"`).
- Requested field outside approved ceiling → native reject.
- Companion AID not served in mdoc-only mode.

### Arm window

Configurable via `EXPO_PUBLIC_HCE_ARM_WINDOW_MS` (default `60000` ms per `dualFormatPolicy.ts`).

## 7. Physical Validation (Part G)

Extend [`2026-07-13-a26-acr1311-hardware-validation.md`](../plans/2026-07-13-a26-acr1311-hardware-validation.md) with **Part G — mDL mdoc-only v1**:

1. Claim mDL `mso_mdoc` from customer issuer (`issuer.zenithcomp.co.th:455`).
2. Wallet: Credential Detail → NFC → consent (3 fields) → arm.
3. Host: scan engagement QR from `WaitingForTapPanel`.
4. Tap A26 to ACR1311U-N2.
5. Reader sends `DeviceRequest` for `family_name`, `given_name`, `birth_date`.
6. Verify encrypted `DeviceResponse`, issuer COSE signature, and device authentication.
7. Record PASS/FAIL in `docs/TASKS.md` (build id, Android version, reader firmware).

**Issuer trust (reader/host):** validation requires the customer issuer IACA root (or VICAL import) on the reader/host side. This is outside wallet code but must be documented in the runbook.

Host tool: extend `tools/acr1311u-n2/` with ISO mdoc AID `A0000002480400` steps (separate from companion SELECT).

## 8. Error Handling

| Situation | User-facing message | Log tag |
|---|---|---|
| NFC off / unsupported | Enable NFC in Settings | `[proximity-nfc]` |
| No mdoc stored | Credential not available for NFC | `[proximity-storage]` |
| Arm window expired | Session expired — try again | `[proximity-arm]` |
| Reader disconnect | Connection lost — try again | `[proximity-session]` |
| Out-of-policy request | Presentation failed — try again | `[proximity-policy]` |
| Engine / crypto failure | Presentation failed — try again | `[proximity-engine]` |
| Screen off during tap | (no HCE response; user retries) | `[proximity-hce]` |

Every caught error emits a raw diagnostic log before mapping to generic UI text. Never log claim values, mdoc bytes, engagement payloads, session keys, or COSE material through the wallet logger.

## 9. Security

- **One biometric prompt** at pre-tap consent only.
- **Consent ceiling** enforced natively on `approvedMdocFields`.
- **Buffer hygiene:** clear session, APDU, and engagement state after every session end path.
- **Screen-on gate** for HCE responses.
- **No mdoc bytes in JS memory** for presentation — native encrypted store only.
- **`__DEV__` only** for raw protocol payload inspection when explicitly needed.

## 10. Testing

### Repository

- `readerProfiles` — mDL profile resolves three field keys; `mdoc-only` has no companion.
- `proximityArmSession` — mdoc-only does not require companion payload bytes.
- `proximityArmPolicy` — payload size gates.
- Proximity event / arm sequence tests with native module mocks.
- `yarn tsc --noEmit`, `yarn lint`, focused proximity test suite.

### Physical (required for v1 completion)

- Part G checklist PASS on A26 + ACR1311U-N2.
- Negative: unarmed tap yields no data.
- Negative: out-of-ceiling `DeviceRequest` rejected.
- Results recorded in `docs/TASKS.md`.

## 11. Acceptance Criteria

v1 is complete only when all of the following are true:

1. Holder can claim mDL `mso_mdoc` from the customer issuer.
2. Credential detail shows NFC when stored mdoc exists and proximity is supported.
3. End-to-end UX: consent → engagement QR → tap → success (or recoverable error) panel.
4. Reader receives encrypted `DeviceResponse` containing `family_name`, `given_name`, `birth_date`.
5. Reader/host verifies issuer MSO signature and device authentication.
6. `getAvailability().presentationReady === true` on A26 dev build.
7. Multipaz spike verdict documented in this spec (or ADR 0006 updated on failure).
8. Repository verification commands pass.
9. Part G physical results recorded in `docs/TASKS.md`.

## 12. Follow-Up Slices (Post-v1)

- Dual-format single-tap (mdoc + companion SD-JWT).
- Expand reader profile to customer-required field set.
- ADR 0006 final native module selection record after sustained physical validation.
- iOS BLE engagement path (if product requires iOS proximity).

## 13. Implementation Order

```text
Multipaz spike (engine gate #2)
  → native wiring + presentationReady
  → mDL reader profile + UX (Section 4–5)
  → Part G ACR1311 validation
  → TASKS.md update + ADR 0006 record
```

Dual-format and companion work must not start until mdoc-only v1 meets Section 11 acceptance criteria.
