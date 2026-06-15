# Android Network Testing

This guide covers physical Android testing for QR credential issuance and VP presentation when the Issuer or Verifier is on an office network.

## Mode 1: USB + PC VPN Proxy

Use this mode when the Windows PC can reach the Issuer through VPN, but the Android phone is not on office Wi-Fi or VPN.

Network path:

```text
Android phone
-> USB adb reverse
-> 127.0.0.1:4000 on the phone
-> Windows PC localhost:4000
-> local backend /dev-issuer-proxy or /dev-verifier-proxy
-> Issuer/Verifier through the PC VPN
```

Root `.env`:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://127.0.0.1:4000
EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET=http://192.100.10.46
EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL=http://127.0.0.1:4000/dev-issuer-proxy
EXPO_PUBLIC_VERIFIER_API_BASE_URL=http://192.100.10.48
EXPO_PUBLIC_VERIFIER_NAME=Verifier API
EXPO_PUBLIC_DEV_VERIFIER_PROXY_TARGET=http://192.100.10.48
EXPO_PUBLIC_DEV_VERIFIER_PROXY_BASE_URL=http://127.0.0.1:4000/dev-verifier-proxy
```

Server `server/.env`:

```env
ENABLE_DEV_ISSUER_PROXY=true
ISSUER_PROXY_TARGET=http://192.100.10.46
ENABLE_DEV_VERIFIER_PROXY=true
VERIFIER_PROXY_TARGET=http://192.100.10.48
```

Terminal 1, start the local backend and proxy:

```powershell
cd C:\project\etdaWallet\server
yarn dev
```

Terminal 2, start USB reverse and Expo:

```powershell
cd C:\project\etdaWallet
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8082 tcp:8082
yarn start -- --port 8082 --clear
```

Launch the development client:

```powershell
adb shell am start -a android.intent.action.VIEW -d "exp+etdawallet://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082" com.thanaboon.chan.etdaWallet
```

Keep the phone connected by USB and keep the PC VPN connected while scanning Issuer QR codes or Verifier VP QR codes.

## Mode 2: Direct Office Wi-Fi

Use this mode when the Android phone is connected to office Wi-Fi and can reach the Issuer and Verifier directly.

Network path:

```text
Android phone on office Wi-Fi
-> Wallet Backend at the Windows PC LAN IP
-> Issuer/Verifier directly on the office network
```

Root `.env`:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-office-lan-ip>:4000
EXPO_PUBLIC_VERIFIER_API_BASE_URL=http://192.100.10.48
EXPO_PUBLIC_VERIFIER_NAME=Verifier API
```

Remove or comment these proxy variables in root `.env`:

```env
EXPO_PUBLIC_DEV_ISSUER_PROXY_TARGET=...
EXPO_PUBLIC_DEV_ISSUER_PROXY_BASE_URL=...
EXPO_PUBLIC_DEV_VERIFIER_PROXY_TARGET=...
EXPO_PUBLIC_DEV_VERIFIER_PROXY_BASE_URL=...
```

Server `server/.env`:

```env
ENABLE_DEV_ISSUER_PROXY=false
ENABLE_DEV_VERIFIER_PROXY=false
```

Terminal 1, start the local backend:

```powershell
cd C:\project\etdaWallet\server
yarn dev
```

Terminal 2, start Expo:

```powershell
cd C:\project\etdaWallet
yarn start -- --port 8082 --clear
```

Open the app from the Expo development client QR or launch it from ADB if USB is connected:

```powershell
adb shell am start -a android.intent.action.VIEW -d "exp+etdawallet://expo-development-client/?url=http%3A%2F%2F<windows-office-lan-ip>%3A8082" com.thanaboon.chan.etdaWallet
```

Use the Windows office LAN IP, not `localhost`, for direct office Wi-Fi testing.

## Quick Checks

Check connected Android devices:

```powershell
adb devices
```

Check active reverse mappings:

```powershell
adb reverse --list
```

Check the local proxy from Windows:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4000/dev-issuer-proxy/.well-known/openid-credential-issuer"
```

Check the local Verifier proxy from Windows:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4000/dev-verifier-proxy/swagger/v1/swagger.json"
```

Check listening ports:

```powershell
netstat -ano | Select-String -Pattern ":4000|:8082"
```

## Notes

- The development Issuer and Verifier proxies are only transport plumbing for local testing. The Wallet still resolves offers, signs proof/VP JWTs, requests credentials, presents credentials, and saves local history on-device.
- Restart Expo with `--clear` after changing root `.env`; Expo public env values are bundled at Metro startup.
- Do not enable the development Issuer or Verifier proxies in production builds.
