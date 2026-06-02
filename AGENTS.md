OID4VCI Wallet Project - Playbook for AI Agents

This is a production-ready playbook defining strict architectural rules, security gates, coding styles, and roadmap tracking for the OID4VCI 1.0 Mobile Wallet.

---

## HANDOFF STATE (2026-06-02)

**Immediate Next Task:** Begin Phase 2.2 Credential Offer Resolution in `src/services/vci/exchangeService.ts`.

**Files to read before starting:**
- `CLAUDE.md` - architecture rules
- `CONTEXT.md` - domain glossary (all terms resolved)
- `docs/ARCHITECTURE.md` - protocol/storage boundaries
- `docs/adr/0001`, `0002`, `0003` - locked decisions
- `TASKS.md` - active backlog and current blockers
- `src/services/crypto/crypto.ts` - Phase 1 crypto
- `src/services/storage/storage.ts` - Phase 1 encrypted storage
- `app/_layout.tsx` - Phase 1 startup wiring
- `orval.config.ts` - Phase 2.1 SDK generation config
- `src/sdk/walletApi.ts` - generated company backend SDK

**Next concrete steps:**
1. Implement `resolveOffer(offerUri: string)` in `src/services/vci/exchangeService.ts`.
2. Use `@sphereon/oid4vci-client` for OID4VCI 1.0 offer parsing; do not call generated `/exchange/*` backend endpoints.
3. Extract Issuer metadata needed for dynamic UI branding.
4. Run `yarn tsc`, `yarn lint`, and update `TASKS.md`.

---

Core Principles

Decoupled Architecture - Separate the public OID4VCI 1.0 protocol layer from the internal wallet state storage.

Config-Driven UI - Map all credential cards dynamically. Never build single-purpose hardcoded screen layouts.

Hardware-Backed Isolation - Never expose private keys or raw cryptographic seeds to the JavaScript memory space.

SDK-First Communication - All company backend operations must pass through the auto-generated TypeScript SDK (generated via orval from the company OpenAPI spec).

Plan Before Execute - Always design data flow and verify interface mappings before writing UI or logic code.

Key Developer Rules & Constraints

1. Expo SDK 54 & Hermes Compliance

Rule: Use Yarn for package installations, but always install Expo/React Native libraries using npx expo install <package_name>.

Reason: This enforces strict peer-dependency matching against the Expo SDK 54 runtime.

Engine: All code must be optimized for the Hermes JavaScript Engine. Avoid legacy, unoptimized JavaScript modules or large dependencies that block JSI bindings.

2. No Direct Database Connections

Rule: The mobile application must never query the MySQL database directly.

Execution: Mobile Wallet App -> TypeScript SDK (orval/TanStack Query) -> API Gateway -> MySQL -> App.

3. Decoupled Protocol Execution

Rule: Use @sphereon/oid4vci-client exclusively to parse credential offers and handle Pre-Authorized Code token flows.

Reason: The legacy /exchange endpoints in the provided Swagger SDK are outdated and do not support OID4VCI 1.0.

Integration: Once @sphereon successfully claims a VC JWT from an Issuer, push the raw payload to storage using the encrypted MMKV credentials store.

4. Self-Sovereign Architecture

Rule: The app claims credentials directly from Issuers. The company backend authenticates the user and returns a Credential Offer URL only - it does not run OID4VCI on behalf of the app.

Security Guidelines

Zero Raw Key Exposure: Keys generated inside hardware secure enclave (@animo-id/expo-secure-environment). JS runtime accesses only the key alias (etda_wallet_signing_key).

Holder DID: did:key derived from compressed P-256 public key (multicodec prefix [0x80, 0x24] = varint(0x1200)). PoP JWT uses kid header (not jwk), iss = Holder DID.

No AsyncStorage: Credentials stored in react-native-mmkv with full encryption. Encryption key stored in react-native-keychain (biometric-gated).

Biometric Sign-Time Gate: Biometric fires on every signProof() call.

NFC Presentation: ISO 18013-5 (mdoc) proximity channel - see ADR 0003. Native mdoc module not yet selected.

Online Presentation: OID4VP 1.0 (online/cross-device channel) - planned post-v1, scope-only. Protocol mechanics (library, query language, client_id scheme) not yet decided. Reuses the hardware Wallet Signing Key via src/services/crypto with the same biometric sign-time gate. Device-to-Verifier direct - no company backend proxy. Does not supersede ADR 0003 (different transport).

Coding Style

Strict Immutability: Copy state objects instead of mutating Zustand slices.

Generic Adapter Pattern: Convert any backend payload into the generic VerifiableCredentialRecord format before storing in MMKV.

Error Handling: Wrap all async SDK calls and crypto operations in try-catch to prevent thread-blocking on Hermes.

Implementation Status Tracker

[x] Tech Stack & System Requirements Alignment
[x] ADR 0001: Hardware-backed non-extractable signing key (EC P-256)
[x] ADR 0002: @animo-id/expo-secure-environment as native signing module
[x] ADR 0003: ISO 18013-5 for NFC credential presentation
[x] Phase 1a: src/services/crypto/crypto.ts - written and yarn tsc green
[x] Phase 1b: src/services/storage/storage.ts - encrypted MMKV storage written
[x] Phase 1c: app/_layout.tsx startup wiring - written
[ ] Phase 2: OID4VCI 1.0 Protocol Integration (Target: Week 3-4; Phase 2.1 SDK setup complete)
[ ] Phase 3: Dynamic Card & Config-Driven UI Mapping (Target: Week 5-6)
[ ] Phase 4: Security Hardening & Release Build (Target: Week 7-8)
[ ] Post-v1: OID4VP 1.0 Online Presentation (planned, scope-only - mechanics TBD)

Key Package Decisions

Signing: @animo-id/expo-secure-environment@0.1.5
Storage: react-native-mmkv v4 via createMMKV() - requires react-native-nitro-modules
Crypto (non-signing): react-native-quick-crypto
State: @tanstack/react-query
Styles: NativeWind (Tailwind CSS)
SDK generation: orval (TanStack Query hooks from OpenAPI spec -> src/sdk/)
