# API Integration

## Orval Toolchain

The company Wallet Backend client is generated from `walletApi.json` with Orval. The generated client lives in `src/sdk/walletApi.ts`. Do not hand-edit generated SDK files.

Regenerate after changing `walletApi.json` or `orval.config.ts`:

```bash
yarn sdk:generate
```

The generated file is committed so CI and team members do not need Orval at checkout time.

## Generated Endpoints

`orval.config.ts` filters the upstream spec to the mobile wallet boundary:

| Method | Path | Operation |
|---|---|---|
| `POST` | `/wallet-api/auth/register` | `registerUser` |
| `POST` | `/wallet-api/auth/login` | `loginUser` |
| `POST` | `/wallet-api/auth/logout` | `logoutUser` |
| `GET` | `/wallet-api/wallet/accounts/wallets` | `getWallets` |
| `POST` | `/wallet-api/wallet/{wallet}/keys/generate` | `generateKey` |
| `POST` | `/wallet-api/wallet/{wallet}/dids/create/key` | `createDidKey` |
| `POST` | `/wallet-api/wallet/{wallet}/credentials/import` | `importCredential` |

## Protocol Boundary Matrix

### Allowed SDK Calls

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/wallet-api/auth/register` | Create a Wallet Account for a Holder |
| `POST` | `/wallet-api/auth/login` | Authenticate and return a bearer session token |
| `POST` | `/wallet-api/auth/logout` | Best-effort session revocation |
| `GET` | `/wallet-api/wallet/accounts/wallets` | List wallets owned by the authenticated Wallet Account |
| `POST` | `/wallet-api/wallet/{walletId}/keys/generate` | Generate a server-side key record, not the hardware signing key |
| `POST` | `/wallet-api/wallet/{walletId}/dids/create/key` | Create a backend DID document record |
| `POST` | `/wallet-api/wallet/{walletId}/credentials/import` | Import a finalized credential after successful on-device acquisition |

### Forbidden Mobile Calls

| Method | Path | Reason |
|---|---|---|
| `GET` | `/wallet-api/wallet/{walletId}/exchange/resolveCredentialOffer` | Offer resolution runs on-device via `@sphereon/oid4vci-client` |
| `POST` | `/wallet-api/wallet/{walletId}/exchange/useOfferRequest` | Token exchange, PoP signing, and credential request run on-device |

Any PR that imports or calls forbidden exchange endpoints from app code must be rejected.

## SDK Base URL Adapter

The generated SDK uses relative `/wallet-api/*` URLs. `src/sdk/installWalletApiFetch.ts` patches global `fetch` so generated SDK calls are prefixed with `EXPO_PUBLIC_WALLET_API_BASE_URL`. Absolute Issuer URLs are left unchanged.

Required root `.env` key:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000
```

Use the Windows LAN IP for physical device testing. Do not commit `.env`.

For Android network setup runbooks, including USB + PC VPN proxy mode and direct office Wi-Fi mode, see `docs/ANDROID_NETWORK_TESTING.md`.

### Development Issuer Proxy

For physical Android testing where the Windows PC can reach an Issuer through VPN but the phone cannot, the same fetch adapter can rewrite one configured Issuer origin through the local backend:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://127.0.0.1:4000
EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET=https://<issuer-host-reachable-from-pc-vpn>
EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL=http://127.0.0.1:4000/dev-issuer-proxy
```

The local backend must also set `ENABLE_DEV_ISSUER_PROXY=true` and `ISSUER_PROXY_TARGET` to the same Issuer origin. With `adb reverse tcp:4000 tcp:4000`, the phone reaches `127.0.0.1:4000`, and the backend forwards matching Issuer metadata/token/credential HTTP requests through the PC VPN. This is development-only transport plumbing; the Wallet still resolves offers, signs proof JWTs, and requests credentials on-device.

### Development Verifier Proxy

For physical Android testing where the Windows PC can reach the Verifier through VPN but the phone cannot, the fetch adapter can also rewrite the configured Verifier origin through the local backend:

```env
EXPO_PUBLIC_VERIFIER_API_BASE_URL=http://192.100.10.48
EXPO_PUBLIC_DEV_VERIFIER_PROXY_TARGET=http://192.100.10.48
EXPO_PUBLIC_DEV_VERIFIER_PROXY_BASE_URL=http://127.0.0.1:4000/dev-verifier-proxy
```

The local backend must also set `ENABLE_DEV_VERIFIER_PROXY=true` and `VERIFIER_PROXY_TARGET` to the same Verifier origin. With `adb reverse tcp:4000 tcp:4000`, the phone reaches `127.0.0.1:4000`, and the backend forwards matching OID4VP `request_uri` and `direct_post` calls through the PC network.

## Auth and Sync Usage

`src/services/auth/authService.ts` owns Wallet Account login/register/logout and stores session data in Keychain.

Credential backend sync remains separate from OID4VCI acquisition:

```typescript
await syncCredentialToBackend(record, {
  walletId,
  sessionToken,
})
```

The sync payload is:

```json
{ "jwt": "<record.rawVc>", "associated_did": "<holderDid>" }
```

Only HTTP 201 is accepted as success.

## Local Development Backend

`server/` implements the allowed Wallet Backend boundary for local development against XAMPP MySQL database `etda_wallet`. The mobile app still talks through the generated SDK and never queries MySQL directly.
