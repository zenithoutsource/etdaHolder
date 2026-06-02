# ADR 0001 — Hardware-backed non-extractable signing key

**Status:** Accepted  
**Date:** 2026-06-02

## Context

The wallet stores and presents government-issued identity credentials (national ID, driving licence, university transcript). OID4VCI requires a Proof of Possession JWT signed with the wallet's private key on every credential issuance request.

Two approaches were evaluated:

**Software key (encrypted-at-rest):** `react-native-quick-crypto` generates the EC P-256 keypair and signs in JavaScript memory. The private key bytes are stored as a biometric-gated blob in `react-native-keychain`. The key is technically extractable — it exists as a byte string in JS memory during every sign operation.

**Hardware non-extractable key:** A native module generates the keypair inside iOS Secure Enclave / Android Keystore. The private key never leaves the secure element. Signing happens inside the hardware. JS receives only the signature bytes.

## Decision

Use a hardware non-extractable signing key (Path B).

`react-native-quick-crypto` is retained for other operations (hashing, encoding). It is removed from the signing path entirely. A native signing module (to be selected in ADR 0002) wraps iOS `SecKey` + Android `KeyPairGenerator(AndroidKeyStore)`.

## Consequences

- Private key cannot be extracted, cloned, or read by JS code under any circumstances.
- Satisfies the `non-extractable keys` and `hardware-backed Keystore/Keychain` constraints in CLAUDE.md.
- Adds a native dependency not yet in `package.json` — requires `npx expo install` and Prebuild regeneration.
- Changing this decision later requires re-keying all issued credentials (users must re-enrol). This is the hard-to-reverse cost.
- Software signing path (quick-crypto) must not be used as a fallback — no silent downgrade on devices without hardware attestation.
