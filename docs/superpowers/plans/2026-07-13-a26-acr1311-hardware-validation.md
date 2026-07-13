# A26 ↔ ACR1311U-N2 — Companion NFC Hardware Validation Checklist

_Manual hardware validation for the Samsung Galaxy A26 phone paired with the ACR1311U-N2
Secure Bluetooth NFC Reader. Confirms the **companion (dual-format JSON / SD-JWT) HCE leg**
interoperates end-to-end. Documentation only — running this checklist requires no app code
changes._

- Protocol reference: [`nfc-companion-apdu.md`](../specs/nfc-companion-apdu.md) (§8 reader
  sequence, §11 host script, §12 acceptance).
- Parent design: [`2026-07-03-android-hce-dual-format-presentation-design.md`](../specs/2026-07-03-android-hce-dual-format-presentation-design.md).
- Closes backlog item: [`2026-07-08-easy-wallet-backlog.md`](./2026-07-08-easy-wallet-backlog.md) §"NFC / mDOC / HCE / ACR1311U physical validation"; unblocks Phase 2D
  ([`2026-06-25-phase-2b-2c-proximity-presentation.md`](./2026-06-25-phase-2b-2c-proximity-presentation.md)).

## Scope and boundaries

- **In scope**: companion AID path (SELECT → GET CAPABILITIES → BEGIN COMPANION →
  GET RESPONSE chaining → SD-JWT/KB-JWT verify).
- **Not in scope**: the ISO 18013-5 mDOC data leg — it is stubbed
  (`ExpoMdocProximityModule.approvePresentation` rejects "not wired until NFC engagement is
  available"). Do not attempt mDOC transfer.
- **Bluetooth is not a phone concern**: the ACR1311U-N2's Bluetooth link is reader ↔ host-PC
  only and invisible to the wallet. The A26 talks to the reader purely over NFC/HCE. There is
  no BLE pairing to test on the phone.

## ✅ Prerequisite — companion AID mismatch (RESOLVED 2026-07-13)

Fixed: `constants.ts:8` and the manifest `aid-filter` now both use the canonical 9-byte
`A00000045444410100` (matching the Kotlin runtime matcher); `registry.test.ts` and the spec
references were aligned. History of the defect for reference — the AID previously disagreed
with the native matcher and one form was malformed:

| Source | Value | Bytes |
|---|---|---|
| Manifest `aid-filter` (`modules/expo-mdoc-proximity/android/src/main/res/xml/companion_apdu_service.xml:9`) | `A0000004544410100` | **17 nibbles — odd / invalid** |
| `constants.ts:8` `COMPANION_AID_HEX` | `A0000004544410100` | 17 nibbles — odd / invalid |
| Kotlin matcher `CompanionHostApduService.kt:41` | `A0 00 00 04 54 44 41 01 00` | `A00000045444410100` (9 bytes — valid) |

Android HCE requires even-length AID hex (5–16 bytes). The 17-nibble form cannot register
cleanly and does not equal the 9-byte matcher. **If not fixed, SELECT-by-AID returns `6A82`
(Step 2 fails)** — this is the most likely reason the A26 appears not to talk to the reader.

Canonical value is the 9-byte `A00000045444410100`. Align the manifest and `constants.ts` to
it before running (this is a wire-protocol AID — see CLAUDE.md naming exception — treat the
byte value as fixed once settled). Tracked as a separate one-line change per file.

## Part A — Host PC + reader setup

- [ x ] Pair the ACR1311U-N2 to the host PC over Bluetooth (ACS driver); confirm it enumerates
      as a PC/SC reader (`pcsc_scan` on Linux/macOS, or Device Manager → Smart card readers on
      Windows).
- [ x ] Install a PC/SC APDU sender for hand-driving APDUs: `pyscard` (Python) or
      `pcsc-tools scriptor`. No repo code is needed — `tools/acr1311u-n2/companion_probe.ts` is
      a stub (ACS SDK not wired) and serves only as a constants reference.

## Part B — A26 wallet arm

- [ x ] Install the dev build on the A26 (`npx expo run:android` / dev-client). Confirm NFC and
      HCE are enabled in Android settings.
- [ x ] In the wallet, open the present flow (`app/(tabs)/present.tsx`), select a dual-format
      credential, pass the pre-tap consent panel, and **arm** the dual-format profile
      (`proximityArmSession`). Keep the screen ON — the HCE service sets
      `requireDeviceScreenOn="true"`, so it only responds while armed with the screen on.

## Part C — APDU sequence (host sends; record SW after each)

Sequence from spec §8/§11. SELECT uses the canonical 9-byte AID.

| # | APDU (hex) | Expected |
|---|---|---|
| 1 | Tap A26 to reader — detect card-present | reader reports ATR / present |
| 2 | `00 A4 04 00 09 A0 00 00 04 54 44 41 01 00 00` (SELECT companion AID) | `9000`. **`6A82` = AID mismatch unresolved, or wallet not armed** |
| 3 | `80 CA 00 00 00` (GET CAPABILITIES) | CBOR map: version `1`, both modes, `9000` |
| 4 | `80 CB 00 00 <Lc> <CBOR {1:mode, 2:nonce(32B), 3:profile_id}>` (BEGIN COMPANION) | `61XX` (more data) or `9000` |
| 5 | `80 C0 00 00 00` (GET RESPONSE — loop while `61XX`) | concatenated SD-JWT presentation, final `9000` |
| 6 | Verify SD-JWT + KB-JWT off-line | nonce binding + `aud=urn:etda:companion:nfc:v1` valid |

- `mode` = `dual-format`.
- `nonce` = 32 random bytes (`COMPANION_NONCE_BYTES`).
- `profile_id` = `etda-transcript-acr1311u-n2` (current `activeProfileId`,
  `constants.ts:57`).
- Negative case: BEGIN COMPANION with a **wrong `profile_id`** must return `6985`.

## Part D — Acceptance (spec §12)

- [ x ] SELECT companion AID succeeds **only** when armed with screen on (tap while un-armed → `6A82`).
- [ ] GET CAPABILITIES returns CBOR version `1` and both modes.
- [ ] BEGIN COMPANION with wrong `profile_id` → `6985`.
- [ ] BEGIN COMPANION `dual-format` → valid SD-JWT with KB-JWT bound to the nonce.
- [ ] Response chaining works for a companion payload > 255 bytes.
- [ ] Full steps 2–6 complete against the A26 dev build over the ACR1311U-N2.

## Part E — Record results

| Field | Value |
|---|---|
| A26 build id / commit | |
| Android version | |
| Reader firmware | |
| Step 2 SW (SELECT) | |
| Step 3 SW (GET CAPABILITIES) | |
| Step 4 SW (BEGIN COMPANION) | |
| Step 5 SW (GET RESPONSE, final) | |
| Wrong-profile negative case SW | |
| SD-JWT / KB-JWT verify | |
| **Overall PASS / FAIL** | |

## Logging / safety during the run

- Wallet logs may record INS, SW, and payload **lengths** only — never SD-JWT body, nonce,
  claims, or key material (CLAUDE.md redaction rule + spec §10).
- Do not paste captured presentations, nonces, or claims into the results table. Use
  `__DEV__`-guarded console blocks if raw payload inspection is temporarily needed.

## Interpreting the outcome

Step 2 (`SELECT` → `9000`) is the decisive proof that the A26 HCE and the ACR1311U-N2
interoperate. If Step 2 returns `6A82`, re-check: (a) the AID mismatch prerequisite is fixed,
(b) the wallet is armed, (c) the screen is on. Steps 3–6 then validate the full companion
presentation over the physical pairing.
