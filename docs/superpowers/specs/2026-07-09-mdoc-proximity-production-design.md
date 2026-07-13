# mDOC Proximity Production Design

Status: Draft for review
Date: 2026-07-09

## Relationship To Prior Specs

This spec narrows the implementation plan for `modules/expo-mdoc-proximity`
from the approved Android HCE dual-format design:

- Parent design: [`2026-07-03-android-hce-dual-format-presentation-design.md`](./2026-07-03-android-hce-dual-format-presentation-design.md)
- Companion APDU wire profile: [`nfc-companion-apdu.md`](./nfc-companion-apdu.md)

It does not replace the dual-format issuance, logical-credential linking, or
online OID4VP design. It focuses only on the production native module and
ACR1311U-N2 validation path.

## 1. Summary

`modules/expo-mdoc-proximity` is required for the production Android NFC
presentation path. React Native JavaScript cannot register an Android
`HostApduService`, cannot reliably service APDU timing, and should not own the
ISO 18013-5 session-crypto state machine.

The module's production role is to bridge the Expo wallet to native Android HCE
and a standards-capable mdoc engine. The wallet UI remains in React Native; the
NFC card-emulation, APDU routing, ISO 18013-5 session handling, native buffers,
and reader interop behavior live inside the native module.

The first production target is dual-format NFC presentation on Samsung A26 with
the ACR1311U-N2 reader:

1. Standard ISO 18013-5 mdoc presentation over Android HCE.
2. A companion SD-JWT presentation over the existing companion APDU extension
   after the mdoc exchange succeeds.

This is not an NDEF tag-reading feature and is not covered by
`react-native-nfc-manager`.

## 2. Current State

The current module is a scaffold, not a production ISO 18013-5 implementation.

- `ExpoMdocProximityModule` exposes the JS bridge and encrypted native mdoc
  storage.
- `MdocProximityEngine.startProximityPresentation()` validates NFC/storage and
  reads stored bytes, but does not establish an ISO 18013-5 session.
- `getAvailability()` reports `presentationReady: false`.
- The HCE service currently covers the companion AID path, not the standard ISO
  mdoc AID.
- The companion APDU handler supports capability and companion transfer
  primitives, but that does not make the wallet ISO 18013-5 compliant.
- `tools/acr1311u-n2/companion_probe.ts` is a stub and cannot validate the full
  production reader flow.

## 3. Production Architecture

The production architecture is:

```text
React Native wallet UI
  -> src/services/proximity/*
  -> ExpoMdocProximity native module
  -> Android HostApduService
  -> mdoc engine
  -> Android NFC controller
  -> ACR1311U-N2 reader
```

Responsibilities:

- React Native owns credential selection, consent, selected reader profile,
  arm-window display, and presentation result UI.
- `src/services/proximity/*` owns wallet-facing orchestration and redacted app
  logging.
- `modules/expo-mdoc-proximity` owns HCE registration, APDU dispatch, native
  session state, encrypted mdoc bytes, native buffers, and event delivery.
- The mdoc engine owns ISO 18013-5 mdoc parsing, session establishment,
  `DeviceRequest` processing, `DeviceResponse` generation, CBOR/COSE handling,
  and session encryption.
- The ACR1311 host tool owns repeatable physical validation from the reader
  side.

Use Multipaz first as the native mdoc engine. Its project documentation states
that the `multipaz` library supports ISO mdoc and ISO/IEC 18013-5 proximity
presentment. The module must not hand-roll ISO 18013-5 session crypto or
CBOR/COSE unless a documented Multipaz feasibility blocker is found.

**Feasibility gate #1 (run before any engine integration work): NFC data
retrieval.** ISO 18013-5's common deployment is NFC/QR engagement plus BLE data
transfer. This design needs the optional, less-implemented **NFC data
retrieval** path, because the ACR1311U-N2 is an NFC-only card reader (its
Bluetooth link is reader-to-host, not mdoc BLE). Multipaz's NFC *engagement*
support is documented; its NFC *data-transfer* support is the unverified
assumption in this spec. First implementation task is a time-boxed spike:
confirm Multipaz can serve the full mdoc exchange over NFC APDUs from an
Android HCE service. If it cannot, that is the documented feasibility blocker,
and the fallback decision (different engine vs. hand-rolled session layer vs.
BLE transfer with a different reader) must come back to this spec before
coding continues.

Reference sources:

- Multipaz: https://github.com/openwallet-foundation/multipaz
- Android HCE: https://developer.android.com/develop/connectivity/nfc/hce

## 4. Native Module Design

### 4.1 HCE Services And AIDs

The production HCE service must register:

- ISO mdoc AID: `A0000002480400`.
- Companion AID: existing deployed companion AID bytes, unchanged until a
  protocol version bump.

The module must keep `android:requireDeviceScreenOn="true"` for the HCE service.
Production behavior must not respond while the device screen is off.

The HCE service dispatches by selected AID:

- ISO mdoc AID -> mdoc session handler.
- Companion AID -> companion APDU handler.
- Unknown AID/INS -> fail closed with an appropriate status word.

### 4.2 Session Model

The wallet uses consent-first presentation:

1. User opens the presentation flow in the wallet.
2. Wallet shows the fixed reader profile for the selected credential and sharing
   mode.
3. User approves once.
4. JS arms the native module for a bounded time window.
5. User taps the ACR1311 reader.
6. Native HCE serves only the approved disclosure ceiling.
7. Native clears buffers on completion, cancellation, timeout, disconnect, or
   error.

In-session consent is out of scope for the production v1 NFC flow because APDU
reader timeouts are too short for interactive disclosure review.

### 4.3 mdoc Engine Integration

**Device engagement method.** The first production slice uses **QR engagement +
NFC data retrieval**. The reader obtains `DeviceEngagement`/EDeviceKey from a QR
shown by the wallet or supplied to the host harness before the NFC tap; the tap
carries the ISO mdoc data exchange.

NFC negotiated handover is a follow-up slice if the verifier requires a tap-only
engagement UX. It is intentionally out of the first production slice because it
adds a separate Type 4 tag/handover surface before the ISO mdoc APDU exchange.

The engagement QR reuses the wallet's existing QR-display components
(`react-native-qrcode-svg` and the established QR panel patterns from the My QR
flow) — do not build a second QR renderer for engagement.

The mdoc engine integration must support:

- Loading a stored `mso_mdoc` credential by credential ID.
- Building or exposing device engagement/session state required by the ISO
  18013-5 HCE exchange (per the engagement decision above).
- Decrypting and validating `DeviceRequest`.
- Rejecting any requested field outside the pre-approved profile.
- Building encrypted `DeviceResponse`.
- Producing mdoc device authentication without interactive signing during APDU
  handling. If Ed25519 device authentication needs the current Keychain-backed
  JS signer, the implementation must first provide a pre-tap/native signing
  capability equivalent to the companion signing requirement. If that is not
  possible, select the P-256 AndroidKeyStore fallback before engine integration
  work continues.
- Reporting requested and shared fields to JS without exposing claim values.
- Clearing native session material after each run.

If Multipaz requires a different storage model than the current encrypted native
file storage, the module should add a small native adapter. Do not move private
credential material into JavaScript memory to satisfy the library.

### 4.4 Companion APDU Integration

The companion path runs only after the standard mdoc flow succeeds and only when
the reader selects the companion AID. This ordering is **enforced natively, not
assumed**: the session holds an `mdocExchangeComplete` flag set by the mdoc
handler on successful `DeviceResponse` delivery, and the companion handler
rejects `SELECT`/`BEGIN COMPANION` with `6985` while the flag is unset. A reader
that jumps straight to the companion AID gets nothing.

The companion payload is the SD-JWT presentation with KB-JWT bound to the reader
nonce. The deployed companion `aud` value remains unchanged as a wire constant
until a protocol version bump.

**KB-JWT sign-at-tap timing (must be resolved, not deferred).** The reader nonce
arrives only in `BEGIN COMPANION`, so the KB-JWT cannot be fully pre-signed at
arm time. The current scaffold routes `onCompanionSignRequested` to JS, signs
via the Keychain-gated key, then calls `supplyCompanionPresentation`; that is a
JS round-trip plus potential Keychain latency while the reader is waiting on an
APDU. Required handling:

- The wallet must answer with `61XX`/busy-wait response chaining while the
  signature is being produced, and the ACR1311 host tool must tolerate that
  wait loop (bounded retries, not an immediate timeout).
- No biometric prompt may fire mid-tap. The single authentication event for the
  presentation must happen before the tap and must produce either a bounded
  native signing capability, a pre-authorized native signing path, or an
  already-prepared companion response model that does not need interactive
  authentication during APDU handling. If the current Keychain-backed JS signer
  cannot provide that, companion signing must move into a native pre-tap design
  or the companion leg must be removed from the production slice before coding
  continues.
- Measure sign latency on the Samsung A26 during the physical test matrix and
  record it next to the reader timeout budget.

The companion handler must enforce:

- Armed session exists and has not expired.
- Requested profile matches the armed profile.
- Requested mode is allowed by the armed sharing mode.
- Payload size is within the configured cap.
- Chained responses are deterministic and clear buffers when done.

### 4.5 JS API

Keep the JS API high-level. It should not expose APDU frames or ISO session
internals.

Required methods:

```ts
type ProximityAvailability = {
  platform: string
  sdkInt?: number
  nfcSupported: boolean
  nfcEnabled: boolean
  presentationReady: boolean
  mdocEngine?: 'multipaz'
}

type ProximityArmConfig = {
  credentialId: string
  sharingMode: 'mdoc-only' | 'dual-format'
  profileId: string
  approvedMdocFields: string[]
  companionTransportPluginId?: string
  companionSdJwt?: string
  armWindowMs: number
  payloadMaxBytes: number
}
```

Per the repository configurable-durations rule, `armWindowMs` and
`payloadMaxBytes` defaults are env-driven via the existing
`src/config/dualFormatPolicy.ts` values: `EXPO_PUBLIC_HCE_ARM_WINDOW_MS`
(default 60_000) and `EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES` (default 65_536). Do
not introduce new env vars for these; JS callers pass the resolved values in
`ProximityArmConfig` (as `proximityArmSession.ts` already does).

Methods:

- `getAvailability()`
- `storeMdoc(credentialId, docType, mdocBytes)`
- `hasMdoc(credentialId)`
- `readMdoc(credentialId)` for app-side diagnostics and existing VP token entry
  behavior only; avoid using it in the NFC live path.
- `deleteMdoc(credentialId)`
- `armProximitySession(config)`
- `supplyCompanionPresentation(presentation)`
- `stopProximityPresentation()`

The legacy `startProximityPresentation(credentialId, deviceKeyId)` method is
**removed** by this design. `armProximitySession` is the only arm path; do not
leave both entry points in place (two near-duplicate arm flows violate the
repository consolidation rule). Migrate or delete its JS callers as part of
this slice.

Events:

- `onDeviceEngaged`
- `onMdocRequestReceived`
- `onMdocPresentationComplete`
- `onCompanionSignRequested`
- `onCompanionPresentationComplete`
- `onError`

Events must include state, counts, byte lengths, and error codes only. They must
not include raw mdoc CBOR, raw SD-JWT, APDU payloads, claims, tokens, seeds, or
PII.

## 5. Key Policy

Initial production policy:

- Use the existing wallet Ed25519 holder key for mdoc device authentication.
- Run Samsung A26 + ACR1311 interop first.
- Add P-256 AndroidKeyStore fallback only if issuer or reader validation rejects
  EdDSA device authentication.

This keeps the first implementation aligned with the current wallet key model.
The tradeoff is that some verifier stacks may accept only P-256 device
authentication. That risk is gated by the physical ACR1311 test matrix.

**Issuer-side precondition.** ISO 18013-5 device authentication only works if
the issuer-signed MSO contains the device key (`deviceKeyInfo`). Choosing the
wallet Ed25519 key for device auth means stored mdocs must have been issued
bound to that key. Before the interop run: verify existing test mdocs carry the
expected Ed25519 device key, and update the local `server/` CBOR issuer to
embed it at issuance. If stored mdocs have no device key or a P-256 key,
presentation fails regardless of wallet-side work — re-issue first.

The module must not expose raw private keys or seeds to JavaScript. If native
signing is needed during the mdoc flow, design it as a bounded native callback or
pre-tap prepared operation that preserves the one-authentication-event rule.

## 6. ACR1311 Host Validation Tool

A production claim requires repeatable reader-side validation. The current host
probe is a stub and must be replaced by a real ACR1311 host tool.

The tool is not part of the mobile app. It runs on the host connected to the
ACR1311 reader and acts as the verifier harness.

Required host tool behavior:

1. Connect to the ACR1311 reader.
2. Obtain the wallet engagement payload before the tap, using one of the
   supported harness inputs: webcam scan of the wallet QR, pasted QR payload,
   or saved engagement payload file.
3. Wait for the Samsung A26 tap.
4. Select the ISO mdoc AID.
5. Execute the ISO 18013-5 reader-side exchange using the engagement payload.
6. Validate the encrypted `DeviceResponse`.
7. Select the companion AID when testing dual-format mode.
8. Send companion capability and begin commands.
9. Validate companion SD-JWT + KB-JWT nonce binding.
10. Print redacted pass/fail diagnostics.

The host tool must support mdoc-only and dual-format runs so standard ISO mdoc
behavior can be tested independently from the companion extension.

## 7. Failure Handling

The module must fail closed.

Required failures:

- NFC unavailable or disabled.
- Native module unavailable.
- No stored mdoc credential.
- HCE selected while unarmed.
- Arm window expired.
- Screen off.
- Reader disconnect.
- Session establishment failure.
- Invalid or unsupported APDU.
- `DeviceRequest` cannot be decrypted or parsed.
- Reader asks for fields outside the approved profile.
- Payload exceeds size cap.
- Companion nonce/profile/mode validation fails.
- Signing is cancelled or fails.

For all failures, native and JS logs must use redacted diagnostics only.

## 8. Test Plan

Unit and focused tests:

- Availability reports `presentationReady` only when NFC and mdoc engine are
  available.
- ISO mdoc AID and companion AID are registered.
- Unarmed HCE select does not share data.
- Arm-window expiry clears session state.
- Field enforcement rejects out-of-profile requests.
- Companion APDU validates mode/profile/nonce and handles response chaining.
- Buffers clear after complete, error, cancel, and disconnect.

Physical validation:

- Samsung A26 screen-on HCE works with ACR1311.
- Samsung A26 screen-off HCE does not respond.
- ISO 18013-5 session establishment succeeds.
- Encrypted `DeviceResponse` validates.
- mdoc-only mode completes without companion.
- dual-format mode completes mdoc first, companion second.
- Reader disconnect produces recoverable failure.
- Repeated presentations do not leak stale payloads.
- Companion `SELECT`/`BEGIN` before mdoc completion is rejected (`6985`).
- Companion sign latency on the Samsung A26 is measured and recorded next to
  the reader timeout budget.

Repository verification:

- Focused proximity, reader-profile, companion transport, and history tests.
- `yarn tsc --noEmit`.
- `yarn lint`.
- Android native build or prebuild verification after implementation.

## 9. Out Of Scope

- iOS HCE.
- NFC NDEF issuance.
- A generic BLE verifier application.
- Hand-rolled ISO 18013-5 cryptography unless Multipaz is proven infeasible.
- Strict migration of legacy runtime IDs such as package names, schemes,
  Keychain services, or database names.

## 10. Acceptance Criteria

The production slice is complete only when:

- Wallet can arm a dual-format NFC session from React Native.
- ACR1311 can complete ISO 18013-5 mdoc presentation against Samsung A26.
- The reader receives and validates encrypted `DeviceResponse`.
- Companion SD-JWT presentation succeeds after mdoc in dual-format mode.
- mdoc-only mode succeeds independently.
- Out-of-profile requests fail closed.
- Screen-off and unarmed taps share no data.
- All sensitive buffers are cleared after session end.
- Feasibility gate #1 verdict (Multipaz NFC data retrieval) is documented in
  this spec before engine integration work is treated as committed.
- Companion sign latency vs. reader timeout budget is recorded with the
  physical results.
- Verification commands pass.
- Physical-device results are recorded in `docs/TASKS.md`.
