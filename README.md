# OID4VCI Wallet

Expo SDK 54 mobile Holder Wallet for **OID4VCI 1.0** credential issuance and **OID4VP 1.0** online presentation. The app claims credentials directly from Issuers on-device, stores them in encrypted MMKV, presents to Verifiers via QR / deeplink / My QR broker, and syncs finalized credentials to the company Wallet Backend through the Orval-generated SDK.

**Target hardware:** Samsung Galaxy A26 paired with ACR1311U-N2 Secure Bluetooth NFC Reader (proximity presentation validation path).

## Current Status

| Area | Status |
|------|--------|
| **Crypto & storage** | Keychain-protected Ed25519 (`alg: EdDSA`); per-credential signing keys + wallet attestation key (ADR 0010); encrypted MMKV; biometric sign-time gate |
| **OID4VCI** | Pre-Authorized Code flow, deferred issuance (§8.4), `dc+sd-jwt` / JWT VC / `mso_mdoc`, same-device deeplink intake, portal-driven ThaID entry, dual-format driving licence |
| **OID4VP** | Verifier QR, JAR trust, DCQL `credential_sets`, `did:web` verifier trust, selective disclosure, dedicated callback screen, My QR broker path; optional `@openid4vc/openid4vp` adapter behind feature flag |
| **Proximity** | Phase 1 NFC tag read (Android); companion HCE + Multipaz mDL module in progress — full E2E on A26 + ACR1311 pending |
| **Lifecycle** | Wallet key renewal (P3), issuer suspension (P6), document expiry (P7), revoke/delete with biometric gate, history log |
| **Auth** | Email-first unified PIN (server + app lock), startup unlock, push notifications (renewal / VP request / expiry) |
| **Release** | EAS preview builds supported; production golden-path walkthrough and NFC E2E still tracked in `docs/TASKS.md` |

Local development backend under `server/` provides XAMPP MySQL-backed Wallet Account auth, wallet listing, credential import, and Swagger docs.

## Quick Start

```bash
yarn install
yarn setup          # writes .env and server/.env (first run)
```

Full first-run guide (XAMPP, backend, physical Android): **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**

## Development

```bash
yarn start              # Expo dev client
yarn tsc --noEmit
yarn lint
yarn test
```

Install Expo / React Native native packages with:

```bash
npx expo install <package-name>
```

Optional overrides: copy `.env.development.local.example` → `.env.development.local`.

## Key Paths

| Path | Purpose |
|------|---------|
| `app/` | Expo Router screens (Wallet, My QR, Scan, History, credential detail, VP callback) |
| `src/services/crypto/` | Ed25519 keys, Holder DID, PoP / KB-JWT signing, wallet key rotation |
| `src/services/vci/` | OID4VCI offer resolve, claim, deferred poll, backend sync |
| `src/services/vp/` | OID4VP resolve, DCQL match, disclosure, direct_post, broker My QR |
| `src/services/proximity/` | ISO 18013-5 companion transport and mdoc presentation |
| `src/services/storage/` | Encrypted MMKV credential and lifecycle storage |
| `src/config/cardSchemas.ts` | Dynamic credential card schema registry |
| `src/components/CredentialCard.tsx` | Config-driven credential card |
| `src/sdk/` | Orval-generated Wallet Backend SDK + fetch/pinning adapter |
| `modules/expo-mdoc-proximity/` | Android native proximity / HCE module |
| `server/` | Local development Wallet Backend |
| `docs/` | Architecture, security, API, ADRs, specs, and active backlog |

## Documentation

| Doc | Contents |
|-----|----------|
| [AGENTS.md](AGENTS.md) | Agent playbook, architecture constraints, implementation tracker |
| [CLAUDE.md](CLAUDE.md) | Repository rules and dev commands |
| [CONTEXT.md](CONTEXT.md) | Domain glossary |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System boundaries and channel matrix |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Libraries vs in-repo protocol code |
| [docs/API.md](docs/API.md) | SDK and endpoint boundary |
| [docs/SECURITY.md](docs/SECURITY.md) | Crypto, storage, pinning, build policy |
| [docs/TASKS.md](docs/TASKS.md) | Active backlog and session notes |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase delivery history |
| [docs/TESTING.md](docs/TESTING.md) | Test standards and commands |
| [server/README.md](server/README.md) | Local backend setup and Swagger URLs | # for local dev, see `docs/GETTING_STARTED.md` for full first-run guide
