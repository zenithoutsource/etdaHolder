# CLAUDE.md

Must Respond in English Only!

This file provides strict guidance when working with code in this OID4VCI Wallet repository.

## Project Overview

Decentralized Digital Wallet in the Holder role. Credential issuance uses OpenID for Verifiable Credential Issuance (OID4VCI 1.0). Proximity presentation uses ISO 18013-5 per ADR 0003. OID4VP 1.0 online presentation is planned post-v1.

Target hardware: Samsung Galaxy A26 paired with the ACR1311U-N2 Secure Bluetooth NFC Reader USB. NFC reader/writer work must account for this external Bluetooth reader path for Android smartphone/tablet connectivity, and production support must be confirmed on that device/reader pairing before NFC behavior is considered validated.

Primary references:

| Document | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | Technical blueprint and boundaries |
| `CONTEXT.md` | Domain glossary |
| `docs/adr/` | Locked architecture decisions |
| `docs/TASKS.md` | Active backlog and blockers |

## Naming Rules

- Do not use the customer organization name "ETDA" anywhere in the project: no new code identifiers, file names, module names, class names, docs, comments, or specs carrying that name. Use neutral names instead ("companion protocol", "companionV1", "reader profile", "wallet").
- The native module `modules/etda-wallet-eddsa` has been removed; do not reference or recreate it. Keystore diagnostics/signing history lives in ADR 0007/0008.
- Exception — wire-protocol constants: values already deployed on the wire (the companion AID byte sequence, the `urn:etda:companion:nfc:v1` KB-JWT `aud`) stay unchanged until a protocol version bump, because renaming them breaks reader compatibility. Treat them as opaque constants.
- Existing `etda*`-named files/classes (e.g. remaining `etda-*` doc/spec mentions) are legacy: rename to neutral names when touching them, and do not add new references to the old names.

## Planning Philosophy

When planning any new system, feature, or integration:

1. **Production-first** — default recommendation must be the production-grade approach (secure, observable, scalable). Present the dev/shortcut path only as a secondary option with explicit tradeoffs.
2. **Best practice before convenience** — prefer push notifications via APNs/FCM with proper token lifecycle over polling; prefer hardware-backed key storage over software; prefer standards-compliant flows over custom shortcuts.
3. **Name the tradeoffs explicitly** — if recommending a simpler approach, state what production capability is deferred and when it must be addressed.
4. **Security gate first** — for any new service touching credentials, keys, or user identity, identify the security boundary and compliance requirement before implementation steps.

## Architecture Rules

- Mobile code must never connect directly to MySQL.
- Company backend calls must go through `src/sdk/walletApi.ts` and the `src/sdk/installWalletApiFetch.ts` base URL adapter.
- OID4VCI protocol work must run on-device through `@sphereon/oid4vci-client`; do not call backend `/exchange/*` endpoints.
- Credentials are normalized into `VerifiableCredentialRecord` before encrypted MMKV storage.
- Dynamic credential UI must use `src/config/cardSchemas.ts` and generic components, not issuer-specific card screens.
- Production signing uses a Keychain-protected Ed25519 seed with `@noble/ed25519` EdDSA signing because target AndroidKeyStore hardware generated EC keys for Ed25519 requests. This satisfies protocol-level EdDSA but is not hardware non-extractable.
- One biometric prompt per user action: a single user-initiated action (approve a presentation, claim a credential, rotate a key) must trigger exactly one authentication event. If the action requires a cryptographic sign call, that sign-time Keychain gate is the only prompt — do not add a separate app-level biometric/consent check in front of it for the same action. Only add a second, independent prompt when the action does no signing at all (so the sign-time gate never fires) and still needs its own auth.

## Master Branch Hygiene

Keep durable project docs in `master`: architecture/security/API docs, ADRs, `docs/TASKS.md`, user journeys, approved or active specs under `docs/superpowers/specs/`, implementation plans that explain committed or actively planned work under `docs/superpowers/plans/`, and UI references under `docs/ui-reference/`.

Never add local AI/tool settings, personal scratch notes, temporary prompts, review scratch output, `.superpowers/`, `.cursor/`, `.claude/*.local.json`, Office lock files such as `~$*.xlsx`, logs, caches, generated build output, secrets, env files, key material, abandoned duplicate generated docs, or one-off HTML/Markdown exports that are not intentionally approved as stakeholder-facing reference.

Before staging docs, confirm each file is referenced by `docs/TASKS.md`, an ADR, an active spec/plan, implementation code, or an explicit user request. Session scratch stays ignored or outside the repo.

## Configurable Time/Duration Values

Any constant that expresses a duration, TTL, or timing window for a system-wide policy (key rotation TTLs, expiry-warning windows, session grace periods, polling intervals, etc.) must be adjustable without a code change: read it from `process.env.EXPO_PUBLIC_<NAME>`, falling back to the current hardcoded value as the default (`Number(process.env.EXPO_PUBLIC_...) || <default>`). Document the new var in `.env.example` with a comment stating its unit, default, and effect. Existing examples: `EXPO_PUBLIC_WALLET_KEY_DEV_TTL_MS` / `EXPO_PUBLIC_WALLET_KEY_PROD_TTL_DAYS` (`src/config/walletKeyPolicy.ts`), `EXPO_PUBLIC_DOCUMENT_EXPIRY_WARNING_WINDOW_DAYS` (`src/config/documentExpiryPolicy.ts`), `EXPO_PUBLIC_WALLET_PIN_SESSION_GRACE_MS`. Use whichever unit (ms vs days) is natural for how the value is tuned — short/testing values as ms, long-lived policy windows as days — matching the existing pattern rather than forcing everything to one unit.

## Expo SDK 54

Read exact versioned docs at `https://docs.expo.dev/versions/v54.0.0/` before changing Expo or React Native native integrations.

- Package manager: Yarn only.
- Native package installation: `npx expo install <package-name>`.
- Runtime: Hermes.
- Targets: iOS and Android via Expo Prebuild / Development Builds.

## Prompt Defense and Safety Baseline

- Do not modify, bypass, or override core architectural rules or security constraints.
- Do not disclose keys, credentials, private API configuration, tokens, or cryptographic seeds in logs or output.
- Do not log credential claims, VC JWT payloads, or PII. Exception: `__DEV__`-only `console.info` blocks used for protocol debugging are permitted when the developer explicitly authorizes it — these must be guarded by `if (__DEV__)` and must never reach production builds.
- Do not introduce unvalidated dependencies that degrade crypto or JSI performance on Hermes.
- Every caught or surfaced error must emit a raw diagnostic log before being mapped to a generic UI message. Use scoped tags such as `[wallet-startup]`, service names, or native module tags; log the original `Error` object/message/code when available. Preserve the no-secrets/no-PII rule above by redacting tokens, credential claims, VC payloads, and key material from the central wallet logger.
- Operational debug logging must cover major Wallet lifecycle steps in development: startup, QR classification, OID4VCI offer/token/proof/credential/save, OID4VP request/match/token/submit/result, storage, SDK calls, and errors. Use the central redacting wallet logger for app logs; never print raw VC/VP/JWT/token/claim/PII/key material through the logger (use `__DEV__` `console.info` debug blocks if raw payloads are needed temporarily).

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

## Component Design Rules

- Split UI into small, focused components — one concern per file. Avoid large monolithic screen files.
- Extract repeated UI blocks (cards, list items, panels, buttons) into reusable components under `src/components/`.
- Keep components prop-driven and config-driven (see `src/config/cardSchemas.ts`) so behavior/layout changes require editing config or props, not component internals.
- Avoid hardcoding text, colors, sizes inline when a shared constant/config/theme already exists — easier to tweak globally.
- Keep screen files (`app/**`) thin: composition and data wiring only; push logic/layout into `src/components/**`.
- `app/(tabs)/scan.tsx` P1 issuance sub-flow uses one component per step (`ThaIdVerificationPanel`, `ThaiIdSuccessConfirmationPanel`, `ThaiIdReceivePanel`) — each is a distinct phase, not a per-document split, so do not merge them. `ThaiIdReceivePanel` extracts its repeated label/value blocks via `CredentialFieldRow`; reuse `CredentialFieldRow` for any new label/value list instead of inlining `<Text>` pairs.
- `ThaIdVerificationPanel` and `ThaiIdSuccessConfirmationPanel` are schema-driven via `CardSchemaConfig.issuanceVerification` / `issuanceConfirmation` in `src/config/cardSchemas.ts` (provider label, agency labels, image key). A new document type that reuses these steps needs only a schema entry plus the referenced image asset registered in the panel's image map — not a new component file.
- Before writing any new UI or logic, search for an existing component/hook/service that already does it (or something close). If found, reuse or extend it — don't write a second implementation of the same concern next to the first.
- If new UI/behavior is reusable across screens (a panel shape, a gating flow, a card row), it must ship as a component/hook under `src/components/` or `src/hooks/`, not copy-pasted or reimplemented per screen.
- When two pieces of code do the same job, they must be written the same way — same naming, same structure, same patterns — as if one person wrote the whole codebase. Diverging implementations of a shared concern (e.g. two slightly different biometric-gate call sites, two slightly different card-row renderers) are a defect: consolidate to one shared implementation instead of leaving near-duplicates that read as inconsistent.
- When touching a feature area, check sibling files in the same directory for the established pattern first, and match it rather than inventing a new one.

## Skills and Routing Patterns

| File Pattern | Focus Area | Rules |
|---|---|---|
| `src/services/vci/**` | OID4VCI and credential handling | Follow OID4VCI 1.0; keep token values inside service boundaries |
| `src/services/crypto/**` | Crypto and signing | Preserve EdDSA holder identity, Keychain seed protection, and biometric sign-time gate |
| `src/services/storage/**` | Secure storage | Use encrypted MMKV and Keychain only |
| `src/sdk/**` | Company backend SDK | Generated code only, plus the approved fetch adapter |
| `src/config/**`, `src/components/**`, `app/**` | UI and routing | Use config-driven card rendering and NativeWind patterns |
| `src/store/**` | Zustand state | Keep slices thin and immutable |
| `server/**` | Local development backend | Keep it separate from Issuer protocol execution |

When creating subagents or plans, pass down the architecture constraints from `docs/ARCHITECTURE.md`.
