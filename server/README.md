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

For Phase 2A NFC proximity work, a separate standalone development issuer now lives under `mdoc-issuer/README.md`. It is not mounted under `/wallet-api/*` and should be run independently from the Wallet Backend.

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

## VPN Issuer/Verifier Proxy for Physical Android Testing

If the Issuer or Verifier is reachable from the Windows PC through VPN but the phone is not on the office Wi-Fi/VPN, run the local backend as a development proxy. The mobile app still performs OID4VCI/OID4VP on-device; only HTTP transport to the configured development host is forwarded by the local backend through the PC network.

For full runbooks covering both USB + PC VPN proxy mode and direct office Wi-Fi mode, see `../docs/ANDROID_NETWORK_TESTING.md`.

Server `server/.env`:

```env
ENABLE_DEV_ISSUER_PROXY=true
ISSUER_PROXY_TARGET=https://<issuer-host-reachable-from-pc-vpn>
ENABLE_DEV_VERIFIER_PROXY=true
VERIFIER_PROXY_TARGET=http://192.100.10.48
```

Root app `.env` for USB testing with `adb reverse`:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://127.0.0.1:4000
EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET=https://<issuer-host-reachable-from-pc-vpn>
EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL=http://127.0.0.1:4000/dev-issuer-proxy
EXPO_PUBLIC_VERIFIER_API_BASE_URL=http://192.100.10.48
EXPO_PUBLIC_DEV_VERIFIER_PROXY_TARGET=http://192.100.10.48
EXPO_PUBLIC_DEV_VERIFIER_PROXY_BASE_URL=http://127.0.0.1:4000/dev-verifier-proxy
```

Then connect the Android phone by USB and run:

```powershell
adb reverse tcp:4000 tcp:4000
```

Restart the Expo dev server after changing root `.env`, then scan the original Issuer or Verifier QR. Requests whose URL starts with `EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET` are rewritten to `/dev-issuer-proxy/*`; requests whose URL starts with `EXPO_PUBLIC_DEV_VERIFIER_PROXY_TARGET` are rewritten to `/dev-verifier-proxy/*`. Do not enable these proxies in production.

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

Standalone mDOC issuer verification:

```powershell
Set-Location server
yarn mdoc-issuer:dev
```
