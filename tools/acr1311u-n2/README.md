# ACR1311U-N2 offline mdoc NFC host

Local **ISO 18013-5 reader** for the wallet’s mDL NFC path. The host owns the ACR1311U-N2 over PC/SC and serves a page at `http://127.0.0.1:8787`. A browser cannot be the NFC endpoint (Web NFC is not HCE Type 4 / AID `A0000002480400`).

After the first Gradle download of Multipaz `0.100.0`, the host, generator, and page need **no internet**. Do not point this tester at `verifier.multipaz.org`. BLE is out of scope.

## Channel cheat-sheet

| QR / action | What it is | What it is not |
|---|---|---|
| Scan tab QR | OID4VCI offer or OID4VP request | Not NFC presentment |
| **Waiting for tap** QR (`mdoc:` + base64url CBOR) | ISO 18013-5 DeviceEngagement for this host | Not a VC JWT |
| Home **Add test mDL** (`__DEV__` only) | Injects a TEST issuer-signed mDL bound to this credential’s `k_cred` | Not production issuance |
| JVM `generate-mdl` without `--device-jwk` | Inspect / host fixtures only | **Do not** drop that file onto the phone |

v1 is **QR then tap**. Skipping the engagement QR is not ISO-valid for this wallet.

## Prerequisites

- JDK 17+
- ACS CCID / PC/SC driver so the ACR1311U-N2 enumerates as a smart-card reader
- USB **or** Bluetooth **to this PC** (the phone still only uses NFC/HCE)
- Debug wallet on Samsung Galaxy A26 with a stored mDL (`hasStoredMdoc`)
- Native rebuild after HCE / Multipaz changes (`npx expo prebuild` / `npx expo run:android`)

Confirm the reader in Windows Device Manager → Smart card readers, or `pcsc_scan` on Linux/macOS.

## Run the host

From this directory:

```bash
./gradlew run
```

Windows: `.\gradlew.bat run`

Open `http://127.0.0.1:8787` (bound to localhost only).

1. On the phone: Driving Licence → NFC → consent (`family_name`, `given_name`, `birth_date`) → arm. Keep the screen on. The arm window is 60 seconds (`EXPO_PUBLIC_HCE_ARM_WINDOW_MS`).
2. Paste (primary) or scan the **Waiting for tap** QR into the page.
3. Click **Wait for tap**.
4. Hold the A26 to the ACR1311.

Pass = the page shows the three claims **and** the wallet shows Success, plus logcat `[hce] mdoc APDU` and `[multipaz-session] NFC transport connected`. **A reader beep alone is not pass.**

### Mapped errors

| SELECT / outcome | Page copy |
|---|---|
| `6A82` | Wallet is not armed |
| `6985` | Presentation not approved (complete pre-tap consent, keep screen on) |
| Timeout | Arm, paste QR, then tap within the arm window |
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

## Wallet inject (`__DEV__`)

On a **debug** Android build, Home → **Add test mDL**:

1. Creates a new `credentialId` and hardware `k_cred` (same APIs as issuance). Flag-off: binds MSO to the existing Keychain Ed25519 holder public key.
2. Native Multipaz builds IssuerSigned `org.iso.18013.5.1.mDL` with that public key as DeviceKey.
3. Stores the mdoc and a `DLTDrivingLicence` card (`rawVc: mdoc:<base64url>`).
4. Skips the PID gate **for this inject only**. Production `canRequestCredentialType('DLTDrivingLicence')` is unchanged.
5. Fail-closed outside debug: JS `__DEV__` plus native `FLAG_DEBUGGABLE`. Release builds reject `generateTestMdl`.

One biometric is allowed if `k_cred` create/sign-time gate fires. Do not add a second app-level prompt.

Then use the same QR-then-tap loop against this host.

## Tests (no hardware)

```bash
./gradlew test
```

Covers `mdoc:` / `mdoc://` engagement parsing, SELECT status-word copy, and `generate-mdl` (doctype, three namespace identifiers, DeviceKey matches supplied JWK).

Physical Part G remains a manual run after inject (or a real claim) + `gradlew run` + a rebuilt wallet. See [`docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md`](../../docs/superpowers/plans/2026-07-13-a26-acr1311-hardware-validation.md).
