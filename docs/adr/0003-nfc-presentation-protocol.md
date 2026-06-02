# ADR 0003 — NFC credential presentation protocol: ISO 18013-5

**Status:** Accepted  
**Date:** 2026-06-02

## Context

The wallet must support proximity credential presentation via NFC — the user taps their phone to a verifier's reader. Two protocols were evaluated:

**ISO 18013-5 (mdoc proximity):** International standard for mobile driving licences and government IDs. Uses NFC/BLE device engagement, encrypted CBOR data transfer, and a defined request/response schema. Required by government verifiers (traffic police, border control, car rental agencies). Thailand's DLT mDL mandate follows this standard.

**OID4VP proximity:** OpenID for Verifiable Presentations over a proximity channel. JSON-based, aligns with OID4VCI. Verifier hardware support is limited in 2026 — no deployed Thai government reader infrastructure uses it today.

## Decision

Use ISO 18013-5 for NFC credential presentation, applied to all three initial credential types (ThaID, Driving Licence, Transcript) where verifier infrastructure supports it.

## Consequences

- Requires a native module that implements ISO 18013-5 device engagement and CBOR data exchange. `react-native-nfc-manager` alone is insufficient — an mdoc-capable library must be evaluated and added in a future ADR.
- iOS HCE (Host Card Emulation) is restricted — iOS can act as NFC reader but not as a card emulator in the general case. Presentation on iOS may require BLE engagement fallback instead of pure NFC.
- Android supports HCE fully.
- Changing this protocol later requires re-negotiation with all verifier operators and replacing reader infrastructure — extremely hard to reverse.
- NFC issuance (reading `openid-credential-offer://...` from a tag) is a separate, simpler flow and does not require ISO 18013-5.
