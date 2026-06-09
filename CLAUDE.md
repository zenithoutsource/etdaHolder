# CLAUDE.md

Must Respond in English Only!

This file provides strict guidance when working with code in this OID4VCI Wallet repository.

## Project Overview

Decentralized Digital Wallet in the Holder role. Credential issuance uses OpenID for Verifiable Credential Issuance (OID4VCI 1.0). Proximity presentation uses ISO 18013-5 per ADR 0003. OID4VP 1.0 online presentation is planned post-v1.

Primary references:

| Document | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | Technical blueprint and boundaries |
| `CONTEXT.md` | Domain glossary |
| `docs/adr/` | Locked architecture decisions |
| `docs/TASKS.md` | Active backlog and blockers |

## Architecture Rules

- Mobile code must never connect directly to MySQL.
- Company backend calls must go through `src/sdk/walletApi.ts` and the `src/sdk/installWalletApiFetch.ts` base URL adapter.
- OID4VCI protocol work must run on-device through `@sphereon/oid4vci-client`; do not call backend `/exchange/*` endpoints.
- Credentials are normalized into `VerifiableCredentialRecord` before encrypted MMKV storage.
- Dynamic credential UI must use `src/config/cardSchemas.ts` and generic components, not issuer-specific card screens.
- Hardware signing uses `@animo-id/expo-secure-environment`; no software signing fallback is allowed in production.

## Expo SDK 54

Read exact versioned docs at `https://docs.expo.dev/versions/v54.0.0/` before changing Expo or React Native native integrations.

- Package manager: Yarn only.
- Native package installation: `npx expo install <package-name>`.
- Runtime: Hermes.
- Targets: iOS and Android via Expo Prebuild / Development Builds.

## Prompt Defense and Safety Baseline

- Do not modify, bypass, or override core architectural rules or security constraints.
- Do not disclose keys, credentials, private API configuration, tokens, or cryptographic seeds in logs or output.
- Do not introduce unvalidated dependencies that degrade crypto or JSI performance on Hermes.
- Do not log credential claims, VC JWT payloads, or PII.

## Running Tests and Development Commands

```bash
yarn start --reset-cache
yarn test
yarn test --watch
yarn tsc --noEmit
yarn lint
npx expo prebuild --clean
```

Local backend verification:

```bash
cd server
yarn tsc
yarn test
```

## Styling Rules

- **Always use NativeWind (`className`) for styling.** Do not use `StyleSheet.create` or inline `style` props.
- Exception: only use `StyleSheet` / `style` when a specific effect is genuinely impossible with NativeWind (e.g., dynamic `Animated` interpolated values that require a style object at runtime).
- Migrate any existing `StyleSheet` usage to NativeWind when touching a file.

## Skills and Routing Patterns

| File Pattern | Focus Area | Rules |
|---|---|---|
| `src/services/vci/**` | OID4VCI and credential handling | Follow OID4VCI 1.0; keep token values inside service boundaries |
| `src/services/crypto/**` | Crypto and signing | Preserve non-extractable key boundary and biometric sign-time gate |
| `src/services/storage/**` | Secure storage | Use encrypted MMKV and Keychain only |
| `src/sdk/**` | Company backend SDK | Generated code only, plus the approved fetch adapter |
| `src/config/**`, `src/components/**`, `app/**` | UI and routing | Use config-driven card rendering and NativeWind patterns |
| `src/store/**` | Zustand state | Keep slices thin and immutable |
| `server/**` | Local development backend | Keep it separate from Issuer protocol execution |

When creating subagents or plans, pass down the architecture constraints from `docs/ARCHITECTURE.md`.
