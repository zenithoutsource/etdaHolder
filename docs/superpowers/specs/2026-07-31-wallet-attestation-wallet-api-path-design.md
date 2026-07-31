# Wallet Attestation Route Under the Wallet API Namespace

**Date:** 2026-07-31  
**Status:** Approved

## Problem

The mobile wallet requests Wallet Provider attestations from:

```text
POST /v1/wallet-attestations
```

The shared HTTPS host forwards `/wallet-api/*` to the Wallet Node service, but
the containerized Nginx configuration does not currently forward `/v1/*`.
Consequently, normal Wallet API operations such as registration succeed while
wallet startup fails with HTTP 404 during v2 crypto activation.

Changing the container's Nginx routing is currently operationally difficult.

## Decision

Move the public Wallet Provider attestation contract to:

```text
POST /wallet-api/wallet-attestations
```

The mobile Wallet Provider base URL remains an origin, for example:

```env
EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL=https://wallet.example
```

The mobile client appends `/wallet-api/wallet-attestations`. The server
mounts the existing `walletProviderAttestRouter` at `/wallet-api`.

The former `/v1/wallet-attestations` route will be removed rather than retained
as an alias. This keeps one canonical contract and avoids publishing an
endpoint that the deployed reverse proxy cannot reach.

## Boundaries

This route shares the Wallet API transport namespace only to reuse the existing
reverse-proxy path. Its implementation remains isolated in
`walletProviderAttestRouter`; it is not added to the generated Orval Wallet
Backend SDK.

The existing handler produces development mock WUA/WIA values using
`alg: none`. It must not be treated as a production Wallet Provider
implementation. Production deployment requires signed, verifiable
attestations and an approved trust policy before the endpoint is considered
production-ready.

## Data Flow

```text
Mobile startup
  -> resolve EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
  -> POST /wallet-api/wallet-attestations
  -> Nginx forwards /wallet-api/* to the Wallet Node service
  -> walletProviderAttestRouter validates pubKAttestJwk
  -> development server returns WUA, WIA, and expiresAt
  -> mobile caches attestations and enables v2 crypto
```

## Error Handling

- A missing route remains `WalletAttestRequestFailed:404`.
- An invalid public JWK returns HTTP 400.
- Network and non-success responses continue to emit redacted
  `[wallet:crypto]` diagnostics.
- Attestation values and credential/key material remain excluded from logs.

## Tests

Update focused tests to assert the canonical path:

- Mobile client calls `/wallet-api/wallet-attestations`.
- Server accepts `POST /wallet-api/wallet-attestations` and returns 201 for
  a valid Ed25519 public JWK.
- Server returns 400 for an invalid JWK.
- The old `/v1/wallet-attestations` path is not part of the public contract.

Run:

```powershell
yarn test src/services/crypto/walletAttestClient.test.ts src/services/crypto/walletCryptoActivation.test.ts --runInBand
Set-Location server
yarn test src/routes/walletProviderAttest.test.ts --runInBand
yarn tsc
```

After implementation, update `docs/TASKS.md` and the attestation API references
in the existing v2 crypto specification and implementation plan.
