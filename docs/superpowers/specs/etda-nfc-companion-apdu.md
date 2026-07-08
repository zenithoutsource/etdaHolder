# ETDA NFC Companion APDU Extension

Status: Draft v1 (2026-07-06) — dev/interop profile for Wallet + ACR1311U-N2 host
Date: 2026-07-06

## Relationship To Parent Spec

This document pins the byte-level protocol referenced by [Android HCE Dual-Format Presentation Design](./2026-07-03-android-hce-dual-format-presentation-design.md) §8 **ETDA JSON Companion Transport**.

- **Parent spec** defines architecture, consent, and payload semantics (signed SD-JWT companion, separate AID, no change to ISO 18013-5 mDOC exchange).
- **This spec** defines the proprietary APDU command set under the ETDA AID for Wallet HCE and ACR1311U-N2 host tooling.

Normative ISO 18013-5 mDOC exchange (AID `A0000002480400`, session encryption, `DeviceResponse`) is **not** defined here — see parent spec §8 **ISO 18013-5 Session Layer**.

## 1. Scope

| In scope | Out of scope |
|---|---|
| ETDA proprietary AID selection | iOS |
| `GET CAPABILITIES`, `BEGIN COMPANION`, response chaining | mDOC session crypto (clause 9) |
| Nonce format for KB-JWT binding | Online OID4VP |
| SD-JWT companion payload on the wire | Issuer OID4VCI |
| ACR1311U-N2 host reader sequence | Production ETDA registry of RID (dev RID below) |

## 2. Application Identifier (AID)

### 2.1 ETDA Companion AID (v1)

| Field | Value |
|---|---|
| Name | `ETDA_COMPANION_V1` |
| Hex | `A0 00 00 04 54 44 41 01 00` |
| String form | `A0000004544410100` |
| Length | 9 bytes |

- `A0 00 00` — ISO 7816-5 registered application format
- `04 54 44 41` — RID slot labelled **ETDA** for development (`'ETDA'` ASCII with prefix byte `04`)
- `01 00` — PIX: companion service v1

Wallet HCE `HostApduService` must declare **both** the ISO mDOC AID (`A0000002480400`) and this ETDA AID. The reader selects mDOC AID first; ETDA AID is selected only after mDOC session completes successfully.

### 2.2 SELECT

Standard ISO 7816-4 SELECT by DF name:

```
CLA  INS  P1   P2   Lc   Data
00   A4   04   00   09   A0 00 00 04 54 44 41 01 00
```

**Success:** `SW=9000`  
**Not found / not armed:** no response from Wallet (HCE not armed) or `SW=6A82`

## 3. Command Set Overview

All ETDA-proprietary commands use **CLA=`80`** (proprietary, no secure messaging in v1).

| INS | Name | Direction | Purpose |
|---|---|---|---|
| `CA` | GET CAPABILITIES | Reader → Wallet | Discover companion version and modes |
| `CB` | BEGIN COMPANION | Reader → Wallet | Supply mode + nonce; start companion transfer |
| `C0` | GET RESPONSE | Reader → Wallet | Continue chained response (`SW=61XX`) |
| `FF` | ABORT | Reader → Wallet | Cancel companion session |

Chaining rules match parent spec: prefer extended-length APDUs when supported; otherwise command/response chaining via `61XX` + `GET RESPONSE`.

## 4. GET CAPABILITIES (`80 CA 00 00 00`)

### 4.1 Request

Empty command data. `Le=0` (reader accepts up to 256/extended per chip).

### 4.2 Response body (CBOR, RFC 8949)

```cbor
{
  1: 1,                              ; version = 1
  2: ["mdoc-only", "dual-format"],   ; supported_modes
  3: "etda-transcript-acr1311u-n2",  ; active_profile_id (matches Wallet config)
  4: 65536                           ; max_companion_bytes (matches EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES default)
}
```

CBOR keys are unsigned integers for compactness:

| Key | Semantics | Type |
|---|---|---|
| `1` | `version` | uint |
| `2` | `supported_modes` | tstr[] |
| `3` | `active_profile_id` | tstr |
| `4` | `max_companion_bytes` | uint |

**Success:** `SW=9000` + CBOR body (if longer than one frame, use `SW=61XX` + `GET RESPONSE`).

### 4.3 Reader rules

- Reader must call GET CAPABILITIES after SELECT ETDA AID before BEGIN COMPANION.
- If `dual-format` is not listed, reader must not request dual-format mode.

## 5. BEGIN COMPANION (`80 CB 00 00 Lc [payload]`)

Starts companion transfer. Wallet must already have an armed presentation with a matching `active_profile_id` and approved disclosure set (parent spec §8 consent-first).

### 5.1 Request payload (CBOR)

```cbor
{
  1: "dual-format",          ; mode: "mdoc-only" | "dual-format"
  2: h'...32 bytes...',      ; nonce (exactly 32 bytes)
  3: "etda-transcript-acr1311u-n2"  ; profile_id (must match armed profile)
}
```

| Key | Semantics | Constraints |
|---|---|---|
| `1` | `mode` | tstr; `mdoc-only` skips companion with `SW=9000` empty body |
| `2` | `nonce` | bstr; **32 bytes** cryptographically random from reader |
| `3` | `profile_id` | tstr; must equal Wallet armed profile |

### 5.2 Wallet validation

Wallet **must** reject (`SW=6985 Conditions not satisfied`) when:

- HCE not armed or arm window expired
- `profile_id` does not match armed profile
- `mode=dual-format` but user armed mdoc-only only
- Any companion field outside the pre-approved disclosure set would be required (parent spec ceiling rule)

Wallet **must** reject (`SW=6982 Security status not satisfied`) when:

- Combined mDOC + companion payload estimate exceeds `EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES` at arm time (parent spec §8 payload budget)

### 5.3 Companion payload content

On success, Wallet returns the **SD-JWT VC presentation** as a **UTF-8** string:

```
<issuer-jwt>~<disclosure1>~...~<kb-jwt>
```

KB-JWT payload **must** include:

| Claim | Value |
|---|---|
| `nonce` | echo of reader 32-byte nonce (base64url in JWT payload) |
| `aud` | `urn:etda:companion:nfc:v1` |
| `iat` | signing time |

Unsigned JSON companion is **prohibited** (parent spec §8).

### 5.4 Response chaining

- If companion UTF-8 length ≤ 255 bytes: `SW=9000` + data in single response.
- If longer: `SW=61XX` where `XX` = remaining bytes available in this frame (standard ISO 7816-4); reader sends `80 C0 00 00 00` (GET RESPONSE) until `SW=9000`.

Maximum companion size is bounded by `EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES` (default 65536).

## 6. GET RESPONSE (`80 C0 00 00 [Le]`)

Identical semantics to ISO 7816-4 GET RESPONSE for chained replies after `61XX`.

## 7. ABORT (`80 FF 00 00 00`)

Reader aborts companion session. Wallet clears companion buffers and returns `SW=9000`. mDOC session state is already complete; no retroactive change to mDOC transfer.

## 8. End-to-End Reader Sequence (ACR1311U-N2)

```
1. [ISO 18013-5 mDOC session on AID A0000002480400 — parent spec]
2. SELECT ETDA AID A0000004544410100
3. GET CAPABILITIES → read supported_modes
4. BEGIN COMPANION { mode, nonce, profile_id }
5. If SW=61XX → loop GET RESPONSE until SW=9000
6. Verifier validates SD-JWT + KB-JWT (nonce, aud, disclosures)
```

Bluetooth (ACR1311U-N2 ↔ host) is invisible to the Wallet; host sends NFC APDUs through the reader SDK.

## 9. Status Words (SW)

| SW | Meaning | Reader action |
|---|---|---|
| `9000` | Success | Continue or finish |
| `61XX` | More data available | GET RESPONSE |
| `6982` | Security / size limit | Fail session |
| `6985` | Conditions not satisfied (consent/profile/mode) | Fail session |
| `6A82` | File/AID not found | Wallet not armed |
| `6D00` | INS not supported | Protocol mismatch |
| `6F00` | Unrecoverable error | Fail session |

## 10. Wallet Implementation Notes

- Constants live in `src/config/etdaCompanionApdu.ts` (AID, INS, CBOR keys, `aud` urn).
- Native `HostApduService` owns ETDA AID dispatch; JS layer supplies armed profile, approved disclosures, and SD-JWT bytes at arm time.
- `proximityArmSession` passes `companionPayloadBytes` estimate for dual-format arm-time size check.
- Logs may include INS, SW, payload **lengths** only — never SD-JWT body, nonce, or claims (parent spec §12).

## 11. Host Reader Script (ACR1311U-N2)

Reference sequence for a PC host using the ACS SDK (pseudocode):

```text
nfc.connect()
nfc.sendApdu(SELECT_ETDA_AID)
caps = cbor_decode(nfc.sendApdu(GET_CAPABILITIES))
assert "dual-format" in caps[2]
nonce = random_bytes(32)
body = cbor_encode({1: "dual-format", 2: nonce, 3: caps[3]})
resp = nfc.sendApdu(BEGIN_COMPANION || body)
while sw(resp) starts with "61":
  resp = nfc.sendApdu(GET_RESPONSE)
presentation = concat(resp.data)
verify_sd_jwt_kb(presentation, nonce, aud="urn:etda:companion:nfc:v1")
```

Physical script location (to be added): `tools/acr1311u-n2/etda_companion_probe.ts`

## 12. Acceptance Criteria

- [ ] Wallet HCE responds to SELECT ETDA AID only when armed with screen on
- [ ] GET CAPABILITIES returns CBOR map with version 1 and both modes
- [ ] BEGIN COMPANION with wrong `profile_id` returns `6985`
- [ ] BEGIN COMPANION `dual-format` returns valid SD-JWT presentation with KB-JWT bound to nonce
- [ ] Response chaining works for companion > 255 bytes
- [ ] ACR1311U-N2 host script completes steps 2–6 against a dev build

## 13. Versioning

| version | AID PIX | Notes |
|---|---|---|
| 1 | `01 00` | Initial dev profile |

Future versions must use a new PIX suffix; readers must not assume v1 CBOR layout on unknown version.
