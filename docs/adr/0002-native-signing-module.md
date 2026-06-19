# ADR 0002 - Native Signing Module: @animo-id/expo-secure-environment

Status: Accepted

Date: 2026-06-02

## Context

ADR 0001 requires a non-extractable hardware-backed EC P-256 signing key. The wallet needs a native module that can generate a keypair inside iOS Secure Enclave or Android Keystore and sign without exposing the private key to JavaScript.

Options evaluated:

- `@animo-id/expo-secure-environment`
- Custom Expo native module

## Decision

Use `@animo-id/expo-secure-environment`.

Reasons:

- Purpose-built for SSI and digital wallet use cases.
- Provides key generation, signing, and public key access.
- Supports per-operation biometric authentication.
- Compatible with Expo Prebuild.
- Avoids maintaining a custom signing bridge during v1.

## Consequences

- Install with `npx expo install @animo-id/expo-secure-environment`.
- Run `npx expo prebuild --clean` after native dependency changes.
- Public key bytes must be converted to DID/JWK formats by wallet code.
- `react-native-quick-crypto` remains non-signing only.
- No production software fallback is allowed.
