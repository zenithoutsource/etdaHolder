# Delivery Roadmap

2-month plan. 4 phases. Each phase is 2 weeks. Phases run sequentially — each phase's output is an input gate for the next.

---

## Phase 1 — Cryptography, Native Integration, and Storage (Weeks 1-2)

Goal: Establish the hardware security foundation and encrypted storage layer before any protocol work begins. All subsequent phases depend on this being correct and audited.

### Week 1

- Install and prebuild `@animo-id/expo-secure-environment`:
  - Run `npx expo install @animo-id/expo-secure-environment`.
  - Run `npx expo prebuild --clean` to regenerate iOS and Android native projects.
  - Verify Secure Enclave availability on iOS simulator (software fallback noted) and on physical device (must be hardware-backed).
- Implement `src/services/crypto/signingKey.ts`:
  - Generate EC P-256 keypair under alias `etda_wallet_signing_key` if not already present.
  - Expose `sign(payload: Uint8Array): Promise<Uint8Array>` — biometric auth gate is enforced inside the native module per call.
  - Expose `getPublicKeyJwk(): Promise<JsonWebKey>` — converts raw public key bytes from the native module to JWK format.
  - No software fallback path. Throw loudly on devices without hardware attestation.
- Write unit tests for `signingKey.ts` with mocked native module responses.

### Week 2

- Install `react-native-mmkv` and configure encrypted storage:
  - Encryption key must be fetched from the native hardware keychain (Keychain Services on iOS, Android Keystore via `react-native-keychain`), not hardcoded.
  - Create `src/services/storage/storage.ts` exporting the single MMKV instance initialized with the dynamically loaded encryption key.
- Implement Zustand persisted slices using the MMKV storage adapter:
  - `credentialsSlice`: stores array of `{ id, vc, addedAt }` records.
  - `sessionSlice`: stores wallet session token (bearer token for company SDK calls).
- Write integration tests verifying MMKV persistence survives app restart simulation.
- Confirm `AsyncStorage` is not imported anywhere in `src/` — add lint rule or grep check to CI.

### Phase 1 Exit Gate

- `yarn tsc` passes with zero errors.
- All crypto and storage unit/integration tests pass.
- `AsyncStorage` import does not appear in `src/`.
- Physical device test: keypair generated in hardware, biometric prompt fires on sign.

---

## Phase 2 — OID4VCI 1.0 Client-Side Integration (Weeks 3-4)

Goal: Implement the full on-device OID4VCI 1.0 credential acquisition flow from offer resolution through credential storage.

### Week 3

- Install `@sphereon/oid4vci-client` via `npx expo install` (check Hermes/Expo compatibility — polyfills may be required).
- Implement `src/services/vci/offerResolver.ts`:
  - Parse `openid-credential-offer://...` URIs from QR scan and NFC tag read input.
  - Fetch Issuer metadata from `/.well-known/openid-credential-issuer`.
  - Return a typed offer object.
- Implement `src/services/vci/tokenExchange.ts`:
  - Support pre-authorized code flow (primary path for ETDA issuance).
  - Support authorization code flow (secondary path — may be deferred to Phase 4 if scope requires).
  - Return an access token record.
- Mock all Issuer HTTP calls with MSW in tests.

### Week 4

- Implement `src/services/vci/credentialRequest.ts`:
  - Build the PoP JWT (`proof` field) using `signingKey.sign()` from Phase 1.
  - Construct and submit the credential request to the Issuer's credential endpoint.
  - Validate the returned VC JWT structure before accepting.
- Implement the company SDK import call after successful VC acquisition:
  - Call `POST /wallet-api/wallet/{walletId}/credentials/import` via the Orval-generated client.
  - On success: persist VC to `credentialsSlice` via MMKV-backed Zustand.
  - On failure: surface error to caller — no silent credential loss.
- Write end-to-end integration tests for the full acquisition flow with MSW intercepting both Issuer and company API endpoints.

### Phase 2 Exit Gate

- Full pre-authorized code flow completes against MSW-mocked Issuer.
- VC JWT lands in MMKV-backed Zustand store after successful import.
- MSW test suite for `src/services/vci/**` achieves 80% line coverage.

---

## Phase 3 — Config-Driven UI Mapping and Design Translation (Weeks 5-6)

Goal: Render credential types using display metadata from Issuer configuration. No hardcoded credential layouts.

### Week 5

- Parse `display` arrays from Issuer metadata and credential offer objects.
- Build `src/services/vci/displayMapper.ts`:
  - Map `display` locale entries to the device locale, with fallback to `en`.
  - Extract background color, logo URI, text color, and credential name per credential type.
- Create `src/components/CredentialCard.tsx`:
  - Renders a single credential using display metadata.
  - NativeWind utility classes. No hardcoded colors or logos.
  - Handles missing display metadata gracefully (fallback to type name and neutral palette).

### Week 6

- Implement credential list screen (`src/screens/credentials/index.tsx`):
  - Reads from `credentialsSlice`.
  - Renders `CredentialCard` per credential.
  - Pull-to-refresh fetches updated credentials from company backend (GET endpoint, allowed per Protocol Boundary Matrix).
- Implement credential detail screen (`src/screens/credentials/[id].tsx`):
  - Shows full claim set with labels derived from credential subject properties.
  - Share / present button (wire to presentation flows in a future phase: ISO 18013-5 proximity per ADR 0003, and OID4VP 1.0 online per the Post-v1 section below).
- Implement QR scanner screen (`src/screens/scan.tsx`):
  - Parses `openid-credential-offer://...` from QR code.
  - Triggers the VCI acquisition flow from Phase 2.
  - Shows progress states: resolving offer, exchanging token, requesting credential, importing.
- Snapshot and interaction tests for all new screens.

### Phase 3 Exit Gate

- Credential card renders correctly for at least 2 credential types with distinct display metadata.
- QR scan-to-store flow works end-to-end in a Development Build on device or simulator.
- Screen component tests achieve 80% line coverage.

---

## Phase 4 — Security Hardening, Auditing, and Release Compilation (Weeks 7-8)

Goal: Harden the release build, audit all security boundaries, and compile final delivery artifacts.

### Week 7

- Security audit checklist:
  - Confirm no private key bytes or VC claim data appear in Metro bundle output or Hermes bytecode debug dumps.
  - Confirm `AsyncStorage` is absent from the production dependency graph.
  - Confirm all sign calls require biometric authentication with no bypass path.
  - Confirm MSW is not included in the production bundle (test-only import boundary).
  - Review all `console.log` calls — strip credential data from any remaining log output.
- Perform authorization code flow implementation and test (if deferred from Phase 2).
- Add error boundary screens for each major flow (offer resolution failure, token exchange failure, biometric cancel).

### Week 8

- Set Jest coverage enforcement to 80% line coverage minimum — CI fails below threshold.
- Run `yarn tsc` with `strict: true` — resolve all remaining type errors.
- Compile Expo EAS production builds for iOS and Android.
- Execute manual test scenarios on physical devices:
  - Pre-authorized code flow credential acquisition (ThaID, Driving Licence, Transcript).
  - Biometric prompt fires and cancellation is handled gracefully.
  - Credential survives app kill and restart (MMKV persistence).
  - Company backend import failure surfaces an error screen.
- Produce release notes and tag `v1.0.0-rc.1`.

### Phase 4 Exit Gate

- EAS production builds succeed for both platforms.
- CI enforces 80% line coverage — no exceptions.
- All physical device manual scenarios pass.
- No credential data in log output on production build.
- `v1.0.0-rc.1` tag pushed.

---

## Post-v1 — OID4VP 1.0 Online Presentation (Planned, Not Scheduled)

> Scope-only. This is **not** part of the fixed 8-week / 4-phase plan above. It is recorded so the architecture and glossary stay consistent (see `ARCHITECTURE.md` §2 Presentation Channels, `../CONTEXT.md` "Online Presentation"). No ADR is written and no protocol mechanics are decided until this work is scheduled.

Goal: add an online / cross-device presentation channel so the Holder can present credentials to a remote Verifier (browser redirect or cross-device QR), complementing the ISO 18013-5 proximity channel (ADR 0003). Does not supersede ADR 0003 — different transport.

Open decisions to resolve before this phase can start (each may warrant an ADR):

- **Library:** which OID4VP 1.0 implementation (e.g. a `@sphereon/*` presentation package) vs building on the existing stack. TBD.
- **Query language:** DCQL vs Presentation Exchange (`presentation_definition`). TBD.
- **`client_id` scheme** and Verifier trust model (how the wallet authenticates the Verifier). TBD.
- **Flow shape:** same-device redirect vs cross-device (`request_uri` + QR), and response mode. TBD.

Fixed constraints (already decided, inherited from the existing architecture):

- `vp_token` is signed with the hardware Wallet Signing Key via `src/services/vp/` → `src/services/crypto`, under the same biometric sign-time gate (`SECURITY.md` §3).
- Presentation runs device-to-Verifier directly. No company backend proxy or presentation audit (`SECURITY.md` §4).
- Follows the OID4VP 1.0 spec — no wallet-specific protocol deviations.
