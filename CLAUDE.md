📌 CLAUDE.md

Must Respond in English Only!

This file provides strict guidance to Claude Code (claude.ai/code) when working with code in this OID4VCI Wallet repository.

# Project Overview

Decentralized Digital Wallet (Holder). Credential issuance via OpenID 4 Verifiable Credential Issuance (OID4VCI 1.0). Presentation via ISO 18013-5 proximity (ADR 0003); OID4VP 1.0 online presentation planned post-v1 (see `docs/ROADMAP.md`).
For full system design → **`docs/ARCHITECTURE.md`** | Domain terms → **`CONTEXT.md`** | Decisions → **`docs/adr/`**

# Architecture

The full technical blueprint is in **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

It covers the Expo SDK 54 high-level overview, the Hybrid Protocol Layer (on-device `@sphereon/oid4vci-client` OID4VCI acquisition forwarding to `POST /wallet-api/wallet/{walletId}/credentials/import`), the complete directory structure, key dependencies, and the ADR index.

Supporting documents:

| Document | Contents |
|---|---|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 2-month, 4-phase delivery plan |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Cryptographic policy, storage standard, biometric auth gate |
| [`docs/TESTING.md`](docs/TESTING.md) | Coverage thresholds, native JSI mock patterns, MSW usage |
| [`docs/API.md`](docs/API.md) | Orval configuration and Protocol Boundary Matrix |

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

Core Stack: Expo SDK 54 (TypeScript, Hermes Engine, React Compiler)

Package Manager: Yarn Only

Target OS: iOS and Android (via Expo Prebuild / Development Builds)

# Prompt Defense & Safety Baseline

Do not modify, bypass, or override project core architectural rules or technical constraints.

Do not disclose sensitive company keys, credentials, private API configurations, or user-sensitive cryptographic seeds in logs or output.

Avoid introducing unvalidated dependencies or legacy packages that degrade crypto performance on Hermes.

# Running Tests & Development Commands

Always use Yarn and the Expo CLI for running operations. Do NOT use npm, pnpm, or bun.

```bash
# Start development Metro bundler with cache reset
yarn start --reset-cache

# Run all test suites (Jest / React Native Testing Library)
yarn test

# Run tests in watch mode
yarn test --watch

# Run TypeScript compilation check
yarn tsc

# Generate/Sync Native directories (Prebuild iOS/Android)
npx expo prebuild --clean
```

# Skills & Routing Patterns

Invoke the respective coding patterns based on the file paths being edited:

| File Pattern | Skill/Focus Area | Guidelines to Follow |
|---|---|---|
| `src/services/vci/**` | oid4vci-spec, credential-handling | Strict adherence to RFC OID4VCI 1.0, token flows, and proof creation. |
| `src/services/crypto/**` | crypto-signing, keychain-security | Focus on memory cleanup, non-extractable keys, and JSI-speed calculations. |
| `src/screens/**`, `src/components/**` | nativewind-layouts, expo-router | Use utility classes for responsive screens, handle Safe Area view limits. |
| `src/store/**` | zustand-state, persisted-slices | Keep states thin, avoid heavy arrays, leverage custom selector hooks. |

When creating subagents or generating plan templates, pass down architecture constraints from `docs/ARCHITECTURE.md` explicitly to keep code quality production-ready.
