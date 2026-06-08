# ADR 0006 - ISO 18013-5 mdoc Native Module Selection Criteria

Status: Accepted

Date: 2026-06-08

## Context

ADR 0003 selected ISO 18013-5 for NFC proximity presentation, but final native module selection is blocked until physical iOS and Android testing is available.

Choosing a module too early risks locking the wallet to an integration that cannot support the required engagement, transport, secure-key, or Expo prebuild constraints on real devices.

## Decision

Defer final mdoc native module selection until physical-device testing is available, but evaluate candidates against these criteria:

- iOS and Android support for ISO 18013-5 proximity presentation.
- NFC engagement and BLE engagement coverage appropriate to platform constraints.
- Ability to integrate with the wallet's hardware-backed signing boundary without exposing private keys or raw seeds to JavaScript.
- Expo prebuild and development-build compatibility.
- Active maintenance, documented native integration surface, and realistic long-term support.
- Testability on physical devices, including negative and interoperability scenarios.
- Compatibility with expected mdoc credential formats and Verifier infrastructure.

## Consequences

- `react-native-nfc-manager` alone remains insufficient for ISO 18013-5 presentation.
- NFC NDEF issuance may still be implemented separately after device testing; it does not decide the mdoc presentation module.
- The final module choice must be recorded in a future ADR after physical iOS and Android validation.
