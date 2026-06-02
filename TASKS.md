TASKS.md - Active Implementation Backlog

Controls execution of local AI agent coding sessions. Isolates immediate steps from long-term milestones.
Cross-reference: AGENTS.md (status) | ARCHITECTURE.md (design) | CONTEXT.md (terms) | docs/adr/ (decisions)

---

## PHASE 1: Cryptography & Secure Storage (Week 1-2)

### 1.1 Crypto Service — src/services/crypto/crypto.ts
[x] Generate EC P-256 hardware keypair via @animo-id/expo-secure-environment
[x] Derive did:key from compressed P-256 key (multicodec prefix [0x80, 0x24], base58btc)
[x] Implement signProof(nonce, audience) — PoP JWT with kid/DID header, biometric sign-time gate
[x] Implement getHolderDid(), getPublicKeyJwk(), hasWalletKey(), resetWalletKey()
[ ] Run yarn tsc — verify zero TypeScript errors

### 1.2 Storage Service — src/services/storage/storage.ts
[ ] Generate random 256-bit encryption key at first launch
[ ] Store encryption key in react-native-keychain with biometric access control
[ ] Expose initStorage(): Promise<void> — retrieves key from Keychain, unlocks MMKV
[ ] Expose getCredentialStorage(): MMKV — returns encrypted wallet-credentials instance
[ ] Two MMKV instances: wallet-meta (unencrypted) | wallet-credentials (AES-256 encrypted)

### 1.3 App Startup Wiring — app/_layout.tsx
[ ] Call generateWalletKeyIfNeeded() on first launch
[ ] Call initStorage() before any credential access
[ ] Show error boundary if hardware key or storage init fails (do not silently swallow)

---

## PHASE 2: OID4VCI 1.0 Protocol Integration (Week 3-4)

### 2.1 SDK Generation Setup
[ ] Install orval: yarn add orval --dev
[ ] Configure orval.config.ts → input: walletApi.json (swap for real company spec when available)
[ ] Output target: src/sdk/ with TanStack Query hooks
[ ] Run orval → verify generated hooks compile

### 2.2 Credential Offer Resolution — src/services/vci/exchangeService.ts
[ ] Install @sphereon/oid4vci-client via npx expo install
[ ] Implement resolveOffer(offerUri: string) — parses openid-credential-offer:// URI
[ ] Extract Issuer metadata for dynamic UI branding (name, logo, colors)
[ ] Handle both QR scan and NFC NDEF offer URI inputs (same function, different call site)

### 2.3 Credential Acquisition — claimCredential()
[ ] Exchange Pre-Authorized Code at Token Endpoint → Access Token + c_nonce
[ ] Call signProof(c_nonce, issuerUrl) from crypto service (biometric fires here)
[ ] Submit Credential Request with Access Token + signed PoP → receive VC JWT
[ ] Normalize VC JWT into VerifiableCredentialRecord (id, type, rawVc, claims, issuedAt, expiresAt)
[ ] Store in encrypted MMKV via getCredentialStorage()
[ ] Prompt user for tx_code/PIN if Issuer metadata requires it

### 2.4 Backend Sync — orval SDK hook
[ ] Sync credential metadata to company backend via generated SDK hook
[ ] Invalidate TanStack Query cache for credentials list → trigger UI re-render

---

## PHASE 3: Config-Driven UI (Week 5-6)

### 3.1 HTML to NativeWind Translation
[ ] Receive HTML/CSS design files from design team
[ ] Extract layout structures, flex containers, typography from HTML
[ ] Translate to React Native primitives (View, Text, Pressable)
[ ] Convert CSS to NativeWind Tailwind utility classes
[ ] Implement skeleton loaders for async states

### 3.2 Dynamic Card Engine
[ ] Define CardSchemaConfig JSON format (title, issuerName, primaryColor, logo, displayFields)
[ ] Create configs for 3 initial cards: ThaID, DLT Driving Licence, Bangkok University Transcript
[ ] Build generic CredentialCard component that renders from config — no hardcoded card types
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
[ ] ISO 18013-5 mdoc native module selection (ADR pending) + integration
[ ] Release build validation (iOS TestFlight + Android internal track)

---

## Definition of Done (Per Session)

Before ending a session or handing off:
1. yarn tsc must pass with zero errors
2. Update checkboxes [x] for completed sub-tasks
3. Write blockers/notes below

---

## Active Session Notes & Blockers

Session 2026-06-02:
- crypto.ts written. Pending: yarn tsc green (last fix: .delete to .remove in resetWalletKey)
- ARCHITECTURE.md, CONTEXT.md, docs/adr/0001-0003 all current
- CLAUDE.md refactored — Architecture section moved to ARCHITECTURE.md
- walletApi.json is a reference example only. Real company spec TBD.
- Installed: @animo-id/expo-secure-environment@0.1.5, react-native-nitro-modules@0.35.9, react-native-quick-base64@3.0.0
