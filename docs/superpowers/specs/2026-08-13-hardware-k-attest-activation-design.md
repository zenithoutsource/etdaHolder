# Hardware k_attest Activation

> **Date:** 2026-08-13  
> **Status:** Approved  
> **Parent:** `docs/superpowers/specs/2026-08-04-hardware-p256-es256-signing-design.md`  
> **Related:** ADR 0011; ADR 0010 topology; P1 canvas steps 6–10  
> **Out of scope:** PID-first cutover gates, proximity opaque-handle signing, removing Ed25519 `k_cred`, defaulting `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED` on

## Summary

Replace Ed25519 Keychain `k_attest` with a hardware P-256 key at alias `wallet.p256.attest`. Claim-time activation POSTs a Wallet Provider challenge, creates the key with that challenge, then POSTs `pub_k_attest` plus the Android attestation chain. The wallet does not sign WUA/WIA with `k_attest`. One biometric remains the `k_cred` PoP session.

The local `server/` handler is a development mock. It does not verify attestation roots, revocation, or app identity. A production Wallet Provider must perform that verification. Never point production `EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL` at this mock.

## Goals

1. `k_attest` is hardware-backed P-256; JavaScript never receives private key bytes.
2. Android attestation challenge is supplied only at `createKey`.
3. WP request is `pub_k_attest` + certificate chain + idempotency key (P1 steps 6–8). No `k_attest` signature.
4. Activation is retryable via persisted `wallet.activation.tx` in encrypted credential storage.
5. If `wallet.p256.attest` is missing, run hardware activation even when `wallet.crypto.v2_enabled` is already true.
6. After successful hardware activation, destroy the leftover Ed25519 attest Keychain item without a biometric prompt.
7. Fail closed on WP/mock non-2xx, missing chain, or missing challenge.

## Non-goals

- Wallet-side verification of Android attestation roots.
- Signed production WUA/WIA (`alg: none` mock only).
- Ed25519 `k_cred` removal (still behind `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED`).
- iOS Secure Enclave (production issuance/presentation remains blocked).

## Contract

### POST `/wallet-api/wallet-attestations/challenge`

Creates server-side challenge state (not GET).

Response 201:

```json
{
  "challengeId": "<hex>",
  "attestationChallengeBase64": "<base64>",
  "expiresAt": "<iso8601>"
}
```

TTL follows `WALLET_ATTEST_TTL_MS` (same as WUA/WIA mock expiry).

### POST `/wallet-api/wallet-attestations`

Request:

```json
{
  "challengeId": "<hex>",
  "pubKAttestJwk": { "kty": "EC", "crv": "P-256", "x": "<b64url>", "y": "<b64url>" },
  "certificateChainDerBase64": ["<base64 DER>", "..."],
  "submissionIdempotencyKey": "<hex>"
}
```

Rules:

- P-256 JWK and a non-empty chain are required. Ed25519 OKP bodies return 400.
- First success **consumes** `challengeId`.
- Replay with the **same** `submissionIdempotencyKey` returns the same 201 without requiring the challenge to still exist.
- Unknown, expired, or consumed `challengeId` without a matching idempotency replay returns 400.

Mock response remains unsigned `alg: none` WUA/WIA. Production WP verification is peer-owned.

## Wallet flow

Claim calls `activateV2IfNeeded()` → `activateWalletCryptoV2()`.

Skip only when `hasKey('wallet.p256.attest')` and `wallet.activation.tx.phase === 'activated'`.

Otherwise:

1. If phase is `wp_submit_pending` or `wp_submitted` with persisted artifacts: resubmit the same chain and idempotency key (no new challenge).
2. Else: POST challenge → delete unactivated alias if present → `createKey('wallet.p256.attest', { attestationChallenge })` → persist `key_created` → persist `wp_submit_pending` **before** the WP POST → POST attestations.
3. On 201: cache WUA/WIA, set `wallet.crypto.v2_enabled`, mark `activated`, call `destroyWalletAttestKey()` (`resetGenericPassword` only; no Keychain get).
4. On failure: return phase to `key_created`, clear idempotency key, rethrow. Next attempt fetches a new challenge and recreates the unactivated key.

`k_attest` is not used for OID4VCI PoP or OID4VP. Zenith credential requests omit WUA/WIA unless `EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED` is on.

## Error handling

| Case | Wallet |
|---|---|
| Missing/empty challenge or chain | Fail closed |
| WP challenge HTTP 404 (route missing) | Skip hardware `k_attest` activation when WUA is **not** requested (Zenith credential requests omit WUA). Retry after `EXPO_PUBLIC_WALLET_ATTEST_CHALLENGE_UNSUPPORTED_TTL_MS`. Fail closed when `EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED` is on. |
| WP/mock other non-2xx | Fail closed; claim stops |
| Alias present, tx missing/unactivated, new challenge | Delete unactivated key, recreate |
| iOS / hardware signer unavailable | Fail closed |
| Leftover Ed25519 attest seed | Destroy after hardware activation success |

## Tests

- Client: POST challenge; POST P-256+chain; reject empty chain.
- Activation: missing alias → create+submit; activated+hasKey → skip; `wp_submit_pending` → resubmit; WP 503 → fail closed; v2 true but alias missing → still runs; success destroys Ed25519 attest key.
- Server: POST challenge; consume-once; idempotent replay; Ed25519 body 400.
