# TASKS.md - Active Implementation Backlog

Controls local AI agent coding sessions. Cross-reference `AGENTS.md`, `docs/ARCHITECTURE.md`, `CONTEXT.md`, and `docs/adr/`.

## Phase 1: Cryptography and Secure Storage

Status: Complete.

[x] Hardware-backed EC P-256 keypair through `@animo-id/expo-secure-environment`
[x] Holder DID derivation from compressed P-256 key
[x] PoP JWT signing with biometric sign-time gate
[x] Encrypted MMKV credential store
[x] Keychain-backed MMKV encryption key
[x] Startup wiring in `app/_layout.tsx`

## Phase 2: OID4VCI 1.0 Protocol Integration

Status: Complete.

[x] Orval SDK generation setup
[x] Generated SDK endpoint filtering
[x] `resolveOffer(offerUri)` through `@sphereon/oid4vci-client`
[x] Issuer metadata extraction for UI branding
[x] Pre-Authorized Code credential acquisition
[x] `tx_code` required when declared by offer
[x] PoP signing through `signProof(c_nonce, issuerUrl)`
[x] JWT VC normalization
[x] SD-JWT VC normalization, including transcript `dc+sd-jwt` / `vc+sd-jwt`
[x] Deterministic credential ID fallback from compact credential hash
[x] `VerifiableCredentialRecord.type` derived from VC/SD-JWT claims
[x] Encrypted local save under `credential:<id>` and `credential:index`
[x] Separate `syncCredentialToBackend(record, { walletId, sessionToken })`
[x] Backend import payload `{ jwt: record.rawVc, associated_did: getHolderDid() }`
[x] HTTP 201-only backend sync success

## Phase 3: Config-Driven UI

Status: In progress.

### 3.1 HTML to NativeWind Translation

[x] Translate `docs/ui-reference/home.html` into Wallet home tab
[x] React Native primitives and NativeWind utility classes
[x] Config-driven credential menu rows
[x] Bottom tab shell: Wallet, My QR, Scan, History Log
[x] Static web export guard for native startup services

### 3.2 Dynamic Card Engine

[x] Define `CardSchemaConfig`
[x] Add ThaID schema
[x] Add DLT Driving Licence schema
[x] Add Bangkok University Transcript schema
[x] Build generic `CredentialCard`
[x] Wire `VerifiableCredentialRecord.type` to `getCardSchema()`
[x] Add credential detail route with configured fields and extra disclosed claims

### 3.3 QR Scanner and NFC

[x] Integrate QR scanner with `expo-camera`
[x] Funnel QR offer URI into `resolveOffer()`
[x] Add Holder Confirmation screen for resolved offers
[x] Save credential only after Holder confirmation
[x] Decide Holder Confirmation semantics: confirm resolved offer before credential acquisition, then acquire and save immediately after successful issuance
[x] Fix remaining corrupted UI labels in scanner confirmation screen
[ ] Integrate NFC NDEF reader for offer URI after device testing is available

## Phase 4: Security Hardening and Release

[x] Screen capture prevention
[x] Certificate pinning decision and implementation if required
[x] Jailbreak/root detection
[ ] Issuer signature validation after trust metadata is finalized
[ ] ISO 18013-5 mdoc native module selection ADR
[ ] Release build validation for iOS and Android (Android prebuild smoke-checked 2026-06-07; EAS builds + device walkthrough still required)
[x] Production bundle/log scan for credential data leaks

## Post-v1: OID4VP 1.0 Online Presentation

Scope-only; not part of the fixed four-phase v1 plan.

Open decisions:

[ ] Choose OID4VP 1.0 library
[ ] Choose query language: DCQL vs Presentation Exchange
[ ] Decide `client_id` scheme and Verifier trust model
[ ] Decide same-device redirect vs cross-device request URI and QR
[ ] Decide response mode

Implementation after decisions:

[ ] `src/services/vp/` for Authorization Request handling and Verifiable Presentation construction
[ ] Sign `vp_token` via `src/services/crypto`
[ ] Device-to-Verifier direct transport
[ ] MSW verifier handler group for tests

## Definition of Done Per Session

1. `yarn tsc --noEmit` passes.
2. `yarn lint` passes or blockers are recorded.
3. Relevant tests pass or blockers are recorded.
4. Completed checkboxes are updated.
5. Session notes below are updated.

## Active Session Notes and Blockers

### Session 2026-06-02

- Phase 1 crypto and storage services completed.
- ADR 0001 through 0003 accepted.
- Phase 2 SDK setup, offer resolution, credential acquisition, and backend sync completed.
- Phase 3.1 Wallet home and tab shell completed.
- NativeWind runtime setup added.
- Static web export guard added for native startup services.

### Session 2026-06-04

- Local Wallet Backend added under `server/` for development auth against local XAMPP MySQL database `etda_wallet`.
- Mobile app remains forbidden from direct MySQL access; it calls generated `/wallet-api/*` SDK functions through the local backend.
- Local backend covers Wallet Account register/login/logout, authenticated wallet listing, and credential import.
- SDK base URL adapter added via `src/sdk/installWalletApiFetch.ts`.
- Root `.env` should set `EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000` for physical device testing.
- Transcript QR flow uses OID4VCI `dc+sd-jwt` and maps to `BangkokUniversityTranscript`.
- Credential response extraction accepts compact credentials from top-level `credential`, `credentials[].credential`, or direct string `credentials[]`.
- Wallet home displays stored Transcript as a summary card when no ID Card is present.
- Transcript document row opens `/credential/[id]`.
- QR scan acquires an unsaved credential record, then shows a Holder Confirmation screen with the actual credential data the Holder will receive before local save.
- Holder Confirmation preview should show decoded credential values from the acquired record, not issuer/credential metadata rows.
- Scanner confirmed flow should call `saveCredentialRecord()` only after confirmation; cancellation discards the unsaved acquired record.
- When a resolved offer requires `tx_code`, prompt for it after Holder Confirmation and before credential acquisition.
- Unknown credential configurations remain claimable through a generic Digital Document/credential fallback instead of being blocked.
- NFC issuance remains documentation-only until device testing is available; do not add disabled or placeholder NFC controls to app UI.
- After successful QR acquisition and local save, navigate to the saved credential detail screen when a record id is available.
- QR acquisition does not auto-sync to the Wallet Backend in Phase 3.3; backend sync stays an explicit authenticated flow.
- Scanner confirmation app-owned fallback copy should use English labels; issuer-provided credential names and configured claim labels may remain localized.
- Scanner now resolves QR offers, acquires an unsaved credential record, shows actual credential claim values, saves only after `Confirm`, and routes to credential detail after local save.
- Security review resolved startup hardware environment assertion, removed software signing fallback, hardened Keychain storage policy, and mapped startup errors to user-facing messages.
- Current blocker: NFC NDEF issuance remains deferred until a test device is available.

### Session 2026-06-07

- Phase 4 sequenced: 5 executable items (screen capture, root detection, cert pinning, bundle/log scan, release validation) ordered as a dependency chain; mdoc ADR and issuer signature validation remain parked on their stated external blockers (test device, finalized trust metadata).
- Screen capture prevention added via `expo-screen-capture` `usePreventScreenCapture()` on Wallet home, credential detail, scanner Holder Confirmation, and History Log; "My QR" intentionally excluded as a share surface.
- Jailbreak/root detection added via `jail-monkey`, wired into `app/_layout.tsx` startup alongside the existing hardware secure environment assertion (`src/services/security/deviceIntegrityPolicy.ts`); response is a hard block at startup with no bypass — see `docs/adr/0004-root-jailbreak-detection-response.md`.
- Backend certificate pinning added via `react-native-ssl-pinning`, scoped to the backend SDK host only (not Issuer hosts) inside `src/sdk/installWalletApiFetch.ts` / `src/sdk/walletApiCertPinning.ts`, gated on HTTPS + hostname match + `EXPO_PUBLIC_WALLET_API_PINNED_CERTS` config — see `docs/adr/0005-backend-only-certificate-pinning.md`.
- Production bundle/log leak scan script added at `scripts/scan-bundle-leaks.ts` (run via `yarn scan:bundle-leaks <path>`); manual pre-release tool, not wired into CI; verified against synthetic positive and clean controls.
- Remaining for Phase 4: release build validation (EAS production builds + golden-path walkthrough on physical iOS/Android hardware) — requires physical devices and EAS credentials not available in this session.
- Bug found in testing: `usePreventScreenCapture()` toggles a window-level flag (Android `FLAG_SECURE` / iOS app-wide), not a per-view one. Bottom-tab screens stay mounted once visited, so Wallet home (always-mounted first tab) kept the flag on globally, leaking onto "My QR" and blocking its capture. Fixed by replacing all four call sites with a new focus-scoped `src/hooks/useScreenCaptureGuard.ts` (`useFocusEffect` + `preventScreenCaptureAsync`/`allowScreenCaptureAsync`), so the flag is only active while a guarded screen is focused; "My QR" is unaffected and capturable again.
- Headless smoke check run: `npx expo prebuild --clean` succeeds for Android (full native project generated under `/android`, gitignored). iOS prebuild is platform-gated by Expo CLI itself ("Run npx expo prebuild again from macOS or Linux to generate the iOS project") — cannot be exercised on Windows. EAS production builds and the physical-device golden-path walkthrough remain the user's manual step.

### Session 2026-06-08

- Bug found in testing: Wallet home showed no stored credentials on cold launch (only appeared after switching tabs and back). Root cause: `app/_layout.tsx` mounted `<Stack>` (and therefore Wallet home / `useStoredCredentials`) immediately, in parallel with async `initStorage()`; the mount-time `refresh()` hit `StorageNotInitialized`, was silently caught, and nothing re-triggered it once storage became ready — only an incidental tab-focus event did. Fixed by gating `<Stack>` mount behind `startupState.status === 'ready'` in `RootLayout`, so no screen exists (and therefore no storage read can happen) until startup completes. See `docs/superpowers/specs/2026-06-08-gate-stack-on-startup-ready-design.md`.
