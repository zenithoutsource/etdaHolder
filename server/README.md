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
