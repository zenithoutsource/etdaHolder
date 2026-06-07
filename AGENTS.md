OID4VCI Wallet Project - Playbook for AI Agents

Must Respond in English Only!

This is a production-ready playbook defining strict architectural rules, security gates, coding styles, and roadmap tracking for the OID4VCI 1.0 Mobile Wallet.

---

## HANDOFF STATE (2026-06-07)

**Immediate Next Task:** Finish Phase 4 release build validation — `npx expo prebuild --clean` already verified for Android in a headless session (succeeds; iOS prebuild is platform-gated by Expo CLI to macOS/Linux and cannot run on Windows). Remaining: EAS production builds for iOS and Android, then a golden-path walkthrough (enroll → claim credential via QR → view detail → sign PoP) on physical hardware. Requires physical devices and EAS credentials not available in a headless session — this is the user's manual step.

**Phase 4 progress (2026-06-07):** Screen capture prevention, jailbreak/root detection (hard block, ADR 0004), backend-only certificate pinning (ADR 0005), and the production bundle/log leak scan script (`yarn scan:bundle-leaks`) are complete — see `docs/TASKS.md` Session 2026-06-07 notes. Issuer signature validation and the ISO 18013-5 mdoc native module ADR remain parked on their stated blockers (finalized trust metadata, physical NFC test device).

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
1. Replace any remaining mojibake or corrupted Thai labels in `app/(tabs)/scan.tsx` with intentional localized strings or English fallback.
2. Add NFC NDEF issuance only when a test device is available; do not wire unverified NFC behavior.
3. Keep QR offer flow routed through `resolveOffer()` and the pre-save confirmation screen.
4. Run `yarn tsc --noEmit`, `yarn lint`, and focused tests after edits.
5. Update `docs/TASKS.md` after every completed implementation slice.

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

- Zero raw key exposure: keys are generated inside `@animo-id/expo-secure-environment`; JS accesses only alias `etda_wallet_signing_key`.
- Holder DID: `did:key` derived from compressed P-256 public key using multicodec prefix `[0x80, 0x24]`.
- PoP JWT: uses `kid` header, not `jwk`; payload `iss` is the Holder DID.
- No AsyncStorage: credentials are stored in encrypted MMKV; encryption key is held in `react-native-keychain`.
- Biometric sign-time gate: biometric authentication fires on every `signProof()` call.
- NFC Presentation: ISO 18013-5 proximity channel; native mdoc module not yet selected.
- Online Presentation: OID4VP 1.0 planned post-v1; protocol mechanics are not decided.

## Coding Style

- Strict immutability: copy state objects instead of mutating Zustand slices.
- Generic adapter pattern: convert backend or issuer payloads into `VerifiableCredentialRecord` before storage.
- Error handling: wrap async SDK calls and crypto operations; do not block Hermes threads.

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
[ ] Post-v1: OID4VP 1.0 online presentation

## Key Package Decisions

- Signing: `@animo-id/expo-secure-environment@0.1.5`
- Storage: `react-native-mmkv` v4 via `createMMKV()`, requiring `react-native-nitro-modules`
- Crypto, non-signing: `react-native-quick-crypto`
- State: `zustand`, with TanStack Query for SDK-generated API hooks
- Styles: NativeWind + `tailwindcss@3.4.4`
- Camera QR: `expo-camera@17.0.10`
- SDK generation: Orval TanStack Query client into `src/sdk/`
