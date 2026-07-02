# Tech Stack

## Mobile App (Wallet)

| Layer | Choice |
|---|---|
| Framework | React Native 0.81.5 (Expo SDK 54, `~54.0.34`), Hermes engine |
| Language | TypeScript `~5.9.2` |
| Routing | `expo-router` (file-based, `app/`) |
| UI | React `19.1.0`, NativeWind `^4.2.4` (Tailwind `3.4.4`) |
| State | Zustand `^5.0.14` |
| Server state / data fetching | TanStack React Query `^5.100.14` |
| Backend SDK | Orval-generated client (`orval.config.ts`) via `src/sdk/walletApi.ts` |
| Credential protocol | `@sphereon/oid4vci-client` (OID4VCI 1.0) |
| Crypto | `@noble/ed25519`, `@noble/hashes`, `react-native-quick-crypto`, `react-native-quick-base64` |
| Secure storage | `react-native-mmkv` (encrypted) + `react-native-keychain` |
| Biometrics | `react-native-biometrics` |
| NFC | `react-native-nfc-manager` |
| Native modules bridge | `react-native-nitro-modules` |
| Push notifications | `expo-notifications` |
| Device/security checks | `jail-monkey`, `expo-device`, `react-native-ssl-pinning` |
| Camera / scanning | `expo-camera` |
| Animations / gestures | `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler` |
| Validation | `zod` |
| Testing | Jest `29`, `jest-expo`, `@testing-library/react-native`, `msw` (API mocking) |
| Lint | ESLint `^9` (`eslint-config-expo`) |
| Native project management | Expo Prebuild / Development Builds (iOS + Android) |
| Custom native module | `modules/etda-wallet-eddsa` (Android, Kotlin) — Keychain-backed Ed25519 signing |

## Local Development Backend (`server/`)

| Layer | Choice |
|---|---|
| Runtime | Node.js + TypeScript `~5.9.2`, run via `tsx` |
| Framework | Express `^4.21.2` |
| Database | MySQL (`mysql2` `^3.11.5`) |
| Auth | `jsonwebtoken`, `bcrypt` |
| Email | `nodemailer` |
| Encoding | `cbor` (mdoc/CBOR issuer support) |
| API docs | `swagger-ui-express` |
| Testing | Jest `29.7.0` + `ts-jest`, `supertest` |

## Protocols & Standards

- **OID4VCI 1.0** — credential issuance, executed on-device (not via backend `/exchange/*`)
- **ISO 18013-5** — proximity presentation (mdoc), per ADR 0003
- **OID4VP 1.0** — online presentation, planned post-v1

## Tooling

- Package manager: Yarn (mobile + server)
- Codegen: Orval (`orval.config.ts` → `walletApi.json` client)
- CI-relevant local commands: `yarn tsc --noEmit`, `yarn lint`, `yarn test`, `expo prebuild --clean`; server: `yarn tsc`, `yarn test`
