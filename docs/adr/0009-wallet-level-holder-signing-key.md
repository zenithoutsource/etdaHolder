# ADR 0009 - Wallet-Level Holder Signing Key

Status: Accepted

Date: 2026-07-08

## Context

User journeys in `docs/User_Journey/` describe per-credential holder identity and key lifecycle:

- **P2 step 12** — each credential may be bound to a fresh `did:key` derived from a document-specific key.
- **P3** — wallet key rotation and renewal interact with credentials that were issued under prior holder keys.
- **P6 (all cases)** — after Issuer confirmation, the Wallet may destroy the affected document's private key while keeping or removing the credential record depending on the case.

The wallet implementation uses **one** Keychain-protected Ed25519 seed for all protocol signing (ADR 0008):

- OID4VCI Proof of Possession JWTs
- OID4VP JWT Verifiable Presentations
- OID4VP SD-JWT Key Binding JWTs

The Holder DID (`did:key` with Ed25519 multicodec prefix `[0xed, 0x01]`) is derived from that single public key. All credentials issued through the current wallet share this holder identity at the protocol layer unless an Issuer embeds separate holder-binding metadata in the credential itself.

## Decision

Accept a **single wallet-level Holder signing key** for v1:

- One 32-byte Ed25519 seed in `react-native-keychain`, retrieved under biometric/device authentication at sign time.
- One Holder `did:key` for OID4VCI PoP, OID4VP presentation, and SD-JWT+KB signing.
- Document lifecycle changes (`revoked`, `deleted`, `used`) are enforced through encrypted MMKV lifecycle markers and presentation filters — not through per-document cryptographic key destruction.
- P3 `rotateWalletKey()` continues to mark **all** holder-bound credentials `renewal-required` when the wallet key rotates.

## Alternatives considered

1. **Per-credential Ed25519 seeds** — aligns with journey text; requires new storage, issuance, renewal, presentation, and UI keyed by per-document identities. Deferred to v2 unless the customer mandates it.
2. **Hybrid (wallet PID key + per-document keys for non-PID credentials)** — partial journey match; highest operational and testing complexity. Not chosen for v1.

## Consequences

- **P3:** Rotating the wallet key affects every credential bound to the prior holder DID. Renewal UX and dev renewal endpoints remain wallet-key-scoped, not per-document-key-scoped.
- **P6 Case 1 (holder revoke):** After Issuer confirmation, the wallet updates local lifecycle state and history. It does **not** destroy a document-specific private key because none exists separately from the wallet seed.
- **P6 Case 3 (single-use / Used):** The wallet marks the credential `used` and blocks further presentation. It does **not** destroy a per-document key; replay prevention is local lifecycle gating in v1.
- **Journey deviation is explicit.** Stakeholders reviewing P2/P6 diagrams should treat per-document key destruction as deferred or permanently out of scope unless a future ADR adopts per-credential keys.
- **v2 trigger:** Adopt per-credential keys only if customer Issuer/Verifier interop or audit requirements mandate distinct holder DIDs or hardware-isolated keys per document, and accept the storage, renewal, and presentation refactors that follow.

## Related decisions

- ADR 0008 — Keychain-protected Ed25519 production signing (algorithm and storage)
- ADR 0001 — superseded for production non-extractable hardware key on target Android devices; wallet-level cardinality remains a separate concern
