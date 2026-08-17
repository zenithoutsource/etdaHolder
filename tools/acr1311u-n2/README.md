# ACR1311U-N2 offline mdoc NFC host

Local **ISO 18013-5 reader** for the wallet’s mDL NFC path. The host owns the ACR1311U-N2 over PC/SC and serves a page at `http://127.0.0.1:8787`. A browser cannot be the NFC endpoint (Web NFC is not HCE Type 4 / AID `A0000002480400`).

After the first Gradle download of Multipaz `0.100.0`, the host, generator, and page need **no internet**. Do not point this tester at `verifier.multipaz.org`. BLE is out of scope.

## Channel cheat-sheet

| QR / action | What it is | What it is not |
|---|---|---|
| Scan tab QR | OID4VCI offer or OID4VP request | Not NFC presentment |
| **Lab fallback:** paste `mdoc:` engagement | ISO 18013-5 DeviceEngagement for this host (QR paste path only) | Not the holder golden path |
| JVM `generate-mdl` without `--device-jwk` | Inspect / host fixtures only | **Do not** drop that file onto the phone |

v1 golden path is **tap-only static NFC handover**: the reader reads DeviceEngagement from Type 4 NDEF (AID `D2760000850101`), then continues mdoc data retrieval on AID `A0000002480400`. The wallet Waiting for tap screen shows **no** holder QR.

## Prerequisites

- JDK 17+
- ACS CCID / PC/SC driver so the ACR1311U-N2 enumerates as a smart-card reader
- USB **or** Bluetooth **to this PC** (the phone still only uses NFC/HCE)
- Debug wallet on Samsung Galaxy A26 with an **OID4VCI-issued** driving licence (`hasStoredMdoc`)
- Native rebuild after HCE / Multipaz changes (`npx expo prebuild` / `npx expo run:android`)

Confirm the reader in Windows Device Manager → Smart card readers, or `pcsc_scan` on Linux/macOS.

## Run the host

From this directory:

```bash
./gradlew run
```

Windows: `.\gradlew.bat run`

Open `http://127.0.0.1:8787` (bound to localhost only).

### Golden path (tap-only)

1. Claim a Driving Licence from the Issuer (no Add test mDL).
2. Host: click **Wait for tap** with the engagement field **empty**.
3. Phone: Driving Licence → NFC → Waiting for tap (**no QR**) → hold the A26 flat on the ACR1311 (`EXPO_PUBLIC_HCE_ARM_WINDOW_MS`, default 180 s). If Samsung Wallet is the default NFC app, disable its NFC/payment service for this tap so AIDs `D2760000850101` and `A0000002480400` can reach this wallet.
4. Pass = the page shows the three claims (`family_name`, `given_name`, `birth_date`) **and** the wallet shows Success, plus logcat `[hce] mdoc APDU` and `[multipaz-session] NFC transport connected`. **A reader beep alone is not pass.**

A second hold after NDEF→mdoc field drop is acceptable. Requiring the holder to scan or paste a `mdoc:` QR is **not** pass for this path.

### Lab fallback (paste `mdoc:` QR)

For debugging engagement parsing without NDEF:

1. On the phone, obtain a DeviceEngagement URI (legacy lab builds or exported engagement).
2. Paste it into the host engagement field, then click **Wait for tap**.
3. Tap as above.

This path is not the production holder golden path. See [`docs/superpowers/specs/2026-08-17-mdl-nfc-static-handover-tap-only-design.md`](../../docs/superpowers/specs/2026-08-17-mdl-nfc-static-handover-tap-only-design.md).

### Mapped errors

| SELECT / outcome | Page copy |
|---|---|
| `6A82` | Wallet is not armed |
| `6985` | Presentation not approved (keep screen on) |
| `6300` | SELECT had no immediate `9000` (rebuild wallet HCE; do not Metro-reload) |
| Timeout | Arm on phone, then tap within the arm window |
| Field drop after DeviceResponse | Typical ACR1311 behavior; treat as success if claims already appeared |

## Optional TEST IACA

`generate-mdl` writes `testdata/test-iaca.pem`. If that file is in the host working directory (or `MDOC_TEST_IACA_PEM` points at the PEM), the host checks DeviceResponse `x5chain` against it. If it is absent, decrypted claims still show with **issuer attestation not verified**. Production IACA/VICAL is not a hard gate for this tester.

Never ship the TEST IACA **private** key in a release APK. `testdata/` is gitignored.

## generate-mdl (inspect / host fixtures)

```bash
./gradlew run --args="generate-mdl --out testdata"
./gradlew run --args="generate-mdl --out testdata --device-jwk path/to/public.jwk.json"
```

Without `--device-jwk`, Multipaz mints a software device key next to the mdoc. That key is **inspection only** — ISO MSO `DeviceKey` must match the credential’s holder key on the phone, so a PC-minted mdoc cannot be presented from the wallet.

With `--device-jwk` (public JWK from a debug helper), the CLI can mint an mdoc bound to that key. There is no production file-import path.

## Tests (no hardware)

```bash
./gradlew test
```

Covers `mdoc:` / `mdoc://` engagement parsing, static-handover NDEF encode/decode, SELECT status-word copy, and `generate-mdl` (doctype, three namespace identifiers, DeviceKey matches supplied JWK).

Physical validation remains manual: issued mDL claim → `gradlew run` → rebuilt debug wallet → three tap-only runs. See [`docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md`](../../docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md) and [`docs/TASKS.md`](../../docs/TASKS.md).
