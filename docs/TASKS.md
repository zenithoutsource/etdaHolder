# TASKS.md - Active Implementation Backlog

### Session 2026-07-23 (VP claim selection on Info — implemented)

- **Implemented:** Consent read-only → Info (Approve by Wallet) hosts selectable **รายการที่ร้องขอ** → submit on **ยอมรับ** → Success. Flow B per `docs/superpowers/specs/2026-07-23-vp-claim-selection-on-info-design.md`.
- Plan: `docs/superpowers/plans/2026-07-23-vp-claim-selection-on-info.md` — Tasks 1–7 complete (review-row toggles, read-only Consent, Info selection + accept gate, Scan + My QR flow routing).
- Components: `PresentationDisclosureList`, `PresentationRequestedItemsCard`, `PresentationInfoPanel`, `PresentationConsentPanel`, `app/(tabs)/scan.tsx`, `Oid4VpDisclosureFlow`.
- Verification: focused VP suite reports 74 passing tests and 3 assertion failures in `PresentationRequestedItemsCard.test.tsx` / `PresentationDisclosureList.test.tsx` (helper-copy mismatch and mandatory badge text expected as `จำเป็น` while the component renders `*`); `yarn lint` exited 0. Root `yarn tsc --noEmit` still reports pre-existing errors in `app/callback.tsx` and `src/services/vci/exchangeService.ts`; VP-related `claimDisclosurePolicy.ts` `selective` Pick type is fixed in this slice.
- **Remaining:** physical-device walkthrough (Consent → Info toggle → sign/submit → Success) on dev build.

### Session 2026-07-23 (Windows native-build path length)

- Routed `yarn android` through the existing Expo wrapper so Cursor sandbox builds use the short `C:\gradle` user-home path instead of a Gradle cache path exceeding Ninja's Windows 260-character limit.
- Added a regression test that locks the package script to the short-path wrapper.
- Removed and regenerated the stale `react-native-screens` and `expo-modules-core` `.cxx` intermediates that retained absolute references to the former Cursor cache.
- Verification: focused wrapper regression test passed; arm64 `app:assembleDebug` completed successfully.

### Session 2026-07-21 (Galaxy Ed25519 hardware-keystore physical validation)

- Physical validation used Galaxy S24 Ultra model `SM-S928B` on build fingerprint `samsung/e3qxxx/e3q:16/BP4A.251205.006/S928BXXS6DZE1:user/release-keys`, Android 16 / API 36, security patch 2026-05-05.
- The device reports `android.hardware.hardware_keystore` version 200 and `android.hardware.strongbox_keystore` present. These feature flags are preflight signals, not proof that the requested Ed25519 recipe succeeds.
- Canonical default recipe (`EC` / AndroidKeyStore, curve `ed25519`, `SIGN | VERIFY`, digest `NONE`, no StrongBox): **unsupported through the tested public AndroidKeyStore recipe**. Generation did not complete before public-key, Ed25519 OID, signature, or `KeyInfo.securityLevel` evidence could be produced.
- Canonical StrongBox recipe (the same parameters with StrongBox requested): **unsupported through the tested public AndroidKeyStore recipe**. StrongBox rejected EC Ed25519 before public-key, Ed25519 OID, signature, or `KeyInfo.securityLevel` evidence could be produced.
- Two fresh cold launches with fresh aliases returned identical null evidence fields, sanitized exception classes/messages, and unsupported classifications for both recipes. Remote attestation was not performed because neither recipe produced a candidate key.
- Native diagnostic compilation completed as part of the successful arm64-v8a debug assembly; the arm64 APK built and installed successfully on the physical device.
- The installed diagnostic APK was arm64-only because the Windows multi-ABI build hit a documented `armeabi-v7a` Prefab path-length failure. This is a build-host limitation, not a device capability result.
- Repository verification: `yarn.cmd lint` exited 0 with no warnings or errors emitted; `yarn.cmd tsc --noEmit` exited 0; `yarn.cmd test src/services/crypto --runInBand` reported no matching tests (708 files checked, 0 matches) and exited 1 as anticipated for this hardware-only diagnostic.
- ADR 0008 remains active. Galaxy A26 physical validation is still pending; no S24 result is generalized to that device or to other firmware.

### Session 2026-07-21 (Galaxy Ed25519 hardware-keystore research)

- Reassessed hardware-backed Ed25519 on Galaxy A26 and S24 Ultra in `docs/eddsa/eddsa-hardware-keystore-research.md` using Android/AOSP, Samsung Knox, Apple, and evaluated-library primary sources.
- Found the prior S24 Ultra `EC`-key observation inconclusive: Android KeyMint represents Curve25519 through EC internally, and the canonical Android 13/14 recipe is `EC` + `ECGenParameterSpec("ed25519")` + `DIGEST_NONE`; the direct `Ed25519` generator alias arrived with Android 15.
- Production decision remains ADR 0008 until both physical devices are rerun with SPKI/OID validation, Ed25519 sign/verify, `KeyInfo.securityLevel`, StrongBox and TEE attempts, and preferably off-device key-attestation validation.
- Verification: documentation/source review only; no runtime code changed and no device was available for this slice.

### Session 2026-07-20 (consent disclosure gesture-handler regression)

- Switched the selectable consent-row `Pressable` back to React Native primitives; the component does not require gesture-handler gestures and was rendering outside a `GestureHandlerRootView`.
- Added regression coverage preventing `PresentationDisclosureList` from importing gesture-handler for row presses.
- Verification: focused disclosure-list tests passed; lint passed with existing warnings; root type-check remains blocked by the existing `claimDisclosurePolicy.ts` `selective` type error.

### Session 2026-07-20 (OID4VP consent metadata policy)

- Preserved Issuer claim metadata as independent `mandatory` and `sd` flags for the wallet consent screen.
- Mandatory claims are selected and locked; optional `sd:true` claims can be selected or deselected; `sd:false` claims remain locked.
- Verification: focused consent/policy tests passed (19 tests); lint passed with existing warnings. Root type-check remains blocked by an existing missing `documentType` prop in `src/components/PresentationRequestedItemsCard.test.tsx`.

### Session 2026-07-22 (Same-device issuance — offer URI callback)

- **PM update:** Issuer returns **issuance URI** on `walletapp://callback` — **not** Wallet-managed OAuth `authorization_code`.
- Portal: `/Account/Login?ReturnUrl=walletapp://callback&documentType=...` → parse `credential_offer_uri` / `uri` / direct `openid-credential-offer://` → existing claim screen.
- Removed Home/Scan wiring for auth-code orchestrator; optional `openid4vp://` callback routes to Scan.
- Verification: focused portal/callback tests.

### Session 2026-07-22 (Portal issuance E2E — design approved)

- **E2E milestone:** IdCard + Transcript + Driving Licence via portal login; Issuer does PID VP in browser; Wallet receives `walletapp://callback?credential_offer_uri=https://...` only.
- Spec: `docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md` (acceptance matrix, Issuer contract, joint sign-off).
- Issuer handoff: `docs/superpowers/specs/2026-07-22-portal-issuance-issuer-handoff.md`.
- Plan: `docs/superpowers/plans/2026-07-22-portal-issuance-e2e.md`.
- **Wallet open:** native prebuild done (`walletapp` in AndroidManifest); device install + E2E matrix (Section 6 of spec) pending adb device.
- **Issuer open (agreed/in progress):** deploy wrapped callback redirect + sample URLs per `documentType`.

### Session 2026-07-20 (Same-device authorization code issuance — design)

- **Pattern A locked:** step 4 stores OAuth `code` from walletapp; step 13 `POST /token` reuses that code (after PID VP for DL/transcript). Legacy offer deeplink still supported.
- Design spec: `docs/superpowers/specs/2026-07-20-same-device-authorization-code-issuance-design.md` (updated 2026-07-22 for Account/Login portal).
- Canvas: `canvases/same-device-vc-issuance.canvas.tsx` (target flow v2).
- **Blocked (E2E only):** Issuer OAuth registration (`client_id`, callback whitelist).

### Session 2026-07-20 (Same-device VP Holder selective disclosure)

- Implemented Holder-driven SD-JWT claim toggles on the existing Scan/My QR consent panel: `md` claims stay locked on when requested; `sd` claims are toggleable before accept.
- Persist Issuer `credential_metadata` claim policy at OID4VCI claim (`claimDisclosurePolicy` on `VerifiableCredentialRecord`); resolve at presentation via stored policy → live Issuer fetch → `cardSchemas` → default selective.
- Wired holder selection into SD-JWT disclosure filtering and dual-format SD-JWT entries; added hybrid same-device return via allowlisted `redirect_uri` after successful `direct_post`.
- Spec: `docs/superpowers/specs/2026-07-20-same-device-vp-holder-selective-disclosure-design.md`.
- Verification: focused VP/consent/policy tests; `yarn tsc --noEmit`; `yarn lint`.

### Session 2026-07-17 (OID4VP SD-JWT selective disclosure)

- SD-JWT DCQL presentations now filter disclosure segments to the claims requested by the Verifier before raw submission or KB-JWT signing; dual-format SD-JWT entries use the same filtering path.
- Added malformed-disclosure fail-closed handling and focused coverage for filtered, unfiltered, KB-bound, raw, and dual-format paths.
- `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` remains envelope-only; `EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING=false` remains the normal validation setting.
- Verification: all OID4VP tests passed (18 suites / 126 tests); `yarn tsc --noEmit` passed; `yarn lint` passed with 22 existing warnings and no errors.

### Session 2026-07-17 (document card unification)

- Completed the full-width `DocumentCardLayout` banner geometry and aligned Driving Licence, ID Card, and Transcript wallet detail cards plus VC receive previews to the shared banner/hero/two-column/divider presentation.
- Preserved the fixed Driving Licence reference card, dynamic Thai ID and Transcript values, distinct Thai ID confirmation phase, receive callbacks, and below-card accept/confirm buttons.
- Restored Revoke/Delete visibility for active credentials with stale or non-blocking renewal metadata; actions remain hidden during wallet-key rotation and visible renewal/inactive ribbon contexts.
- Verification: consolidated focused Jest passed (9 suites, 43 tests); `yarn tsc --noEmit` passed; `yarn lint` passed with 22 existing warnings and no errors.
- Follow-up: the document-title banner now uses the primary color across the full width; focused card tests passed.

### Session 2026-07-17 (production configuration hardening)

- Added centralized mobile endpoint validation for Wallet API and Broker URLs; release-like runtimes reject missing, non-HTTPS, loopback, malformed, and credential-bearing URLs while development keeps local defaults.
- Server configuration now validates production JWT, database host, mail address, public presentation URL, and verifier URL; Issuer/public-base values are consumed through `ServerConfig` instead of direct service environment reads.
- Updated mobile/server environment templates and onboarding documentation with development defaults and production requirements. Deferred migration of remaining timing-policy defaults to a separate slice.
- Verification: mobile focused tests passed (17 tests), full server tests passed (100 tests), server TypeScript passed, root `yarn tsc --noEmit` passed, root lint passed, and `yarn setup --check` passed.

### Session 2026-07-17 (driving-licence reference card)

- Added the fixed screenshot-reference driving-licence card to wallet credential detail/home and VC receive confirmation, using `assets/images/user_profile.png` for the portrait.
- Verification: the four focused driving-licence suites passed (22 tests); `yarn tsc --noEmit` was run and currently reports two unrelated existing errors in `app/(tabs)/credential/[id].tsx`; `yarn lint` passed with 23 existing warnings and no errors.

### Session 2026-07-17 (P3 key + document expiry deadlock — implement)

- Lane selector `readWalletKeyExpiryLane` + `readFirstPendingRenewalCredentialId` + pending-renewal copy.
- `WalletKeyExpiryHost` shows create-key only for `create-key` lane; `finish-renewals && isExpired` steers via AppDialog; blocked rotate offers **ไปต่ออายุเอกสาร**.
- Document-expired `ขอเอกสารใหม่` gated by `shouldOfferDocumentReissueCta` on home + credential detail while lane is `create-key`.
- Spec/plan: `2026-07-17-p3-key-document-expiry-deadlock-*`.

### Session 2026-07-17 (My QR Broker engagement + OID4VP cutover)

- Production My QR now uses Wallet Broker engagement (`POST /broker/session` → show `qr_payload` → poll/push for deposited OID4VP request → shared `Oid4VpDisclosureFlow` → `direct_post`).
- Broker default: `EXPO_PUBLIC_BROKER_BASE_URL` → `https://wallet.zenithcomp.co.th:455` (swagger confirmed `POST/GET /broker/session…`).
- Push route: `presentation-request` + `session_id` → `/(tabs)/qr` with `brokerSessionId`.
- Option A verifier-owned `/v1/*` VP-by-reference is superseded for production My QR (see `2026-07-16-my-qr-broker-oid4vp-design.md`).
- Removed unused mobile Option A stack (`verifierPresentationAdapter`, presentation gateway client/base URL helpers, pre-upload `walletInitiatedPresentation` session APIs). Kept `isSdJwtCredential` in `sdJwtCredential.ts`.
- Removed unused `VP_RELAY_BASE_URL` / `vpRelayBaseUrl` (server fallbacks use `VERIFIER_PRESENTATION_BASE_URL` / `PRESENTATION_GATEWAY_BASE_URL` only for the local `/v1` reference service).
- Open items for Broker team: exact `GET .../request` body sample after deposit; confirm push event name stays `presentation-request`.

### Session 2026-07-17 (customer issuer Iso18013 direct config keys)

- Issuer reportedly added direct `credential_configurations_supported` keys: `org.iso.18013.5.1.mDL` (`mso_mdoc`) and `Iso18013DriversLicenseCredential_dc+sd-jwt` (`dc+sd-jwt`). Live fetch of `http://192.100.10.46/.well-known/openid-credential-issuer` timed out from this workstation (host unreachable).
- Unit coverage: direct dual-format resolve (`requestId === offer id`) plus regression for missing-doctype / `vc+sd-jwt` alias paths; dual-format grouping maps ISO mDL doctype ids onto the `Iso18013DriversLicenseCredential_*` family.
- Kept prior compatibility fallbacks. Focused Jest (7) passed; root `tsc` still has unrelated existing `WalletInitiatedVpQr` phase errors.

### Session 2026-07-17 (remove development Issuer/Verifier proxy)

- Removed the development Issuer/Verifier proxy routes, environment switches, and mobile URL rewriting.
- Renewal helpers now use the direct public `ISSUER_BASE_URL`; physical Android testing uses public Issuer/Verifier URLs directly.
- Focused mobile and server tests pass. Root TypeScript still reports unrelated existing `WalletInitiatedVpQr` phase comparison errors.

### Session 2026-07-17 (P3 key + document expiry deadlock — design)

- Spec: `docs/superpowers/specs/2026-07-17-p3-key-document-expiry-deadlock-design.md` — ordered lane `create-key` → holder taps **ขอเอกสาร**; while `wallet.key_rotation` exists, steer to finish renewals (second rotate stays blocked).
- Plan: `docs/superpowers/plans/2026-07-17-p3-key-document-expiry-deadlock.md`.
- Parent changelog updated in `2026-06-25-p3-wallet-key-renewal-design.md`.

### Session 2026-07-17 (remove unused mDOC mocks)

- Deleted local mock issuer `server/mdoc-issuer/` (issuance uses customer Issuer `issuer.zenithcomp.co.th:455`).
- Deleted stub `tools/acr1311u-n2/companion_probe.ts`; keep runnable `probe_companion.py`.
- Removed `mdoc-issuer:*` scripts, `cbor` server dep (issuer-only), and jest/tsconfig includes for the mock tree.

### Session 2026-07-16 (customer issuer mDL resolve — `issuer.zenithcomp.co.th:455`)

- Offer id `org.iso.18013.5.1.mDL` failed with `CredentialConfigurationNotSupported` against customer issuer metadata that has `Iso18013DriversLicenseCredential_mso_mdoc` but omits `doctype`.
- Added doctype-offer → ISO 18013 driving-licence `mso_mdoc` resolver; enriches `doctype` from the offer id for the credential request.
- Dual-format customer offer also lists `Iso18013DriversLicenseCredential_dc+sd-jwt` while metadata only has `vc+sd-jwt`: format-aware family match + `dc+sd-jwt`↔`vc+sd-jwt` compatibility; dual-format grouping uses `requestId` so mDL doctype pairs with the SD-JWT sibling.
- Not using local `server/mdoc-issuer` for this path — target is `http://issuer.zenithcomp.co.th:455`.

### Session 2026-07-16 (approvePresentation bridge + ISO mDOC HCE routing)

- Wired `ExpoMdocProximityModule.approvePresentation` to `MdocProximityEngine.approvePresentation` (consent ceiling enforcement + presentation engine start).
- Added ISO mDOC AID `A0000002480400` to HCE manifest; `CompanionHostApduService` routes mDOC vs companion AIDs; `MdocApduHandler` + `StoredMdocPresentationEngine` scaffold (Multipaz adapter next per ADR 0006).
- `proximityArmSession` now calls `approveProximityPresentation` after arm; native events dispatch via `ProximityEventDispatcher`.
- **Still open:** Multipaz-backed `processApdu` for full `DeviceResponse`; dual-format single-tap E2E after `markMdocExchangeComplete`.

### Session 2026-07-16 (ISO 18013-5 mDL + ACR1311U-N2 physical validation)

- **PASS:** ISO 18013-5 mDOC presentation with doctype `org.iso.18013.5.1.mDL` interoperates on Samsung A26 + ACR1311U-N2.
- Closes the primary physical blocker for the mDOC data leg on the ACR1311U-N2 reader path; companion HCE leg was already validated separately (2026-07-13 checklist).
- **Still open:** wire `approvePresentation` in `ExpoMdocProximityModule` to the validated native session path; online OID4VP `DeviceResponse` builder; follow-up ADR 0006 module selection record; dual-format end-to-end (mDOC + companion) on one tap.

### Session 2026-07-14 (Keychain session recovery)

- An unreadable session Keychain item (`E_CRYPTO_FAILED`) no longer aborts Wallet startup.
- `loadSession()` retains the redacted diagnostic, clears the broken session entry, and returns signed-out state so the user can log in again.
- Added regression coverage for Keychain read failure recovery; auth tests, TypeScript, and lint pass with existing warnings only.
- If the encrypted storage Keychain item is unreadable while a PIN-wrapped fallback exists, startup now offers PIN recovery instead of failing before Login; encrypted wallet data is not wiped automatically.

Controls local AI agent coding sessions. Cross-reference `AGENTS.md`, `docs/ARCHITECTURE.md`, `CONTEXT.md`, and `docs/adr/`.

### Session 2026-07-14 (P3 manual renewal receive consent)

- Renewal-ready notification taps no longer auto-claim. Wallet Home and Credential Detail now require the Holder to explicitly select **Receive new document**; an initial PIN/biometric unlock may occur for navigation but is not treated as consent to receive.
- Final review: ready-offer markers are cleared after a failed claim, before resubmission, and on explicit status failures; malformed persisted ready-offer values are ignored. Focused renewal, detail, and notification tests (42 tests), TypeScript, and lint passed.

### Session 2026-07-13 (My QR VP verify outcome — P5 #16/#18 Wallet scope)

- Wallet-initiated My QR now polls explicit terminal statuses `verified` / `verify_failed` (replaces ambiguous `consumed`) after Verifier §2.1 crypto on scan.
- Gateway finalizes sessions on verify failure; status API includes `reason` on `verify_failed` (not shown in Holder UI).
- Wallet: `verify_failed` phase + `presentation-failed` history (`channel: wallet`); success path unchanged (`presentation-success`).
- Spec: `docs/superpowers/specs/2026-07-13-wallet-initiated-vp-verify-outcome-design.md`; plan: `docs/superpowers/plans/2026-07-13-wallet-initiated-vp-verify-outcome.md`.

### Session 2026-07-13 (companion GET CAPABILITIES uint32 encoding)

- Fixed companion HCE `GET CAPABILITIES` returning `SW=6F00`: the advertised `max_companion_bytes=65536` exceeded the encoder's uint16-only branch and raised an exception.
- Added CBOR uint32 encoding for values at and above `65536`; Android `:expo-mdoc-proximity:compileDebugKotlin` succeeds.

### Session 2026-07-13 (unauthenticated startup biometric prompt)

- Fixed startup prompting for PIN/biometric before routing an unauthenticated user to Login when the persisted wallet storage key/PIN remains but the session is missing.
- Storage initialization now requires biometric authentication only when a persisted authenticated session exists; authenticated cold starts retain the existing biometric gate.
- Fixed the remaining visible prompt by preventing the startup UI from entering `storage-pin-required` while an unauthenticated storage initialization is in progress.
- Added regression coverage for no-session storage initialization without a biometric prompt.

### Session 2026-07-13 (P3 step 31 local verify-failure history)

- Added Wallet-local Audit Trail stand-in for receive-side VC signature/holder-binding failures: history kind `credential-verify-failed` via `recordCredentialVerifyFailed`, wired from `finalizeCredentialRecord` (covers OID4VCI claim + renewal auto-claim).
- Shown under History Log issuance filter; no PII/JWT payload stored. External Audit Trail service still absent.

### Session 2026-07-13 (P3 OID4VP old-VC auth after key rotation)

- Implemented sequence steps 5–6 for P3 renewal: dual-key retention (`forceRotateWalletKey` keeps previous Ed25519 seed), silent Issuer OID4VP of the renewing old VC with previous-key PoP (`renewalOid4VpPresentation`), then existing auto-claim with new did:key.
- Dev Issuer: `POST /wallet/renewal-request` returns `authorizationRequest`; `POST /wallet/renewal-vp/response` gates `offer-ready`. `__DEV__` trusted verifier for wallet-api renewal `redirect_uri`.
- Spec changelog + §3.5 TASKS updated. Physical-device golden path still open.

### Session 2026-07-13 (push token registration for renewal notifications)

- Root cause of server `token-missing` for `renewal-required`: the default development setup wrote `EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true`, so the app never registered its Expo token under the current Holder DID.
- Removed that skip flag from the generated and checked-in development environment; the flag remains available as an explicit opt-out for push-free development.
- Deduplicated concurrent push-notification initialization for the same Holder DID so repeated startup/HMR calls share one Expo token request and do not create an avoidable aborted request.
- Added setup-script regression coverage proving a fresh environment enables the normal push registration path.
- Fixed post-claim Wallet Home fallback navigation to target the `/(tabs)` shell instead of the unresolved `/`/`index` route; renewal logs confirmed credential claim and save had already completed before this warning.

### Session 2026-07-13 (holder credential delete removal)

- Fixed holder-initiated credential Delete from the detail action menu so it records the lifecycle/history deletion event and physically removes the credential from encrypted MMKV/index via the shared stored-credential removal path.
- Root cause: ordinary Delete only wrote `credential:lifecycle:* = deleted`, while renewal cleanup and expiry cleanup called `removeStoredCredential()`. The stale credential could therefore remain visible and require repeated delete attempts depending on the next screen refresh.
- Added focused regression coverage for holder-approved delete removing the credential while preserving the deleted lifecycle marker.

### Session 2026-07-13 (Android document-expiry alarm cap)

- Fixed repeated document-expiry notification scheduling that could churn Android alarms until `ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE` / concurrent alarm limit 500 after wallet key actions triggered credential refreshes.
- `scheduleDocumentExpiryNotifications()` no longer cancels a valid future `document-expired` alarm on every unchanged credential pass; `useCredentialExpiryWatch()` uses the idempotent scheduler for normal mount/app-active/credential-change refreshes instead of full reschedule.
- Added Android alarm-cap recovery: when Expo reports the 500 concurrent alarm limit, the Wallet cancels stale app scheduled notifications, clears document-expiry schedule markers, retries the current schedule once, and logs recoverable cap detection as an info diagnostic instead of a red schedule failure.
- After alarm-cap recovery, the scheduler runs one clean idempotent rebuild pass so marker-skipped notifications are recreated after native alarms are cleared.
- The scheduler now reconciles MMKV document-expiry notification markers against Expo's native scheduled notification list; if Android has no matching native alarm, stale markers are cleared and the notification is rebuilt in the same pass.
- Local scheduled notification permission/tap routing now initializes even when `EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true`; the flag skips only Expo push-token/backend registration, not local OS notification setup.
- Added focused regression coverage proving repeated scheduling for an unchanged credential creates one `document-expiring-soon` and one `document-expired` notification, proving stale markers are rebuilt when native alarms are missing, proving alarm-cap recovery clears stale state before retrying, and proving dev push-registration skip still requests local notification permission.

### Session 2026-07-13 (P2 canvas + OID4VP handler status sync)

- P2 sequence canvas: Wallet steps 4, 6, 7 updated from Missing → Done (handler shipped 2026-07-10). Step 5 note clarified (consent + single sign-time gate on OID4VP path).
- Spec `docs/superpowers/specs/2026-07-10-p2-issuer-oid4vp-pid-auth-design.md`: status → Handler shipped · E2E pending Issuer step 3; added E2E checklist for `issuer.zenithcomp.co.th:455`.
- `.env.development.local.example`: issuer OID4VP vars documented with `issuer.zenithcomp.co.th:455` example.
- No new Wallet code — gap was documentation/canvas drift only.

### Session 2026-07-10 (P2 Issuer did:web verify on receive)

- On OID4VCI credential finalize, when VC `iss` is `did:web:…`, Wallet resolves the Issuer DID document (`resolveDidWebVerificationJwk`) and verifies the Issuer JWT EdDSA signature (`assertIssuerDidWebCredentialSignature`).
- Shared helper: `src/services/crypto/eddsaJwtVerify.ts` (also used by JAR verify). HTTPS/`iss` missing/`mdoc` skip DID resolve; Trust Registry accreditation still blocked.
- Files: `src/services/vci/issuerDidWebVerify.ts`, wired from `finalizeCredentialRecord` in `exchangeService.ts`.

### Session 2026-07-10 (P2 Issuer OID4VP PID auth handler)

- Wallet handler for Issuer-initiated OID4VP PID auth reuses the existing Scan OID4VP path: `openid4vp` intake, `resolvePresentationRequest()`, Holder consent, VP creation, and `submitPresentationResponse()` direct_post.
- Added issuer OID4VP did:web relying-party allowlist env: `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID`, `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN`, optional `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME`, and optional `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK`.
- Spec: `docs/superpowers/specs/2026-07-10-p2-issuer-oid4vp-pid-auth-design.md`; plan: `docs/superpowers/plans/2026-07-10-p2-issuer-oid4vp-pid-auth.md`.
- E2E remains blocked on the real Issuer Authorization Request and live `response_uri`. No Issuer mock server is added for this slice.

### Session 2026-07-09 (Verifier-owned My QR — Option A)

- Production authority model: **Verifier presentation service** owns session create, VP upload, §2.1 verify, and HTML outcome — wallet company backend is not in the My QR path.
- Mobile: `resolveVerifierPresentationBaseUrl()` + `createVerifierPresentationAdapter()`; KB-JWT `aud` and QR fallback use verifier base URL; history `partyName: 'Verifier'`. Legacy gateway env names remain as deprecated fallbacks.
- Server: `VERIFIER_PRESENTATION_BASE_URL` config; `presentationGateway.ts` documented as reference verifier presentation service (LAN co-location ok for dev).
- Spec: `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md` supersedes wallet-as-authority framing in `2026-07-09-production-my-qr-presentation-gateway-design.md`.
- Golden path env: `EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL` (mobile) + `VERIFIER_PRESENTATION_BASE_URL` (server). External Verifier API (`verifier.zenithcomp.co.th:455`) needs `/v1/*` deployed OR use local reference service on LAN until then.
- Verification: focused VP/verifier tests + `yarn tsc --noEmit` + `yarn lint`.

### Session 2026-07-09 (Production My QR Presentation Gateway)

- Production My QR: hardened VP-by-reference relay into `/v1/presentation-sessions` + `/v1/present/verify` with shared `presentationGatewayService`, ThaID-only upload policy, and async issuer JWKS resolution when `VP_ISSUER_PUBLIC_KEY_JWK` is absent.
- Mobile decoupled from `/dev/*` via `PresentationGatewayClient` + `RelayPresentationGatewayAdapter`; `useWalletInitiatedVpQrSession` uses server-provided `verifyUrl`.
- Dev `/dev/vp-session` + `/dev/vp-verify` retained unchanged for LAN golden path.
- Spec: `docs/superpowers/specs/2026-07-09-production-my-qr-presentation-gateway-design.md`; plan: `docs/superpowers/plans/2026-07-09-production-my-qr-presentation-gateway.md`.
- Configure `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` (mobile) and `PRESENTATION_GATEWAY_BASE_URL` (server) for `/v1` path; manual LAN golden-path validation (task 9) pending on Galaxy A36 + Honeywell.

### Session 2026-07-09 (OID4VP production did:web verifier trust)

- Production OID4VP trust gate: dev `redirect_uri` Verifier API entries are emitted only in development builds; release builds use env-configured `decentralized_identifier:did:web:` trust only.
- JAR verification now reuses the shared scheme-aware trusted-verifier matcher and rejects untrusted `did:web` Request Objects before any unpinned DID document fetch.
- Added `did:web` DID document fetch timeout/UTF-8 byte-cap policy via `EXPO_PUBLIC_DID_WEB_FETCH_TIMEOUT_MS` and `EXPO_PUBLIC_DID_WEB_MAX_BYTES`; standard HTTPS DID document URLs remain the only v1 resolution path.
- Removed the superseded `modules/etda-wallet-eddsa` native diagnostic/weak-biometric module and its JS bridge. Production Ed25519 signing remains the Keychain-protected software seed path in `src/services/crypto/crypto.ts`; app-level biometric gates now use `expo-local-authentication`.
- Renamed visible project/app branding from `etdaWallet` / `ETDA Wallet` to `Wallet` in Expo metadata, package metadata, Android app label, and PIN reset email content. Android package id and app scheme remain `com.thanaboon.chan.etdaWallet` / `etdawallet` to preserve Firebase and deep-link compatibility.
- Spec: `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`; plan: `docs/superpowers/plans/2026-07-09-oid4vp-production-did-web-verifier-trust.md`.
- Verification: focused trusted-verifier/JAR/did-web/presentation tests pass; `yarn lint` pass with pre-existing warnings.

### Session 2026-07-08 (OID4VP trust + JAR)

- OID4VP hardware-free hardening: `clientIdScheme.ts` (scheme parsing + `response_uri` binding), `authorizationRequestJar.ts` (JAR `typ` enforcement + EdDSA verify), `didWebResolver.ts` (`did:web` document → `publicKeyJwk`), scheme-aware `findTrustedVerifier()` in `presentationService.ts`.
- Production-style verifier allowlist: optional `EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID`, `EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN`, `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK` via `buildTrustedVerifiersFromEnv()`; dev `redirect_uri` verifier unchanged.
- Verification: focused OID4VP/JAR tests pass; root `yarn tsc --noEmit` pass.

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
[x] Drop `user_pin` dual-send in token request after the customer Issuer confirms `tx_code`-only acceptance (`exchangeService.ts:760`). OID4VCI 1.0 final token requests now send `tx_code` only.
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
[x] Add Chulalongkorn University Transcript schema
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

Source: `docs/User_Journey/id_card/P3.md`, `docs/superpowers/specs/2026-06-25-p3-wallet-key-renewal-design.md` (canonical; merged async + UX specs 2026-06-26; OID4VP old-VC auth 2026-07-13; key+doc expiry deadlock lane 2026-07-17).

[x] Wallet key TTL policy (`src/config/walletKeyPolicy.ts`) and `rotateWalletKey()` with per-credential `renewal-required` marking
[x] Holder-binding parse (`credentialHolderBinding.ts`) and renewal state machine (`credentialKeyRenewal.ts`, `credentialRenewalService.ts`)
[x] Dual-key retention: previous Ed25519 seed kept after rotate for old-VC PoP; `clearPreviousWalletKey` on rotation cleanup
[x] Silent OID4VP of old VC on renewal (`renewalOid4VpPresentation.ts`) — previous-key sign, no consent UI
[x] Async renewal flow: `submitRenewalRequest()` (OID4VP then processing) + `refreshAndCompleteRenewals()` (poll on focus, auto-claim on `offer-ready`)
[x] Dev renewal endpoints (`server/src/routes/devWallet.ts`: `POST /wallet/renewal-request` → `{ accepted, authorizationRequest }`, `POST /wallet/renewal-vp/response` → gates `offer-ready`, `GET /wallet/renewal-status`)
[x] Wallet home expiry modal (`WalletKeyExpiredModal`) and renewal badges on document rows (`app/(tabs)/index.tsx`)
[x] Credential detail inactive/active overlay (`ribbon_badge.png`), renewal CTA (renewal-required only), P3-6 cleanup dialog (`app/(tabs)/credential/[id].tsx`)
[x] Scan-tab renewal deep link via `?renew=<credentialId>` submits only, then routes to old credential detail (`app/(tabs)/scan.tsx`)
[x] Key+document expiry deadlock lane (`walletKeyExpiryLane`) — create-key first per sequence, then holder **ขอเอกสาร**; `finish-renewals` steers while rotation record exists (spec/plan 2026-07-17)
[ ] Physical-device validation: rotate key → submit renewal (silent old-VC OID4VP biometric) → wait/poll → green Active on new VC → P3-6 delete old VC on hardware

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

[x] Screen capture prevention: focus-scoped `useScreenCaptureGuard` on Wallet Home, Credential Detail, Scan, and History; My QR excluded; disable via `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true`. Spec: `docs/superpowers/specs/2026-07-14-phase4-screen-capture-and-route-logging-design.md`.
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
[x] Advisory: dedupe claim-reading helpers — shared `src/services/credentials/claimFormatting.ts` (`stringifyClaim`, `HIDDEN_CLAIM_KEYS`, `readClaimText`); wired into `credentialDisplay.ts`, `qrIssuanceFlow.ts`, `presentationService.ts`, `dcqlCredentialMatch.ts`. Screen-level alias maps in `app/(tabs)/*` were already absent; type→title maps remain in `cardSchemas.ts` via `getCardSchema()`.
[x] Advisory: route error logging — `authService.ts` already uses `logWalletError`; `server/src/routes/{auth,credentials,wallets}.ts` now log via `logRouteError` before 500 responses. Dev routes unchanged.
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
[x] Initial Verifier config: development Verifier API at `http://verifier.zenithcomp.co.th:455`

Implemented:

[x] `src/services/vp/` for Authorization Request handling and Presentation Exchange matching
[x] Verifier API `request_uri` JWT + DCQL IDCard compatibility
[x] Verifier API Transcript DCQL `dc+sd-jwt` compatibility
[x] Hardware-signed JWT VP token via `src/services/crypto`
[x] Device-to-Verifier `direct_post` transport
[x] Scan tab Holder consent/result flow for OID4VP QR
[x] Local encrypted history for successful presentations

Remaining:

[x] Signed Request Object (JAR) signature verification — `authorizationRequestJar.ts` verifies `typ: oauth-authz-req+jwt`; `decentralized_identifier` requires EdDSA signature (pinned JWK or `did:web` document fetch); `redirect_uri` stays unsigned per OID4VP §5.9.3.
[x] `client_id_scheme` enforcement — `clientIdScheme.ts` + scheme-aware `findTrustedVerifier()` for `redirect_uri`, `decentralized_identifier`, and legacy pre-registered `did:web` allowlist entries.
[ ] Replace development `redirect_uri:` Verifier with registered production `did:web` Verifier entries — spec: `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md` (gate dev `redirect_uri` to `__DEV__`; require `EXPO_PUBLIC_VERIFIER_DID_WEB_*` in production; DID fetch timeout/size). **Env checklist:** `docs/GETTING_STARTED.md` § Production Verifier OID4VP checklist + `.env.example`; E2E pending customer Verifier host.
[x] `presentation_definition_uri` fetch support — `presentationDefinitionResolver.ts`; fetch after trust gate; AbortController timeout + max-bytes cap; PE/DCQL mutually exclusive in v1; P5 birth-date scope unchanged.
[x] DCQL `credential_sets` grouping — `dcqlCredentialSetResolver.ts` + `dcqlCredentialMatch.ts`; single-credential OR v1; first satisfiable option; unified DCQL claim validation; exact dual-format short-circuit unchanged.
[ ] Add broader claim sets only after trust and disclosure semantics are documented
[x] Add MSW Verifier handler group or integration harness for direct_post tests — `src/__tests__/setup/handlers/verifier.ts`, `src/__tests__/setup/mswServer.ts`, opt-in `presentationService MSW harness` describe block.
[ ] Decide whether to add a full ADR before expanding beyond the P5 age-over-20 slice

## User Journey Gap Backlog (2026-07-06 audit vs docs/User_Journey)

Gap analysis of P0–P6 journey diagrams against implemented flows. Wallet-side buildable items first; ecosystem-blocked items recorded as external blockers.

### Buildable now (wallet-side)

[x] P6 Case 1 Issuer round-trip for holder revoke (v1 dev): `POST /wallet-api/dev/issuer/holder-revoke` + `holderRevokeService`; credential detail awaits Issuer `201` before `recordCredentialLifecycleAction('Revoke')`. Keeps credential record for history; no per-credential key destruction (ADR 0009). v1: no PoP JWT — Wallet PIN approve unchanged.
[x] P6 Case 3 Single-Use credential self-cleanup (v1): `CredentialLifecycleAction` `'Used'` via `recordCredentialLifecycleAction`, parser whitelist, `credential-used` history event, inactive badge, dev `POST /wallet-api/dev/wallet/mark-used`. Presentation blocked through existing lifecycle filter. No per-credential key destruction (ADR 0009).
[x] P6 Slice 1 auto single-use consumption: `MedicalCertificate` schema (`singleUse: true` in `cardSchemas.ts`); `maybeConsumeSingleUseCredential()` after OID4VP and My QR presentation success (`presentationHistory.ts`, `walletInitiatedPresentation.ts`). Transcript/ThaID/DL not auto-consumed. Spec: `docs/superpowers/specs/2026-07-13-p6-wallet-gap-closure-design.md`.
[x] P6 Slice 2 holder revoke PoP: `POST /dev/issuer/holder-revoke/nonce` + `signHolderStatusChangePop` + DEV Issuer PoP verify; Revoke skips PIN (biometric sign gate only). `holderRevokeService.ts`, `server/src/services/holderRevokePopVerifier.ts`.
[x] OID4VP same-device link intake: `openid4vp` scheme in `app.json`, `readPendingPresentationRoute` + `vpGeneration` in `deeplinkStore`, Scan dismiss/remount parity, tests in `deeplinkStore.test.ts` and `ScanScreenDeeplink.test.tsx`. Manual: `adb shell am start -a android.intent.action.VIEW -d "openid4vp://authorize?..."` after `npx expo prebuild --platform android`.
[x] ADR: single wallet-level Ed25519 key vs journey's per-credential `did:key` (P2 step 12) — accepted for v1 in `docs/adr/0009-wallet-level-holder-signing-key.md`: one Keychain Ed25519 seed; P3 rotation marks all credentials; P6 per-document key destruction deferred (lifecycle markers gate presentation instead).

### Blocked on the customer ecosystem services (external)

[ ] Trust Registry integration: wallet-side Issuer accreditation check on credential receive (P2 journey step 21) and Verifier trust check before presenting (P4 steps 6–7). Blocked: no Trust Registry service/API exists. Note: Issuer `did:web` document resolve + EdDSA signature verify on receive is implemented (`issuerDidWebVerify.ts`) when VC `iss` is `did:web:` — that is crypto verify, not Trust Registry accreditation.
[ ] DID Resolver integration: resolve Verifier public key (P4 steps 4–5) and Issuer public key for wallet-side verification. Partially overlaps the open JAR signature-verification item above; production resolution mechanism blocked on ecosystem DID method decision.
[ ] VC Status Registry checking: wallet-side credential status refresh (suspended/revoked/used) from a central registry instead of dev polling endpoints. Blocked: no registry exists; current P6 Case 2 dev polling is the stand-in.
[ ] P2 identity verification via real PID VC presentation to Issuer (journey steps 3–10): **Wallet handler shipped** (Scan OID4VP path + `EXPO_PUBLIC_ISSUER_OID4VP_*` trust env; spec `2026-07-10-p2-issuer-oid4vp-pid-auth-design.md`). E2E blocked until customer Issuer sends live `openid4vp` Authorization Request and `response_uri`. P1 ThaID interstitial remains until Issuer drives real OID4VP. Issuer-side Trust Registry + VC Status Registry checks (steps 8–17) remain peer-owned.

## Definition of Done Per Session

1. `yarn tsc --noEmit` passes.
2. `yarn lint` passes or blockers are recorded.
3. Relevant tests pass or blockers are recorded.
4. Completed checkboxes are updated.
5. Session notes below are updated.

## Active Session Notes and Blockers

### Session 2026-07-14 (Wave 1 claims/errors/msw/verifier docs)

- Added `src/services/credentials/claimFormatting.ts` and wired consumers (`credentialDisplay`, `qrIssuanceFlow`, `presentationService`, `dcqlCredentialMatch`).
- Extended `scanFriendlyErrors.ts` with Issuer OID4VP error mappings; `presentationService.ts` throws `:issuer` / `:issuer-pid` suffixes via `isIssuerOid4VpClientId` / `isIssuerOid4VpResponseUri` in `trustedVerifiers.ts`.
- MSW harness: `src/__tests__/setup/handlers/verifier.ts`, `mswServer.ts`, one opt-in test in `presentationService.test.ts`.
- Production Verifier env checklist in `docs/GETTING_STARTED.md` and `.env.example`.
- P2 step 18 (partial): Scan OID4VP Issuer PID errors surfaced; Issuer notify channel still peer-owned.

### Session 2026-07-14 (Phase 4 screen capture + route logging)

- Restored `useScreenCaptureGuard` on Home, Credential Detail, Scan, History; tester override `EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD=true`.
- Added `server/src/logging/routeError.ts` and wired auth/credentials/wallets catch blocks.
- Plan: `docs/superpowers/plans/2026-07-14-phase4-screen-capture-and-route-logging.md`.

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
- Transcript QR flow uses OID4VCI `dc+sd-jwt` and maps to `ChulalongkornUniversityTranscript`.
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
- the wallet HTML reference applied to v1 UI scope: Wallet Home, Credential Detail, Scan Holder Confirmation, My QR placeholder, and History Log now follow the new visual baseline without enabling post-v1 Verifier presentation behavior.
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
- Credential Detail now uses a direct React Native translation of `docs/ui-reference/the wallet.html` `IDCardScreen`: navy Wallet header, white rounded document card, blue document band, photo/name/primary identifier hero row, two-column detail grid, and bottom-right My QR action, while keeping values schema-driven through `readCredentialDetailDisplay()`.
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
- Added compatibility for the supplied Verifier API at `http://verifier.zenithcomp.co.th:455`: `POST /generate-vp-qr` returns an `openid4vp://` QR with `request_uri`; `GET /openid4vc/request/{id}` returns a JWT request object using DCQL for `IDCardCredential`; `POST /openid4vc/verify/{id}` accepts `vp_token` and `state`.
- Successful Verifier responses are now recorded in encrypted local presentation history and displayed in History Log. `src/config/trustedVerifiers.ts` contains the development `redirect_uri:` Verifier entry and must be replaced for production.
- Attempted to add a Sphereon OID4VP package, but the expected package name was not available from the registry in this environment; the implementation uses a narrow local service boundary under `src/services/vp/` that can be replaced or adapted when the correct library is confirmed.
- Added a development Verifier proxy for USB + PC VPN testing: matching Verifier calls are rewritten through `/dev-verifier-proxy/*` so the phone can scan Verifier QR codes even when only the PC can reach `http://verifier.zenithcomp.co.th:455`.
- Hardened Verifier submission after `Present VP is invalid`: DCQL `vp_token` is now encoded as a credential-query-id response object, Verifier error descriptions surface in Scan, JWT VP tokens include `jti`/`nbf`/`exp`, and the Wallet blocks submission when the stored ThaiNationalID format does not match the Verifier's requested DCQL format. Current known mismatch: the Issuer flow in this repo uses `IDCard_dc+sd-jwt`, while the supplied Verifier requests `jwt_vc_json`; the Verifier should request `format: "dc+sd-jwt"` with `meta.vct_values: ["IDCardCredential"]`.
- Wallet DCQL parsing now supports `meta.vct_values` for SD-JWT VC requests, so it accepts the corrected `dc+sd-jwt` Verifier request against a stored SD-JWT ThaiNationalID.
- Pivoted the first practical Verifier flow to Transcript while IDCard format is pending: the live Verifier now emits `transcript_credential` with `format: "dc+sd-jwt"` and `meta.vct_values: ["http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential"]`; the Wallet now matches that to stored `ChulalongkornUniversityTranscript` credentials.
- Fixed Transcript Verifier submission shape: DCQL `dc+sd-jwt` / `vc+sd-jwt` requests no longer wrap the credential in a signed JWT VP. They now default to SD-JWT+KB when holder binding is required and submit raw compact SD-JWT only when the Verifier explicitly sets `require_cryptographic_holder_binding: false`; Presentation Exchange requests still use the hardware-signed JWT VP token.
- Tightened DCQL SD-JWT matching: a stored credential must now match both the requested format and the requested `meta.vct_values` before the Wallet submits it. This prevents sending a Transcript issued with a different `vct` (for example Issuer `issuer.zenithcomp.co.th:455`) to a Verifier request that asks for `http://verifier.zenithcomp.co.th:455/credentials/TranscriptCredential`, which the Verifier rejects as `Present VP is invalid`.
- Added actionable Wallet diagnostics for DCQL SD-JWT metadata mismatches: the Scan error now shows the requested `vct_values` and the stored credential's actual `vct`, so Verifier configuration can be corrected without guessing.
- Added OID4VP 1.0 SD-JWT+KB presentation support: the Wallet signs a Key Binding JWT with the hardware Wallet Signing Key, includes `nonce`, `aud`, `iat`, and `sd_hash`, appends it to the presented SD-JWT, and rejects credentials that lack `cnf.jwk` holder binding or are bound to a different Wallet Signing Key.

### Session 2026-06-12

- Fixed local Verifier trust configuration for physical-device testing: `.env` now sets `EXPO_PUBLIC_VERIFIER_API_BASE_URL=http://verifier.zenithcomp.co.th:455` and `EXPO_PUBLIC_VERIFIER_NAME=Verifier API`, so the Scan tab builds a non-empty development Verifier allowlist instead of rejecting ID-card Verifier QR codes as untrusted. Restarted Metro on port 8081 after the env change; focused verifier/presentation tests pass.
- Added temporary development-only SD-JWT KB bypass for the current Verifier API, which omits `require_cryptographic_holder_binding` while test credentials lack `cnf.jwk`: `EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING=true` makes omitted holder-binding requirements behave like `false` in dev only, so the wallet submits raw compact SD-JWT. This is now superseded locally by the software EdDSA test path below; production/release behavior remains SD-JWT+KB by default.
- Added temporary development-only software Ed25519/EdDSA KB-JWT signing through `@noble/curves` for the the production verifier test path. `EXPO_PUBLIC_ENABLE_SOFTWARE_EDDSA_FOR_TESTING=true` makes OID4VP SD-JWT presentation use `alg: EdDSA` while preserving the existing hardware-backed P-256 `ES256` OID4VCI issuance path. This stores software key material in JS-accessible local metadata storage and is explicitly not release-safe.
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
- Extended OID4VP requested-item presentation labels to ChulalongkornUniversityTranscript and DLTDrivingLicence DCQL claim paths, added Driving Licence DCQL type matching, and changed the P5 age-over-20 approval row to show `อายุ` with a derived age instead of displaying date of birth.
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
- Hardened the customer OID4VP presentation approval flow without changing screen order: the first face-scan step no longer auto-completes on timeout or biometric errors, signed VP/SD-JWT+KB modes still use the Keychain Ed25519 sign-time gate, and `raw-credential` presentation mode now requires an explicit OS biometric/device approval before `direct_post` submission.

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

- Generalized the customer-specific config into extension registries: `readerProfiles.ts`, `companionTransport/` plugins (`etda-companion-v1` reference), `presentationTokenBuilders/` for OID4VP `vp_token` assembly.
- Renamed sharing mode `etda-dual-format` → `dual-format`; `etdaReaderProfiles.ts` is now a deprecated re-export shim; CBOR moved to `companionTransport/plugins/companionV1/`.
- Design spec §16 documents the prototype extension model; removed non-the customer ecosystems from out-of-scope.
- Verification: focused Jest + `yarn tsc --noEmit`.

### Session 2026-07-06 (dual-format software continuation)

- OID4VP: `buildDualFormatDcqlVpToken` assembles per-query-id `vp_token` for DCQL requests with both `dc+sd-jwt` and `mso_mdoc`; mDOC entry reads stored bytes (interim until DeviceResponse builder).
- the customer companion: `companionTransport/plugins/companionV1/`, `companionPresentation.ts` (KB-JWT with `aud=urn:etda:companion:nfc:v1`).
- Native: `EtdaCompanionHostApduService` + APDU handler (GET CAPABILITIES / BEGIN COMPANION / chaining); JS bridge via `armProximitySession`, `onCompanionSignRequested`, `supplyCompanionPresentation`.
- Verification: focused Jest + `yarn tsc --noEmit`.

### Session 2026-07-06 (the customer companion APDU spec)

- Authored [`docs/superpowers/specs/nfc-companion-apdu.md`](./superpowers/specs/nfc-companion-apdu.md): the customer AID `A00000045444410100`, INS `CA/CB/C0/FF`, CBOR capabilities + BEGIN COMPANION with 32-byte nonce, SD-JWT+KB-JWT companion (`aud=urn:etda:companion:nfc:v1`), ACR1311U-N2 host sequence.
- Added `src/services/proximity/companionTransport/plugins/companionV1/constants.ts` (pinned constants + tests). Parent HCE spec §8 now links companion doc.
- `proximityArmSession` dual-format gate updated to require companion payload size estimate (no longer blocked on missing spec doc).


- Implemented spec-backed dual-format foundation: `LogicalCredential` linking layer (`logicalCredentialStorage`, grouping, consistency), `claimDualFormatCredential` / `claimCredentialWithDualFormatSupport`, `mso_mdoc` OID4VCI response path in `exchangeService`, config (`dualFormatPolicy`, `readerProfiles`), proximity consent-first UX (`PreTapConsentPanel`, `proximityStore`, `proximityArmSession`), OID4VP dual-format readiness check (`dualFormatPresentationMatch`).
- `armProximityPresentation` derives `companionPayloadBytes` from stored SD-JWT at arm time (`companionPayloadSize.ts`). Native HCE/session crypto unchanged (ADR 0006 / stub module).
- Verification: focused Jest suites pass; `yarn tsc --noEmit` pass.

### Session 2026-07-06 (HCE dual-format spec review + approval)

- Reviewed `docs/superpowers/specs/2026-07-06-android-hce-dual-format-presentation-design-review.md` (Composer 2.5) against the spec, ADR 0003/0006, the 2026-06-23 proximity spec, and current code; confirmed major findings, rejected 2 (companion-spec restatement, state merge).
- Spec `2026-07-03-android-hce-dual-format-presentation-design.md` revised to rev 4 and marked **Approved (design-level)**: added Relationship To Prior Specs (HCE APDU supersedes BLE data leg; 2026-06-23 spec header amended), Pre-Tap Request Resolution (fixed the customer reader profile in config, consent = ceiling), Migration From Current Model (linking layer over `VerifiableCredentialRecord` + `mdocStorage`; UI/renewal/sync stay SD-JWT-keyed in v1), same-Ed25519-seed device key decision, Multipaz as leading candidate per ADR 0006, issuer configuration grouping rule, subset test-matrix case, v1 consent-screen identity fallback.
- **Remaining blockers before NFC dual-format on device:** (1) ~~native HCE APDU stack + companion handler~~ **companion PASS (2026-07-13); mDOC `org.iso.18013.5.1.mDL` PASS on ACR1311U-N2 (2026-07-16)**; (2) wire validated mDOC session into `approvePresentation` + dual-format single-tap E2E; (3) EdDSA device-authentication interop record (gates Ed25519 vs P-256 fallback in spec §5).
- Follow-up backlog from review pass (rev 4):
  - [x] the customer companion APDU spec pinned: [`nfc-companion-apdu.md`](./superpowers/specs/nfc-companion-apdu.md) + `src/services/proximity/companionTransport/plugins/companionV1/constants.ts`
  - [x] Dual-format issuance slice: `mso_mdoc` claim in `exchangeService`, `LogicalCredential` linking layer, consistency validation, `claimDualFormatCredential` / `claimCredentialWithDualFormatSupport`
  - [x] Proximity refactor to consent-first arm flow per spec §8–9 (`present.tsx` / `proximityStore`), reader profiles in `src/config/readerProfiles.ts`, policy env vars in `.env.example`
  - [x] OID4VP dual-format `vp_token` assembly (`dualFormatVpToken.ts`, `mdocVpTokenEntry.ts`, `presentationTokenBuilders/`)
  - [x] the customer companion CBOR + KB-JWT builder (`companionTransport/plugins/companionV1/`, `companionPresentation.ts`)
  - [x] Native the customer `HostApduService` skeleton + JS arm/companion bridge (`EtdaCompanionHostApduService.kt`, `armProximitySession`, `supplyCompanionPresentation`)
  - [x] After physical reader: ISO 18013-5 mDOC (`org.iso.18013.5.1.mDL`) on ACR1311U-N2 — **PASS 2026-07-16**
  - [x] Wire `approvePresentation` to native session bridge (`MdocProximityEngine`, `StoredMdocPresentationEngine` scaffold)
  - [ ] Multipaz-backed ISO 18013-5 `processApdu` + record EdDSA interop + ADR 0006 module selection
  - [ ] Full online OID4VP `DeviceResponse` builder (native module pending ADR 0006)

### Session 2026-07-08 (User Journey gap sprint — slices 1–4)

- **Slice 1:** ADR 0009 (`docs/adr/0009-wallet-level-holder-signing-key.md`) — single wallet Ed25519 key accepted for v1; per-document key destruction deferred.
- **Slice 2:** OID4VP same-device deeplink — `openid4vp` in `app.json`; `isPresentationRequestDeeplink`, `readPendingPresentationRoute`, `vpGeneration` in `deeplinkStore`; Scan dismiss/remount parity; tests pass.
- **Slice 3:** P6 Case 3 Used — `CredentialLifecycleAction` `'Used'` through `recordCredentialLifecycleAction`; `credential-used` history kind; inactive badge; dev `POST /wallet-api/dev/wallet/mark-used`.
- **Slice 4:** P6 Case 1 dev holder revoke — `POST /wallet-api/dev/issuer/holder-revoke`, `holderRevokeService`, credential detail `revokeSubmitting` phase; local revoke only after Issuer `201`; credential record retained (no key destruction). v1: no PoP — PIN flow unchanged.
- Verification: `yarn test` on touched suites pass; root `yarn tsc --noEmit` still reports pre-existing `server/src/config.test.ts` `NODE_ENV` read-only assignment (unchanged by this sprint).

### Session 2026-07-17 (History Log issuer logos)

- Implemented the approved issuer-logo slice from [`docs/superpowers/specs/2026-07-17-history-issuer-logo-design.md`](./superpowers/specs/2026-07-17-history-issuer-logo-design.md).
- History Log entries now render `thaid.png`, `dltt.png`, or `chulalongkorn.png` from card-schema metadata for the supported credential types; unknown types retain the generic icon fallback.
- Added focused `HistoryItem` coverage for all three mappings and the fallback.
- Temporary issuer names are now schema-configured for all supported types: Department of Provincial Administration, Department of Land Transport, and Chulalongkorn University. Unknown credential types may use issuer metadata or JWT `iss`; credential-configuration `display.name` remains the document name (`TranscriptCredential`).
- Verification: affected history/issuance suites pass (45 tests); root TypeScript passes; lint passes with existing repository warnings and no errors.
