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

### 3.4 P1 PID VC Bootstrap Flow (ThaiNationalID mandatory first credential)

Source: `docs/User_Journey/id_card/P1.md`. After PIN setup the Wallet is "Operational"; it becomes legally "Valid" only after the Holder stores the PID VC (ThaiNationalID). All other credential requests are gated behind PID existence. No real PID Issuer exists yet — uses existing OID4VCI backend with credential type `idcard` mapped to `ThaiNationalID`.

[x] Map credential type `idcard` → `ThaiNationalID` in `canonicalCredentialType()` (`src/services/vci/exchangeService.ts`)
[x] Create `src/services/credentials/credentialGuard.ts` exporting `hasPidCredential(credentials: VerifiableCredentialRecord[]): boolean`
[x] Wallet Home summary card (`app/(tabs)/index.tsx` `summaryCredential`) shows only ThaiNationalID — remove Transcript and `credentials[0]` fallback
[x] Gate "ขอเอกสาร" taps on non-ThaiNationalID rows: when no PID stored, show `Alert.alert` "ต้องมี ThaID ก่อน" with "ขอ ThaID" → Scan action (`app/(tabs)/index.tsx`)
[x] Gate QR scan: after `resolveOffer()` succeeds, block acquisition of non-ThaiNationalID offers when `!hasPidCredential()`, set `phase = { tag: 'error', message: 'กรุณาขอ ThaID ก่อน' }` (`app/(tabs)/scan.tsx`)

#### P1 ID Card scan sub-flow (screens 2.1–2.4, `docs/ui-reference/P1IDCard/`)

[x] **P1-2.2** After idcard QR resolves, show "ยืนยันตัวตนผ่าน ThaID" interstitial screen (ThaID logo, "ยืนยัน" button) before credential acquisition — represents LoA High identity verification redirect to ThaID app; simulate with a proceed button that continues the OID4VCI flow (`app/(tabs)/scan.tsx` new `thaIdVerify` phase or separate screen)
[x] **P1-2.3** After ThaID verification returns, show Holder Confirmation matching `P1-2.3-ThaID_success_page.png`: issuer seal/logo (กรมการปกครอง), document name (บัตรประชาชน), receiving unit, green checkmark ribbon, "ยืนยัน" button — replaces generic preview for ThaiNationalID offers
[x] **P1-3** After tapping ยืนยัน on P1-2.3, show full credential data preview before final save — reference `P1-3-Receive_page.png` / `P1-2.5-idcard_vc.png`: ID CARD header band, holder photo, ชื่อ-นามสกุล (Thai + English romanised), เลขบัตรประจำตัวประชาชน (masked), วันเดือนปีเกิด, ศาสนา, ที่อยู่ตามทะเบียนบ้าน, "ยืนยัน" button that triggers `saveCredentialRecord()` and navigates to Wallet home
[x] **P1-2.4** History Log screen lists issuance/presentation events; each row: issuer logo, issuer name, document type, date/time, status badge, action label — reference `P1-2.4-history_log_page.png` (10 records: ธนาคาร, โรงพยาบาล, 7-Eleven, Central/Driving License)

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

## OID4VP 1.0 Online Presentation

First narrow slice implemented for `docs/User_Journey/id_card/P5.md`: ThaiNationalID age-over-20 Verifier checks through birth-date disclosure.

Resolved decisions:

[x] Request transport: cross-device QR Authorization Request
[x] Query language: Presentation Exchange
[x] Response mode: `direct_post`
[x] Verifier trust model: local `did:web` allowlist with response-origin allowlist
[x] First claim scope: ThaiNationalID birth date disclosure so the Verifier computes age over 20
[x] Entry point: Scan tab
[x] Auth UI: native biometric sign-time gate
[x] Result source: HTTP response body from `direct_post`
[x] History: successful presentations only
[x] Initial Verifier config: development Verifier API at `http://192.100.10.48`

Implemented:

[x] `src/services/vp/` for Authorization Request handling and Presentation Exchange matching
[x] Verifier API `request_uri` JWT + DCQL IDCard compatibility
[x] Verifier API Transcript DCQL `dc+sd-jwt` compatibility
[x] Hardware-signed JWT VP token via `src/services/crypto`
[x] Device-to-Verifier `direct_post` transport
[x] Scan tab Holder consent/result flow for OID4VP QR
[x] Local encrypted history for successful presentations

Remaining:

[ ] Replace development `redirect_uri:` Verifier with registered production `did:web` Verifier entries
[ ] Add broader claim sets only after trust and disclosure semantics are documented
[ ] Add MSW Verifier handler group or integration harness for direct_post tests
[ ] Decide whether to add a full ADR before expanding beyond the P5 age-over-20 slice

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

### Session 2026-06-09

- Scan QR save flow now shows a post-save success screen matching `docs/ui-reference/scan_success.png`, populated from the actual saved `VerifiableCredentialRecord` through schema-driven credential display metadata.
- Scan QR `Information to receive` preview now uses `assets/images/user_profile.png` for Transcript holder artwork.
- Newly received credentials are marked in encrypted credential storage and Wallet Home renders the green `เอกสารใหม่` badge from `docs/ui-reference/after_scan_success_show_new_badge.png` until the Holder opens that document row.
- Wallet Home status badges such as new-document and unavailable lifecycle labels now sit at the top-right of the document button; the request-document pill stays inline as a Scan action button.
- Wallet PIN flow fixed: first successful native Wallet Account login without an existing Wallet PIN routes to PIN setup. Cold start with an authenticated session now returns to PIN setup if the Holder killed the app before completing PIN setup; resume still does not invoke PIN lock. Wallet PIN remains scoped to protected in-app actions.
- Wallet Home document buttons now keep `p-1` on the tappable content and move visible spacing to the outer document card with `m-2`, because the card background lives on the wrapper.
- PIN setup now hides the biometric keypad button while leaving other PIN keypad screens unchanged.
- Wallet Home request-document rows are temporarily disabled; missing-credential rows no longer navigate to Scan while keeping the existing request pill styling.
- Blue Wallet screen headers now use one shared `WalletHeader` component across Wallet Home, My QR, Scan, History, and Credential Detail screens.
- P1 PID VC bootstrap flow tasks added (section 3.4): `idcard` → `ThaiNationalID` type mapping, `hasPidCredential()` guard, Wallet Home summary card scoped to ThaiNationalID only, and scan/request gates blocking non-PID credentials until ThaiNationalID is stored.
- P1 PID VC bootstrap implemented: `idcard` remains mapped to `ThaiNationalID`, credential guard helpers now cover PID existence plus PID offer/request checks, Wallet Home shows only ThaiNationalID in the summary card, request buttons require ThaID before non-PID documents, and Scan blocks non-PID QR acquisition until ThaID exists.
- App-themed dialog system added through `AppDialogProvider`/`useAppDialog`, replacing native alerts for register success, forgot-PIN logout confirmation, and ThaID-first credential gating.
- Fixed ID card QR compatibility: OID4VCI offers using format-suffixed configuration IDs such as `IdCard_dc+sd-jwt` now resolve against canonical issuer metadata keys like `idcard` instead of failing with `CredentialConfigurationNotSupported`.
- Fixed OID4VCI 1.0 credential request shape: credential acquisition now sends the matched issuer metadata `credential_configuration_id` instead of relying on `format` alone or blindly echoing a format-suffixed offer alias, which is required for `IdCard_dc+sd-jwt` offers that resolve to canonical metadata keys such as `idcard`.
- Fixed OID4VCI 1.0 credential identifier handling: if token exchange returns `authorization_details[].credential_identifiers`, the Wallet now sends `credential_identifier` in the Credential Request instead of `credential_configuration_id`.
- Hardened ID card QR resolution for issuer metadata that uses a non-identical configuration key: `IdCard_dc+sd-jwt` offers can now match a compatible `dc+sd-jwt` metadata entry by `vct`, credential definition type, or display name, while still sending the issuer metadata key in the Credential Request.
- Fixed the current ID card issuer shape: `IDCard_dc+sd-jwt` offers now resolve to metadata key `IDCardCredential_dc+sd-jwt` and request that exact issuer key.
- Credential response parsing now accepts direct issuer response bodies and nested `credential_response` wrappers, not only Sphereon `successBody`, and reports response-shape failures separately from unsupported credential formats.
- Credential endpoint failures now surface issuer `errorBody.error` / `error_description` in Scan instead of collapsing every request failure to a generic issuer-declined message.
- Non-standard credential endpoint errors now include HTTP status and serialized `errorBody` when issuer response has no standard OAuth `error` field.
- Credential Request client now builds from the matched issuer metadata configuration ID instead of the original Credential Offer, preventing `IDCard_dc+sd-jwt` from leaking into the request when the issuer metadata key is `IDCardCredential_dc+sd-jwt`.
- Wallet Home ThaiNationalID summary card now matches `docs/ui-reference/idcard.png`: navy rounded ID card, portrait photo on the left, Holder name and ID card number on the right using actual credential claims.
- Added a final PID QR resolver fallback for `IDCard_dc+sd-jwt`: when no key/content match exists but issuer metadata has exactly one compatible credential configuration for the offered format, the Wallet uses that metadata key instead of failing with `CredentialConfigurationNotSupported`.
- Scan camera screen styling updated: the `Scan QR code` title sits in a full-width top translucent band without parent margin, the scan square stays outside translucent panels, the bottom translucent band fills the lower area/cancel placement without parent padding gaps, the scan box shadow/frame was removed, and white corner brackets are more rounded.
- P1-2.2 ID Card scan sub-flow implemented: idcard/ThaiNationalID QR offers now show a simulated ThaID verification interstitial using `assets/images/thaid.png` before tx_code/acquisition continues.
- P1-2.3 ID Card Holder Confirmation implemented: ThaiNationalID preview now uses a dedicated Department of Provincial Administration card with ThaID artwork, green check ribbon, document/receiving-unit labels, and a `ยืนยัน` save action instead of the generic `Information to receive` preview.
- P1-2.4 History Log implemented: issuance/lifecycle events now carry issuer/document/action metadata and render in a unified P1-style History Log list with issuer icon, issuer name, document type, Thai date/time, status badge, and action label.
- Transcript Credential Detail now follows `docs/ui-reference/transcript_document.png` with a transcript-specific pink document layout, `user_profile.png` portrait, Thai field labels, two-column academic details, red expiry text, and existing My QR action.
- Transcript detail data mapping now exposes `issuedAt`/`expiresAt` from the stored credential display object, adds transcript aliases for birth/graduation/expiry fields, and uses credential `expiresAt` as the transcript expiry fallback when no expiry claim is disclosed.
- Transcript detail now pulls holder Thai/English name and birth date from stored ThaiNationalID when the transcript credential omits them; name renders Thai on the first line and English on the second line instead of falling back to `Academic Transcript`.
- ID Card Credential Detail now follows `docs/ui-reference/idcard_document.png` with an ID-card-specific blue card layout, portrait, Thai/English holder name, national ID, birth date, address, religion, issue date, expiry date, and existing My QR action.
- Development Issuer proxy added for physical Android testing when the PC reaches the Issuer through VPN but the phone cannot join office Wi-Fi/VPN: matching Issuer fetches are rewritten through `/dev-issuer-proxy/*` on the local backend while OID4VCI protocol execution remains on-device. Documented USB `adb reverse` setup in `server/README.md` and `docs/API.md`.
- Fixed the physical Android VPN proxy scan timeout: remote `credential_offer_uri` resolution and Pre-Authorized Code token exchange now use proxy-aware fetch before Sphereon handles the inline offer / credential request, avoiding Sphereon's internal `cross-fetch` direct calls to VPN-only Issuer URLs.
- Added `docs/ANDROID_NETWORK_TESTING.md` with physical Android runbooks for USB + PC VPN proxy mode and direct office Wi-Fi mode, including `.env`, `server/.env`, ADB, Expo, and quick-check commands.

### Session 2026-06-11

- Implemented the first OID4VP P5 slice for ThaiNationalID age-over-20 checks: the Scan tab now accepts `openid4vp://` QR Authorization Requests, validates local `did:web` Verifier allowlist entries, supports Presentation Exchange birth-date disclosure, shows native Holder consent, signs a JWT VP token with the hardware Wallet Signing Key, and submits `vp_token` / `presentation_submission` through `direct_post`.
- Added compatibility for the supplied Verifier API at `http://192.100.10.48`: `POST /generate-vp-qr` returns an `openid4vp://` QR with `request_uri`; `GET /openid4vc/request/{id}` returns a JWT request object using DCQL for `IDCardCredential`; `POST /openid4vc/verify/{id}` accepts `vp_token` and `state`.
- Successful Verifier responses are now recorded in encrypted local presentation history and displayed in History Log. `src/config/trustedVerifiers.ts` contains the development `redirect_uri:` Verifier entry and must be replaced for production.
- Attempted to add a Sphereon OID4VP package, but the expected package name was not available from the registry in this environment; the implementation uses a narrow local service boundary under `src/services/vp/` that can be replaced or adapted when the correct library is confirmed.
- Added a development Verifier proxy for USB + PC VPN testing: matching Verifier calls are rewritten through `/dev-verifier-proxy/*` so the phone can scan Verifier QR codes even when only the PC can reach `http://192.100.10.48`.
- Hardened Verifier submission after `Present VP is invalid`: DCQL `vp_token` is now encoded as a credential-query-id response object, Verifier error descriptions surface in Scan, JWT VP tokens include `jti`/`nbf`/`exp`, and the Wallet blocks submission when the stored ThaiNationalID format does not match the Verifier's requested DCQL format. Current known mismatch: the Issuer flow in this repo uses `IDCard_dc+sd-jwt`, while the supplied Verifier requests `jwt_vc_json`; the Verifier should request `format: "dc+sd-jwt"` with `meta.vct_values: ["IDCardCredential"]`.
- Wallet DCQL parsing now supports `meta.vct_values` for SD-JWT VC requests, so it accepts the corrected `dc+sd-jwt` Verifier request against a stored SD-JWT ThaiNationalID.
- Pivoted the first practical Verifier flow to Transcript while IDCard format is pending: the live Verifier now emits `transcript_credential` with `format: "dc+sd-jwt"` and `meta.vct_values: ["http://192.100.10.48/credentials/TranscriptCredential"]`; the Wallet now matches that to stored `BangkokUniversityTranscript` credentials.
- Fixed Transcript Verifier submission shape: DCQL `dc+sd-jwt` / `vc+sd-jwt` requests no longer wrap the credential in a signed JWT VP. They now default to SD-JWT+KB when holder binding is required and submit raw compact SD-JWT only when the Verifier explicitly sets `require_cryptographic_holder_binding: false`; Presentation Exchange requests still use the hardware-signed JWT VP token.
- Tightened DCQL SD-JWT matching: a stored credential must now match both the requested format and the requested `meta.vct_values` before the Wallet submits it. This prevents sending a Transcript issued with a different `vct` (for example Issuer `192.100.10.46`) to a Verifier request that asks for `http://192.100.10.48/credentials/TranscriptCredential`, which the Verifier rejects as `Present VP is invalid`.
- Added actionable Wallet diagnostics for DCQL SD-JWT metadata mismatches: the Scan error now shows the requested `vct_values` and the stored credential's actual `vct`, so Verifier configuration can be corrected without guessing.
- Added OID4VP 1.0 SD-JWT+KB presentation support: the Wallet signs a Key Binding JWT with the hardware Wallet Signing Key, includes `nonce`, `aud`, `iat`, and `sd_hash`, appends it to the presented SD-JWT, and rejects credentials that lack `cnf.jwk` holder binding or are bound to a different Wallet Signing Key.

### Session 2026-06-12

- Fixed local Verifier trust configuration for physical-device testing: `.env` now sets `EXPO_PUBLIC_VERIFIER_API_BASE_URL=http://192.100.10.48` and `EXPO_PUBLIC_VERIFIER_NAME=Verifier API`, so the Scan tab builds a non-empty development Verifier allowlist instead of rejecting ID-card Verifier QR codes as untrusted. Restarted Metro on port 8081 after the env change; focused verifier/presentation tests pass.
- Added temporary development-only SD-JWT KB bypass for the current Verifier API, which omits `require_cryptographic_holder_binding` while test credentials lack `cnf.jwk`: `EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING=true` makes omitted holder-binding requirements behave like `false` in dev only, so the wallet submits raw compact SD-JWT. This is now superseded locally by the software EdDSA test path below; production/release behavior remains SD-JWT+KB by default.
- Added temporary development-only software Ed25519/EdDSA KB-JWT signing through `@noble/curves` for the ETDA Verifier test path. `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING=true` makes OID4VP SD-JWT presentation use `alg: EdDSA` while preserving the existing hardware-backed P-256 `ES256` OID4VCI issuance path. This stores software key material in JS-accessible local metadata storage and is explicitly not release-safe.
- Extended the same development-only software Ed25519 key to OID4VCI PoP JWTs when `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING=true`: `signProof()` now emits `alg: EdDSA`, an Ed25519 `did:key` `kid`, and an OKP public JWK for issuer interoperability testing. Existing credentials issued before this change must be reissued before the Verifier can validate EdDSA holder binding.
- Tightened the development-only software EdDSA OID4VP path so it now rejects SD-JWT credentials whose issuer JWT lacks `cnf.jwk` or is bound to a different Ed25519 key before posting to the Verifier. A remaining `Present VP is invalid` after this point means the credential likely needs to be reissued with the current wallet Ed25519 PoP, or the Issuer is not embedding the PoP public key as credential holder binding.
- Added issuance-time holder-binding validation for SD-JWT credentials when the Wallet sends a PoP JWT with a public JWK/kid: the Wallet now accepts matching `cnf.jwk` or `cnf.kid`, rejects responses that omit both or bind to a different key before the credential is saved, and Scan surfaces the Issuer-side binding problem directly.
- Made the temporary EdDSA testing mode internally consistent for holder identity: when `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING=true`, `getHolderDid()` / `getPublicKeyJwk()` return the software Ed25519 holder identity, and OID4VCI PoP JWTs include `sub` equal to the Ed25519 holder DID so Issuers that read holder subject do not fall back to the old P-256 `did:key:zDnae...`.
- Adjusted SD-JWT+KB signing to preserve an exact matching credential `cnf.kid` in the KB-JWT header. This supports Verifiers that compare `credential.cnf.kid` to `kb_jwt.header.kid` literally, including Issuers that store a bare `did:key:z6Mk...` rather than a `did:key:z6Mk...#z6Mk...` verification method.
- Added a development presentation diagnostic summary to Verifier rejection errors. On `Present VP is invalid`, Scan now reports non-secret request/token metadata including requested vct, credential vct, credential cnf, KB-JWT kid/aud/nonce, and aud/nonce match checks so the failing Verifier validation can be isolated without exposing the full SD-JWT.
- Tightened the software EdDSA KB-JWT JOSE header to mirror the credential confirmation method: when the credential is bound by `cnf.kid`, the KB-JWT header now sends `kid` only and omits embedded `jwk`; when bound by `cnf.jwk`, it sends `jwk` only. The presentation diagnostic now reports `kb_header_jwk` presence.
- Added development-only OID4VP compatibility probes for unresolved Verifier `Present VP is invalid` responses: `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` can try `object_array`, `object_string`, or raw DCQL `vp_token` submission, and `EXPO_PUBLIC_VERIFIER_KB_AUD` can compare the Verifier's `client_id` default against `response_uri`. Diagnostics now also report response shape, state presence, SD-JWT disclosure count, recomputed `sd_hash` match, Ed25519 KB-JWT self-verification, and KB-JWT age without exposing token/disclosure contents.
- Wallet Home now shows a green `ตรวจสอบสำเร็จ` badge on a document after that credential has a successful OID4VP presentation event recorded in encrypted presentation history; tapping the document clears the current badge while preserving history, and a later successful presentation shows it again.
- Face preparation instructions now use the provided local image assets (`light_bulb`, `poker_face`, `eye`, `face_mask`) instead of vector icons in `FacePreparePanel`.
- Presentation approval device display now formats known Android model codes such as `SM-S928B` as marketing names (`Galaxy S24 Ultra`) and shows a full OS label instead of only the raw OS version.
- Credential Detail approval now reuses `PresentationApprovalDeviceCard` and `PresentationPopCard` for the wallet approval and POP evidence sections instead of maintaining duplicate inline UI.
- Credential Detail POP evidence now passes the extracted compact credential signature into `PresentationPopCard`, matching the presentation approval screen behavior.
- Presentation approval POP evidence now shows the matched credential compact-token signature instead of the Verifier request nonce; added a focused regression test for JWT, SD-JWT, and nonce-like inputs.
- Presentation POP copy action now writes the displayed signature to the system clipboard via `expo-clipboard` and clears its copied-state timer on unmount.

### Session 2026-06-15

- Fixed first-login PIN setup bypass after killing and reopening the app: authenticated native startup now checks whether a Wallet PIN exists and routes back to `/pin-setup` when setup was not completed, instead of entering Wallet Home directly.
- Presentation request debugging now logs the resolved OID4VP Verifier request in development as pretty JSON, including expanded `dcql_query.credentials`, client/response URIs, nonce/state, matched credential, disclosures, and the disclosure fallback reason. The requested-items UI remains the user-facing disclosure summary.
- OID4VP requested-item labels now use schema-defined presentation labels for ThaiNationalID DCQL claim paths such as `id_number`, `full_name`, `birthdate`, `expiry_date`, `religion`, and `photo`, instead of showing raw Verifier path names when a stored claim matches.
- Extended OID4VP requested-item presentation labels to BangkokUniversityTranscript and DLTDrivingLicence DCQL claim paths, added Driving Licence DCQL type matching, and changed the P5 age-over-20 approval row to show `อายุ` with a derived age instead of displaying date of birth.
- Fixed revoked/deleted credential presentation eligibility: active local P6 lifecycle statuses are now filtered out before OID4VP Verifier matching, so scanning a Verifier QR for a revoked document no longer reaches the Holder approval/data-to-send screen or posts a stale credential to the Verifier.
- Fixed stale Scan-tab credential state after reissue: saving a newly scanned credential now refreshes `useStoredCredentials()` immediately, so a subsequent Verifier scan in the same Scan screen uses the newly issued credential instead of the pre-reissue/revoked snapshot.
- Tightened the same reissue/debug path at the QR boundary: OID4VP Verifier QR handling now reads the latest credential records directly from encrypted storage at scan time before lifecycle filtering, avoiding a React render-timing race where the camera could match an old credential snapshot immediately after reissue.
- Fixed Android native crash on the simulated face-scan step after presentation approval: `FaceScanPanel` no longer animates `react-native-svg` circle props that Android can receive as the wrong native type; it now renders the scan rings with plain animated React Native views.
