# Per-Credential Signing Keys + Wallet Attest Key (v2 Crypto)

> **Date:** 2026-07-24  
> **Status:** Approved for spec review  
> **Supersedes:** `docs/adr/0009-wallet-level-holder-signing-key.md` (when implemented)  
> **Related:** ADR 0008 (Keychain Ed25519), P1/P2/P3/P6 user journeys, `src/services/crypto/crypto.ts`

## Summary

Align wallet cryptography with P1/P2 sequence diagrams:

- **`k_attest`** — one wallet attestation key for Wallet Provider (WUA/WIA).
- **`k_cred`** — one Ed25519 seed (and `did:key`) **per credential**, created at issuance (P1 step 17, P2 step 12).

v2 ships **both together** and remains **disabled** until a Wallet Provider API for WUA/WIA is defined and implemented. Storage follows **ADR 0008** (Keychain-protected software Ed25519, biometric sign-time gate) using **one Keychain service per key** (Approach A). WSCD / hardware non-extractable keys are out of scope until target hardware (Samsung Galaxy A26) proves Ed25519 in AndroidKeyStore.

**Migration:** greenfield only — existing single-key wallets must re-issue all credentials; no in-place key rebinding.

## Problem

Today (ADR 0009):

- One Keychain Ed25519 seed → one `did:key` for all OID4VCI PoP, OID4VP, and SD-JWT KB-JWT.
- No `k_attest` or WUA/WIA path.
- P3 wallet-wide `rotateWalletKey()` marks every credential `renewal-required`.
- P6 “destroy document key” is lifecycle metadata only — the signing seed remains.

Journey diagrams (P1, P2, P3, P6) require per-document `did:key` generation and secure destruction, plus a separate wallet attestation key for ecosystem trust.

## Goals

1. Generate a **new `did:key` per credential** at issuance PoP time.
2. Sign presentations and renewals with **that credential’s key** only.
3. **Destroy** the Keychain entry on P6/P3 old-key cleanup (real cryptographic isolation).
4. Introduce **`k_attest`** and WUA/WIA retrieval from Wallet Provider at activation.
5. Preserve **one biometric prompt per user action** (sign-time Keychain gate only).
6. Preserve **Ed25519 / `alg: EdDSA`** on the wire (ADR 0008 algorithm choice unchanged).

## Non-goals (v2.0)

- Hardware WSCD / Secure Element key generation on device (logical lane only).
- Play Integrity / DeviceCheck attestation tokens (optional field reserved on WP client).
- In-place migration of credentials bound to the v1 wallet-level `did:key`.
- Per-credential keys without Wallet Provider attestations (both ship together).

## Key model

| Key | Created | Keychain service | Used for | Destroyed |
|-----|---------|------------------|----------|-----------|
| `k_attest` | Wallet activation (after PIN) | `wallet.ed25519_seed.attest` | WUA/WIA request; optional inclusion in credential request | Wallet reset / reinstall |
| `k_cred` | Each issuance (before PoP) | `wallet.ed25519_seed.cred.{credentialId}` | PoP, SD-JWT KB-JWT, OID4VP for that VC | P3 old key; P6 revoke/used/cancel |

**`did:key`:** derived from each `k_cred` public key using multicodec prefix `[0xed, 0x01]`.

**No global holder DID in v2.** Call sites use `getCredentialHolderDid(credentialId)` instead of `getHolderDid()`.

## Architecture (Approach A — Keychain service per key)

### Modules (`src/services/crypto/`)

| Module | Responsibility |
|--------|----------------|
| `walletAttestKey.ts` | Create/read/destroy `k_attest`; expose `pub_k_attest` JWK |
| `credentialSigningKey.ts` | Generate, sign, destroy per-credential seed; Ed25519 via `@noble/ed25519` |
| `credentialKeyRegistry.ts` | MMKV index: `credentialId → { did:key, keychainService, credentialType, createdAt }` |
| `walletAttestClient.ts` | WP API client for WUA/WIA (interface + dev mock; prod when API frozen) |
| `crypto.ts` | Thin facade; deprecate global `getHolderDid()` / undifferentiated `signProof()` |

### Storage

```
Keychain
  wallet.ed25519_seed.attest
  wallet.ed25519_seed.cred.{credentialId}

MMKV (meta)
  wallet.credential_keys.{credentialId}     → did:key + metadata (no seed bytes)
  wallet.attest.wua / wallet.attest.wia     → cached attestations + expiresAt
  wallet.crypto.v2_enabled                  → true after successful activation attest
```

## Data flows

### Activation (P1 steps 6–10)

```
PIN / biometric setup complete
  → generateWalletAttestKey()
  → walletAttestClient.requestAttestations({ pubKAttestJwk })
  → persist WUA/WIA + expiresAt
  → set wallet.crypto.v2_enabled
```

Wallet is not OPERATIONAL for issuance until attest succeeds.

### Issuance (P1 step 17 / P2 step 12)

`credentialId` does not exist until after `saveCredentialRecord`. Use a **pending key** during claim:

```
resolveOffer()
  → pendingId = createPendingCredentialKey()
  → signProof(pendingId, cNonce, issuerAud)     // new did:key in PoP
  → claimCredential (token + credential request + WUA/WIA when required)
  → saveCredentialRecord → credentialId
  → bindPendingKeyToCredential(pendingId, credentialId)
  → registry[credentialId] = { did:key, ... }
```

Orphan pending keys: GC entries older than `ISSUANCE_PENDING_KEY_TTL_MS` (env-configurable, default 30 minutes).

### Credential request payload (P1 step 20)

Submit PoP + `did:key` as today. When WP attest is available, include WUA/WIA per issuer/WP contract. Issuers that do not yet validate attestations may ignore them.

### Presentation (OID4VP / My QR)

```
approve presentation for credentialId
  → credentialSigningKey.sign(credentialId, payload)
  → single Keychain biometric gate
```

KB-JWT `cnf` and PoP `kid` must match the **credential’s** `did:key`, not a wallet-global key.

### Renewal (P3)

```
renewal offer accepted
  → newPendingKey → PoP with new did:key
  → store new VC
  → destroyCredentialKey(oldCredentialId)
  → update registry
```

Remove wallet-wide `rotateWalletKey()` marking all credentials.

### Lifecycle destroy (P6)

After Issuer confirmation (or single-use consumed):

```
destroyCredentialKey(credentialId)   // Keychain.delete
  → lifecycle marker (revoked / used / deleted)
  → presentation filters block credential
```

Credential record may remain per journey case; signing must fail.

## Wallet Provider client boundary

v2 feature flag stays **off** until:

1. WP API contract is documented (request/response, TTL, error codes).
2. `walletAttestClient` is implemented (prod URL + dev mock).

```typescript
type WalletAttestClient = {
  requestAttestations(input: {
    pubKAttestJwk: JsonWebKey
    deviceIntegrityToken?: string
  }): Promise<{ wua: string; wia: string; expiresAt: string }>
}
```

| Environment | Config |
|-------------|--------|
| Mobile | `EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL` |
| Dev mock | Local `server/` reference route (LAN), same pattern as presentation gateway |

## Feature gating

| Condition | Behavior |
|-----------|----------|
| `wallet.crypto.v2_enabled` false | Block issuance; show activation retry if attest failed |
| v1 single-key wallet detected | Greenfield message: re-issue all credentials (no migration) |
| WUA/WIA expired | Refresh before claim; fail claim if refresh fails |

No release that enables per-doc keys without WP attest path.

## Error handling

| Failure | Behavior |
|---------|----------|
| WP unreachable at activation | Retry UI; wallet not OPERATIONAL for issuance |
| User cancels Keychain sign | Abort action; no partial bind of pending key to credential |
| PoP rejected | Log diagnostic; do not auto-rotate key |
| `destroyCredentialKey` fails | Log error; block presentation for that credential |
| Pending key GC | Background cleanup; log count only |

All surfaced errors: raw scoped log first, generic UI message (no secrets/PII).

## Security

- ADR 0008 tradeoff retained: software Ed25519, Keychain-protected seed, not hardware non-extractable.
- One biometric prompt per user-initiated action that signs.
- Seeds and WUA/WIA never logged.
- `destroyCredentialKey` is irreversible (`Keychain.resetGenericPassword` for that service).

## Testing

| Layer | Focus |
|-------|--------|
| Unit | Registry, pending→bind, destroy removes signing, GC pending keys |
| Integration | OID4VCI claim PoP `iss`/`sub`/`kid` match credential `did:key`; `cnf` on received SD-JWT |
| Contract | Mock WP client; WUA/WIA attach to credential request |
| Device | Deferred until WP API + v2 flag enabled on Galaxy A26 |

## Supersedes / removes

- **ADR 0009** — single wallet-level holder key (superseded by new ADR when code lands).
- Global `getHolderDid()` for protocol signing.
- `rotateWalletKey()` marking all credentials on one wallet key rotation.
- Backend sync `associated_did` must use per-credential `did:key` at sync time.

## Rollout

1. Freeze Wallet Provider WUA/WIA API (external dependency).
2. Land ADR 0010 (or update ADR 0009 status to Superseded).
3. Implement crypto modules + registry + exchange/presentation routing.
4. Dev mock WP on `server/`.
5. Greenfield v2 only; document re-issue requirement for v1 wallets.
6. E2E P1/P2 golden path with mock WP, then production WP URL.

## Open dependencies

| Dependency | Owner | Blocks |
|------------|-------|--------|
| Wallet Provider WUA/WIA API | External / customer | v2 release |
| Issuer accepts per-doc `did:key` in PoP | Issuer config | E2E validation |
| Trust Registry attest verification | Issuer | Step 21 (Peer) — not wallet |

## Related documents

- `docs/adr/0008-keychain-protected-ed25519-production-signing.md`
- `docs/adr/0009-wallet-level-holder-signing-key.md` (current v1)
- `docs/User_Journey/id_card/P1.md`
- `docs/User_Journey/ใบขับขี่/P2.md`
- `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md`
