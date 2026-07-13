# ADR 0007 - Android-First EdDSA Ed25519 Production Signing

Status: Superseded by ADR 0008

Date: 2026-06-15

## Context

The customer requires `alg: EdDSA` with Ed25519 for OID4VCI Proof of Possession JWTs and OID4VP SD-JWT Key Binding JWTs. The previously accepted signing module, `@animo-id/expo-secure-environment`, only supports P-256 / ES256. The temporary Noble software Ed25519 path exposed private key material to JavaScript memory and is not release-safe.

iOS Secure Enclave does not support Ed25519. Android API 33+ documents Ed25519 `Signature` support, but AndroidKeyStore Ed25519 key generation and hardware backing must still be confirmed on the actual target devices.

## Decision

Add an Android-first local Expo native module, `EtdaWalletEddsa`, under `modules/etda-wallet-eddsa`.

The module:

- Generates the Wallet Signing Key under alias `etda_wallet_signing_key` in AndroidKeyStore.
- Attempts Ed25519 key generation with AndroidKeyStore and requires API 33+.
- Rejects generated keys unless `KeyInfo.securityLevel` reports TEE or StrongBox hardware backing.
- Uses Android `BiometricPrompt` with a `Signature` `CryptoObject` for sign-time biometric authentication.
- Exposes raw 32-byte Ed25519 public keys and raw 64-byte Ed25519 signatures to JavaScript.

The wallet now derives the Holder DID as:

```text
did:key:z<base58btc(varint(0xed01) + raw_ed25519_public_key)>
```

The wallet public JWK is:

```json
{ "kty": "OKP", "crv": "Ed25519", "x": "<base64url(raw_public_key)>" }
```

OID4VCI PoP JWTs, OID4VP JWT VP tokens, and OID4VP SD-JWT KB-JWTs now emit `alg: EdDSA` and sign through the native Ed25519 module. The development-only software Ed25519 signing path and `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING` flag are removed.

## Consequences

- Android release remains blocked until the target physical devices prove AndroidKeyStore Ed25519 generation works and reports TEE or StrongBox backing.
- iOS Ed25519 remains deferred to a separate ADR because Secure Enclave cannot produce Ed25519 signatures.
- Existing credentials bound to the old P-256 Holder DID must be reissued. SD-JWT holder-binding validation will reject credentials whose `cnf.jwk` or `cnf.kid` targets the old key.
- Production builds must fail startup when the native Ed25519 signer is unavailable. There is no production software fallback.
- `react-native-quick-crypto` remains allowed for hashing and randomness only, not signing.

## Supersession Note

On 2026-06-16, target-device diagnostics on the Galaxy S24 Ultra showed AndroidKeyStore generated `EC` keys when requested to generate `Ed25519` keys. ADR 0008 supersedes this native hardware-backed plan with Keychain-protected software Ed25519 signing for production protocol compatibility.
