# Security Policy

This document defines mandatory security constraints for the the wallet. Any code that violates them must not be merged.

## 1. Cryptographic Key Policy

### Signing Key

The wallet uses exactly one Keychain-protected Ed25519 seed for Proof of Possession and presentation signatures.

- Keychain service: `etda.wallet.ed25519_seed`
- Public key cache: `wallet.ed25519_pub_key`
- Backing store: `react-native-keychain` with biometric/device-passcode access control and hardware-backed storage when the platform provides it
- Private key material: a software-generated 32-byte Ed25519 seed, retrieved only for signing
- Generation: once on first launch
- Rotation: explicit user-initiated re-enrollment only
- Native AndroidKeyStore Ed25519 module: diagnostic/experimental only

This satisfies protocol-level `alg: EdDSA` / Ed25519 compatibility. It does not provide hardware-backed non-extractability because the target Android device generated EC keys for AndroidKeyStore Ed25519 requests.

### Non-Signing Crypto

`react-native-quick-crypto` is allowed for:

- random bytes
- hashing
- HMAC
- AES-GCM wrapping for non-signing local storage keys
- base64url and encoding support

It must not be used for Ed25519 signing. Ed25519 signing is performed by `@noble/ed25519` using the Keychain-protected seed.

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
- A PIN-wrapped copy of the MMKV encryption key may be stored in unencrypted meta storage only for startup recovery after the user cancels the Keychain biometric prompt. This uses PBKDF2-SHA256 and AES-256-GCM, contains no raw PIN or raw MMKV key, and is a UX/security tradeoff with offline PIN-guessing risk if device storage is extracted.
- Session data is stored in Keychain, not AsyncStorage.

### Forbidden

- `AsyncStorage` imports in app source.
- Credential claims, VC JWTs, tokens, or PII in `console.log`, crash reporters, analytics, build logs, or screenshots.
- Hardcoded secrets or local `.env` values committed to git.

## 3. Biometric Authentication Gate

Every signature operation must be gated by Keychain biometric/device authentication before the Ed25519 seed is returned for signing.

- The gate applies at key usage time, not just wallet startup.
- User cancellation rejects the sign call.
- JavaScript must not implement a manual PIN fallback for signing-key release.
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

Resolved items from the June 4 auth and crypto review (predates ADR 0007 and ADR 0008; `SECURITY_FINDINGS.md` no longer exists in this repo):

- Startup now asserts the hardware secure environment.
- The temporary Noble software Ed25519 path from that review was removed at the time.
- Android production MMKV key storage uses hardware-backed constraints where available.
- Startup errors are mapped to user-facing messages.

Superseded by later decisions: ADR 0008 (2026-06-16) reintroduced software Ed25519 signing as the accepted production design — see Section 1 above. The "software signing fallback was removed" finding above refers only to the pre-ADR-0007 temporary path, not the current signing key design.
