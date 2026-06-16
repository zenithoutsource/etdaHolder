# EdDSA (Ed25519) Migration Plan — OID4VCI PoP and OID4VP Presentation (2026-06-15)

ETDA requires `alg: EdDSA` (Ed25519) for the OID4VCI Proof of Possession (PoP) JWT and the OID4VP SD-JWT+KB presentation token. This is Phase 5 in `docs/ROADMAP.md` and the current Immediate Next Task in `AGENTS.md`. This document lists what has to change, in order, to get there.

## Implementation status (2026-06-15)

- Android-first implementation is now wired through the local Expo module `modules/etda-wallet-eddsa` and `src/services/crypto/nativeEddsaSigner.ts`.
- `src/services/crypto/crypto.ts` now derives an Ed25519 `did:key`, emits `alg: EdDSA`, and signs OID4VCI PoP, OID4VP JWT VP, and OID4VP SD-JWT KB-JWT tokens through the native module.
- The development-only software Ed25519 signing flag/path has been removed from app code.
- Remaining blocker: physical Android target devices must still prove AndroidKeyStore Ed25519 key generation works and reports TEE or StrongBox backing. iOS remains deferred to a separate ADR.

## Current state

- Production Android Wallet Signing Key is Ed25519, generated and used through the local Expo module `EtdaWalletEddsa` (`generateKeypair`, `sign`, `getPublicBytesForKeyId`).
- `@animo-id/expo-secure-environment` README confirms it only supports **Secp256r1 / ECDSA-SHA256** — no Ed25519. The wallet no longer uses it for signing.
- `src/services/crypto/crypto.ts`:
  - `signProof()` → OID4VCI PoP, `alg: EdDSA`, native Ed25519 key, `kid`-based header.
  - `signPresentationVpToken()` → OID4VP JWT VP token, `alg: EdDSA`, native Ed25519 key.
  - `signSdJwtKbPresentationToken()` → OID4VP SD-JWT KB-JWT, `alg: EdDSA`, native Ed25519 key, enforces `cnf.jwk`/`cnf.kid` holder binding via `assertSdJwtHolderBinding`.
  - `getHolderDid()` / `getPublicKeyJwk()` → `did:key` from raw Ed25519 key, multicodec prefix `[0xed, 0x01]`.
- The former development-only software Ed25519 path (`EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING`, Noble signing, JS-accessible secret key) has been removed from app code.

## Why this is hard

The hardware module (`@animo-id/expo-secure-environment`) cannot produce Ed25519 signatures. There is no software fallback allowed in production (CLAUDE.md: "no software signing fallback is allowed in production"). So step 1 below — finding or building a hardware-backed Ed25519 signer — is the actual blocker; everything else is just rewiring `crypto.ts` once that exists.

**Project priority is Android-first** (2026-06-15). This significantly de-risks step 1: Android `java.security.Signature` supports `Ed25519` from API 33 ([source](https://developer.android.com/reference/java/security/Signature)), unlike iOS Secure Enclave which can never support it (Apple hardware limitation). Whether `AndroidKeyStore` `KeyPairGenerator` can *generate* a hardware-backed Ed25519 keypair on API 33+ is **not yet confirmed by official docs** — `KeyPairGenerator`'s documented algorithm list shows `XDH` from API 33 but does not list `Ed25519` ([source](https://developer.android.com/reference/java/security/KeyPairGenerator)). This must be spiked on-device (see step 1 Action). iOS is deferred — its own ADR exception (software/Keychain-backed Ed25519) can be resolved later without blocking the Android release path.

## Steps

### 1. Resolve the native Ed25519 signing module (Android-first)

Pick one (needs an ADR — see step 2):

- **Option A — Android Keystore Ed25519 directly (primary path).** `Signature` on API 33+ supports `alg: Ed25519` for signing/verification ([source](https://developer.android.com/reference/java/security/Signature)). Whether `AndroidKeyStore`'s `KeyPairGenerator` can generate and hardware-back an `Ed25519` keypair (vs. only `EC`/`XDH`, per [KeyPairGenerator docs](https://developer.android.com/reference/java/security/KeyPairGenerator)) is unconfirmed and **must be spiked on the actual Phase 4 Android target devices first**. If on-device spike confirms hardware-backed `AndroidKeyStore` Ed25519 keygen on API 33+, this is hardware-backed, in-architecture, Android-only work (Kotlin only, no Swift). iOS deferred to a separate track (see below).
- **Option B — Extend or fork `@animo-id/expo-secure-environment`** to add an Android Ed25519 code path (per Option A) behind the same `SecureEnvironment` interface, with iOS left on P-256/ES256 (or a documented future Keychain-backed fallback) until its own ADR. Most aligned with existing architecture (same module, same `kid`-based key alias pattern); new native module work is Kotlin-only for the Android-first slice.
- **Option C — Per-platform signing algorithm** (interim): Android ships `alg: EdDSA` once Option A/B lands; iOS continues with `alg: ES256` until its native/Keystore-equivalent path is resolved. Requires `crypto.ts` and `assertSdJwtHolderBinding`/Verifier-side to tolerate per-platform `alg`/holder-DID differences — needs explicit ETDA sign-off that a temporary per-OS algorithm split is acceptable.

Action: spike Option A on the actual Phase 4 Android target devices — check `Build.VERSION.SDK_INT >= 33`, attempt an `AndroidKeyStore` `KeyPairGenerator` with `Ed25519`, and on success inspect `KeyInfo.getSecurityLevel()` (target SDK 29+) for `SECURITY_LEVEL_TRUSTED_ENVIRONMENT` or `SECURITY_LEVEL_STRONGBOX` — not just `isInsideSecureHardware()`, since the release gate is hardware-backed Ed25519 specifically, not merely "signing works" ([source](https://developer.android.com/privacy-and-security/keystore)). If it works on target devices with a `TRUSTED_ENVIRONMENT`/`STRONGBOX` security level, proceed with Option B (Android-only native module) and treat iOS as a separate, non-blocking deferred track under its own ADR. If target Android devices are below API 33, lack Ed25519-capable Keystore keygen, or only achieve `SECURITY_LEVEL_SOFTWARE`, escalate to ETDA/architecture per the open question below — same conflict as before, just scoped to Android now.

#### Reference: procivis/one-core precedent (2026-06-15)

[`procivis/one-core`](https://github.com/procivis/one-core) (the Rust core behind [`procivis/react-native-one-core`](https://github.com/procivis/react-native-one-core), an eIDAS 2.0-targeted wallet core) supports SD-JWT VC, ISO mdoc, and W3C VC-JOSE-COSE with `EdDSA Ed25519` alongside `ES256`. Its documented key-storage tiers are Secure Enclave (iOS) / Android Keystore TEE+StrongBox / Azure Key Vault HSM / internal encrypted database fallback.

This does not change the conclusion above — it confirms it. iOS Secure Enclave still cannot produce Ed25519 signatures (Apple hardware limitation, independent of any library), so even this reference eIDAS 2.0 implementation must fall back to its "internal encrypted database" tier for Ed25519 keys on iOS. There is no known library or platform API that gives true hardware-backed Ed25519 on iOS today.

**Note for ADR use**: this precedent is cited as a *reference implementation only* (its key-storage crate's approach to Android Keystore/iOS Keychain Ed25519 wrapping). Exact source ref/version and license were not pinned as of this writing — before citing this precedent in the ADR (step 2) or forking any of its code (step 3), confirm the specific commit/tag reviewed and its license terms permit reference or reuse.

Decision: stay on the current stack (`@sphereon/oid4vci-client` + `@animo-id/expo-secure-environment`) rather than adopting `@procivis/react-native-one-core` wholesale. A full swap would replace the OID4VCI client, the crypto layer, and the credential storage model — re-touching Phases 1-4 (`docs/ROADMAP.md`, all "Complete"/"Substantially complete") — while not closing the iOS gap any further than Option B does. If Option B's native module is built, `procivis/one-core`'s key-storage crate (Android Keystore/iOS Keychain wrapper for Ed25519) may be usable as a reference or fork source for that module's implementation, license permitting — but this is an implementation detail of step 3, not a stack change.

### 2. Write the ADR

New `docs/adr/0007-eddsa-ed25519-production-signing.md` (or next free ADR number), covering:

- The chosen native module approach from step 1, and why the alternatives were rejected.
- New Holder DID / JWK rules for Ed25519 (`did:key` with multicodec prefix `[0xed, 0x01]`, `kty: OKP, crv: Ed25519` — same shape as the existing dev software path in `crypto.ts`, just hardware-backed).
- Key rotation / migration story for wallets that already hold a P-256-bound Holder DID and previously issued credentials (see step 5).
- Confirmation that the software EdDSA path (`@noble/curves`) is dev/testing-only and is removed from release builds (already true via `isSoftwareEddsaEnabledForTesting`, but the ADR should make this an explicit, audited constraint).

### 3. Implement the native Ed25519 signer

- Add the native module (new package or extend `@animo-id/expo-secure-environment` per the ADR), exposing the same shape as the existing `SecureEnvironment` interface: `generateKeypair`, `getPublicBytesForKeyId`, `sign`, `deleteKey`. Android's `KeyPairGenerator`/`KeyFactory` expose Ed25519 public keys as encoded `X509EncodedKeySpec` (Java `PublicKey`), not raw bytes — the native module must decode/normalize these to raw 32-byte Ed25519 public key points (and raw 64-byte signatures from `Signature.sign()`) at the JS boundary, so `crypto.ts`'s `ed25519PublicKeyToDidKey()` / `publicKeyToEd25519Jwk()` (which expect raw 32-byte input) need no changes.
- Wire it into `expo-modules-core` autolinking, `npx expo install`, and `npx expo prebuild --clean` for the Android-first slice (iOS wiring deferred to its own ADR/implementation track per step 1).
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

Step 1's remaining unknown is now scoped to Android: do the actual Phase 4 target Android devices run API 33+ and support hardware-backed AndroidKeyStore Ed25519 key generation/signing? Android `java.security.Signature` support for `Ed25519` is documented from API 33, but AndroidKeyStore key generation and hardware backing must be confirmed on-device.

If target Android devices **do** support it: proceed with Option A/B, Android-only, no ETDA escalation needed for the Android release. iOS becomes a separate deferred track.

If target Android devices **do not** (API <33 or no Ed25519-capable Keystore on that hardware): same conflict as before, now scoped to Android — escalate to ETDA/architecture for either (a) a documented exception to "no software signing fallback in production" for the holder-binding key on those devices, or (b) ETDA accepting P-256/ES256 with a `did:key` Ed25519-equivalent mapping (unlikely, since `alg: EdDSA` is checked on the wire).

iOS Ed25519 (Secure Enclave never supports it, confirmed independently and via the procivis/one-core precedent above) remains an open, lower-priority question — resolve only when iOS becomes a release target, via its own ADR exception for software/Keychain-backed Ed25519.
