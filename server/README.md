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

3. Create `server/.env` from `server/.env.example`.
4. Replace `JWT_SECRET=local-dev-change-me` with a local secret before testing real accounts.
5. Start the backend:

```powershell
Set-Location server
yarn dev
```

The API listens on `0.0.0.0:4000` so a phone on the same LAN can reach it. Keep this local development server off public networks.

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
