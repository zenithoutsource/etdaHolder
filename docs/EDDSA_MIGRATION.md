# EdDSA (Ed25519) Migration Plan — OID4VCI PoP and OID4VP Presentation (2026-06-15)

ETDA requires `alg: EdDSA` (Ed25519) for the OID4VCI Proof of Possession (PoP) JWT and the OID4VP SD-JWT+KB presentation token. This is Phase 5 in `docs/ROADMAP.md` and the current Immediate Next Task in `AGENTS.md`. This document lists what has to change, in order, to get there.

## Current state

- Production Wallet Signing Key is P-256 (Secp256r1), generated and used via `@animo-id/expo-secure-environment` (`generateKeypair`, `sign`, `getPublicBytesForKeyId`).
- `@animo-id/expo-secure-environment` README confirms it only supports **Secp256r1 / ECDSA-SHA256** — no Ed25519. There is no native EdDSA signing path today.
- `src/services/crypto/crypto.ts`:
  - `signProof()` → OID4VCI PoP, `alg: ES256`, hardware P-256 key, `kid`-based header.
  - `signPresentationVpToken()` → OID4VP JWT VP token, `alg: ES256`, hardware P-256 key.
  - `signSdJwtKbPresentationToken()` → OID4VP SD-JWT KB-JWT, `alg: ES256`, hardware P-256 key, enforces `cnf.jwk`/`cnf.kid` holder binding via `assertSdJwtHolderBinding`.
  - `getHolderDid()` / `getPublicKeyJwk()` → `did:key` from compressed P-256 key, multicodec prefix `[0x80, 0x24]`.
- A **development-only** software Ed25519 path already exists, gated by `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING`:
  - `signSoftwareEddsaProof()`, `signSoftwareEddsaSdJwtKbPresentationToken()`, `getSoftwareEd25519HolderDid()`, `ed25519PublicKeyToDidKey()` (multicodec prefix `[0xed, 0x01]`), `publicKeyToEd25519Jwk()` (`kty: OKP, crv: Ed25519`).
  - Uses `@noble/curves/ed25519.js`, secret key stored in plaintext in MMKV meta storage (`wallet.software_ed25519_secret_key`) — **forbidden in release builds**.

## Why this is hard

The hardware module (`@animo-id/expo-secure-environment`) cannot produce Ed25519 signatures. There is no software fallback allowed in production (CLAUDE.md: "no software signing fallback is allowed in production"). So step 1 below — finding or building a hardware-backed Ed25519 signer — is the actual blocker; everything else is just rewiring `crypto.ts` once that exists.

## Steps

### 1. Resolve the native Ed25519 signing module

Pick one (needs an ADR — see step 2):

- **Option A — Secure Enclave / StrongBox Ed25519 directly.** iOS Secure Enclave does not support Ed25519 (P-256/P-384/P-521 only). Android Keystore (API 33+, BoringSSL-backed StrongBox/TEE on supporting devices) added `Ed25519` support via `KeyProperties.KEY_ALGORITHM_EC` + `AlgorithmParameterSpec` for `Ed25519` on some OEMs, but it is **not universally available** below API 33 / on all secure elements. This option likely fails the "works on both iOS and Android" requirement on its own.
- **Option B — Extend or fork `@animo-id/expo-secure-environment`** to add an Ed25519 code path where the platform secure element supports it, with a documented fallback story for platforms that don't (e.g., iOS Secure Enclave). This is the most aligned with existing architecture (same module, same `kid`-based key alias pattern) but is new native module work (Swift + Kotlin).
- **Option C — Keep P-256 hardware signing for the *device key*, but layer an Ed25519 *credential-binding key* generated and held in a hardware-backed keystore that does support Ed25519 on the target devices** (effectively Option B scoped down to Android-only devices that support it, with iOS needing Option A/B research). Practically this still reduces to "does the target device's secure element support Ed25519," so it converges with Option A.

Action: spike Option B against the actual target devices (the ones used for Phase 4 golden-path validation) before committing. If no target device's secure element supports Ed25519, escalate to ETDA/architecture — the EdDSA requirement and the "no software signing fallback in production" rule may be in direct conflict and need a documented exception or a different key-storage strategy (e.g., Keystore-wrapped key without raw extraction, even if not in the dedicated secure element).

### 2. Write the ADR

New `docs/adr/0007-eddsa-ed25519-production-signing.md` (or next free ADR number), covering:

- The chosen native module approach from step 1, and why the alternatives were rejected.
- New Holder DID / JWK rules for Ed25519 (`did:key` with multicodec prefix `[0xed, 0x01]`, `kty: OKP, crv: Ed25519` — same shape as the existing dev software path in `crypto.ts`, just hardware-backed).
- Key rotation / migration story for wallets that already hold a P-256-bound Holder DID and previously issued credentials (see step 5).
- Confirmation that the software EdDSA path (`@noble/curves`) is dev/testing-only and is removed from release builds (already true via `isSoftwareEddsaEnabledForTesting`, but the ADR should make this an explicit, audited constraint).

### 3. Implement the native Ed25519 signer

- Add the native module (new package or extend `@animo-id/expo-secure-environment` per the ADR), exposing the same shape as the existing `SecureEnvironment` interface: `generateKeypair`, `getPublicBytesForKeyId`, `sign`, `deleteKey` — but producing/consuming raw 32-byte Ed25519 keys and 64-byte Ed25519 signatures instead of P-256.
- Wire it into `expo-modules-core` autolinking, `npx expo install`, and `npx expo prebuild --clean` for both platforms.
- Add a `secureEnvironmentPolicy.ts`-level guard (see existing `src/services/crypto/secureEnvironmentPolicy.ts`) so startup fails hard if the native Ed25519 module is unavailable in a release build — same "hard block, no bypass" pattern as ADR 0004/0005.

### 4. Migrate `crypto.ts`

Once the native signer exists:

- Replace the P-256 key generation/derivation in `generateWalletKeyIfNeeded()`, `getHolderDid()`, `getPublicKeyJwk()` with the Ed25519 equivalents — reuse `ed25519PublicKeyToDidKey()` and `publicKeyToEd25519Jwk()` (already written for the dev path, just point them at the native key instead of the Noble-generated one).
- `signProof()`: emit `alg: EdDSA`, sign via the native Ed25519 module instead of `sign()` from `@animo-id/expo-secure-environment`. Drop the `isSoftwareEddsaEnabledForTesting()` branch — production and dev now use the same algorithm, differing only in *which* module signs.
- `signPresentationVpToken()`: same — `alg: EdDSA`, native signer.
- `signSdJwtKbPresentationToken()`: same — `alg: EdDSA`, native signer. `assertSdJwtHolderBinding` already accepts `OKP/Ed25519` JWKs (it's shape-agnostic via `isSameJwk`), so this should need no change beyond the signer call.
- Once production uses native EdDSA, delete `signSoftwareEddsaProof()`, `signSoftwareEddsaSdJwtKbPresentationToken()`, `getOrCreateSoftwareEd25519SecretKey()`, `getSoftwareEd25519HolderDid()`, and `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING` / `isSoftwareEddsaEnabledForTesting()` from `runtimeFlags.ts` — no reason to keep two EdDSA code paths once one is hardware-backed.
- `resetWalletKey()` / `hasWalletKey()` / `getWalletKeyRegisteredAt()` need no shape change, just operate on the new key.

### 5. Re-issue credentials and re-test holder binding

- Any credential already issued under the old P-256 `did:key` has `cnf.jwk`/`cnf.kid` bound to that key. After migrating, `assertSdJwtHolderBinding()` will reject those credentials (`PresentationCredentialHolderBindingMismatch`).
- Re-run the OID4VCI claim flow against the dev Issuer to get new credentials bound to the new Ed25519 Holder DID, then re-test the OID4VP Verifier flow end-to-end (`docs/SPEC_COMPLIANCE_OID4VC.md` "OK" items for SD-JWT+KB and DCQL `vp_token` shape should still hold — only `alg` and key material change).
- Existing wallet installs (if any test devices have enrolled keys) need a "regenerate Wallet Signing Key" path — `resetWalletKey()` + `generateWalletKeyIfNeeded()` already exist for this; confirm the UI/flow that triggers re-enrollment is acceptable (likely: detect old key format at startup, prompt re-enrollment).

### 6. Quality gates and sequencing

- `yarn tsc --noEmit`, `yarn lint`, `yarn test` after each step (3-5), per CLAUDE.md.
- Update `AGENTS.md` Implementation Status Tracker: check off "ETDA EdDSA OID4VCI PoP migration" and "Production native Ed25519 signer for OID4VCI/OID4VP" only after step 5 passes end-to-end against the dev Issuer/Verifier.
- Phase 4 release validation (EAS builds + physical-device golden path) stays sequenced **after** this migration, per `docs/ROADMAP.md` Phase 4 "Remaining" — credentials need reissuing under the new key before a meaningful walkthrough.

## Open question to resolve first

Step 1 is the real unknown: whether any realistic target device's secure element supports Ed25519 at all. If not, this migration cannot proceed without either (a) a documented, ETDA-approved exception to "no software signing fallback in production" for the holder-binding key specifically, or (b) ETDA accepting P-256/ES256 with a `did:key` Ed25519-equivalent mapping (unlikely, since `alg: EdDSA` is what's being checked on the wire). Recommend raising this with ETDA/architecture before investing in native module work.
