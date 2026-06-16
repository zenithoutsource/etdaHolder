# Security Policy

This document defines mandatory security constraints for the ETDA Wallet. Any code that violates them must not be merged.

## 1. Cryptographic Key Policy

### Signing Key

The Android wallet uses exactly one hardware-bound Ed25519 keypair for Proof of Possession and presentation signatures.

- Native module: local Expo module `EtdaWalletEddsa` (`modules/etda-wallet-eddsa`)
- Key alias: `etda_wallet_signing_key`
- Backing store: AndroidKeyStore, requiring TEE or StrongBox hardware backing
- Private key: non-extractable, never present in JavaScript memory
- Generation: once on first launch
- Rotation: explicit user-initiated re-enrollment only
- Fallback: no production software fallback

Production startup must fail if the native Ed25519 signer is unavailable. iOS Ed25519 remains deferred because Secure Enclave does not support Ed25519.

### Non-Signing Crypto

`react-native-quick-crypto` is allowed for non-signing operations only:

- random bytes
- hashing
- HMAC
- base64url and encoding support

It must not be used for key generation or signing.

### Public Key and Holder DID

The public key is exported as raw 32-byte Ed25519 public bytes only. The Holder DID is:

```text
did:key:z<base58btc(varint(0xed01) + raw_ed25519_public_key)>
```

The public JWK shape is `{ "kty": "OKP", "crv": "Ed25519", "x": "<base64url(raw_public_key)>" }`. PoP and presentation JWT headers use `kid` and `alg: EdDSA`.

## 2. Local Storage Standard

### Required

- Credentials are stored in encrypted `react-native-mmkv`.
- MMKV encryption key is generated at first launch with a CSPRNG.
- The encryption key is stored in `react-native-keychain`.
- Production storage must use hardware-backed Keychain constraints when available.
- Session data is stored in Keychain, not AsyncStorage.

### Forbidden

- `AsyncStorage` imports in app source.
- Credential claims, VC JWTs, tokens, or PII in `console.log`, crash reporters, analytics, build logs, or screenshots.
- Hardcoded secrets or local `.env` values committed to git.

## 3. Biometric Authentication Gate

Every signature operation must be gated by biometric authentication through the native signing module.

- The gate applies at key usage time, not just wallet startup.
- User cancellation rejects the sign call.
- JavaScript must not implement a manual PIN fallback.
- OID4VP and future ISO 18013-5 signing must reuse this gate.

## 4. Network and API Boundaries

- OID4VCI Issuer traffic goes directly from device to Issuer.
- The company backend does not proxy credential negotiation.
- Backend sync receives only finalized compact credentials through `importCredential`.
- Mobile app calls only allowed Orval-generated SDK endpoints from `docs/API.md`.
- Mobile app never connects directly to MySQL.
- Local development backend under `server/` is acceptable only behind the SDK/API boundary.
- OID4VP online presentation must run device-to-Verifier directly.
- OID4VP Verifier requests must be rejected unless both the `client_id` and `direct_post` origin are allowlisted. Production should use registered `did:web` Verifiers; the current `redirect_uri:` Verifier is development-only.

### Local Backend Hardening

The `server/` backend is development-only and is not the production Wallet Backend. Real local runs still require:

- Explicit non-default `JWT_SECRET`; only tests may use a deterministic default.
- Configured development CORS origins instead of wildcard origin.
- Rate limiting on login and registration routes.
- HS256-only JWT verification.
- Distinct logging and responses for invalid authentication versus infrastructure failures.

## 5. Bundle and Build Security

- MSW must not be included in production EAS builds.
- Production source maps must not be committed or shipped.
- API base URLs and local secrets belong in ignored `.env` files.
- Metro bundles, Hermes bytecode, and EAS logs must be checked for leaked credential data before release.

## 6. Current Security Findings

See `SECURITY_FINDINGS.md` for the June 4 auth and crypto review. Latest resolved items:

- Startup now asserts the hardware secure environment.
- Software signing fallback was removed.
- Android production MMKV key storage uses hardware-backed constraints where available.
- Startup errors are mapped to user-facing messages.
