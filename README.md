# ETDA OID4VCI Wallet

Expo SDK 54 mobile Holder Wallet for OID4VCI 1.0 credential issuance. The app claims credentials directly from Issuers, stores them in encrypted on-device MMKV storage, and can optionally sync finalized credentials to the company Wallet Backend through the Orval-generated SDK.

## Current Status

- Phase 1 complete: hardware-backed P-256 Wallet Signing Key, Holder DID derivation, biometric-gated PoP signing, and encrypted MMKV credential storage.
- Phase 2 complete: OID4VCI offer resolution, Pre-Authorized Code credential acquisition, JWT VC and SD-JWT VC normalization, encrypted local save, and separate backend sync.
- Phase 3 in progress: Wallet home UI, dynamic card schemas, generic `CredentialCard`, credential detail route, QR scanner, and pre-save confirmation are implemented. NFC NDEF issuance is deferred until device testing is available.
- Local development backend exists under `server/` for XAMPP MySQL-backed Wallet Account auth, wallet listing, and credential import.

## Development

Install dependencies with Yarn:

```bash
yarn install
```

Start the Expo development client:

```bash
yarn start
```

Run verification:

```bash
yarn tsc --noEmit
yarn lint
yarn test
```

Use Expo install for Expo or React Native native packages:

```bash
npx expo install <package-name>
```

## Environment

For local backend testing, create root `.env`:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000
```

Use the Windows LAN IP when testing on a physical phone. `localhost` points to the phone itself.

## Key Paths

| Path | Purpose |
|---|---|
| `app/` | Expo Router screens and tab shell |
| `src/services/crypto/` | Hardware key, Holder DID, PoP signing |
| `src/services/storage/` | Encrypted MMKV storage |
| `src/services/vci/` | OID4VCI offer resolution, acquisition, backend sync |
| `src/config/cardSchemas.ts` | Dynamic credential card schema registry |
| `src/components/CredentialCard.tsx` | Generic config-driven credential card |
| `src/sdk/` | Orval-generated Wallet Backend SDK and fetch adapter |
| `server/` | Local development Wallet Backend |
| `docs/` | Architecture, roadmap, security, API, testing, and ADRs |

## Documentation

- `AGENTS.md`: agent playbook, current handoff, implementation tracker.
- `CLAUDE.md`: repository rules and development commands.
- `CONTEXT.md`: domain glossary.
- `docs/ARCHITECTURE.md`: architecture and boundaries.
- `docs/API.md`: SDK and endpoint boundary.
- `docs/TASKS.md`: active backlog and session notes.
- `docs/SECURITY.md`: security policy.
- `docs/TESTING.md`: testing standards.
