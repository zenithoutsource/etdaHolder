# ADR 0010 - Per-Credential Signing Keys + Wallet Attest Key (v2 Crypto)

Status: Accepted

Date: 2026-07-24

Supersedes: ADR 0009 (wallet-level holder signing key)

## Context

User journeys (P1, P2, P3, P6) describe:

- **`k_attest`** — a wallet attestation key used with Wallet Provider WUA/WIA at activation.
- **`k_cred`** — a distinct Ed25519 key and `did:key` per credential at issuance (P1 step 17, P2 step 12).
- **Key destruction** on P3 renewal (old key) and P6 lifecycle (revoke, single-use, cancel).

ADR 0009 accepted a single wallet-level Holder signing key for v1: one Keychain Ed25519 seed, one `did:key` for all OID4VCI PoP, OID4VP, and SD-JWT KB-JWT. Document lifecycle used MMKV markers only — no per-document cryptographic key destruction.

ADR 0008 remains the algorithm and storage baseline **only for flag-off Ed25519 `k_cred`**. Production holder algorithm and storage for hardware keys are ADR 0011 (P-256 / ES256, AndroidKeyStore). Hardware WSCD / non-extractable keys for `k_attest` are in scope under ADR 0011. `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED` defaults on; Galaxy A26 device-gate evidence (StrongBox, capacity, WP attestation, E2E issue/present/proximity) is still required before production cutover is treated as validated.

## Decision

Adopt **v2 crypto** with two key classes, shipped together:

1. **`k_attest`** — one wallet attestation key (`wallet.p256.attest` hardware P-256 per ADR 0011) for Wallet Provider WUA/WIA. Cached attestations in MMKV (`wallet.attest.wua`, `wallet.attest.wia`). v2 issuance is gated until activation attest succeeds (`wallet.crypto.v2_enabled`).

2. **`k_cred`** — one Ed25519 seed per credential (`wallet.ed25519_seed.cred.{credentialId}`). Each credential's Holder `did:key` is derived from its public key (multicodec prefix `[0xed, 0x01]`). Issuance uses a **pending key** before `credentialId` exists, then binds after `saveCredentialRecord`.

3. **Storage (Approach A)** — one Keychain service per key; MMKV registry maps `credentialId → { holderDid, keychainService, credentialType, createdAt }` without storing seed bytes.

4. **Signing scope** — OID4VCI PoP, OID4VP, and SD-JWT KB-JWT use the credential's key. `k_attest` is not used for VC PoP or presentation.

5. **Destruction** — P3 renewal and P6 lifecycle call `destroyCredentialKey()` to delete the Keychain entry and registry row. Orphan pending keys are garbage-collected after `EXPO_PUBLIC_ISSUANCE_PENDING_KEY_TTL_MS` (default 30 minutes).

6. **Migration** — greenfield only. v1 single-key wallets must re-issue all credentials; no in-place rebinding.

## Alternatives considered

1. **Keep ADR 0009 (single wallet key)** — simplest; does not match journey diagrams or audit expectations for per-document holder DIDs.
2. **Hybrid (wallet PID key + per-document keys for non-PID)** — partial journey match; highest operational complexity. Not chosen.
3. **Hardware WSCD per key** — strongest isolation; adopted for P-256 / ES256 in ADR 0011. Ed25519 in AndroidKeyStore remains unavailable.

## Consequences

- **Global `getHolderDid()` is deprecated** for protocol paths. Call sites use `getCredentialHolderDid(credentialId)`.
- **Wallet-wide `rotateWalletKey()`** no longer marks all credentials renewal-required; rotation is per-credential on P3 renewal.
- **P6 Case 1 / Case 3** destroy the credential's private key in Keychain, not only MMKV lifecycle markers.
- **Activation dependency** — wallet is not OPERATIONAL for v2 issuance until Wallet Provider WUA/WIA succeeds. Dev mock server supplies reference attest routes until production WP API is frozen.
- **One biometric prompt per user action** — sign-time Keychain gate only; no extra app-level biometric in front of signing.
- **ADR 0009** is superseded for new work; v1 behavior remains until `wallet.crypto.v2_enabled` is set.

## Related decisions

- ADR 0008 — superseded by ADR 0011 for holder algorithm/storage; Ed25519 `k_cred` remains flag-off only
- ADR 0009 — superseded by this ADR for v2
- ADR 0011 — hardware P-256 / ES256 holder keys (`k_attest` + flagged `k_cred`)
- Spec: `docs/superpowers/specs/2026-07-24-per-credential-signing-keys-design.md`
