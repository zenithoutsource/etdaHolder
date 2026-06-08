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

[ ] Screen capture prevention (temporarily removed for tester builds)
[x] Certificate pinning decision and implementation if required
[x] Jailbreak/root detection
[ ] Issuer signature validation after trust metadata is finalized: missing decision is the trusted issuer registry/trust-list source that maps issuer identifiers to verification material plus accepted credential formats and status rules. Do not hardcode issuer keys or trust issuer-hosted metadata as the sole root of trust.
[x] ISO 18013-5 mdoc native module selection criteria ADR
[ ] Final ISO 18013-5 mdoc native module selection ADR after physical iOS/Android validation
[ ] Release build validation for iOS and Android (Android prebuild smoke-checked 2026-06-07; EAS builds + device walkthrough still required). Manual blocker: user-held EAS credentials, physical iOS device, physical Android device, and a real or test Issuer QR issuance source.
[x] Production bundle/log scan for credential data leaks

### 4.1 Findings from review of 5bd028e (2026-06-08) — Important items block release

Release-blocking scope: Important UI-correctness, security, and robustness items below must be fixed before release. Advisory items remain visible hardening work, but do not block Phase 4 release unless they are touched as part of a blocking fix.

[x] Wallet home `CredentialSummaryCard` (`app/(tabs)/index.tsx`) renders any non-`ThaiNationalID`/non-Transcript record (e.g. `DLTDrivingLicence`, acquirable via QR scan) through the transcript-styled branch — wrong title/labels ("Student ID :", degree/faculty/GPA on a driving licence). Release fix renders summary title/fields/images from `cardSchemas.ts` through `readCredentialSummaryDisplay()`, not another credential-specific branch in Wallet home.
[x] `useStoredCredentials.refresh()` (`src/hooks/useStoredCredentials.ts:35-40`) silently catches `StorageNotInitialized` into an empty list with no error — reproduces the cold-launch bug pattern fixed this session if init ordering ever regresses. Release fix exposes `status: 'storage-not-ready'` plus a visible "Wallet storage is not ready." error; an empty list with `status: 'ready'` means storage is ready and no credentials exist.
[x] Local backend auth hardening for development release confidence, not production Wallet Backend readiness: no rate limiting on `/wallet-api/auth/login|register` (`server/src/testApp.ts`); `JWT_SECRET` default-secret check only enforced when `NODE_ENV === 'production'` and fails open otherwise (`server/src/config.ts:42-48`); `requireAuth` (`server/src/auth.ts:109`) catches DB and token errors together into a bare 401 with no logging, masking infra failures as auth failures. `server/` remains a development-only Local Wallet Backend for XAMPP testing.
[x] Backend cert pinning (`src/sdk/walletApiCertPinning.ts:87`) is opt-in via `EXPO_PUBLIC_WALLET_API_PINNED_CERTS` with no startup assertion blocking release-like builds that ship with empty pins or plain HTTP — hard-block check added alongside `assertDeviceIntegrity`/`assertHardwareSecureEnvironmentSupported`. Development may allow LAN HTTP and empty pins; every non-development native runtime now fails startup when the Wallet Backend base URL is plain HTTP or HTTPS pins are empty.
[ ] Advisory: dedupe claim-reading helpers/alias lists (`stringifyClaim`, `HIDDEN_CLAIM_KEYS`, `readClaimValue`, type→title/image maps) duplicated across `app/(tabs)/index.tsx`, `app/(tabs)/credential/[id].tsx`, `app/(tabs)/scan.tsx`, `src/services/vci/qrIssuanceFlow.ts` instead of being driven from `cardSchemas.ts` per the config-driven UI rule.
[ ] Advisory: add error logging to swallowed catches with no signal — `authService.ts` (`loadSession` JSON.parse, `readCredentialIds` JSON.parse, `logout` best-effort server call), and bare `catch { res.status(500)... }` in `server/src/routes/{auth,credentials,wallets}.ts` and `auth.ts:132` logout — all discard the original error/stack with zero log trail.
[ ] Advisory: local-backend auth oracle cleanup still open only for registration email enumeration — registration returns distinct 409 vs 400 (`server/src/routes/auth.ts:82`). Login now runs dummy bcrypt comparison for unknown users, CORS is restricted to configured development origins, and JWT verification pins `algorithms: ['HS256']`.

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
- Remaining for Phase 4: release build validation (EAS production builds + golden-path walkthrough on physical iOS/Android hardware) — requires user-held EAS credentials, physical iOS and Android devices, and a real or test Issuer QR issuance source not available in this session.
- Bug found in testing: `usePreventScreenCapture()` toggles a window-level flag (Android `FLAG_SECURE` / iOS app-wide), not a per-view one. Bottom-tab screens stay mounted once visited, so Wallet home (always-mounted first tab) kept the flag on globally, leaking onto "My QR" and blocking its capture. Fixed by replacing all four call sites with a new focus-scoped `src/hooks/useScreenCaptureGuard.ts` (`useFocusEffect` + `preventScreenCaptureAsync`/`allowScreenCaptureAsync`), so the flag is only active while a guarded screen is focused; "My QR" is unaffected and capturable again.
- Headless smoke check run: `npx expo prebuild --clean` succeeds for Android (full native project generated under `/android`, gitignored). iOS prebuild is platform-gated by Expo CLI itself ("Run npx expo prebuild again from macOS or Linux to generate the iOS project") — cannot be exercised on Windows. EAS production builds and the physical-device golden-path walkthrough remain the user's manual step.

### Session 2026-06-08

- Bug found in testing: Wallet home showed no stored credentials on cold launch (only appeared after switching tabs and back). Root cause: `app/_layout.tsx` mounted `<Stack>` (and therefore Wallet home / `useStoredCredentials`) immediately, in parallel with async `initStorage()`; the mount-time `refresh()` hit `StorageNotInitialized`, was silently caught, and nothing re-triggered it once storage became ready — only an incidental tab-focus event did. Fixed by gating `<Stack>` mount behind `startupState.status === 'ready'` in `RootLayout`, so no screen exists (and therefore no storage read can happen) until startup completes. See `docs/superpowers/specs/2026-06-08-gate-stack-on-startup-ready-design.md`.
- Definition-of-Done quality gates run against current `dev` (5bd028e): root `yarn tsc --noEmit` pass, `yarn lint` pass, `yarn test` 8 suites / 40 tests pass; `server` `yarn tsc` pass, `yarn test` 2 suites / 6 tests pass. No regressions found; nothing to record as a blocker.
- Multi-perspective review of `5bd028e` (no PR exists; reviewed locally) via `code-reviewer` + `security-reviewer` + `silent-failure-hunter`: 0 Critical findings (parameterized queries, no IDOR, no leaked secrets, software-signing fallback already removed, hardware Keychain policy hardened). 1 Important UI-correctness bug, 5 Important hardening/robustness gaps, and several Advisory items recorded as new Phase 4.1 backlog checkboxes above — see those for the full list with file:line references. Worth calling out: `useStoredCredentials.refresh()` still silently swallows `StorageNotInitialized` into an empty list (same shape as the cold-launch bug just fixed this session — currently masked by the new startup gate, but a latent regression risk if init ordering changes again).
- Grill-with-docs pass resolved Phase 4.1 documentation decisions: `docs/SECURITY_FINDINGS.md` restored as security review history; Phase 4.1 release gate narrowed to Important items; Wallet home release fix should use `cardSchemas.ts`; storage-not-ready must be a visible hook/UI state, not an empty wallet; non-development native runtimes must hard-block empty Wallet Backend pins or plain HTTP; `server/` remains development-only but local auth hardening still blocks release confidence; ADR 0006 added for mdoc native module selection criteria while final module choice stays blocked on physical iOS/Android validation; release validation blockers now explicitly include user-held EAS credentials, physical iOS/Android devices, and a real or test Issuer QR issuance source.
- Phase 4.1 release-blocking fixes completed: storage hook exposes explicit storage-not-ready state; Wallet Backend startup policy hard-blocks non-development native builds with plain HTTP or empty pins; local backend now requires non-default `JWT_SECRET` outside tests, restricts CORS to configured development origins, rate-limits auth routes, pins JWT verification to HS256, distinguishes token failures from session lookup infrastructure failures, and runs dummy bcrypt comparison for unknown login users. Verified root `yarn tsc --noEmit`, root `yarn test --runInBand` (12 suites / 49 tests), root `yarn lint`, server `yarn tsc`, and server `yarn test` (5 suites / 13 tests) all pass.
- ETDA Wallet HTML reference applied to v1 UI scope: Wallet Home, Credential Detail, Scan Holder Confirmation, My QR placeholder, and History Log now follow the new visual baseline without enabling post-v1 Verifier presentation behavior.
- Phase 4.1 UI/storage fixes completed in code: Wallet Home summary and Credential Detail read schema-driven metadata/fields from `cardSchemas.ts`, and `useStoredCredentials.refresh()` now surfaces `Wallet storage is not ready.` instead of silently presenting an empty wallet when storage is not initialized.
- Scan QR flow now follows documented Holder Confirmation timing: resolve offer, show resolved-offer metadata, collect `tx_code` when required, then acquire and save through `claimConfirmedOffer()` only after confirmation.
- Scan QR Holder Confirmation was switched back to the data-preview behavior requested for the UI reference: after scan/`tx_code`, the app acquires an unsaved credential record and shows the actual credential values the Holder will receive; `saveCredentialRecord()` still runs only after the Holder taps Confirm.
- Android local run command now uses `scripts/run-android-device.js` so `yarn android` requires a connected physical Android device, excludes emulator devices via `ro.kernel.qemu`, and avoids Expo CLI's emulator-starting Android resolver.
- Android physical-device detection hardened after a `pixel_6` emulator was still selected: the runner now rejects emulator serials, SDK/generic ADB product/device identities, and known emulator system properties (`ro.boot.qemu`, `goldfish`, `ranchu`, `sdk_gphone`, generic, Genymotion, VBox) before installing or launching the app.
- Temporary tester convenience added: `EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING=true` disables secure-environment sign prompts and credential-storage Keychain prompts only when `__DEV__` is true. Production/release runtimes ignore the flag and keep biometric-gated signing/storage.
- Local backend registration now rejects malformed email addresses before password hashing or database writes, including invalid domain suffixes such as `example@gmail.commmm`; verified server `yarn tsc` and `yarn test`.
- Screen-capture prevention temporarily removed for tester builds: Wallet home, Credential Detail, Scan, and History Log no longer call `useScreenCaptureGuard()`, and the hook file was deleted. Re-enable before release if screenshot blocking remains part of Phase 4.
- Added `docs/User_Journey/transcript/P6-Case1.md` as the focused English-only Holder-initiated Transcript cancellation/suspension journey and future contract note. It preserves the device-scoped Wallet Signing Key model and scopes cleanup to the affected Transcript credential state after Issuer confirmation.
- P6 Case 1 design pass started from `docs/ui-reference/P6Case1`: Transcript detail now exposes design-labeled `Revoke` and `Delete this document` actions, drives a PIN-style security screen and Wallet approval screen, records a local inactive status/event for tester visibility, and shows lifecycle badges/history without deleting the credential record or Wallet Signing Key.
- P6 Case 1 tester revision planned/implemented: `Delete this document` remains visible but disabled; first protected Revoke action sets/confirms a 6-digit Wallet PIN, later actions verify it, and the fingerprint button is a development-only bypass. Approval now uses selected credential/local metadata instead of mock device/date values, and revoked Wallet home rows expand into the design-style unavailable panel with a button that opens Scan.
- Credential Detail now uses a direct React Native translation of `docs/ui-reference/ETDA Wallet.html` `IDCardScreen`: navy Wallet header, white rounded document card, blue document band, photo/name/primary identifier hero row, two-column detail grid, and bottom-right My QR action, while keeping values schema-driven through `readCredentialDetailDisplay()`.
- Fixed Credential Detail artwork sizing regression: only ID portrait artwork fills the hero photo frame; transcript, driving licence, and fallback artwork now render contained so they do not visually cover the card header/hero area.
- Fixed Credential Detail card header band regression: the blue document band now stretches to the full card width, clips its gradient background inside the rounded card, and uses explicit line height so the document title text is not cut off.
- Fixed Transcript detail card header rendering on the Wallet -> Transcript path: replaced the fragile absolute SVG gradient with a native full-width blue band and increased the band/text height so `TRANSCRIPT` does not clip.
- Transcript Credential Detail now uses `assets/images/user_profile.png` for the document hero image instead of `assets/images/transcript.png`, matching the requested document-detail visual.
- Transcript Credential Detail hero image now fills the full photo frame with `cover`, matching the ID portrait treatment.
- PIN security keypad now renders the fingerprint scan action as the same styled keypad cell as number buttons, positioned in the lower-left slot beside `0` and backspace.
- Fixed P6 Revoke reissue state: saving a newly scanned credential now clears any stale local `credential:lifecycle:<id>` marker for the same credential id, replaces older local records of the same credential type when the issuer returns a new credential id, and Wallet home ignores/removes lifecycle markers older than the saved credential `issuedAt`.
- Fixed stale Credential Detail approval state after reissue: when Expo Router reuses the dynamic `/credential/[id]` screen for a newly scanned credential id, local detail state now resets from the prior `approve`/PIN/action-menu phase back to the normal document detail view.
