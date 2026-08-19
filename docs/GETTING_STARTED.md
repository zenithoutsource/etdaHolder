# Getting Started (30 minutes)

First-run guide for a new developer on **Windows + XAMPP + physical Android**. Goal: register, set a PIN, unlock the app, and reach **Wallet home** (empty credentials are fine).

OID4VCI issuance, OID4VP presentation, NFC proximity, and production Verifier trust configuration are **advanced paths** documented separately — not required for this 30-minute setup.

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

Development may use localhost or LAN HTTP endpoints. Release builds require explicit HTTPS Wallet API and Broker URLs and reject missing or loopback endpoint values. Never copy development defaults or placeholder secrets into a production environment.

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

- **Optional mobile overrides:** copy `.env.development.local.example` → `.env.development.local` (issuer/verifier URLs, OID4VP trust, SSL pins, broker base URL)
- **Optional server overrides:** copy `server/.env.development.local.example` → `server/.env.development.local`
- **Full backend docs:** [server/README.md](../server/README.md) (Wallet Swagger at `/wallet-api/docs`, development APIs at `/wallet-api/dev/docs`)
- **Architecture & channels:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Production OID4VP verifier trust:** checklist below and `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`

## Production Verifier OID4VP checklist

Use this before a release build that must present to a customer Verifier over OID4VP (not the dev `redirect_uri` Verifier API).

1. Set `EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID`, `EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN`, `EXPO_PUBLIC_VERIFIER_DID_WEB_NAME`, and `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK` to match the production Verifier `client_id` and `response_uri` origin. See `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`.
2. Unset `EXPO_PUBLIC_VERIFIER_API_BASE_URL` for release builds — that variable only enables the dev-only `redirect_uri` trust entry in `__DEV__` builds.
3. Scan a signed JAR Authorization Request QR from the production Verifier; confirm trust resolution and `direct_post` submission succeed on a physical device.

E2E validation still requires a live customer Verifier host — env configuration alone is not sufficient.

## VP adapter re-E2E (dev build)

Use this after the 2026-08-07 P1 blocker fixes (`docs/TASKS.md` session entry) before treating
`EXPO_PUBLIC_OID4VC_VP_ADAPTER=true` as validated on Hermes. Jest runs on Node and does not
catch Hermes-only routing issues.

1. Copy `.env.development.local.example` → `.env.development.local` if needed.
2. Set `EXPO_PUBLIC_OID4VC_VP_ADAPTER=true` (build-time — requires rebuild to toggle).
3. Keep `EXPO_PUBLIC_VERIFIER_API_BASE_URL` for dev `redirect_uri` Scan golden path in `__DEV__`.
4. Build and install a development client on target hardware (Samsung Galaxy A26):

   ```powershell
   npx expo prebuild --clean   # only if native deps changed
   yarn start --reset-cache
   ```

   Or use an EAS development profile with the flag baked into env.

5. Run checklist items 1–7 in `docs/TASKS.md` (Session 2026-08-07 VP adapter P1 table); record pass/fail there.
6. Rebuild with `EXPO_PUBLIC_OID4VC_VP_ADAPTER=false` and repeat Scan + callback (item 4).

Adapter remains **default false** in `.env.example` until staging rollout decision after re-E2E passes.

## Verification commands

```powershell
yarn tsc --noEmit
yarn lint
yarn test
```
