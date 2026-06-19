OID4VCI Wallet Project - Playbook for AI Agents

Must Respond in English Only!

This is a production-ready playbook defining strict architectural rules, security gates, coding styles, and roadmap tracking for the OID4VCI 1.0 Mobile Wallet.

---

## HANDOFF STATE (2026-06-15)

**Immediate Next Task:** Validate the new production Keychain-protected Ed25519 signer end to end on physical Android: reissue credentials with the new Ed25519 Holder DID, then retry OID4VP Verifier QR. Android `npx expo prebuild --clean` already succeeds in a headless Windows session; iOS prebuild is platform-gated by Expo CLI to macOS/Linux and cannot run on Windows. Remaining validation is EAS production builds for iOS and Android, then a golden-path walkthrough (enroll → claim credential via QR → confirm issuance → complete biometric-gated issuance → view saved credential detail) on physical hardware. Requires user-held EAS credentials, physical iOS and Android devices, and a real or test Issuer QR issuance source not available in a headless session — this is the user's manual step.

**Session 2026-06-15 verification:** root `yarn tsc --noEmit` pass, root `yarn lint` pass (2 pre-existing `no-require-imports` warnings in `src/services/vci/exchangeService.test.ts`, no errors), root `yarn test` 37 suites / 174 tests pass, server `yarn tsc` pass, server `yarn test` 5 suites / 16 tests pass. No regressions found in the current uncommitted working tree. See `docs/TASKS.md` Session 2026-06-15 notes for the PIN-setup-bypass fix, revoked-credential presentation filtering, stale Scan-tab credential refresh fix, and the Android `FaceScanPanel` crash fix landed this session.

**Phase 4 progress (2026-06-07):** Screen capture prevention, jailbreak/root detection (hard block, ADR 0004), backend-only certificate pinning (ADR 0005), and the production bundle/log leak scan script (`yarn scan:bundle-leaks`) are complete — see `docs/TASKS.md` Session 2026-06-07 notes. ADR 0006 records ISO 18013-5 mdoc native module selection criteria; final module selection remains parked on physical iOS/Android validation. Issuer signature validation remains parked on finalized trust metadata.

**ETDA EdDSA direction (2026-06-16):** ETDA requires EdDSA/Ed25519 for both OID4VCI issuance PoP and OID4VP presentation KB-JWT. The target Galaxy S24 Ultra proved AndroidKeyStore Ed25519 generation is unavailable in practice because AndroidKeyStore returned EC keys for Ed25519 requests. Production now uses a Keychain-protected software Ed25519 seed with biometric/device authentication on signing, producing protocol-valid `alg: EdDSA` signatures. This is a security tradeoff versus hardware non-extractability and is recorded in ADR 0008. Existing credentials issued before this Holder DID must be reissued before Verifier holder-binding validation can pass.

**Files to read before starting:**
- `CLAUDE.md` - architecture rules and commands
- `CONTEXT.md` - domain glossary
- `docs/ARCHITECTURE.md` - protocol, storage, and UI boundaries
- `docs/API.md` - generated SDK boundary and local backend URL adapter
- `docs/SECURITY.md` - crypto, storage, biometric, network, and build rules
- `docs/SECURITY_FINDINGS.md` - latest auth/crypto review status
- `docs/TASKS.md` - active backlog and blockers
- `docs/adr/0001-hardware-backed-signing-key.md`
- `docs/adr/0002-native-signing-module.md`
- `docs/adr/0003-nfc-presentation-protocol.md`
- `docs/adr/0004-root-jailbreak-detection-response.md`
- `docs/adr/0005-backend-only-certificate-pinning.md`
- `docs/adr/0006-mdoc-native-module-selection-criteria.md`
- `src/services/crypto/crypto.ts`
- `src/services/crypto/secureEnvironmentPolicy.ts`
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

- Production signing: `@noble/curves` Ed25519 with the 32-byte seed stored in `react-native-keychain` and retrieved under biometric/device authentication for signing.
- Storage: `react-native-mmkv` v4 via `createMMKV()`, requiring `react-native-nitro-modules`
- Crypto, non-signing: `react-native-quick-crypto`
- State: `zustand`, with TanStack Query for SDK-generated API hooks
- Styles: NativeWind + `tailwindcss@3.4.4`
- Camera QR: `expo-camera@17.0.10`
- SDK generation: Orval TanStack Query client into `src/sdk/`
