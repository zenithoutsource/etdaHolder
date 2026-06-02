# ADR 0002 — Native signing module: @animo-id/expo-secure-environment

**Status:** Accepted  
**Date:** 2026-06-02

## Context

ADR 0001 established that the Wallet Signing Key must be non-extractable and hardware-backed. This requires a native module that can generate an EC P-256 keypair inside iOS Secure Enclave / Android Keystore and sign data without exposing the private key to JavaScript.

Two options were evaluated: `@animo-id/expo-secure-environment` (existing library) or a custom Expo native module.

## Decision

Use `@animo-id/expo-secure-environment`.

Reasons:
- Purpose-built for OID4VCI/SSI digital wallet use cases — same ecosystem as `@sphereon/oid4vci-client`.
- Provides `generateKeypair`, `sign`, and `getPublicKey` over iOS Secure Enclave and Android Keystore.
- Biometric per-operation authentication is built in.
- Compatible with Expo Prebuild (no ejection required).
- Maintained by Animo.id, an active SSI/VC organisation.

## Consequences

- `react-native-quick-crypto` remains in the stack for non-signing operations (hashing, HMAC, encoding). It is excluded from the signing path.
- Install via `npx expo install @animo-id/expo-secure-environment` (not `yarn add`).
- Requires `npx expo prebuild --clean` after install to regenerate iOS/Android native projects.
- Public key is returned as raw bytes from the module and must be converted to JWK format before use in PoP JWT headers.
- No software fallback for devices without hardware attestation — fail loudly, do not silently downgrade.
