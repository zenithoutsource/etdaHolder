TASKS.md - Active Implementation Backlog

Controls execution of local AI agent coding sessions. Isolates immediate steps from long-term milestones.
Cross-reference: AGENTS.md (status) | docs/ARCHITECTURE.md (design) | CONTEXT.md (terms) | docs/adr/ (decisions)

---

## PHASE 1: Cryptography & Secure Storage (Week 1-2)

### 1.1 Crypto Service - src/services/crypto/crypto.ts
[x] Generate EC P-256 hardware keypair via @animo-id/expo-secure-environment
[x] Derive did:key from compressed P-256 key (multicodec prefix [0x80, 0x24], base58btc)
[x] Implement signProof(nonce, audience) - PoP JWT with kid/DID header, biometric sign-time gate
[x] Implement getHolderDid(), getPublicKeyJwk(), hasWalletKey(), resetWalletKey()
[x] Run yarn tsc - verify zero TypeScript errors

### 1.2 Storage Service - src/services/storage/storage.ts
[x] Generate random 256-bit encryption key at first launch
[x] Store encryption key in react-native-keychain with biometric access control
[x] Expose initStorage(): Promise<void> - retrieves key from Keychain, unlocks MMKV
[x] Expose getCredentialStorage(): MMKV - returns encrypted wallet-credentials instance
[x] Two MMKV instances: wallet-meta (unencrypted) | wallet-credentials (AES-256 encrypted)

### 1.3 App Startup Wiring - app/_layout.tsx
[x] Call generateWalletKeyIfNeeded() on first launch
[x] Call initStorage() before any credential access
[x] Show error boundary if hardware key or storage init fails (do not silently swallow)

---

## PHASE 2: OID4VCI 1.0 Protocol Integration (Week 3-4)

### 2.1 SDK Generation Setup
[x] Install orval: yarn add --dev orval@7.10.0
[x] Configure orval.config.ts -> input: walletApi.json (swap for real company spec when available)
[x] Output target: src/sdk/ with TanStack Query hooks
[x] Run orval -> verify generated hooks compile

### 2.2 Credential Offer Resolution - src/services/vci/exchangeService.ts
[x] Verify @sphereon/oid4vci-client@0.20.1 is installed
[x] Implement resolveOffer(offerUri: string) - parses openid-credential-offer:// URI
[x] Extract Issuer metadata for dynamic UI branding (name, logo, colors)
[x] Handle both QR scan and NFC NDEF offer URI inputs (same function, different call site)

### 2.3 Credential Acquisition - claimCredential()
[x] Accept `ResolvedCredentialOffer` as input; do not resolve raw offer URI inside `claimCredential()`
[x] Return only the stored VerifiableCredentialRecord; do not expose access token or c_nonce outside protocol service
[x] Support Pre-Authorized Code flow only for Phase 2.3; reject Authorization Code flow as `CredentialFlowUnsupported`
[x] Support JWT VC credential responses only; reject unsupported formats as `CredentialFormatUnsupported`
[x] Use stable prefixed Error messages for Phase 2.3 failures; avoid custom Error classes unless UI needs structured handling later
[x] Exchange Pre-Authorized Code at Token Endpoint -> Access Token + c_nonce
[x] Call signProof(c_nonce, issuerUrl) from crypto service (biometric fires here)
[x] Submit Credential Request with Access Token + signed PoP -> receive VC JWT
[x] Normalize VC JWT into VerifiableCredentialRecord (id, type, rawVc, claims, issuedAt, expiresAt); store full decoded VC payload in `claims` and parse as untrusted display data unless Sphereon validates issuer signature during acquisition
[x] Normalize `issuedAt` / `expiresAt` to ISO 8601 strings from JWT seconds or VC date claims
[x] Use VC `jti` / `id` as VerifiableCredentialRecord.id when present; fallback to deterministic hash of raw VC JWT
[x] Derive VerifiableCredentialRecord.type from VC claims (`vc.type` / `type`), not from offered credential configuration ID
[x] Store in encrypted MMKV via getCredentialStorage(); overwrite existing record with same normalized id
[x] Store records under `credential:<id>` and maintain `credential:index` for listing IDs
[x] Require caller-supplied `tx_code` when offer declares it; throw `TransactionCodeRequired` if missing

### 2.4 Backend Sync - orval SDK hook
[x] Implement separate backend sync function; do not call backend from inside `claimCredential()`
[x] Add `syncCredentialToBackend(record, { walletId, sessionToken })` in `src/services/vci/exchangeService.ts`
[x] Require authenticated company session token; throw `BackendSyncUnauthorized` when missing
[x] Require explicit `walletId`; throw `BackendSyncWalletMissing` when missing
[x] Run backend sync after local credential storage succeeds; do not make claimCredential() depend on company backend availability
[x] Sync only the signed VC JWT to company backend via generated SDK `importCredential(walletId, { jwt: record.rawVc, associated_did: getHolderDid() })`
[x] Treat only HTTP 201 from `importCredential` as sync success; throw `BackendSyncFailed: HTTP <status>` otherwise
[x] Return sync result only; do not add backend sync status fields to VerifiableCredentialRecord in Phase 2.4
[x] Invalidate TanStack Query cache in caller/UI code after sync success; do not import React Query into the VCI service

---

## PHASE 3: Config-Driven UI (Week 5-6)

### 3.1 HTML to NativeWind Translation
[x] Receive HTML/CSS design files from design team (`docs/ui-reference/home.html`)
[x] Extract layout structures, flex containers, typography from HTML
[x] Translate to React Native primitives (View, Text, Pressable)
[x] Convert CSS to NativeWind Tailwind utility classes
[x] Implement skeleton loaders for async states

### 3.2 Dynamic Card Engine
[ ] Define CardSchemaConfig JSON format (title, issuerName, primaryColor, logo, displayFields)
[ ] Create configs for 3 initial cards: ThaID, DLT Driving Licence, Bangkok University Transcript
[ ] Build generic CredentialCard component that renders from config - no hardcoded card types
[ ] Wire VerifiableCredentialRecord.type to CardSchemaConfig lookup

### 3.3 QR Scanner & NFC
[ ] Integrate camera QR scanner (reference legacy repo for UI/UX only)
[ ] Integrate NFC NDEF reader for offer URI (npx expo install react-native-nfc-manager)
[ ] Both funnel into resolveOffer() from Phase 2.2

---

## PHASE 4: Security Hardening & Release (Week 7-8)

[ ] Screen capture prevention (iOS/Android)
[ ] Certificate pinning for company backend API calls
[ ] Jailbreak/root detection
[ ] Issuer signature validation for stored VC JWTs once issuer trust metadata is finalized
[ ] ISO 18013-5 mdoc native module selection (ADR pending) + integration
[ ] Release build validation (iOS TestFlight + Android internal track)

---

## POST-V1: OID4VP 1.0 Online Presentation (Planned, Not Scheduled)

Scope-only — not part of the 4-phase plan. No ADR, no library chosen yet.
See docs/ROADMAP.md "Post-v1" and docs/ARCHITECTURE.md §2 Presentation Channels.

Open decisions (resolve before starting):
[ ] Choose OID4VP 1.0 library (e.g. @sphereon/* presentation pkg) vs build on existing stack
[ ] Choose query language: DCQL vs Presentation Exchange (presentation_definition)
[ ] Decide client_id scheme + Verifier trust model
[ ] Decide flow shape: same-device redirect vs cross-device (request_uri + QR) + response mode

Implementation (after decisions locked):
[ ] src/services/vp/ - handle Authorization Request, build Verifiable Presentation
[ ] Sign vp_token via src/services/crypto (hardware key, biometric sign-time gate)
[ ] Device-to-Verifier direct - no company backend proxy (does not supersede ADR 0003)
[ ] Tests: verifier.ts MSW handler group (see docs/TESTING.md)

---

## Definition of Done (Per Session)

Before ending a session or handing off:
1. yarn tsc must pass with zero errors
2. Update checkboxes [x] for completed sub-tasks
3. Write blockers/notes below

---

## Active Session Notes & Blockers

Session 2026-06-02:
- crypto.ts written and verified with yarn tsc.
- docs/ARCHITECTURE.md, CONTEXT.md, docs/adr/0001-0003 all current.
- CLAUDE.md refactored - Architecture section moved to docs/ARCHITECTURE.md.
- walletApi.json is a reference example only. Real company spec TBD.
- Installed: @animo-id/expo-secure-environment@0.1.5, react-native-nitro-modules@0.35.9, react-native-quick-base64@3.0.0.
- storage.ts now owns wallet-meta and wallet-credentials MMKV setup, with the encrypted credential store unlocked from react-native-keychain.
- app/_layout.tsx now calls generateWalletKeyIfNeeded() and initStorage() before rendering credential-accessible routes.
- yarn tsc and yarn lint pass after storage/startup wiring.
- Test blocker: Jest/jest-expo dependencies and config are not installed yet, so storage unit tests could not be added in this session.
- Phase 2.1 SDK setup complete: orval@7.10.0 is pinned for Node 20 compatibility, `orval.config.ts` filters `walletApi.json` down to the allowed Protocol Boundary Matrix paths, and `src/sdk/walletApi.ts` exports `generateKey`, `createDidKey`, `importCredential`, plus TanStack Query mutation hooks.
- Orval still prints a warning about `#/components/securitySchemes/auth-bearer-alternative` in the upstream OpenAPI 3.1 spec, but generation, TypeScript, and lint verification pass.
- Phase 2.2 Credential Offer Resolution complete: `resolveOffer()` parses inline and referenced OID4VCI offers with Sphereon, fetches Issuer metadata directly, and returns issuer/credential display data for dynamic UI branding. QR scan and NFC NDEF call sites should both pass their offer URI into this same function.
- Test blocker remains: Jest/jest-expo dependencies and config are not installed yet, so `src/services/vci/exchangeService.test.ts` is a TypeScript contract test compiled by `yarn tsc` rather than an executable Jest test.
- Phase 2.3 Credential Acquisition complete: `claimCredential()` accepts a `ResolvedCredentialOffer`, supports Pre-Authorized Code + JWT VC only, requires caller-supplied `tx_code` when declared, signs PoP through `signProof(c_nonce, issuerUrl)`, normalizes the returned VC JWT, and stores the record under encrypted MMKV keys `credential:<id>` plus `credential:index`.
- Phase 2.4 Backend Sync complete: `syncCredentialToBackend()` runs separately from `claimCredential()`, requires `walletId` + `sessionToken`, calls generated SDK `importCredential()` with `{ jwt, associated_did }`, treats only HTTP 201 as success, and leaves TanStack Query invalidation to caller/UI code.
- Phase 3.1 HTML to NativeWind Translation complete: `app/(tabs)/index.tsx` now renders the Wallet home screen from `docs/ui-reference/home.html` with React Native primitives, NativeWind utility classes, config-driven credential rows, vector-icon placeholders for missing design assets, and a skeleton card placeholder.
- Bottom tabs now match the design shell: Wallet, My QR, Scan, History Log. QR, Scan, and History Log are route-scoped placeholders for Phase 3.3 and later workflow wiring.
- NativeWind runtime setup added: `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `metro.config.js`, and `tailwindcss@3.4.4`.
- `app/_layout.tsx` now dynamically imports native wallet startup services only on non-web platforms so Expo Router static web rendering does not evaluate hardware-signing dependencies.
- Removed unused Expo starter UI/assets: Explore route, HelloWave, ParallaxScrollView, ExternalLink, Collapsible, IconSymbol, and React logo PNGs. App icon, favicon, Android icons, and splash image remain because `app.json` references them.
- Verification after Phase 3.1: `yarn.cmd tsc --noEmit`, `yarn.cmd lint`, and `yarn.cmd expo export --platform web --output-dir .expo/codex-web-export` pass.
