# ADR 0011 - Hardware P-256 / ES256 Holder Keys

Status: Accepted

Date: 2026-08-13

Supersedes: ADR 0008 for holder algorithm and storage; ADR 0002 (Animo native signing module)

Updates: ADR 0001 (hardware non-extractable restored for protocol holder keys); ADR 0010 (topology kept)

## Context

ADR 0007/0008 adopted Keychain-protected software Ed25519 because the program required `alg: EdDSA` and target Android devices could not generate hardware Ed25519 in AndroidKeyStore. That satisfied protocol EdDSA but not ADR 0001 hardware non-extractability.

Stakeholders now accept P-256 / ES256 for holder proofs. Android StrongBox documents P-256. The Animo `@animo-id/expo-secure-environment` spike (ADR 0002) did not meet attestation-at-create and StrongBox-first policy, so production uses the custom Expo module `modules/expo-wallet-hardware-ecdsa`.

ADR 0010 topology stays: one wallet `k_attest` plus one `k_cred` per credential. This ADR changes algorithm and storage for those keys.

## Decision

Use hardware non-extractable P-256 keys and wire algorithm `alg: ES256` for holder signing:

1. **Curve / JWT alg** — P-256 (`secp256r1`); JWS signature is 64-byte `r‖s`.
2. **Storage** — AndroidKeyStore via `modules/expo-wallet-hardware-ecdsa`. StrongBox-first at `createKey`; TEE fallback only on explicit StrongBox unavailability. JavaScript never receives private key bytes.
3. **`k_attest`** — alias `wallet.p256.attest`. Activation POSTs a Wallet Provider challenge, creates the key with that challenge, then POSTs `pub_k_attest` plus the Android attestation certificate chain. The wallet does not sign WUA/WIA with `k_attest`. After success, destroy leftover Ed25519 attest Keychain material (`wallet.ed25519_seed.attest`) without a biometric prompt.
4. **`k_cred`** — one hardware P-256 key per credential when `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED=true`. Until that flag is the production default (Galaxy A26 gate), Ed25519 `k_cred` remains the flag-off path (ADR 0008 storage for those keys only).
5. **Remote attestation** — Wallet Provider must verify `k_attest` hardware backing (chain, roots, revocation, app identity, security level, user-auth). The local `server/` handler is a development mock: unsigned `alg: none`, no root/revocation/app-identity verify. Never point production `EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL` at that mock. `k_cred` is not remotely attested in P1–P6.
6. **Platform** — Android production only. iOS issuance and presentation stay blocked until Secure Enclave lands.
7. **Biometric** — one prompt per user action on `k_cred` PoP / presentation. Activation does not add a `k_attest` biometric.

## Consequences

- Holder proofs use `alg: ES256` and P-256 `did:key` (multicodec `0x1200`) when hardware signing is enabled.
- ADR 0008 is no longer the production holder algorithm/storage decision. Ed25519 `k_cred` is a temporary flag-off path until the A26 cutover gate.
- ADR 0002 is superseded; do not reintroduce Animo as the production signer.
- Production Wallet Provider verification, signed WUA/WIA, PID-first cutover, proximity opaque-handle signing, and defaulting the hardware flag on remain out of this activation slice.

## Related decisions

- ADR 0001 — hardware non-extractable principle restored for P-256 holder keys
- ADR 0002 — superseded (custom module)
- ADR 0008 — superseded for holder algorithm/storage
- ADR 0010 — `k_attest` + per-credential `k_cred` topology unchanged
- Specs: `docs/superpowers/specs/2026-08-04-hardware-p256-es256-signing-design.md`, `docs/superpowers/specs/2026-08-13-hardware-k-attest-activation-design.md`
