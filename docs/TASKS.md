# TASKS.md - Active Implementation Backlog

Controls local AI agent coding sessions. Cross-reference `AGENTS.md`, `docs/ARCHITECTURE.md`, `CONTEXT.md`, and `docs/adr/`.

### Session 2026-07-08

- **Developer onboarding** — `yarn setup`, slim `.env.example`, optional `.env.development.local.example`, `docs/GETTING_STARTED.md`, default wallet API port 4000. Spec: `docs/superpowers/specs/2026-07-08-developer-onboarding-design.md`; plan: `docs/superpowers/plans/2026-07-08-developer-onboarding.md`.

### Session 2026-07-06

- **Wallet-initiated VP QR (dev relay)** — holder shows QR from credential detail; relay at `/dev/vp-session` + `/dev/vp-verify` with full SD-JWT-KB verification (§2.1). Spec: `docs/superpowers/specs/2026-06-29-vp-qr-wallet-initiated-design.md`; plan: `docs/superpowers/plans/2026-07-06-wallet-initiated-vp-qr.md`. Server: `vpSessionStore`, `sdJwtVerifier`, `vpSession` routes. Mobile: `walletInitiatedPresentation`, `VpQrModal`, credential detail button. Configure `VP_ISSUER_PUBLIC_KEY_JWK` + `VP_RELAY_BASE_URL` on server; run `yarn install` for `react-native-qrcode-svg` if package link failed (EPERM). Manual LAN golden-path validation pending.
- **History Log v1** — unified append-only `walletEventLog` in encrypted MMKV (`wallet:history:*`): events `credential-received`, `presentation-success`, `presentation-declined`, `credential-revoked`, `credential-deleted` with `initiatedBy` for system expiry deletes. Spec: `docs/superpowers/specs/2026-07-06-history-log-design.md`; plan: `docs/superpowers/plans/2026-07-06-history-log.md`.
- One-time backfill at storage init (`ensureWalletHistoryBackfill()` in `app/_layout.tsx`) migrates legacy `presentation:history:*` and seeds issuance/lifecycle rows; `presentation:badge-cleared:{credentialId}` keys preserved for Wallet Home badges.
- Recording choke points: `saveCredentialRecord()`, `recordSuccessfulPresentation()` / Scan decline, `recordCredentialLifecycleAction()` (expiry cleanup passes `'system'`).
- Thai list + detail UI: `readWalletHistoryRows()` / `projectWalletHistoryRow()`, tap-to-detail at `app/(tabs)/history-event/[id].tsx`, removed non-functional "ลบรายการ" button.
- **History Log v2** — suspend-access button + `presentation-access-suspended`; `presentation-failed`; NFC/renewal/backend-sync events; filter chips; local hide row; retention via `EXPO_PUBLIC_WALLET_HISTORY_RETENTION_DAYS`.

### Session 2026-07-03

- Removed the PIN-lock flash on app resume by suppressing `/pin-lock` redirects while the root AppState handler checks whether the existing wallet PIN session is still inside the grace window.
- Fixed Transcript QR issuance gating after P3 cleanup state: `cleanup-pending` ThaiNationalID now counts as usable PID for non-PID credential offers, matching the current active detail-state treatment while still blocking expired PID credentials.
- Fixed P3 renewal claim cancellation retry loop: when local renewal claim/signing fails after an `offer-ready` status, the old credential renewal state is reset from `renewal-processing` to `renewal-required`, stopping the 4-second detail-screen poll from silently reopening biometric without a fresh user tap.
- Removed the `cleanup-pending` inactive detail panel/message branch, and moved `Present via NFC` into the credential detail action row beside `My QR` using the same compact button style while keeping NFC visibility gated by proximity support.

### Session 2026-07-02

- Rate-limited `POST /wallet-api/auth/pin-reset/request` with existing in-memory IP and normalized-email limiters before DB lookup and SMTP send; added a route regression proving the fourth valid request for the same email returns `429 { message: 'Too Many Requests' }` and does not send another OTP.

### Session 2026-07-01

- Fixed Android Keychain biometric prompt cancellation during credential storage startup: `react-native-keychain` can surface Cancel as `E_CRYPTO_FAILED` / `CryptoFailedException` with `code: 13`, and storage now maps that native diagnostic to retryable `StorageUnlockCancelled` instead of `StorageInitializationFailed`.
- Added focused storage regression coverage proving cancellation does not poison the next `initStorage()` attempt.
- Fixed PIN-lock biometric cancellation logging: pressing Cancel on the unlock prompt now records normal `biometric-cancelled` / `pin-lock-biometric-cancelled` steps instead of emitting `[wallet:wallet-unlock] biometric-failed` and `pin-lock-biometric-failed` error logs.
- Added focused auth-service and PIN-lock screen regressions for biometric cancellation while preserving error logging for real native biometric failures.
- Implemented storage PIN fallback for startup biometric Cancel: the Wallet provisions a PBKDF2-SHA256/AES-256-GCM wrapped copy of the MMKV encryption key in meta storage after PIN setup/login or a successful normal PIN unlock, then `RootLayout` can show a PIN surface and call `initStorageWithPin()` instead of failing startup after `StorageUnlockCancelled`.
- Changed native cold start to render loading through native module/device-policy checks, then show the storage PIN unlock surface once the Keychain biometric unlock is ready to be requested; the PIN/fingerprint keypad remains guarded until the startup unlock attempt finishes to avoid concurrent storage unlock races.
- Fixed the startup PIN biometric retry blink by keeping the PIN surface mounted when retrying biometric unlock from the lower-left keypad button instead of bouncing through the loading screen.
- Enabled PIN digit entry while the biometric storage prompt is still pending, including when PIN fallback availability is false/unknown, and guarded storage/startup races so a later biometric cancellation cannot clear or overwrite a successful PIN unlock.
- Mapped startup PIN unlock attempts before fallback provisioning to a normal biometric-required message instead of logging `[wallet:startup] storage-pin-unlock-failed`.
- Documented the storage-only PIN fallback security tradeoff in `docs/SECURITY.md`; signing-key release remains Keychain biometric/device gated with no JavaScript PIN fallback.
- Extracted the duplicated PIN unlock UI into `src/components/PinUnlockPrompt.tsx` and reused it from both `app/pin-lock.tsx` and `src/components/StartupStoragePinUnlock.tsx`, keeping route-level wallet PIN verification separate from startup storage PIN unlock.
- Consolidated reusable UI surfaces across PIN/auth, Wallet Home summary cards, presentation disclosure/result panels, and Scan QR capture: added `PinEntrySurface`, `StatusBadge`, `WalletCredentialSummaryCard`, `PresentationDisclosureList`, `PresentationSuccessPanel`, `PresentationStepScaffold`, and `ScanCaptureSurface`; migrated the current callers while preserving each flow's security and protocol logic.

## Phase 1: Cryptography and Secure Storage

Status: Complete.

[x] Hardware-backed EC P-256 keypair through `@animo-id/expo-secure-environment`
[x] Holder DID derivation from compressed P-256 key
[x] PoP JWT signing with biometric sign-time gate
[x] Encrypted MMKV credential store
[x] Keychain-backed MMKV encryption key
[x] Startup wiring in `app/_layout.tsx`

## Phase 2: OID4VCI 1.0 Protocol Integration

Status: Complete (core flow). Spec compliance gaps tracked below.

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
[x] Token endpoint discovery via `authorization_servers` metadata (OID4VCI §11)
[x] `c_nonce` refresh retry on `invalid_proof` (OID4VCI §8.3.3)
[x] Drop `user_pin` dual-send in token request after ETDA Issuer confirms `tx_code`-only acceptance (`exchangeService.ts:760`). OID4VCI 1.0 final token requests now send `tx_code` only.
[x] Deferred Credential Issuance (`transaction_id`, OID4VCI §8.4) — `DeferredIssuancePending` typed error, `readDeferredTransactionId()`, `pollDeferredCredential()` — landed `feat/transaction-id` PR #7

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
[x] Integrate NFC NDEF reader for offer URI after device testing is available

### 3.5 P3 Wallet Key Expiry and Credential Renewal

Source: `docs/User_Journey/id_card/P3.md`, `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md` (canonical; merged async + UX specs 2026-06-26).

[x] Wallet key TTL policy (`src/config/walletKeyPolicy.ts`) and `rotateWalletKey()` with per-credential `renewal-required` marking
[x] Holder-binding parse (`credentialHolderBinding.ts`) and renewal state machine (`credentialKeyRenewal.ts`, `credentialRenewalService.ts`)
[x] Async renewal flow: `submitRenewalRequest()` (one-shot after HTTP 201) + `refreshAndCompleteRenewals()` (poll on focus, auto-claim on `offer-ready`)
[x] Dev renewal endpoints (`server/src/routes/devWallet.ts`: `POST /wallet/renewal-request` → `{ accepted: true }`, `GET /wallet/renewal-status` → `requested` → `offer-ready`)
[x] Wallet home expiry modal (`WalletKeyExpiredModal`) and renewal badges on document rows (`app/(tabs)/index.tsx`)
[x] Credential detail inactive/active overlay (`ribbon_badge.png`), renewal CTA (renewal-required only), P3-6 cleanup dialog (`app/(tabs)/credential/[id].tsx`)
[x] Scan-tab renewal deep link via `?renew=<credentialId>` submits only, then routes to old credential detail (`app/(tabs)/scan.tsx`)
[ ] Physical-device validation: rotate key → submit renewal → wait/poll → green Active on new VC → P3-6 delete old VC on hardware

### 3.6 P6 Case 2: Issuer-Initiated Suspension + Unified Holder Actions

Source: `docs/User_Journey/id_card/P6.md`, `docs/superpowers/specs/2026-06-25-p6-case2-issuer-suspension-design.md`.

[x] Issuer suspension storage (`credential:suspension:<id>` MMKV, separate from lifecycle) — `src/services/credentials/issuerSuspension.ts`
[x] `readIssuerSuspension()`, `acknowledgeIssuerSuspension()`, `readIssuerSuspensionStatuses()` — CRUD + ack + batch read
[x] `resolveCredentialRevokeBehavior()` — routes Revoke to `issuer-acknowledgment` or `holder-revoke` based on suspension ack state
[x] `filterPresentableCredentials` excludes both lifecycle-revoked and issuer-suspended credentials
[x] Wallet home suspension poll on focus (`useFocusEffect` calls dev `/issuer/suspension-status`)
[x] Dev endpoints: `POST /dev/issuer/suspend`, `GET /dev/wallet/suspension-status` — `server/src/routes/devWallet.ts`
[x] Credential detail ⋮ menu visible for ALL credential types (not transcript-only) — `CredentialActionMenu`
[x] Revoke routing: suspension pending → `issuerAck` phase overlay; no suspension → existing holder-revoke flow
[x] `IssuerSuspensionAckOverlay` — รับทราบการระงับ button acknowledges suspension and resets phase
[x] Delete action enabled in ⋮ menu for all credential types
[x] Badge precedence: P6 lifecycle > P6 suspension > P3 renewal > verified/new — `credentialInactiveState.ts`
[x] Approve phase hides My QR button (`onOpenQr` optional on `CredentialDocumentDetailCard`)
[x] `PresentationApprovalDeviceCard` — date/time values blue `#071f5f`, ลงทะเบียนแล้ว blue
[ ] Physical-device validation: issuer suspend → holder sees suspended badge → Revoke routes to ack → acknowledged → holder-revoke flow

### 3.7 OS Push Notifications

Source: `docs/superpowers/specs/2026-06-29-push-notifications-design.md`.

[x] Mobile push notification init service (`src/services/notifications/pushNotificationService.ts`) requests OS permission, fetches Expo push token, registers it through the Wallet API boundary, and installs notification-tap routing
[x] Notification tap router (`src/services/notifications/notificationRouter.ts`) deep-links push payloads to `/(tabs)/credential/[id]`
[x] Root startup wiring calls `initPushNotifications(getHolderDid())` after wallet key + storage + session startup in `app/_layout.tsx`
[x] SDK-bound push token registration helper added without hand-editing generated `src/sdk/walletApi.ts` (`src/sdk/pushTokenApi.ts`)
[x] Dev backend push token endpoint (`POST /wallet-api/wallet/push-token`) stores Expo tokens in-memory by Holder DID
[x] Dev webhook route (`POST /wallet-api/dev/webhook/credential-event`) maps the 5 credential lifecycle events to Thai notification copy and forwards pushes through Expo Push Service
[x] Expo push sender (`server/src/services/expoPushClient.ts`) posts to `https://exp.host/--/api/v2/push/send` and logs Expo ticket errors without retry
[ ] Physical-device validation: grant OS permission on Android/iOS, confirm token registration on startup, trigger dev webhook event, receive push, tap push, and land on the credential detail screen

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
[ ] Signed Request Object (JAR) signature verification — currently decoded but not verified (`presentationService.ts:344-351`). Must close before onboarding additional Verifiers. Do together with `did:web` migration since both touch `findTrustedVerifier`/`readAuthorizationRequest`.
[ ] `client_id_scheme` enforcement — `findTrustedVerifier()` does literal-prefix match only, does not branch on scheme (`did`, `x509_san_dns`, `verifier_attestation`, `redirect_uri`). Do together with `did:web` migration.
[ ] `presentation_definition_uri` fetch support — currently throws `PresentationRequestUnsupported` (`presentationService.ts:393`). Implement if a Verifier requires it.
[ ] DCQL `credential_sets` grouping — `readOptionalDcqlQuery()` reads `credentials` only, ignores `credential_sets` (DCQL §6.1). Needed for "present one of credential A or B" requests.
[ ] Add broader claim sets only after trust and disclosure semantics are documented
[ ] Add MSW Verifier handler group or integration harness for direct_post tests
[ ] Decide whether to add a full ADR before expanding beyond the P5 age-over-20 slice

## User Journey Gap Backlog (2026-07-06 audit vs docs/User_Journey)

Gap analysis of P0–P6 journey diagrams against implemented flows. Wallet-side buildable items first; ecosystem-blocked items recorded as external blockers.

### Buildable now (wallet-side)

[x] P6 Case 1 Issuer round-trip for holder revoke (v1 dev): `POST /wallet-api/dev/issuer/holder-revoke` + `holderRevokeService`; credential detail awaits Issuer `201` before `recordCredentialLifecycleAction('Revoke')`. Keeps credential record for history; no per-credential key destruction (ADR 0009). v1: no PoP JWT — Wallet PIN approve unchanged.
[x] P6 Case 3 Single-Use credential self-cleanup (v1): `CredentialLifecycleAction` `'Used'` via `recordCredentialLifecycleAction`, parser whitelist, `credential-used` history event, inactive badge, dev `POST /wallet-api/dev/wallet/mark-used`. Presentation blocked through existing lifecycle filter. No per-credential key destruction (ADR 0009).
[x] OID4VP same-device link intake: `openid4vp` scheme in `app.json`, `readPendingPresentationRoute` + `vpGeneration` in `deeplinkStore`, Scan dismiss/remount parity, tests in `deeplinkStore.test.ts` and `ScanScreenDeeplink.test.tsx`. Manual: `adb shell am start -a android.intent.action.VIEW -d "openid4vp://authorize?..."` after `npx expo prebuild --platform android`.
[x] ADR: single wallet-level Ed25519 key vs journey's per-credential `did:key` (P2 step 12) — accepted for v1 in `docs/adr/0009-wallet-level-holder-signing-key.md`: one Keychain Ed25519 seed; P3 rotation marks all credentials; P6 per-document key destruction deferred (lifecycle markers gate presentation instead).

### Blocked on ETDA ecosystem services (external)

[ ] Trust Registry integration: wallet-side Issuer trust check on credential receive (P2 step 21) and Verifier trust check before presenting (P4 steps 6–7). Blocked: no Trust Registry service/API exists. Related to the Phase 4 issuer-signature-validation item (trusted issuer registry decision).
[ ] DID Resolver integration: resolve Verifier public key (P4 steps 4–5) and Issuer public key for wallet-side verification. Partially overlaps the open JAR signature-verification item above; production resolution mechanism blocked on ecosystem DID method decision.
[ ] VC Status Registry checking: wallet-side credential status refresh (suspended/revoked/used) from a central registry instead of dev polling endpoints. Blocked: no registry exists; current P6 Case 2 dev polling is the stand-in.
[ ] P2 identity verification via real PID VC presentation to Issuer (journey steps 5–10): wallet presents stored PID VC, Issuer verifies against Trust Registry + VC Status Registry before sending the offer. Currently simulated by the ThaID interstitial. Blocked: requires Issuer-side support; document as accepted deviation if the ETDA Issuer never requests PID presentation.

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
- Implemented the two non-blocked OID4VCI gaps from `docs/SPEC_COMPLIANCE_OID4VC.md`'s suggested order: (1) `requestPreAuthorizedAccessToken()` now discovers the AS `token_endpoint` via `authorization_servers` metadata (`.well-known/oauth-authorization-server` / `.well-known/openid-configuration`, routed through `resolveDevIssuerProxyUrl`) before falling back to `issuerMetadata.token_endpoint` then the guessed `${issuer}/token`; (2) `acquireCredentialRecord()` now retries the Credential Request exactly once with a freshly signed proof when the Issuer returns `invalid_proof` with a refreshed `c_nonce` (new exported `InvalidProofError`). Both changes are additive fallbacks with new tests in `exchangeService.test.ts`; the dev Issuer's existing `/token`-fallback flow is unchanged. Remaining `docs/SPEC_COMPLIANCE_OID4VC.md` items (signed Request Object/`client_id_scheme`, `presentation_definition_uri`/`credential_sets`, deferred issuance) and the EdDSA migration (`docs/EDDSA_MIGRATION.md`) remain open, blocked on external trust/device/ADR decisions.
- Added ADR 0007 and the Android-first native Ed25519 signing slice: new local Expo module `modules/etda-wallet-eddsa` wraps AndroidKeyStore Ed25519 generation/signing, normalizes public keys to raw 32-byte Ed25519 bytes, returns raw 64-byte signatures, checks `KeyInfo.securityLevel` for TEE/StrongBox after generation, and gates signing with Android `BiometricPrompt`. This native-only direction was later superseded by ADR 0008 after target S24 Ultra diagnostics showed AndroidKeyStore generated EC keys for Ed25519 requests.
- Tightened the Android Ed25519 native module support probe after first fresh-start testing: `supportsSecureEnvironment()` now requires Android hardware keystore feature version 200+ for Curve25519/Ed25519 and no longer treats a generic EC AndroidKeyStore generator as Ed25519 support. The connected Galaxy device reports Android SDK 36 and `pm has-feature android.hardware.hardware_keystore 200=true`. Fixed a follow-up AndroidKeyStore interoperability issue where generated Ed25519 keys may report their algorithm as OID `1.3.101.112`; hardware-backed `KeyInfo` lookup now requests the AndroidKeyStore `Ed25519` `KeyFactory` explicitly.

### Session 2026-06-16

- Added a development-only redacting Wallet operation logger (`src/services/debug/walletLogger.ts`) and wired it across startup, native Ed25519 crypto, encrypted storage, auth/session SDK calls, fetch transport, OID4VCI issuance, Scan QR classification, credential save, OID4VP request resolution, VP token creation, Verifier submission, presentation history, and all surfaced error paths. Logs use `[wallet:<scope>]` tags and metadata such as host/path/status/format/byte counts, while redacting tokens, VC/VP/JWT payloads, proofs, claims, PII, secrets, and key material. `.env.example` now documents `EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS`; unset or `true` enables logs in `__DEV__`, `false` mutes them, and production builds stay disabled.

### Session 2026-06-17

- Hardened development Wallet API URL resolution against stale physical-device loopback config: when a development bundle sees `EXPO_PUBLIC_WALLET_API_BASE_URL` as `localhost`, `127.0.0.1`, or `0.0.0.0`, `src/sdk/installWalletApiFetch.ts` now rewrites only the hostname to the Metro dev-server host while preserving the backend port. This prevents physical Android devices from calling their own loopback address for `/wallet-api/*` after old dev-client/Metro env state leaks through. Explicit LAN URLs and non-development builds remain unchanged.
- Replaced the production startup/signing dependency on AndroidKeyStore Ed25519 with Keychain-protected software Ed25519 after target S24 Ultra diagnostics showed AndroidKeyStore generated EC keys for Ed25519 requests. `src/services/crypto/crypto.ts` now stores a 32-byte Ed25519 seed in `react-native-keychain`, derives the Ed25519 `did:key` Holder DID, and signs OID4VCI PoP / OID4VP JWT VP / SD-JWT KB-JWT with `@noble/curves` `alg: EdDSA`; startup no longer hard-blocks on `nativeEddsaSigner` availability. ADR 0008 records the accepted security tradeoff and ADR 0007 is superseded.
- Aligned the roadmap, EdDSA migration note, and OID4VC spec compliance review with ADR 0008 so they no longer describe native AndroidKeyStore Ed25519 target-device validation as the active blocker. The remaining validation is credential reissue under the new Ed25519 Holder DID, OID4VCI/OID4VP retry, EAS production builds, and physical-device golden-path walkthrough.
- Added a development-only native AndroidKeyStore Ed25519 diagnostic matrix and startup log. On the connected Galaxy S24 Ultra (`SM-S928B`, Android SDK 36), Android reports hardware keystore, Curve25519 hardware keystore, and StrongBox availability, but every tested Ed25519 generation recipe returns an EC-shaped public key (`publicKeyLooksEd25519: false`) and fails Ed25519 sign/verify, so `supported: false`. This includes the common Kotlin recipe using `KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")`, `PURPOSE_SIGN or PURPOSE_VERIFY`, and `setDigests(KeyProperties.DIGEST_NONE)`. This confirms the production path must stay on the Keychain-protected software Ed25519 signer unless another physical device proves real hardware-backed Ed25519 with public-key shape, sign/verify, and `KeyInfo` security level all passing.
- Enforced EdDSA-only issuer credential headers before local storage: `acquireCredentialRecord()` now rejects compact JWT VC and SD-JWT issuer JWT responses unless the protected JOSE header has `alg: EdDSA`, raising `CredentialSignatureAlgUnsupported` for `ES256`, `none`, or missing `alg`. Existing credentials issued before this enforcement may still contain older algorithms and must be deleted/reissued.
- Documented every `[wallet:native-eddsa] diagnostics` field in `docs/NATIVE_EDDSA_DIAGNOSTICS.md`, including top-level device capability flags, per-recipe AndroidKeyStore fields, compact Logcat aliases, and pass/fail interpretation.
- Replaced the custom presentation face-scan camera screen with an OS biometric gate: `FaceScanPanel` and its ML Kit face-detection type shim were removed, the Scan tab now opens `react-native-biometrics` from the existing presentation preparation step, and raw-credential presentation token creation no longer triggers a second biometric prompt. Android still cannot be forced to face-only through `react-native-biometrics`; the app requests biometric-only auth with no device credential fallback.
- Hardened the ETDA OID4VP presentation approval flow without changing screen order: the first face-scan step no longer auto-completes on timeout or biometric errors, signed VP/SD-JWT+KB modes still use the Keychain Ed25519 sign-time gate, and `raw-credential` presentation mode now requires an explicit OS biometric/device approval before `direct_post` submission.

### Session 2026-06-18

- Added an Android-only weak biometric approval path for the OID4VP presentation preparation step. The existing `EtdaWalletEddsa` Expo module now exposes `authenticateWeakBiometric()`, which requests `BiometricManager.Authenticators.BIOMETRIC_WEAK` so supported Android devices may show Class 2 face unlock; the Wallet falls back to `react-native-biometrics` when the native method is unavailable. This is only a pre-submit UX gate: EdDSA signing still uses the production Keychain-protected signer and can still trigger a separate OS authentication prompt.
- Added path-specific OID4VP biometric diagnostics so development logs now distinguish Android native weak-biometric approval from the `react-native-biometrics` fallback and record the fallback sensor type without exposing credential data. Focused `presentationApproval` tests cover both prompt paths.

### Session 2026-06-19

- Deleted unused development reference files `issuerApi.json` (IssuerAPI OpenAPI spec) and `oidvci.json` (OID4VCI issuer metadata dump). `walletApi.json` retained as Orval SDK generation input (`orval.config.ts`).
- Updated `docs/TASKS.md`: cross-referenced spec compliance gaps from `docs/SPEC_COMPLIANCE_OID4VC.md` into Phase 2 and OID4VP tracked items (`user_pin` dual-send, deferred issuance, JAR signature verification, `client_id_scheme`, `presentation_definition_uri`, DCQL `credential_sets`). Verified all existing `[ ]` items still open against current codebase.
- Completed the Phase 2 OID4VCI `user_pin` cleanup: Pre-Authorized Code token requests now send only `tx_code` when a transaction code is supplied. Added a focused regression assertion in `exchangeService.test.ts` that `user_pin` is absent from the token request body.
- Implemented same-device OID4VCI deeplink intake from `docs/PLAN_SAME_DEVICE_DEEPLINK.md`: `app.json` now registers `openid-credential-offer`, root layout stores supported incoming URIs and navigates to Scan when startup/auth routing permits, and the Scan tab consumes pending/direct deeplinks through the existing QR `handleBarcode()` path with duplicate suppression. Added focused `src/store/deeplinkStore.test.ts` coverage for supported URI detection and one-shot consumption. Android `yarn expo prebuild --clean --platform android` succeeded and regenerated `AndroidManifest.xml` with the new scheme; iOS prebuild remains unavailable in this Windows session.
- Reworked same-device OID4VCI deeplinks to avoid the camera scanner surface: credential-offer deeplinks now resume after login/PIN setup into a dedicated non-camera `/credential-offer` route, which consumes the pending offer once and runs the existing OID4VCI resolve/PID/tx_code/acquire/preview/save flow without requesting camera permission. The Scan tab remains the QR/OID4VP surface and ignores `openid-credential-offer://` values received through `Linking.useURL()` to avoid duplicate processing.
- Fixed a cold-start/direct-route deeplink race where `/credential-offer` could mount before the root layout populated the in-memory pending deeplink store, causing "No credential offer link is pending." The claim screen now falls back to the current `expo-linking` URL when the store is empty and waits for the launch URL before surfacing the missing-offer state.
- Fixed the Back to Wallet deeplink loop by tracking the dismissed credential-offer URI. The claim screen marks the active offer as dismissed before replacing the route with Wallet home, and root/login/PIN routing ignores that exact dismissed URI instead of immediately reopening `/credential-offer`.
- Hardened the Back to Wallet fix against stale root-layout deeplink effects: repeating the same pending URI after dismissal no longer clears `dismissedUri`, preventing the same `Linking.useURL()` value from reopening `/credential-offer`.
- Hardened Back to Wallet navigation from `/credential-offer`: the button now replaces to the concrete Wallet index route `/`, and the root incoming-URL effect reads the latest dismissed URI from the deeplink store at execution time so stale React closures cannot reopen the offer.
- Fixed the remaining cold-start deeplink race where `/credential-offer` could render before both the in-memory pending store and `Linking.useURL()` contained the offer. The claim screen now falls back to async `Linking.getInitialURL()` before showing "No credential offer link is pending.", with regression coverage using the `credential_offer_uri` launch URL shape.
- Added warm-app deeplink handling: root layout now subscribes to `Linking.addEventListener('url')`, records fresh URL events with a store action that can reopen a previously dismissed same URI, and routes authenticated/PIN-ready credential offers to `/credential-offer` without requiring an app cold start.
- Replaced the hidden `/credential-offer` tab route with a Scan-tab claim mode: credential-offer deeplinks now route to `/(tabs)/scan`, where Scan renders `CredentialOfferClaimScreen` before camera permission checks. This keeps the bottom navbar, avoids the scanner camera surface, and removes unhandled root `REPLACE credential-offer` actions.
- Fixed deeplink reuse regressions: `CredentialOfferClaimScreen` subscribes to pending URI changes so a mounted claim screen resolves each new offer instead of showing the previous IDCard/transcript result.
- Fixed nested tab routing warnings by using `router.push()` instead of `router.replace()` whenever deeplink flow targets the Scan tab (`/(tabs)/scan`). Root stack `replace()` remains only for root-level auth/home routes.
- Fixed the mounted Scan-tab warm deeplink no-op: Scan now subscribes to pending deeplink store changes and opens `CredentialOfferClaimScreen` when a credential-offer URI arrives after the tab is already mounted, before camera permission UI can render.
- Fixed stale Scan success state after issuance: leaving the success screen now resets Scan state, clears any embedded deeplink claim screen, and navigates to Wallet home so returning to Scan starts from the scanner/permission state instead of the old "receive document success" page.
- Split OID4VCI issuance back out of the Scan tab: credential-offer QR scans and same-device deeplinks now hand off to the root `/credential-offer` route, leaving Scan as camera/OID4VP-only and preventing tab-preserved issuance success state from appearing when the Holder returns to Scan.

### Session 2026-06-25

- Implemented the Phase 2A standalone development mDOC issuer under `server/mdoc-issuer/` instead of adding issuer behavior to the Wallet Backend routes. The service exposes OID4VCI issuer metadata, authorization-server metadata, pre-authorized offer creation, token exchange, and a sample `mso_mdoc` credential response with a signed issuer-auth COSE envelope.
- Added deterministic ECDSA dev certificate fixtures, CBOR issuer-signed item/MSO construction, and focused Jest coverage for both the document builder and the issuer HTTP contract.
- Added `server` scripts `yarn mdoc-issuer:dev` and `yarn mdoc-issuer:start`, documented the runbook in `server/mdoc-issuer/README.md`, and extended `server` TypeScript/Jest config so Phase 2A files participate in normal `server` verification.

### Session 2026-06-25 (P3 wallet key renewal)

- Landed P3 wallet key expiry and per-credential renewal slice per `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md`: wallet key rotation marks bound credentials `renewal-required`, dev issuer renewal loop reuses OID4VCI `claimCredential()`, replacement credentials get `renewed-active` while old credentials move through `old-revoked` → `cleanup-pending` with P3-4/P3-6 dialogs.
- UI: `WalletKeyExpiredModal` on home focus when `isWalletKeyExpired()`, inactive/active overlays on `CredentialDocumentDetailCard`, home list badges merge P6 → P3 → verified/new precedence, Scan tab handles `?renew=<credentialId>`.
- Verification: root `yarn tsc --noEmit` pass; focused credential renewal tests pass; server `yarn test` includes dev renewal endpoint coverage.
- Fixed dev renewal `offerUri` generation: `POST /wallet/renewal-request` now calls issuer `POST /credential-offer` (via `ISSUER_PROXY_TARGET`) and returns a parseable `credential_offer` / `credential_offer_uri` OID4VCI URI instead of custom `credential_type` query params that caused `CredentialOfferParseFailed: Wrong parameters provided` on-device.

### Session 2026-06-26 (P3 async renewal flow)

- Refactored P3 renewal (canonical spec §changelog 2026-06-26 async): **ขอเอกสาร** is one-shot after issuer accepts (HTTP 201); network failure keeps `renewal-required` and allows retry.
- Split `credentialRenewalService`: `submitRenewalRequest()` POST only → `renewal-processing`; `refreshAndCompleteRenewals()` polls dev `renewal-status` on screen focus and auto-claims when `offer-ready`.
- Dev server: `POST /wallet/renewal-request` returns `{ accepted: true }`; `GET /wallet/renewal-status` returns `offer-ready` only after `DEV_RENEWAL_DELAY_MS` (default 8000).
- **UX revision** (canonical spec §changelog 2026-06-26 UX): grey `ribbon_badge_inactive.png` for waiting states; full-color `ribbon_badge.png` (no tint) for `renewed-active`; no auto P3-6 dialog or auto-navigate after claim; **ดูเอกสาร (เอกสารเดิม)** on home while `renewal-processing`; later slices removed home banner, limited Active badge to cleanup window, hid ⋮ menu during rotation flow.
- Merged P3 renewal specs into single canonical `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md`; removed superseded `2026-06-26-p3-renewal-async-flow-design.md` and `2026-06-26-p3-renewal-ux-flow-design.md`.
- Verification: `yarn tsc --noEmit` pass; `credentialRenewalService.test.ts` + server renewal tests pass; `ScanScreenDeeplink.test.tsx` mock updated for `useLocalSearchParams`.

### Session 2026-06-26 (code review + fixes)

- Confirmed `feat/transaction-id` PR #7 merged — marked Phase 2 deferred issuance `[x]`.
- Code review of P3 spec implementation found 2 issues: (1) `forceRotateWalletKey()` swallowed biometric cancellation via `.catch(() => undefined)` — removed, cancellation now propagates; (2) `requestCredentialRenewal()` wrote stale `renewed-active` renewal record for replacement credential — deleted.
- Full local review (P3 + P6 uncommitted changes): 0 CRITICAL / 0 HIGH findings; 4 MEDIUM/LOW fixed — `isReplaceableCredentialId()` returned `true` when either holder DID missing (now `false`), renewal fetch has 30s `AbortController` timeout, `walletHomeCopy.test.ts` covers all P3 copy fields, `credentialInactiveState.test.ts` covers all 5 renewal state transitions + P6 > P3 precedence.
- Added P6 Case 2 task section (3.6) and updated Phase 2 deferred issuance checkbox.
- Docs audit: ADR 0007 is the only fully superseded doc (superseded by ADR 0008); `docs/PLAN_SAME_DEVICE_DEEPLINK.md` complete and can be deleted. One production blocker: deterministic salt in `server/mdoc-issuer/documentBuilder.ts:36` must use `crypto.randomBytes(16)` before production mDOC issuance.

### Session 2026-06-29

- Implemented the approved OS push notification slice from `docs/superpowers/specs/2026-06-29-push-notifications-design.md`.
- Mobile: added `src/services/notifications/pushNotificationService.ts` and `notificationRouter.ts`, registered Expo push tokens after native startup in `app/_layout.tsx`, and routed notification taps to `/(tabs)/credential/[id]`.
- SDK boundary: kept generated `src/sdk/walletApi.ts` untouched and added adjacent helper `src/sdk/pushTokenApi.ts` for `POST /wallet-api/wallet/push-token`.
- Dev backend: added in-memory push token storage (`server/src/routes/pushTokens.ts`), Expo push sender (`server/src/services/expoPushClient.ts`), and webhook event forwarding in `server/src/routes/devWallet.ts`.
- Added `expo-notifications` plugin entry to `app.json` and test coverage for notification routing/registration plus the dev push webhook path.
- Verification: root `yarn tsc --noEmit` pass, root `yarn lint` pass, root `yarn test --runInBand` pass (57 suites / 291 tests), server `yarn tsc` pass, server `yarn test --runInBand` pass (8 suites / 33 tests).

### Session 2026-06-29 (unified PIN auth — `refactor/auth`)

- Implemented `docs/superpowers/specs/2026-06-29-unified-pin-auth-design.md`: single 6-digit PIN for server login and local app lock; email-first `/auth` wizard replaces separate login/register flows.
- Server: `password` → `pin` on register/login; new `email-status`, `pin-reset/request`, `pin-reset/confirm` routes; `002_pin_reset_otps.sql` migration; name profanity + weak-PIN validation.
- Mobile: `AuthWizard`, `PinEntryStep`, `/forgot-pin` OTP reset; `authService` auto-login after register and `setWalletPin()` after every login; `/login` and `/register` redirect to `/auth`.
- OpenAPI/SDK: `walletApi.json` + `yarn sdk:generate`; set `orval` `clean: false` so hand-written `src/sdk/*` helpers are not deleted on regen.
- Verification: server `yarn test` pass (36 tests); root auth tests pass (22 tests); root `yarn tsc --noEmit` pass.
- Manual setup: run `server/src/migrations/002_pin_reset_otps.sql`; dev PIN-reset OTP logs to server console as `[pin-reset] OTP for …`.

### Session 2026-07-06 (pluggable reader/verifier refactor)

- Generalized ETDA-specific config into extension registries: `readerProfiles.ts`, `companionTransport/` plugins (`etda-companion-v1` reference), `presentationTokenBuilders/` for OID4VP `vp_token` assembly.
- Renamed sharing mode `etda-dual-format` → `dual-format`; `etdaReaderProfiles.ts` is now a deprecated re-export shim; CBOR moved to `companionTransport/plugins/etdaCompanionV1/`.
- Design spec §16 documents the prototype extension model; removed non-ETDA ecosystems from out-of-scope.
- Verification: focused Jest + `yarn tsc --noEmit`.

### Session 2026-07-06 (dual-format software continuation)

- OID4VP: `buildDualFormatDcqlVpToken` assembles per-query-id `vp_token` for DCQL requests with both `dc+sd-jwt` and `mso_mdoc`; mDOC entry reads stored bytes (interim until DeviceResponse builder).
- ETDA companion: `companionTransport/plugins/etdaCompanionV1/`, `companionPresentation.ts` (KB-JWT with `aud=urn:etda:companion:nfc:v1`).
- Native: `EtdaCompanionHostApduService` + APDU handler (GET CAPABILITIES / BEGIN COMPANION / chaining); JS bridge via `armProximitySession`, `onCompanionSignRequested`, `supplyCompanionPresentation`.
- Verification: focused Jest + `yarn tsc --noEmit`.

### Session 2026-07-06 (ETDA companion APDU spec)

- Authored [`docs/superpowers/specs/etda-nfc-companion-apdu.md`](./superpowers/specs/etda-nfc-companion-apdu.md): ETDA AID `A0000004544410100`, INS `CA/CB/C0/FF`, CBOR capabilities + BEGIN COMPANION with 32-byte nonce, SD-JWT+KB-JWT companion (`aud=urn:etda:companion:nfc:v1`), ACR1311U-N2 host sequence.
- Added `src/config/etdaCompanionApdu.ts` (pinned constants + tests). Parent HCE spec §8 now links companion doc.
- `proximityArmSession` dual-format gate updated to require companion payload size estimate (no longer blocked on missing spec doc).


- Implemented spec-backed dual-format foundation: `LogicalCredential` linking layer (`logicalCredentialStorage`, grouping, consistency), `claimDualFormatCredential` / `claimCredentialWithDualFormatSupport`, `mso_mdoc` OID4VCI response path in `exchangeService`, config (`dualFormatPolicy`, `readerProfiles`), proximity consent-first UX (`PreTapConsentPanel`, `proximityStore`, `proximityArmSession`), OID4VP dual-format readiness check (`dualFormatPresentationMatch`).
- `armProximityPresentation` derives `companionPayloadBytes` from stored SD-JWT at arm time (`companionPayloadSize.ts`). Native HCE/session crypto unchanged (ADR 0006 / stub module).
- Verification: focused Jest suites pass; `yarn tsc --noEmit` pass.

### Session 2026-07-06 (HCE dual-format spec review + approval)

- Reviewed `docs/superpowers/specs/2026-07-06-android-hce-dual-format-presentation-design-review.md` (Composer 2.5) against the spec, ADR 0003/0006, the 2026-06-23 proximity spec, and current code; confirmed major findings, rejected 2 (companion-spec restatement, state merge).
- Spec `2026-07-03-android-hce-dual-format-presentation-design.md` revised to rev 4 and marked **Approved (design-level)**: added Relationship To Prior Specs (HCE APDU supersedes BLE data leg; 2026-06-23 spec header amended), Pre-Tap Request Resolution (fixed ETDA reader profile in config, consent = ceiling), Migration From Current Model (linking layer over `VerifiableCredentialRecord` + `mdocStorage`; UI/renewal/sync stay SD-JWT-keyed in v1), same-Ed25519-seed device key decision, Multipaz as leading candidate per ADR 0006, issuer configuration grouping rule, subset test-matrix case, v1 consent-screen identity fallback.
- **Remaining blockers before NFC dual-format on device:** (1) native HCE APDU stack + ETDA companion handler; (2) EdDSA device-authentication interop pass on ACR1311U-N2 (gates Ed25519 vs P-256 fallback in spec §5).
- Follow-up backlog from review pass (rev 4):
  - [x] ETDA companion APDU spec pinned: [`etda-nfc-companion-apdu.md`](./superpowers/specs/etda-nfc-companion-apdu.md) + `src/config/etdaCompanionApdu.ts`
  - [x] Dual-format issuance slice: `mso_mdoc` claim in `exchangeService`, `LogicalCredential` linking layer, consistency validation, `claimDualFormatCredential` / `claimCredentialWithDualFormatSupport`
  - [x] Proximity refactor to consent-first arm flow per spec §8–9 (`present.tsx` / `proximityStore`), reader profiles in `src/config/readerProfiles.ts`, policy env vars in `.env.example`
  - [x] OID4VP dual-format `vp_token` assembly (`dualFormatVpToken.ts`, `mdocVpTokenEntry.ts`, `presentationTokenBuilders/`)
  - [x] ETDA companion CBOR + KB-JWT builder (`companionTransport/plugins/etdaCompanionV1/`, `companionPresentation.ts`)
  - [x] Native ETDA `HostApduService` skeleton + JS arm/companion bridge (`EtdaCompanionHostApduService.kt`, `armProximitySession`, `supplyCompanionPresentation`)
  - [ ] After physical reader: EdDSA interop pass first (gates Ed25519 vs P-256), then follow-up ADR selecting the mDOC native module
  - [ ] Full ISO 18013-5 mDOC session crypto + online DeviceResponse builder (native module pending ADR 0006)

### Session 2026-07-08 (User Journey gap sprint — slices 1–4)

- **Slice 1:** ADR 0009 (`docs/adr/0009-wallet-level-holder-signing-key.md`) — single wallet Ed25519 key accepted for v1; per-document key destruction deferred.
- **Slice 2:** OID4VP same-device deeplink — `openid4vp` in `app.json`; `isPresentationRequestDeeplink`, `readPendingPresentationRoute`, `vpGeneration` in `deeplinkStore`; Scan dismiss/remount parity; tests pass.
- **Slice 3:** P6 Case 3 Used — `CredentialLifecycleAction` `'Used'` through `recordCredentialLifecycleAction`; `credential-used` history kind; inactive badge; dev `POST /wallet-api/dev/wallet/mark-used`.
- **Slice 4:** P6 Case 1 dev holder revoke — `POST /wallet-api/dev/issuer/holder-revoke`, `holderRevokeService`, credential detail `revokeSubmitting` phase; local revoke only after Issuer `201`; credential record retained (no key destruction). v1: no PoP — PIN flow unchanged.
- Verification: `yarn test` on touched suites pass; root `yarn tsc --noEmit` still reports pre-existing `server/src/config.test.ts` `NODE_ENV` read-only assignment (unchanged by this sprint).
