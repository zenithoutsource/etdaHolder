# Local Wallet Backend Design

## Goal

Add a local Wallet Backend API for development so the mobile app can run real sign-up, sign-in, wallet lookup, logout, and credential import flows against a local XAMPP MySQL database named `etda_wallet`.

## Scope

The local backend is a development service inside this repository. It mimics the small generated SDK surface the mobile app already uses:

- `POST /wallet-api/auth/register`
- `POST /wallet-api/auth/login`
- `POST /wallet-api/auth/logout`
- `GET /wallet-api/wallet/accounts/wallets`
- `POST /wallet-api/wallet/:wallet/credentials/import`

The backend stores Wallet Account data only. It does not connect to the Issuer database at `192.100.10.46`, does not run OID4VCI issuance, and does not replace the on-device Sphereon flow. The mobile app still claims credentials directly from Issuers and only imports finalized VC JWTs into the Wallet Backend.

## Architecture

The development topology is:

```text
Expo Wallet App
  -> generated SDK / fetch
  -> http://<LAN-IP>:4000/wallet-api/*
  -> server/ Express API
  -> local XAMPP MySQL etda_wallet
```

The mobile app must not connect directly to MySQL. The backend listens on `0.0.0.0:4000` so a physical device on the same network can reach it through the Windows machine LAN IP. The mobile app reads `EXPO_PUBLIC_WALLET_API_BASE_URL` and prepends it to generated SDK relative paths.

## Backend Stack

Use Node.js, TypeScript, Express, `mysql2`, `bcrypt`, and `jsonwebtoken`.

The service lives under `server/`:

```text
server/
  package.json
  tsconfig.json
  .env.example
  src/
    server.ts
    db.ts
    auth.ts
    routes/
      auth.ts
      wallets.ts
      credentials.ts
    migrations/
      001_init.sql
```

Runtime configuration comes from `server/.env`:

```env
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=etda_wallet
DB_USER=root
DB_PASSWORD=
JWT_SECRET=local-dev-change-me
JWT_EXPIRES_IN=7d
```

`config.inc.php` for phpMyAdmin does not need changes. The backend uses its own MySQL connection settings.

## Database Schema

The initial schema is intentionally small:

```text
users
- id
- name
- email
- password_hash
- created_at

wallets
- id
- user_id
- name
- created_at

sessions
- id
- user_id
- token_hash
- expires_at
- created_at
- revoked_at

credentials
- id
- wallet_id
- jwt
- associated_did
- created_at
```

`server/src/migrations/001_init.sql` creates the database tables. The backend checks required tables on startup and fails with a clear message if the migration has not been applied.

## Auth Flow

Register:

1. Receive `{ type: "email", name, email, password }`.
2. Validate required fields.
3. Hash the password with bcrypt.
4. Create a `users` row.
5. Create one default `wallets` row for the user.
6. Return HTTP `201` with an empty body, matching the generated SDK expectation.

Login:

1. Receive `{ type: "email", email, password }`.
2. Verify the user exists and the bcrypt password check passes.
3. Create a JWT session token.
4. Store a hash of the JWT in `sessions`.
5. Return HTTP `200` with `{ id, token }`, where `id` is the user/account id.

Wallet lookup:

1. Require `Authorization: Bearer <token>`.
2. Verify the JWT and confirm the session is not revoked.
3. Return HTTP `200` with `{ account, wallets }`.

Logout:

1. Read `Authorization: Bearer <token>` when present.
2. Mark the matching session revoked.
3. Return HTTP `200` even when no matching session is found, so mobile logout remains best effort.

Credential import:

1. Require a valid Bearer token.
2. Confirm the wallet belongs to the authenticated user.
3. Store `{ jwt, associated_did }` in `credentials`.
4. Return HTTP `201` with a wallet credential-shaped object containing at least `id`, `wallet`, `document`, `format`, `pending`, and `addedOn`.

## Mobile App Integration

Add a small SDK fetch wrapper or global fetch adapter so generated SDK relative paths resolve against `EXPO_PUBLIC_WALLET_API_BASE_URL`. The generated `src/sdk/walletApi.ts` file remains generated and should not be hand-edited.

Use a LAN IP in the app environment during physical-device development:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000
```

The auth store continues to persist `{ token, walletId, accountId }` in Keychain. `syncCredentialToBackend()` continues to receive `walletId` and `sessionToken` explicitly.

## Error Policy

For the mobile app, preserve stable service-level prefixes:

- `RegisterFailed`
- `LoginFailed`
- `WalletsFetchFailed`
- `BackendSyncFailed`

For the backend API, return HTTP status codes consistently:

- `400` for malformed requests.
- `401` for missing or invalid Bearer token.
- `403` for authenticated users trying to access another user's wallet.
- `409` for duplicate registration email.
- `500` for unexpected server or database failures.

## Testing

Backend tests should cover:

- Register creates a user and default wallet.
- Duplicate email returns `409`.
- Login returns a JWT for valid credentials.
- Login rejects invalid passwords.
- Wallet lookup requires Bearer auth.
- Credential import rejects wallets owned by another user.

Mobile tests should cover:

- Auth service prepends the configured API base URL.
- Login stores token, account id, and first wallet id.
- Register treats HTTP `201` as success.
- Logout clears the Keychain session even if server logout fails.

## Documentation

After implementation, update:

- `.env.example` with `EXPO_PUBLIC_WALLET_API_BASE_URL`.
- `docs/API.md` so the allowed endpoint list includes auth endpoints already generated in `orval.config.ts`.
- `docs/TASKS.md` with the local backend status and any remaining production migration notes.
