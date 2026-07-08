# Android HCE Dual-Format Presentation Design

Status: Approved (rev 4 — 2026-07-06; design-level approval. Implementation of dual-format NFC additionally gated on the ETDA companion APDU spec and the EdDSA interop test pass.)
Date: 2026-07-03 (rev 4: 2026-07-06)

## Relationship To Prior Specs

This spec **amends** [`2026-06-23-nfc-proximity-design.md`](./2026-06-23-nfc-proximity-design.md) (Approved) on the offline transport decision:

- Prior spec: NFC device engagement → BLE data transfer.
- This spec: full ISO 18013-5 NFC data retrieval — ISO 7816-4 APDUs over Android HCE, no BLE data leg on the phone. The ACR1311U-N2 talks NFC to the phone; its Bluetooth link is reader↔host only and invisible to the Wallet.
- Rationale: the validation target reader consumes mDOC over the NFC retrieval stack directly; a phone-side BLE server adds permissions, pairing UX, and a second transport stack with no reader requirement behind it.
- Everything in the prior spec not about the BLE data leg (QR engagement reuse, error UX, mDOC library criteria via ADR 0006) remains in force. The prior spec's BLE transfer mode is retired for v1, not redesigned.

## 1. Summary

The Wallet must support ETDA dual-format credential issuance and presentation:

- `dc+sd-jwt` for JSON / SD-JWT VC usage.
- `mso_mdoc` for ISO 18013-5 mDOC usage.

For online presentation, Wallet uses OpenID4VP 1.0 and can return both formats in one `vp_token` transaction when the Verifier requests both through DCQL.

For offline NFC presentation, Wallet uses Android HCE and ISO 18013-5 mDOC as the normative proximity credential exchange. ETDA also requires a JSON companion payload in the same reader session. This JSON companion payload is an ETDA extension, not ISO 18013-5 compliance.

The primary reader validation target is the ACR1311U-N2 Secure Bluetooth NFC Reader USB. The phone brand is not fixed; any Android 10+ device with NFC and HCE support may be supported. The first acceptance target is the available physical Android device paired with ACR1311U-N2.

## 2. Standards Boundary

### OID4VCI 1.0 Issuance

The Issuer should offer both formats for the same logical document using multiple credential configuration IDs:

```json
{
  "credential_configuration_ids": [
    "TranscriptCredential_dc+sd-jwt",
    "TranscriptCredential_mso_mdoc"
  ]
}
```

Wallet must treat each format as a separate credential request because OID4VCI requires multiple Credential Endpoint requests for differing Credential Formats or Credential Datasets. The same pre-authorized code may authorize the offered configurations if the Issuer policy allows it.

The QR or `credential_offer_uri` does not contain holder claims such as name, surname, or transcript data. It contains the Issuer URL, offered credential configuration IDs, and authorization material. The Issuer resolves the actual claims from issuer-side state keyed by the pre-authorized code, subject, issuer session, or equivalent server-side correlation.

### OID4VP 1.0 Online Presentation

OpenID4VP supports multiple credential formats in one transaction. ETDA Verifiers may request both:

- `mso_mdoc`
- `dc+sd-jwt`

Wallet must return both when both are requested, available, and approved by the holder. If one required format is missing, Wallet must fail the matching request rather than silently sending only one format.

### ISO 18013-5 Offline Presentation

The ISO 18013-5-compliant payload is the mDOC `DeviceResponse`.

The JSON companion payload required by ETDA is not part of ISO 18013-5. It must be implemented as an ETDA reader extension and clearly documented as such. Generic ISO 18013-5 readers should still be able to receive mDOC without depending on the ETDA JSON companion.

## 3. Device And Reader Requirements

- Android 10+ technical floor.
- Device must support NFC and Android HCE.
- Android HCE service must set `android:requireDeviceScreenOn="true"`.
- Wallet must not respond to HCE while the screen is off.
- Phone brand is not a product requirement.
- ACR1311U-N2 Secure Bluetooth NFC Reader USB is the primary reader interoperability target.
- Higher and lower Android models are secondary compatibility targets after the primary reader flow works.
- iOS HCE is out of scope.
- NFC NDEF issuance/tag reading is separate from this design.

## 4. Data Model

Wallet must store each issued format as a separate physical format record while linking them under one logical credential.

Recommended model:

```ts
type LogicalCredential = {
  logicalCredentialId: string
  issuer: string
  documentType: string
  subjectId?: string
  documentId?: string
  formats: {
    "dc+sd-jwt"?: CredentialFormatRecord
    "mso_mdoc"?: CredentialFormatRecord
  }
  consistencyStatus: "verified" | "warning" | "mismatch"
  warnings: string[]
}

type CredentialFormatRecord = {
  format: "dc+sd-jwt" | "mso_mdoc"
  credentialConfigurationId: string
  rawCredentialRef: string
  issuedAt?: string
  expiresAt?: string
  holderBindingRef?: string
}
```

### Linkage Key

Wallet must link records using `logicalCredentialId`.

Preferred source order:

1. Issuer-provided stable logical ID, such as `logical_credential_id`, `credential_id`, `document_id`, or transcript ID, when present in both formats.
2. Derived key from stable shared fields: `(issuer, canonical document type, subject ID, document ID)`.
3. Manual/unlinked warning state when stable shared identifiers are unavailable.

Wallet must not use a full claim hash as the primary linkage key. SD-JWT selective disclosure, mDOC namespace differences, encoding differences, and format-specific claim names make full claim hashes unstable.

Presentation matching must require both requested formats to share the same `logicalCredentialId`.

### Migration From Current Model

Current storage: flat `VerifiableCredentialRecord` (one `id`, one `rawVc`, JWT/SD-JWT) in encrypted MMKV, with mDOC bytes stored separately in `mdocStorage` keyed by `credentialId`. Migration rules:

- `LogicalCredential` is a **linking layer over**, not a replacement of, `VerifiableCredentialRecord`. Existing records keep their `id`; `CredentialFormatRecord.rawCredentialRef` points at the existing record `id` (for `dc+sd-jwt`) or the `mdocStorage` key (for `mso_mdoc`).
- For single-format credentials issued before dual-format support, `logicalCredentialId = record.id` and the `formats` map has one entry. No data rewrite is required at upgrade; linking metadata is written lazily on first dual-format claim or on read.
- **UI, home list, expiry watch, renewal, lifecycle/suspension, and notifications continue to key off the `dc+sd-jwt` `VerifiableCredentialRecord.id`** in v1. The logical layer only affects presentation matching and dual-format status display. Migrating those services to logical IDs is a separate later slice.
- **Backend sync unchanged in v1**: `syncCredentialToBackend` continues sending the JWT/SD-JWT format only. mDOC records are not synced until a backend contract for them exists.
- Deleting/revoking a logical credential applies the lifecycle action to all linked format records; a dangling single format reverts to the partial-issuance state (Section 6).
- **Renewal in v1 stays SD-JWT-only** through the existing `credentialRenewalService` / renewal overlay UX; renewing the mDOC format (and the paired-refresh policy in Section 5) is a later slice, tracked when dual-format issuance lands.

## 5. Cross-Format Consistency

After claiming both formats, Wallet must validate that they describe the same logical document.

Core consistency fields:

- Issuer.
- Credential format configuration family, for example `TranscriptCredential`.
- Subject ID or equivalent holder/person reference.
- Document ID, transcript ID, card number, or equivalent document reference.
- Document type.
- Holder binding key reference, where applicable.
- Issued-at timestamp.
- Expiry timestamp, where available.

### Holder Binding Consistency

Both formats must be holder-bound and verified at claim time:

- The SD-JWT VC `cnf` key and the mDOC MSO device key must each be verified as keys the Wallet controls.
- Key decision: the mDOC device key is the **same Ed25519 Keychain-protected seed** as the existing holder identity key (OID4VCI PoP, OID4VP KB-JWT, SD-JWT `cnf`) — one key, one lifecycle, not merely the same policy. Accepted tradeoff: a compromise of this seed affects both online and offline presentation; mitigated by the existing Keychain protection and sign-time gate. If separation is later required, the P-256 fallback below already defines the split.
- Key type rationale: the mDOC device key uses **EdDSA (Ed25519)**, matching the Wallet's existing holder identity key model. ISO 18013-5 cipher suite 1 permits EdDSA (Ed25519/Ed448) for device authentication via `deviceSignature`; session encryption is unaffected because it uses separate ephemeral ECDH keys. This keeps one holder key model across `dc+sd-jwt` and `mso_mdoc` and one key lifecycle.
- Known tradeoffs of EdDSA here: (1) many deployed reader/verifier stacks implement only P-256 ECDSA device auth — EdDSA acceptance by the Issuer and the ACR1311U-N2 verifier stack must be validated in the first interoperability test pass; (2) AndroidKeyStore cannot generate hardware-backed Ed25519 keys, so the device key remains a Keychain-protected software key (same posture as the existing holder identity seed).
- Fallback: if the Issuer or target reader stack rejects EdDSA device authentication, switch to a separate P-256 device key generated in AndroidKeyStore (hardware-backed where available), recorded in `holderBindingRef`. This is a contained change: only mDOC device-key generation and MSO binding move; SD-JWT holder binding is untouched.
- If either format fails holder-binding verification, treat it as a claim failure for that format (partial issuance), not a warning.

Policy:

- If core identifiers differ, Wallet must not link the records automatically.
- If issue timestamps differ beyond the configured threshold, Wallet may link them but must set `consistencyStatus = "warning"`.
- If expiry timestamps differ unexpectedly, Wallet must set a warning unless ETDA or the Issuer profile explicitly allows different expiry per format.
- If one format is reissued later, Wallet must either refresh the paired format or mark the logical credential as partially updated.

Initial timestamp threshold: 5 minutes unless ETDA defines a stricter value. Per the project configurable-duration rule, this must be read from `EXPO_PUBLIC_DUAL_FORMAT_ISSUE_SKEW_MS` (`Number(process.env.EXPO_PUBLIC_DUAL_FORMAT_ISSUE_SKEW_MS) || 300000`) and documented in `.env.example` (unit: ms, default 300000, effect: max allowed issued-at skew between paired formats before `consistencyStatus = "warning"`).

## 6. Issuance Flow

1. Wallet resolves `credential_offer` or `credential_offer_uri`.
2. Wallet fetches Issuer metadata.
3. Wallet finds all offered configurations relevant to the same logical document. Grouping rule: configuration IDs sharing the same family prefix with format suffixes `_dc+sd-jwt` / `_mso_mdoc` (e.g. `TranscriptCredential_dc+sd-jwt` + `TranscriptCredential_mso_mdoc`) are one logical document; if the Issuer metadata provides an explicit grouping field (e.g. `logical_credential_id` per configuration), that field wins over the naming convention.
4. Wallet exchanges the pre-authorized code for an access token.
5. Wallet sends one Credential Endpoint request for `dc+sd-jwt`.
6. Wallet sends one Credential Endpoint request for `mso_mdoc`.
7. Wallet stores both format records.
8. Wallet derives or reads `logicalCredentialId`.
9. Wallet runs cross-format consistency validation.
10. Wallet shows one credential in the UI, with format availability tracked internally.

### Proof Signing And The One-Prompt Rule

Two Credential Endpoint requests require two key-proof signatures (one JWT/COSE proof per format). Claiming a dual-format offer is one user action, so it must trigger at most one biometric/device-auth event. The Wallet must perform both proof signs inside a single authentication session: authenticate once, then execute both sign calls within the Keychain auth-validity window. If the platform cannot hold an auth session across both signs, the Wallet must sign both proofs back-to-back immediately after the single prompt rather than prompting per request.

### Partial Issuance And Retry

If one format succeeds and the other fails, Wallet must not present the document as fully dual-format. It must show a recoverable partial-issuance state.

- Retry of the missing format is possible only while the access token (or a refresh token) remains valid; pre-authorized codes are single-use and must not be replayed.
- If the token has expired and the Issuer supports re-offer, Wallet prompts the user to re-scan/receive a new offer for the missing format.
- If the Issuer supports neither retry nor re-offer, Wallet marks the logical credential permanently partial, disables flows that require the missing format (e.g. dual-format NFC mode when `mso_mdoc` is absent), and states this in the credential detail UI.

## 7. Online Presentation Flow

Online presentation uses OpenID4VP 1.0.

When a DCQL request asks for both `mso_mdoc` and `dc+sd-jwt`:

1. Wallet resolves the request.
2. Wallet matches candidate credentials by format and `logicalCredentialId`.
3. Wallet shows one consent screen for the logical credential.
4. Consent UI groups requested disclosures by format:
   - mDOC fields.
   - JSON / SD-JWT fields.
5. User approves or rejects once.
6. Wallet performs the required signing/authentication sequence.
7. Wallet submits both presentations in the `vp_token` response.

Wallet must not show two separate approval prompts for the same logical credential in the same Verifier request.

If the Verifier marks both formats as required and one is unavailable, Wallet must fail the request. If the Verifier expresses alternatives, Wallet may choose the option that minimizes disclosure and satisfies the request.

## 8. Offline NFC HCE Flow

Offline NFC presentation uses Android HCE with `requireDeviceScreenOn=true`.

### Consent-First Ordering

Consent happens before the tap, not inside the live APDU session. NFC readers time out within seconds; holder review of requested disclosures takes tens of seconds. The primary flow is:

1. User opens the presentation screen (extends the existing `ProximityPresentButton` flow), reviews the sharing mode (mDOC-only or ETDA dual-format) and the disclosure set, and approves.
2. Approval arms the HCE service for a bounded window (`EXPO_PUBLIC_HCE_ARM_WINDOW_MS`, default 60000 ms, documented in `.env.example`).
3. User taps the reader; the armed session serves the approved disclosure set without further UI blocking the APDU exchange.
4. If the reader requests fields outside the approved set, the Wallet returns an ISO 18013-5 error status and ends the session — it never silently widens consent.

In-session consent (approve while the reader waits) is not supported in v1. The `awaiting-consent` state below therefore occurs before `hce-ready`, not between APDUs. This also removes any need for the HCE service to launch activities from the background (restricted on Android 10+): the app is always foreground when a session starts.

### Pre-Tap Request Resolution

ISO 18013-5 delivers the reader's `DeviceRequest` only after session establishment (post-tap), so the pre-tap consent screen needs a defined source for the disclosure set the user approves. v1 normative behavior:

- **v1 source: fixed ETDA reader profile.** The Wallet ships a per-document-type ETDA request profile (field list per `docType`/namespace, plus companion field list for dual-format mode) matching the locked ACR1311U-N2 request template. The consent screen renders this profile; approval covers exactly these fields.
- The profile lives in config (`src/config/`), not hardcoded in components, so ETDA template changes are config edits.
- Post-tap enforcement is unchanged: the actual decrypted `DeviceRequest` is checked against the approved set. A request for any field outside the approved profile ends the session with an ISO 18013-5 error status (Section 8 rule 4). A request for a **subset** of the approved profile is served with only the requested fields — approval is a ceiling, not a floor.
- **Not in v1:** scanning a reader-engagement QR to obtain the request pre-tap (adds a sub-flow; revisit if ETDA readers stop using a fixed template), and blanket "approve all stored fields" consent (over-broad disclosure).
- If ETDA later deploys variable request templates, this subsection must be revised before that deployment; the profile-mismatch error path above fails safe in the meantime.

### ISO 18013-5 Session Layer

The mDOC exchange must implement the full ISO 18013-5 NFC data retrieval stack, not raw application payloads:

- **Device engagement**: QR engagement (reuse existing flow) or NFC negotiated handover. Engagement carries the Wallet's ephemeral session public key (`EDeviceKey`).
- **Session establishment**: reader sends `SessionEstablishment` with its ephemeral key (`EReaderKey`); both sides derive session keys (ECDH P-256 + HKDF per ISO 18013-5 clause 9); all subsequent request/response payloads travel as encrypted `SessionData`.
- **Transport**: ISO 7816-4 APDUs over HCE — `SELECT AID` (mDOC AID `A0000002480400`), `ENVELOPE` command chaining for requests, response chaining via `GET RESPONSE` / status `61XX`. Extended-length APDUs must be used when the reader and phone support them; command chaining is the fallback.
- **Primary payload**: encrypted `DeviceResponse` (CBOR), with `DeviceSigned` authentication by the mDOC device key.

Generic ISO 18013-5 readers must be able to complete this flow with no ETDA extension present.

### ETDA JSON Companion Transport

The companion is not part of ISO 18013-5 and must not alter the mDOC exchange. Transport:

- The companion is served under a **separate ETDA proprietary AID**, selected by the reader after the ISO 18013-5 session completes. Readers that never select the ETDA AID get standard mDOC behavior only.
- Dual-format mode is negotiated explicitly: the reader selects the ETDA AID and issues an ETDA `GET CAPABILITIES` command; the Wallet answers with supported modes. No heuristic detection.
- Companion payload content is the **SD-JWT VC presentation** (SD-JWT + selected disclosures + KB-JWT bound to a session nonce supplied by the reader in the ETDA request), not unsigned JSON. An unsigned JSON blob would be unverifiable and is prohibited.
- Companion transfer reuses the same APDU chaining rules (ENVELOPE / GET RESPONSE) under the ETDA AID.
- Exact ETDA APDU command set (CLA/INS values, capability format, nonce format) is pinned in [`etda-nfc-companion-apdu.md`](./etda-nfc-companion-apdu.md); Wallet constants live in `src/config/etdaCompanionApdu.ts`.

### Payload Size Budget

NFC APDU throughput is on the order of a few KB/s. Budget:

- Combined mDOC `DeviceResponse` + companion payload target ≤ 32 KB; hard cap `EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES` (default 65536, documented in `.env.example`).
- Over-cap presentations fail fast at arm time (before the tap) with a clear size-limit error, never mid-transfer.
- Large-transcript documents that exceed the cap are out of scope for NFC v1 and must use online OID4VP.

Default sharing policy is all-or-nothing for ETDA dual-format presentation:

- If the reader requests ETDA dual-format mode, user approval covers both mDOC and JSON companion.
- If the user rejects the JSON companion, Wallet rejects the whole ETDA dual-format session.
- mDOC-only fallback is allowed only when the reader explicitly runs in mDOC-only mode.

## 9. HCE State Machine

Required states (consent-first ordering per Section 8):

- `idle`
- `awaiting-consent`
- `approved`
- `hce-armed`
- `reader-selected`
- `session-established`
- `request-received`
- `transmitting-mdoc`
- `transmitting-json-companion`
- `complete`
- `cancelled`
- `error`

State rules:

- `idle` to `awaiting-consent`: User opens the presentation screen; Wallet displays sharing mode and requested/offered disclosures.
- `awaiting-consent` to `approved`: User approves once. Any required signing-time Keychain gate fires here (see Section 10).
- `approved` to `hce-armed`: Wallet enables the HCE presentation service with the approved disclosure set and starts the arm-window timer; device engagement material (ephemeral `EDeviceKey`, QR or NFC handover) is generated.
- `hce-armed` to `reader-selected`: ACR1311U-N2 or another reader selects the Wallet mDOC AID.
- `reader-selected` to `session-established`: Reader delivers `SessionEstablishment`; Wallet derives session keys and validates session encryption.
- `session-established` to `request-received`: Wallet decrypts the ISO 18013-5 device request and checks it against the approved disclosure set. Out-of-scope fields end the session with an error status.
- `request-received` to `transmitting-mdoc`: Wallet builds and sends the encrypted mDOC `DeviceResponse`.
- `transmitting-mdoc` to `transmitting-json-companion`: Reader selects the ETDA AID and negotiates dual-format mode; Wallet sends the SD-JWT companion presentation.
- `transmitting-mdoc` to `complete`: mDOC-only mode — reader ends the session without selecting the ETDA AID.
- `transmitting-json-companion` to `complete`: Reader acknowledges final receipt.
- `hce-armed` to `cancelled`: Arm-window timeout expires with no reader, or user cancels.
- Any active state to `cancelled`: User cancels, denies, or the session is explicitly stopped.
- Any active state to `error`: Reader disconnect, session-encryption failure, protocol failure, timeout, unsupported request, or signing failure.

Edge cases:

- Reader tap before approval is impossible by construction (HCE not armed until `approved`); an unarmed tap gets no Wallet AID response.
- Reader disconnect after approval but before transmission completes: show recoverable failure; do not mark presentation successful.
- Bluetooth latency/drop from ACR1311U-N2 is a normal recoverable failure.
- Screen timeout during consent must cancel or pause the session. Wallet must not continue sharing after the screen turns off.
- If `requireDeviceScreenOn=true` prevents HCE response, this is expected behavior, not an error.
- Session data, APDU buffers, BLE buffers, and companion payload buffers must be cleared after completion, cancellation, or error.

## 10. Consent And Authentication

One holder action should cover one logical presentation. For offline NFC, that action is the pre-tap approval (Section 8 consent-first ordering); the tap itself requires no further prompt within the arm window.

Consent UI must show:

- Verifier/reader identity when available. In the v1 fixed-profile flow no reader identity exists before the tap; the consent screen shows the ETDA request profile name and document type instead.
- Requested mDOC fields.
- Requested JSON / SD-JWT companion fields.
- Whether the reader is using mDOC-only mode or ETDA dual-format mode.
- Clear Allow and Deny actions.

Authentication must follow the Wallet security rule: one biometric/device-auth event per user action. If the presentation requires a signing call that already triggers Keychain/device authentication, Wallet must not add a separate biometric prompt in front of it for the same action.

## 11. ACR1311U-N2 Interoperability Test Matrix

Required physical-device tests:

- HCE service activates with screen on.
- HCE service does not respond with screen off.
- Reader can select the Wallet HCE AID.
- APDU command/response timing stays within reader tolerance.
- APDU max length and chaining behavior work for expected request and response sizes.
- Bluetooth pairing persists after Wallet app restart.
- Bluetooth pairing persists after phone reboot, where OS policy allows it.
- Bluetooth pairing persists after reader reboot.
- Unarmed tap (no prior approval) gets no Wallet AID response and shares nothing.
- Reader disconnect during mDOC transmission shows recoverable failure.
- Reader disconnect during JSON companion transmission shows recoverable failure.
- Arm-window expiry without a tap disarms HCE cleanly and offers re-arm.
- Screen timeout while armed cancels the armed session; no HCE response after screen off.
- EdDSA device authentication accepted end-to-end: reader/verifier stack validates an Ed25519 `deviceSignature` in `DeviceResponse` (run this first — gates the key-type decision in Section 5).
- ISO 18013-5 session establishment succeeds: session keys derived, request/response encrypted as `SessionData`.
- Tampered or missing `SessionEstablishment` ends the session with an error; nothing is shared unencrypted.
- Reader request for fields outside the approved disclosure set is refused with an error status.
- Reader request for a subset of the approved disclosure set succeeds and returns only the requested fields.
- mDOC-only reader mode succeeds without JSON companion.
- ETDA dual-format reader mode succeeds with mDOC plus JSON companion.
- Large transcript payload succeeds or fails with a clear size-limit error.
- Retry after failed session starts from clean state.
- Repeated presentations do not leak stale payloads between sessions.

## 12. Logging And Privacy

Logs may include:

- Format names.
- Credential configuration IDs.
- Logical credential ID hash or redacted suffix.
- Reader mode.
- State transitions.
- Payload byte lengths.
- Error codes.

Logs must not include:

- Raw VC, VP, SD-JWT, mDOC CBOR, DeviceResponse, APDU payloads, JSON companion payloads, tokens, private keys, seeds, holder claims, or PII.

## 13. Implementation Stack

Expo SDK 54 (Hermes, prebuild/dev-build) constraints:

- **HCE service**: native Kotlin `HostApduService` delivered via an Expo config plugin (custom local module under `modules/` or equivalent). No pure-JS HCE exists; `react-native-hce` may be used as a starting point but must be evaluated for extended-length APDU and multi-AID support before adoption (per the no-unvalidated-dependencies rule).
- **mDOC / ISO 18013-5 engine**: prefer an audited library over hand-rolled CBOR/COSE/session-encryption. Multipaz (Google `identity-credential` successor, Kotlin) is the **leading candidate, not a final decision** — ADR 0006 defers module selection until physical-device testing; a follow-up ADR records the pick after the first interop pass. Hand-rolling clause 9 session crypto is the fallback only if library integration is infeasible, and requires security review.
- **Key storage**: mDOC device key is Ed25519 (EdDSA), Keychain-protected seed signed via `@noble/ed25519`, same model as the existing holder identity key; referenced by `holderBindingRef`. Fallback to a P-256 AndroidKeyStore device key only if Issuer/reader EdDSA validation fails (see Section 5). Session-encryption ephemeral ECDH keys are generated per session by the mDOC engine and are independent of the device key.
- **JS ↔ native boundary**: JS layer owns consent, credential selection, and state display; native layer owns APDU handling, session crypto, and buffers. Credential material crosses the boundary once at arm time; buffers are cleared native-side per Section 9.
- Follow `https://docs.expo.dev/versions/v54.0.0/` before native integration changes; install native packages with `npx expo install`.

## 14. Acceptance Criteria

- Wallet can claim both `dc+sd-jwt` and `mso_mdoc` for the same logical document from an OID4VCI offer containing both configurations.
- Wallet links both formats under one `logicalCredentialId`.
- Wallet detects and flags cross-format mismatch conditions.
- Online OID4VP can return both `mso_mdoc` and `dc+sd-jwt` in one approved transaction when requested. (Net-new work: current `presentationService` matches and submits a single credential per request; multi-format `vp_token` assembly is not an extension of the existing path.)
- Offline ACR1311U-N2 flow completes the full ISO 18013-5 session (engagement, session encryption, encrypted `DeviceResponse`) and, in ETDA mode, delivers the signed SD-JWT companion presentation under the ETDA AID.
- Claiming a dual-format offer triggers exactly one biometric/device-auth event despite two proof signs.
- User sees one consent screen for dual-format sharing, before the tap; unarmed taps share nothing.
- HCE does not respond when the device screen is off.
- Reader disconnects, Bluetooth drops, timeouts, and screen timeout are handled without silent data sharing.
- Payloads over the configured NFC size cap fail at arm time with a clear error.

## 15. Out Of Scope

- iOS HCE.
- Generic BLE verifier application design outside the ACR1311U-N2 integration target.
- NFC NDEF issuance/tag reading.
- Claim-level UI redesign unrelated to dual-format consent.

## 16. Extension Model (Prototype Platform)

Wallet core stays standards-first (OID4VCI, OID4VP, ISO 18013-5 mDOC). Proprietary reader and verifier ecosystems extend via registries:

- **Reader profiles** (`src/config/readerProfiles.ts`): per-vendor offline disclosure templates keyed by `vendorId` + `profileId`.
- **Companion transport plugins** (`src/services/proximity/companionTransport/`): proprietary second-leg NFC protocols (ETDA v1 is the reference plugin `etda-companion-v1`).
- **Presentation token builders** (`src/services/vp/presentationTokenBuilders/`): verifier-specific `vp_token` assembly beyond standard DCQL / Presentation Exchange.

Third parties add a reader profile + optional companion plugin and/or presentation builder without modifying wallet core flows.
