# ADR 0008 - Keychain-Protected Ed25519 Production Signing

Status: Accepted

Date: 2026-06-16

## Context

ETDA requires `alg: EdDSA` with Ed25519 for OID4VCI Proof of Possession JWTs and OID4VP SD-JWT Key Binding JWTs.

ADR 0007 attempted an Android-first hardware-backed Ed25519 signer through AndroidKeyStore. On the target Galaxy S24 Ultra, the native diagnostics showed AndroidKeyStore generated `EC` keys when requested to generate `Ed25519` keys. That means the target hardware cannot satisfy the hardware-backed Ed25519 plan in practice.

`react-native-keychain` can protect stored secrets behind biometric/device authentication, but it does not provide an Ed25519 signing API. Therefore protocol-level EdDSA requires software Ed25519 signing with the private seed protected by Keychain.

## Decision

Use a production Keychain-protected software Ed25519 signer:

- Generate one 32-byte Ed25519 seed with a CSPRNG.
- Store the seed in `react-native-keychain` under service `etda.wallet.ed25519_seed`.
- Protect seed retrieval with biometric/device-passcode access control.
- Derive the Holder DID from the Ed25519 public key using the `did:key` Ed25519 multicodec prefix `[0xed, 0x01]`.
- Sign OID4VCI PoP JWTs, OID4VP JWT VP tokens, and OID4VP SD-JWT KB-JWTs with `@noble/curves` Ed25519, emitting `alg: EdDSA`.
- Keep the local Android `EtdaWalletEddsa` module as diagnostic/experimental code only.

## Consequences

- The Wallet is protocol-compatible with Issuers and Verifiers that require EdDSA/Ed25519.
- This is not hardware-backed non-extractable signing. The Ed25519 seed is software-generated and exists in app memory during signing.
- Keychain biometric/device authentication remains the sign-time gate.
- Existing credentials bound to old Holder keys must be reissued.
- ADR 0007 is superseded for production signing on the current target hardware.
