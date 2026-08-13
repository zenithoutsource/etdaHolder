# Wallet Backend API

The Wallet Backend handles Wallet Account authentication, session management, wallet listing, finalized credential import, push-token registration, and development-only Wallet attestation mocks. It does **not** run OID4VCI issuance, exchange OID4VCI tokens, sign PoP JWTs, or store Wallet private keys.

## Base URL

Use your deployment host without copying environment-specific values:

- Local development: `http://localhost:4000` (or your machine LAN IP for physical devices)
- Shared HTTPS host: your operator-configured Wallet API origin

Interactive documentation:

- Swagger UI: `/wallet-api/docs`
- OpenAPI JSON: `/wallet-api/openapi.json`

## Authentication workflow

1. **Check email** — `POST /wallet-api/auth/email-status` with `{ "email": "developer@example.invalid" }`.
2. **Register** — `POST /wallet-api/auth/register` with email, six-digit PIN (`593817`), and display name.
3. **Login** — `POST /wallet-api/auth/login` returns `{ "id", "token" }`. Use the token as `Authorization: Bearer SYNTHETIC_TOKEN` on protected routes.
4. **List wallets** — `GET /wallet-api/wallet/accounts/wallets` (Bearer required).
5. **Import credential** — `POST /wallet-api/wallet/{wallet}/credentials/import` with `{ "jwt": "synthetic.jwt.vc", "associated_did": "did:key:zSyntheticHolder" }` (Bearer required). The mobile app claims credentials from Issuers on-device; this endpoint only stores an already-finalized VC JWT.
6. **Logout** — `POST /wallet-api/auth/logout`.

### Example: login and list wallets

```bash
curl -sS -X POST "https://wallet.example.invalid/wallet-api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"type":"email","email":"developer@example.invalid","pin":"593817"}'

curl -sS "https://wallet.example.invalid/wallet-api/wallet/accounts/wallets" \
  -H "Authorization: Bearer SYNTHETIC_TOKEN"
```

## PIN reset

1. `POST /wallet-api/auth/pin-reset/request` — requests an OTP email.
2. `POST /wallet-api/auth/pin-reset/verify` — verifies the OTP.
3. `POST /wallet-api/auth/pin-reset/confirm` — sets a new six-digit PIN.

Auth endpoints share a rate limiter (10 attempts per minute per IP and path). Excess attempts return `429 Too Many Requests`.

## Push-token registration

`POST /wallet-api/wallet/push-token` registers an Expo push token for a Holder DID. The current route does **not** enforce Bearer authentication.

```bash
curl -sS -X POST "https://wallet.example.invalid/wallet-api/wallet/push-token" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[synthetic-device]","holderDid":"did:key:zSyntheticHolder"}'
```

## Wallet attestation (development only)

`POST /wallet-api/wallet-attestations/challenge` creates a single-use challenge (`challengeId`, `attestationChallengeBase64`, `expiresAt`). `POST /wallet-api/wallet-attestations` accepts a P-256 public JWK, a non-empty Android attestation certificate chain, that `challengeId`, and `submissionIdempotencyKey`. First success consumes the challenge; the same idempotency key may replay the 201.

The current handler returns **unsigned `alg: none` development mocks**. It does **not** verify attestation roots, revocation, or app identity. It is not a production Wallet Provider. Never point a production `EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL` at this mock.

```bash
curl -sS -X POST "https://wallet.example.invalid/wallet-api/wallet-attestations/challenge" \
  -H "Content-Type: application/json" \
  -d '{}'

curl -sS -X POST "https://wallet.example.invalid/wallet-api/wallet-attestations" \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"<id>","pubKAttestJwk":{"kty":"EC","crv":"P-256","x":"SyntheticP256X","y":"SyntheticP256Y"},"certificateChainDerBase64":["MAMBAgME"],"submissionIdempotencyKey":"idem-1"}'
```

## Field reference

See `/wallet-api/openapi.json` for complete request and response schemas.
