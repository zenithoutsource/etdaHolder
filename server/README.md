# Local Wallet Backend

Development backend for the Expo wallet. It stores Wallet Account data in local XAMPP MySQL database `etda_wallet`.

This service is separate from Issuer systems. Do not use it for Issuer eligibility data, and do not connect the mobile app directly to MySQL.

## Scope

Implemented local endpoints mirror the mobile wallet's allowed SDK boundary:

- register Wallet Account
- login Wallet Account
- logout session
- list authenticated wallets
- import finalized credential

The backend does not resolve credential offers, exchange OID4VCI tokens, sign PoP JWTs, or request credentials from Issuers.

mDOC / OID4VCI issuance for proximity work uses the customer Issuer (e.g. `http://issuer.zenithcomp.co.th:455`), not a local mock issuer.

## API documentation

| Surface | Guide | Swagger UI | OpenAPI JSON | Production |
|---|---|---|---|---|
| Wallet Backend | `docs/wallet-backend-api.md` | `/wallet-api/docs` | `/wallet-api/openapi.json` | Yes |
| Development APIs | `docs/development-api.md` | `/wallet-api/dev/docs` | `/wallet-api/dev/openapi.json` | Only with `ENABLE_DEVELOPMENT_APIS=true` |

Verifier-owned OID4VP (`openid4vc/*` on the external Verifier host) and Wallet Broker
(`/broker/session` on the shared wallet host) are documented on those services'
Swagger UIs — not in this Node wallet backend.

Local examples:

- Wallet Swagger UI: `http://localhost:4000/wallet-api/docs`
- Development Swagger UI: `http://localhost:4000/wallet-api/dev/docs` (also `/dev/docs`)

On a shared HTTPS host that reverse-proxies only `/wallet-api/*`, use:

- `https://<host>/wallet-api/docs`
- `https://<host>/wallet-api/dev/docs`

`/dev/docs` is a local Swagger alias and is not forwarded by that proxy.

Development APIs (`/wallet-api/dev/*`, `/dev/*`, and Development Swagger) are
mounted when `NODE_ENV !== "production"`, or when `ENABLE_DEVELOPMENT_APIS=true`
even if `NODE_ENV` is `production`. They return `404` when production is on and
the override is unset/false. The shared staging host should set
`ENABLE_DEVELOPMENT_APIS=true` if it runs with `NODE_ENV=production`. Do not set
that flag on a true production Wallet Backend.

The Wallet Backend documentation covers normal `/wallet-api/auth/*`, `/wallet-api/wallet/*`, push-token registration, and the development-only Wallet attestation mock at `/wallet-api/wallet-attestations` and `/wallet-api/wallet-attestations/challenge` (unsigned `alg: none`, no Android attestation root/revocation/app-identity verify — never a production Wallet Provider). When development APIs are enabled, `/wallet-api/docs` also includes `/wallet-api/dev/*` simulation operations. Use Swagger **Authorize** with a Wallet login JWT for Bearer-protected Wallet operations.

The reverse proxy must preserve complete `/wallet-api/*` paths when forwarding to the Node process on port `4000`. Examples use synthetic data only.

## Setup

1. Start XAMPP MySQL.
2. Create the database and tables:

```powershell
C:\xampp\mysql\bin\mysql.exe -u root < server\src\migrations\001_init.sql
```

Alternative PowerShell form:

```powershell
Get-Content server\src\migrations\001_init.sql | C:\xampp\mysql\bin\mysql.exe -u root
```

For unified PIN auth (`refactor/auth`), also run:

```powershell
Get-Content server\src\migrations\002_pin_reset_otps.sql | C:\xampp\mysql\bin\mysql.exe -u root
```

3. Run `yarn setup` from the **repo root** (writes `server/.env`), or create `server/.env` manually from `server/.env.example`.
4. Replace `JWT_SECRET=local-dev-change-me` with a local secret before testing real accounts.
5. Configure SMTP for PIN reset emails (optional in dev). Example for Gmail with an app password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_PASSWORD=your-app-password
MAIL_FROM=your-account@gmail.com
MAIL_FROM_NAME=Wallet
```

If `SMTP_HOST` is left empty, the backend logs OTP codes to the server terminal instead of sending email.
6. Start the backend:

```powershell
Set-Location server
yarn dev
```

The API listens on `0.0.0.0:4000` so a phone on the same LAN can reach it. Keep this local development server off public networks.

### Production configuration

Production startup rejects the development JWT placeholder, loopback database hosts, development mail addresses, missing public presentation URLs, malformed endpoints, and non-HTTPS external URLs. Configure `JWT_SECRET`, database values, `WALLET_API_ALLOWED_ORIGINS`, `PUBLIC_BASE_URL`, and the relevant Issuer/Verifier URLs explicitly in the deployment environment. Startup errors identify only the invalid configuration key.

## Mobile App

Set the app base URL in root `.env`:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000
```

Use the Windows LAN IP, not `localhost`, when testing from a physical phone. Do not commit `.env`.

## Verification

```powershell
Set-Location server
yarn tsc
yarn test
```
