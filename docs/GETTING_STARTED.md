# Getting Started (30 minutes)

First-run guide for a new developer on **Windows + XAMPP + physical Android**. Goal: register, set a PIN, and reach **Wallet home** (empty credentials are fine).

OID4VCI issuance, OID4VP presentation, NFC, and VPN proxies are **not** required for this path.

## Prerequisites

- Windows 10/11
- Node.js LTS and Yarn
- Android SDK + USB debugging on a **physical Android device** (not an emulator)
- [XAMPP](https://www.apachefriends.org/) with MySQL
- Expo development build workflow (`yarn android:dev`)

## 1. Clone and install

```powershell
git clone <repo-url> etdaWallet
cd etdaWallet
yarn install
yarn setup
```

`yarn setup` writes a minimal `.env` and `server/.env` (skipped if they already exist — use `yarn setup --force` to regenerate).

**Minimal mobile `.env` (generated):**

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<your-lan-ip>:4000
EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true
```

**Tip:** With USB + `adb reverse tcp:4000 tcp:4000`, `http://localhost:4000` can work on device because the app rewrites loopback to the Metro host in dev. `yarn setup` picks your LAN IP when available.

Verify env files later:

```powershell
yarn setup --check
```

Exit `0` = env files exist and MySQL/backend probes passed; `1` = something missing (run backend first for HTTP check).

## 2. Database (XAMPP)

1. Start **MySQL** in the XAMPP Control Panel.
2. Create schema and tables:

```powershell
Get-Content server\src\migrations\001_init.sql | C:\xampp\mysql\bin\mysql.exe -u root
Get-Content server\src\migrations\002_pin_reset_otps.sql | C:\xampp\mysql\bin\mysql.exe -u root
```

Adjust the `mysql.exe` path if XAMPP is installed elsewhere.

## 3. Local backend

```powershell
cd server
yarn install
yarn dev
```

The API listens on `http://0.0.0.0:4000`. From your PC browser, `http://localhost:4000` should respond (login endpoint exists at `/wallet-api/auth/login`).

Keep this terminal running.

## 4. Mobile app (physical device)

In a **new** terminal from the repo root:

```powershell
yarn android:dev
```

- Connect the phone via USB with debugging enabled.
- Phone and PC should be on the same Wi‑Fi **or** use `adb reverse tcp:4000 tcp:4000` for backend access via localhost.

If the app cannot reach the backend, re-run `yarn setup` and confirm `EXPO_PUBLIC_WALLET_API_BASE_URL` uses your PC's LAN IP (not the phone's).

## 5. First login

1. **Register** a Wallet Account.
2. Complete **PIN setup**.
3. You should land on **Wallet home** with no credentials — success.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Cannot reach backend from phone | Check LAN IP in `.env`, Windows firewall, same Wi‑Fi; or `adb reverse tcp:4000 tcp:4000` |
| MySQL connection refused | Start MySQL in XAMPP; confirm `server/.env` DB settings |
| Emulator selected | Use `yarn android:dev` — it targets a physical device |
| Push registration errors in dev | Already skipped when `EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true` |

## Advanced configuration (not needed for first run)

- **Optional mobile overrides:** copy `.env.development.local.example` → `.env.development.local`
- **Optional server overrides:** copy `server/.env.development.local.example` → `server/.env.development.local`
- **Office VPN / issuer / verifier proxies:** `docs/ANDROID_NETWORK_TESTING.md`
- **Full backend docs:** `server/README.md`
- **Architecture:** `docs/ARCHITECTURE.md`

## Verification commands

```powershell
yarn tsc --noEmit
yarn lint
yarn test
```
