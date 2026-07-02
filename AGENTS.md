OID4VCI Wallet Project - Playbook for AI Agents

Must Respond in English Only!

This is a production-ready playbook defining strict architectural rules, security gates, coding styles, and roadmap tracking for the OID4VCI 1.0 Mobile Wallet.

---

## HANDOFF STATE

Session-by-session progress, verification runs, and next steps live in `docs/TASKS.md` — treat that file as the current source of truth instead of dates in this section, which go stale fast.

**Standing architecture note (ADR 0007 → ADR 0008, 2026-06-16):** ETDA requires EdDSA/Ed25519 for both OID4VCI issuance PoP and OID4VP presentation KB-JWT. The target Galaxy S24 Ultra proved AndroidKeyStore Ed25519 key generation unavailable in practice (AndroidKeyStore returned EC keys for Ed25519 requests). Production uses a Keychain-protected software Ed25519 seed with biometric/device authentication at every sign call, producing protocol-valid `alg: EdDSA` signatures — a documented security tradeoff versus hardware non-extractability (ADR 0008, `docs/SECURITY.md` Section 1).

**Files to read before starting:**
- `CLAUDE.md` - architecture rules and commands
- `CONTEXT.md` - domain glossary
- `docs/ARCHITECTURE.md` - protocol, storage, and UI boundaries
- `docs/API.md` - generated SDK boundary and local backend URL adapter
- `docs/SECURITY.md` - crypto, storage, biometric, network, and build rules (includes Section 6 "Current Security Findings")
- `docs/TASKS.md` - active backlog and blockers
- `docs/adr/0001-hardware-backed-signing-key.md`
- `docs/adr/0002-native-signing-module.md`
- `docs/adr/0003-nfc-presentation-protocol.md`
- `docs/adr/0004-root-jailbreak-detection-response.md`
- `docs/adr/0005-backend-only-certificate-pinning.md`
- `docs/adr/0006-mdoc-native-module-selection-criteria.md`
- `src/services/crypto/crypto.ts`
- `src/services/security/deviceIntegrityPolicy.ts`
- `src/services/storage/storage.ts`
- `src/services/vci/exchangeService.ts`
- `src/services/auth/authService.ts`
- `src/sdk/installWalletApiFetch.ts`
- `src/config/cardSchemas.ts`
- `src/components/CredentialCard.tsx`
- `app/_layout.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/scan.tsx`
- `app/(tabs)/credential/[id].tsx`
- `server/README.md`

**Next concrete steps:**
1. Add an ADR for ETDA EdDSA/Ed25519 requirements and the migration from P-256/ES256.
2. Reissue test credentials through the dev-only EdDSA OID4VCI PoP path, then retry OID4VP Verifier QR.
3. Reissue credentials using the Keychain Ed25519 Holder DID before OID4VP validation.
4. Run Phase 4 release validation only after production EdDSA signing decisions are resolved: EAS production builds and physical-device golden-path walkthrough.
5. Add NFC NDEF issuance only when a test device is available; do not wire unverified NFC behavior.
6. Keep QR offer flow routed through `resolveOffer()` and the pre-save confirmation screen.
7. Run `yarn tsc --noEmit`, `yarn lint`, and focused tests after edits.
8. Update `docs/TASKS.md` after every completed implementation slice.

**Phase 2.3 resolved decisions:**
- `claimCredential()` accepts `ResolvedCredentialOffer`, not a raw offer URI.
- Phase 2.3 supports OID4VCI 1.0 Pre-Authorized Code flow only.
- Credential responses support compact JWT VC plus compact SD-JWT VC profiles, including `dc+sd-jwt` and `vc+sd-jwt` transcript responses.
- `tx_code` is caller-supplied; protocol service throws `TransactionCodeRequired` when required and missing.
- `claimCredential()` returns only the stored `VerifiableCredentialRecord`; token values stay inside the protocol service.
- Store locally first in encrypted MMKV; backend sync remains separate Phase 2.4 work.

**Phase 2.4 resolved decisions:**
- `syncCredentialToBackend()` is separate from `claimCredential()`.
- Backend sync requires explicit `walletId` and authenticated `sessionToken`.
- Generated SDK `importCredential()` payload is `{ jwt: record.rawVc, associated_did: getHolderDid() }`.
- Only HTTP 201 counts as sync success.
- TanStack Query cache invalidation stays in caller/UI code.

**Phase 3 resolved decisions:**
- `docs/ui-reference/home.html` is the current design reference for the Wallet home tab.
- `app/(tabs)/index.tsx` uses React Native primitives and NativeWind classes.
- `CardSchemaConfig` lives in `src/config/cardSchemas.ts`.
- Initial card configs are ThaID, DLT Driving Licence, and Bangkok University Transcript.
- `CredentialCard` renders from config; do not create issuer-specific card components.
- `VerifiableCredentialRecord.type` maps to `CardSchemaConfig` through `getCardSchema()`.
- QR scanner uses `expo-camera` `CameraView`; NFC NDEF issuance is deferred for lack of device verification.
- Bottom tab shell is Wallet, My QR, Scan, History Log.
- `app/_layout.tsx` imports native startup services only on non-web platforms so static web export does not evaluate hardware-signing dependencies.

---

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

## Planning Philosophy

When planning any new system, feature, or integration:

1. **Production-first** — default recommendation must be the production-grade approach (secure, observable, scalable). Present the dev/shortcut path only as a secondary option with explicit tradeoffs stated.
2. **Best practice before convenience** — prefer APNs/FCM push with proper token lifecycle over polling; prefer hardware-backed key storage over software; prefer standards-compliant protocol flows over custom shortcuts.
3. **Name the tradeoffs explicitly** — if recommending a simpler path, state what production capability is deferred and the trigger for when it must be addressed.
4. **Security gate first** — for any new service touching credentials, keys, or user identity, identify the security boundary and compliance requirement before writing implementation steps.

## Core Principles

Decoupled Architecture - Separate the public OID4VCI 1.0 protocol layer from internal wallet state storage.

Config-Driven UI - Map all credential cards dynamically. Never build single-purpose hardcoded screen layouts.

Hardware-Backed Isolation - Never expose private keys or raw cryptographic seeds to JavaScript memory.

SDK-First Communication - All company backend operations must pass through the auto-generated TypeScript SDK generated by Orval from the company OpenAPI spec.

Plan Before Execute - Always design data flow and verify interface mappings before writing UI or logic code.

## Key Developer Rules and Constraints

### 1. Expo SDK 54 and Hermes Compliance

Use Yarn for package installations, but install Expo/React Native native libraries using `npx expo install <package_name>`.

All code must be compatible with Hermes. Avoid legacy or pure-JS cryptographic dependencies on the signing path.

### 2. No Direct Database Connections

The mobile application must never query MySQL directly.

Allowed path: Mobile Wallet App -> TypeScript SDK -> API Gateway or local development backend -> MySQL.

### 3. Decoupled Protocol Execution

Use `@sphereon/oid4vci-client` for OID4VCI offer parsing and Pre-Authorized Code flows. Legacy `/exchange/*` endpoints in the backend spec are forbidden from mobile code.

### 4. Self-Sovereign Architecture

The app claims credentials directly from Issuers. The company backend authenticates the user and returns or stores wallet data; it does not run OID4VCI on behalf of the app.

## Security Guidelines

- Production Holder DID is `did:key` derived from the Keychain-protected Ed25519 public key using multicodec prefix `[0xed, 0x01]`. The Ed25519 seed is software-generated and retrieved through `react-native-keychain`; this is not hardware non-extractable.
- Current PoP JWT: uses `kid` header, not `jwk`; payload `iss`/`sub` is the Ed25519 Holder DID and `alg` is `EdDSA`.
- No AsyncStorage: credentials are stored in encrypted MMKV; encryption key is held in `react-native-keychain`.
- Biometric sign-time gate: biometric authentication fires on every `signProof()` call.
- One biometric prompt per user action: a single user-initiated action (approve a presentation, claim a credential, rotate a key) must trigger exactly one authentication event. If the action requires a cryptographic sign call, that sign-time Keychain gate is the only prompt — do not add a separate app-level biometric/consent check in front of it for the same action. Only add a second, independent prompt when the action does no signing at all (so the sign-time gate never fires) and still needs its own auth.
- NFC Presentation: ISO 18013-5 proximity channel; native mdoc module not yet selected.
- Online Presentation: OID4VP 1.0 first slice is implemented. Production uses Keychain-protected Ed25519 EdDSA for SD-JWT KB-JWT.

## Coding Style

- Strict immutability: copy state objects instead of mutating Zustand slices.
- Generic adapter pattern: convert backend or issuer payloads into `VerifiableCredentialRecord` before storage.
- Error handling: wrap async SDK calls and crypto operations; do not block Hermes threads.
- Error logging: every caught or surfaced error must emit a raw diagnostic log before being mapped to a generic UI message. Use scoped tags such as `[wallet-startup]`, service names, or native module tags; log the original `Error` object/message/code when available. Redact tokens, credential claims, VC payloads, private keys, cryptographic seeds, and PII.
- Operational debug logging must cover major Wallet lifecycle steps in development: startup, QR classification, OID4VCI offer/token/proof/credential/save, OID4VP request/match/token/submit/result, storage, SDK calls, and errors. Use the central redacting wallet logger for app logs; never print raw VC/VP/JWT/token/claim/PII/key material.

## Implementation Status Tracker

[x] Tech Stack and System Requirements Alignment
[x] ADR 0001: Hardware-backed non-extractable signing key
[x] ADR 0002: `@animo-id/expo-secure-environment` as native signing module
[x] ADR 0003: ISO 18013-5 for NFC credential presentation
[x] Phase 1: Cryptography and secure storage
[x] Phase 2: OID4VCI 1.0 protocol integration and backend sync
[x] Phase 3.1: Wallet home HTML to NativeWind translation
[x] Phase 3.2: Dynamic card engine
[x] Phase 3.3: QR scanner and pre-save credential confirmation
[ ] Phase 3.3: NFC NDEF issuance reader, deferred until test device
[ ] Phase 4: Security hardening and release build
[x] OID4VP 1.0 first Verifier QR slice
[x] ETDA EdDSA OID4VCI PoP migration
[x] Production Keychain Ed25519 signer for OID4VCI/OID4VP

## Key Package Decisions

- Production signing: `@noble/ed25519` with the 32-byte seed stored in `react-native-keychain` and retrieved under biometric/device authentication for signing.
- Storage: `react-native-mmkv` v4 via `createMMKV()`, requiring `react-native-nitro-modules`
- Crypto, non-signing: `react-native-quick-crypto`
- State: `zustand`, with TanStack Query for SDK-generated API hooks
- Styles: NativeWind + `tailwindcss@3.4.4`
- Camera QR: `expo-camera@17.0.10`
- SDK generation: Orval TanStack Query client into `src/sdk/`
