# ADR 0001 - Hardware-backed Non-extractable Signing Key

Status: Accepted

Date: 2026-06-02

## Context

The wallet stores and presents government-issued identity credentials. OID4VCI requires a Proof of Possession JWT signed with the wallet's private key during credential issuance.

Two approaches were evaluated:

- Software key, encrypted at rest: `react-native-quick-crypto` generates and signs in JavaScript memory, with private key bytes stored as a biometric-gated blob.
- Hardware non-extractable key: a native module generates the keypair inside iOS Secure Enclave or Android Keystore, and signing happens inside hardware.

The software approach leaves private key bytes available to JavaScript during signing. That violates the wallet security model.

## Decision

Use a hardware-backed non-extractable signing key.

`react-native-quick-crypto` is retained only for non-signing operations such as hashing, random bytes, and encoding. It is removed from the signing path entirely.

## Consequences

- Private key cannot be extracted, cloned, or read by JavaScript.
- Signing requires a native dependency and Expo Prebuild.
- Devices without a supported secure environment must fail loudly in production.
- Changing this decision later requires user re-enrollment and potential credential re-issuance.
- Software signing must not be used as a production fallback.

## Supersession Note

On 2026-06-16, ADR 0008 established that the target Android hardware (Galaxy S24 Ultra) cannot generate Ed25519 keys in AndroidKeyStore (it silently returns EC keys instead — see ADR 0007). For the Ed25519 wallet signing key specifically, ADR 0008 supersedes the "no production software fallback" decision here with a Keychain-protected software Ed25519 signer. This ADR's hardware-non-extractable principle remains the target for any future signing key where the platform can satisfy it.
