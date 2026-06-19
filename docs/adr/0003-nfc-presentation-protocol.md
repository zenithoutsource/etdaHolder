# ADR 0003 - NFC Credential Presentation Protocol: ISO 18013-5

Status: Accepted

Date: 2026-06-02

## Context

The wallet must support proximity credential presentation where the Holder taps a phone to a Verifier reader.

Two protocols were evaluated:

- ISO 18013-5 mdoc proximity: international standard for mobile driving licences and government IDs. Uses NFC/BLE engagement, encrypted CBOR transfer, and defined request/response schemas.
- OID4VP proximity: JSON-based OpenID presentation over a proximity channel. Verifier hardware support is limited for the initial target environment.

## Decision

Use ISO 18013-5 for NFC proximity credential presentation.

This applies to initial credential types where Verifier infrastructure supports it.

## Consequences

- A native mdoc-capable module is required; `react-native-nfc-manager` alone is insufficient for presentation.
- iOS may require BLE engagement fallback because general HCE is restricted.
- Android supports HCE more fully.
- NFC issuance by reading an `openid-credential-offer://...` NDEF tag is separate from ISO 18013-5 presentation.
- Changing this protocol later would require coordination with Verifier infrastructure and should require a superseding ADR.
