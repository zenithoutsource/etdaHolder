# Security Policy

This document defines mandatory security constraints for the the wallet. Any code that violates them must not be merged.

## 1. Cryptographic Key Policy

### Holder keys (`k_attest` and `k_cred`)

Production holder keys follow ADR 0011 (topology from ADR 0010):

- **`k_attest`** — one hardware P-256 key per wallet at AndroidKeyStore alias `wallet.p256.attest`. JavaScript never receives private key bytes. Wallet Provider remote attestation applies to this key only: the wallet POSTs a challenge, creates the key with those bytes, then POSTs `pub_k_attest` plus the Android attestation certificate chain. The wallet does not sign WUA/WIA with `k_attest`. The local `server/` handler is a development mock (`alg: none`; no root, revocation, or app-identity verify) and must never be used as a production Wallet Provider.
- **`k_cred`** — one key per credential. When `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED=true` on Android, that key is hardware P-256 (`alg: ES256`, `did:key` multicodec `0x1200`). Otherwise the flag-off path remains a Keychain-protected software Ed25519 seed (`alg: EdDSA`, multicodec `[0xed, 0x01]`). Hardware `k_cred` is not remotely attested in P1–P6.
- **Native module** — `modules/expo-wallet-hardware-ecdsa`. StrongBox-first at create; TEE only on explicit StrongBox unavailability.
- **iOS** — production issuance and presentation are blocked until Secure Enclave lands.
- **Biometric** — one prompt per user action on `k_cred` PoP or presentation. Activation does not add a second `k_attest` prompt.

### Non-Signing Crypto

`react-native-quick-crypto` is allowed for:

- random bytes
- hashing
- HMAC
- AES-GCM wrapping for non-signing local storage keys
- base64url and encoding support

It must not be used for holder signing. Hardware ECDSA signing stays in the native module. Flag-off Ed25519 signing uses `@noble/ed25519` with the Keychain-protected seed.

### Public Key and Holder DID

Hardware P-256 public keys are exported as JWK `{ "kty": "EC", "crv": "P-256", "x", "y" }`. The Holder DID is `did:key` with multicodec varint `0x1200` and the 33-byte compressed public key. PoP and presentation JWT headers use `alg: ES256`.

Flag-off Ed25519 public keys remain raw 32-byte bytes. The Holder DID is:

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
- Android application backup and restore is disabled (`expo.android.allowBackup = false`). Wallet Keychain entries, encrypted MMKV files, and their device-bound Android Keystore keys must not cross an installation boundary independently; a reinstall starts a new wallet and requires credential reissuance.

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
- Before sending an OID4VP response, the wallet stores only SHA-256 fingerprints
  of the authorization-request URI and nonce in encrypted wallet storage. Callback,
  startup, and PIN-unlock routing reject those fingerprints to prevent a stale
  request from reopening after process death. This is a local replay guard; the
  Verifier remains responsible for authoritative nonce validation.
- OID4VP Verifier requests must be rejected unless both the `client_id` and `direct_post` origin are allowlisted. Production should use registered `did:web` Verifiers; the current `redirect_uri:` Verifier is development-only.

### Local Backend Hardening

The `server/` backend is development-only and is not the production Wallet Backend. Real local runs still require:

- Explicit non-default `JWT_SECRET`; only tests may use a deterministic default.
- Configured development CORS origins instead of wildcard origin.
- Rate limiting on login and registration routes.
- HS256-only JWT verification.
- Distinct logging and responses for invalid authentication versus infrastructure failures.

## 5. Bundle and Build Security

- Android application backup and restore is disabled through `expo.android.allowBackup = false`. Wallet Keychain entries, encrypted MMKV files, and their device-bound Android Keystore keys must not cross an installation boundary independently; a reinstall starts a new wallet and requires credential reissuance.
- The existing PIN fallback is only a same-install recovery mechanism; it does not make the Ed25519 signing seed portable or authorize restoring wallet storage across installations.
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

Superseded by later decisions: ADR 0008 (2026-06-16) reintroduced software Ed25519 signing after AndroidKeyStore Ed25519 failed on target hardware. ADR 0011 (2026-08-13) restored hardware P-256 / ES256 for holder keys (`k_attest`, and `k_cred` when the hardware flag is on) — see Section 1 above. The "software signing fallback was removed" finding above refers only to the pre-ADR-0007 temporary path, not the ADR 0008 flag-off Ed25519 `k_cred` path.
