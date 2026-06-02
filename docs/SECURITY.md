# Security Policy

This document defines the mandatory security constraints for the ETDA Wallet. These are not guidelines — they are hard requirements. Any code that violates them must not be merged.

---

## 1. Cryptographic Key Policy

### Signing Key

The wallet uses exactly one hardware-bound EC P-256 keypair for all Proof of Possession (PoP) JWT signatures.

- **Native module:** `@animo-id/expo-secure-environment`
- **Key alias:** `etda_wallet_signing_key`
- **Backed by:** iOS Secure Enclave on iOS, Android Keystore on Android
- **Non-extractable:** The private key never leaves the secure element. It is never present as bytes in JavaScript memory, never logged, never serialized, and never transmitted.
- **Generation:** Generated once on first launch. If already present under the alias, no new key is generated. Key rotation requires explicit user-initiated re-enrollment.
- **No software fallback:** If the device does not have hardware attestation support, the wallet throws a hard error. Silent downgrade to a software signing path is forbidden.

### Key Usage Boundary

`react-native-quick-crypto` is present in the stack for non-signing operations only: hashing (SHA-256), HMAC, base64url encoding. It must not be used for EC key generation or ECDSA signing. Any PR that routes signing through `react-native-quick-crypto` must be rejected.

### Public Key Format

The public key is returned from `@animo-id/expo-secure-environment` as raw bytes. Before use in a PoP JWT `cnf` claim or `jwk` header, it must be converted to JWK format (key type `EC`, curve `P-256`, coordinates `x` and `y` as base64url). This conversion happens in `src/services/crypto/signingKey.ts`.

---

## 2. Local Storage Standard

### Required

All persistent on-device storage uses `react-native-mmkv` initialized with AES-256 encryption.

The AES-256 encryption key is not hardcoded. It is fetched at runtime from the native hardware keychain:
- iOS: Keychain Services (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`)
- Android: Android Keystore (via `react-native-keychain`)

On first launch, the encryption key is generated using `react-native-quick-crypto` (CSPRNG), stored in the hardware keychain, and then used to initialize the MMKV instance. On subsequent launches, the key is loaded from the keychain.

### Forbidden

`AsyncStorage` is unconditionally forbidden. It stores data in plaintext on the device filesystem. It must not appear in any import statement within `src/`. This is enforced by a lint rule or CI grep check.

No credential claim data (VC JWT payload, PII fields) is written to `console.log`, crash reporters, or analytics pipelines. Log sanitization is enforced before any production release.

---

## 3. Biometric Authentication Gate

Every Proof of Possession (PoP) signature transaction must be gated by biometric authentication.

- The `sign` function exposed by `@animo-id/expo-secure-environment` enforces biometric authentication internally at the native layer before accessing the Secure Enclave / Android Keystore.
- There is no JavaScript-level gate that can be bypassed. The hardware enforces authentication at the key usage boundary.
- If the user cancels biometric authentication, the sign call rejects. The credential request flow surfaces an error to the user. No retry without a new biometric prompt.
- Face ID, Touch ID, and Android biometric authentication are all acceptable modalities. Device PIN fallback is permitted only if the native module explicitly supports it — do not implement a manual PIN fallback in JavaScript.

This gate applies to every PoP JWT construction during OID4VCI credential acquisition, and to every future signature operation added to the wallet (e.g., presentation proofs). No signature bypasses the gate.

---

## 4. Network and API Boundaries

- OID4VCI protocol traffic (credential offer resolution, token endpoint, credential endpoint) communicates directly from the device to the Issuer service. No company backend proxies this traffic.
- The company backend receives only the finalized, validated VC JWT via `POST /wallet-api/wallet/{walletId}/credentials/import`. It does not participate in credential negotiation.
- All HTTPS connections use system TLS. Certificate pinning may be added in a future ADR if the threat model requires it.
- The Orval-generated SDK client is restricted to the allowed endpoints defined in `docs/API.md`. Forbidden endpoints must not be called from application code.

---

## 5. Bundle and Build Security

- MSW (Mock Service Worker) must not be included in the production Expo EAS build. All MSW imports must be in test files only, gated by `process.env.NODE_ENV === 'test'` or equivalent jest setup files.
- Source maps for production builds must not be committed to the repository or shipped to end users.
- Environment variables containing API base URLs, tenant IDs, or other configuration must be defined in `.env` files excluded from version control (see `.env.example` for the required keys).
- No private key material, VC JWT payloads, or user PII may appear in Metro bundle output, Hermes bytecode dumps, or EAS build logs.
