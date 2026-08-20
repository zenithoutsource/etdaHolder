# Frontend CODEMAP

Open this file first when you cannot find a Wallet screen, panel, or Holder-facing string. File-top comments in `app/`, `src/screens/`, and `src/components/` are the in-repo shortcut and point back here.

English only in this map and in code comments. Thai belongs in UI strings / copy configs. Protocol internals stay in [docs/ARCHITECTURE.md](../ARCHITECTURE.md) §3 (channel matrix). Do not add walkthrough comments next to obvious JSX or `setState`.

Journey canvases (Cursor project `canvases/`): `p1-sequence-check`, `p2-sequence-check`, `p3-key-rotation-sequence-check`, `p4-vp-presentation-sequence-check`, `p5-vp-verification-audit`, `p6-revocation-status-sequence-check`.

## Copy and layout

Where to change text vs card chrome. Inline exceptions are listed per screen.

| Concern | File |
|---|---|
| Field labels, card titles, issuance confirmation, disclosure labels | [src/config/cardSchemas.ts](../../src/config/cardSchemas.ts) |
| Home / PID-gate / My QR / key-expiry strings | [src/services/credentials/walletHomeCopy.ts](../../src/services/credentials/walletHomeCopy.ts) |
| History row / event display names | [src/config/historyDisplayNames.ts](../../src/config/historyDisplayNames.ts) |
| History success copy (including NFC result wrapper) | [src/config/walletHistoryCopy.ts](../../src/config/walletHistoryCopy.ts) |
| Issuer-requested PID presentation copy | [src/config/issuerPidPresentationCopy.ts](../../src/config/issuerPidPresentationCopy.ts) |
| Colors | [src/config/themeColors.ts](../../src/config/themeColors.ts) |
| NFC pre-tap disclosure set | [src/config/readerProfiles.ts](../../src/config/readerProfiles.ts) |
| Display helpers (claim → label/value; issuer-first holder profile, PID fills gaps) | [src/services/credentials/credentialDisplay.ts](../../src/services/credentials/credentialDisplay.ts) (`resolveDisplayHolderProfile`) |
| DL/transcript card English mock | [src/config/drivingLicenceSample.ts](../../src/config/drivingLicenceSample.ts) (`MOCK_HOLDER_ENGLISH_NAME`) |

**Inline exceptions (not extracted):** NFC waiting copy in [WaitingForTapPanel.tsx](../../src/components/proximity/WaitingForTapPanel.tsx); several Scan/Auth/OID4VP panel strings still live in the component.

## Wallet

Tab: [app/(tabs)/index.tsx](../../app/(tabs)/index.tsx). Hidden detail: [app/(tabs)/credential/[id].tsx](../../app/(tabs)/credential/[id].tsx).

**Panels / cards:** [WalletHeader](../../src/components/WalletHeader.tsx), [WalletCredentialSummaryCard](../../src/components/WalletCredentialSummaryCard.tsx) / `WalletEmptyCredentialCard`, [WalletDocumentMenuItem](../../src/components/WalletDocumentMenuItem.tsx), [CredentialDocumentDetailCard](../../src/components/CredentialDocumentDetailCard.tsx), [DrivingLicenceDocumentCard](../../src/components/DrivingLicenceDocumentCard.tsx), [DocumentCardLayout](../../src/components/DocumentCardLayout.tsx) + compact [DocumentCardDetailValue](../../src/components/DocumentCardDetailValue.tsx) (ID / transcript / driving licence), [CredentialActionMenu](../../src/components/CredentialActionMenu.tsx), [VpQrModal](../../src/components/VpQrModal.tsx), [WalletKeyExpiredActionPanel](../../src/components/WalletKeyExpiredActionPanel.tsx).

**Copy / layout:** `WALLET_HOME_COPY`; field chrome in `cardSchemas.ts`.

**Steps**

1. Home lists stored credentials (hero summary + document rows) with request / renew / reissue CTAs.
2. Card or row press opens credential detail.
3. Detail: view document; My QR modal (hidden when this document is expired); NFC present → `#present-and-nfc`; receive / portal **ขอเอกสารใหม่** for expired or leftover-key cards; revoke/delete via action menu (PIN/biometric then approve). P3 **ขอเอกสาร** is Home expand only.
4. Revoke/delete success → History with `filter=lifecycle`.

**Canvas:** P1 home; P3 expiry / wallet-key banners; P6 inactive split, revoke, delete.

**Gotchas**

- Home prefers the renewed-active card when old + new coexist. Split rows (icon/label → detail, chevron-down → expand) for issuer-suspended, revoked, document-expired, leftover Ed25519 hardware-reissue, and P3 Inactive (`renewal-required` / `renewal-processing` / `cleanup-pending` / `old-revoked`). Expand a11y is `ขยายเอกสาร` / `ย่อเอกสาร`, not ถูกระงับ-only. NFC / My QR / revoke / delete are **not** on home — they live on detail. P3-6 cleanup does **not** pause that card’s hardware `k_cred` TTL (`createdAt` at bind/claim). OID4VP uses [`filterPresentableCredentials`](../../src/services/credentials/credentialLifecycle.ts), which excludes TTL-elapsed keys even while storage is still `renewed-active`. Badge is **หมดอายุ** immediately; pairing stays until old-VC delete. Silent old-VC renewal OID4VP is unchanged.
- Hardware P3 **ขอเอกสาร** (`WALLET_HOME_COPY.requestCredential`) is Home expand only; credential detail does not show it. It appears only while the VC is still valid as a document. Badge is **หมดอายุ** (not English Inactive). Calendar warning window uses **ใกล้หมดอายุ** even if leftover P3 `renewal-required` is present. Document-expired and leftover Ed25519 use **ขอเอกสารใหม่** (`requestNewCredential`) via issuer portal Fresh reissue (`requestCredentialViaPortalFlow`) — same Home expand as P6 revoke, not `submitRenewalRequest`. Leftover `renewal-required` must not hide that CTA. In-flight P3 (`renewal-processing` / `cleanup-pending` / `old-revoked`) still wins over expiry. Wallet-wide P3-1 is hidden when hardware P-256 or crypto v2 is on. Detail still has **ขอเอกสารใหม่** for expired / hardware-reissue-required so opening the card is not a dead end.
- Inactive **ขอเอกสาร** (`WALLET_HOME_COPY.requestCredential`) on Home expand is P3 intake: mint pending hardware `k_cred`, then issuer portal (`requestCredentialViaPortalFlow`) or Scan. Home does **not** POST `/wallet-api/dev/wallet/renewal-request`. The card stays `renewal-required` (not `renewal-processing`) so the stub status poller does not run. Portal dismiss / empty offer / PID block discards the pending key. Same-type claim reuses that pending key and pairs old `cleanup-pending` / new `renewed-active`. Silent old-VC OID4VP stays peer until a working renewal-request API exists. Mint failures still use [`renewalRequestFailureUi`](../../src/services/credentials/renewalRequestFailureUi.ts). Document-expired and leftover Ed25519 stay portal **ขอเอกสารใหม่**.
- Slice B is not on Home. The runner is [runHardwareEcdsaSliceBChecklist](../../src/services/crypto/hardwareEcdsaDiagnostics.ts). Claim / startup do **not** log `slice-b-checklist-complete`. Metro tag is `[wallet:hardware-ecdsa]`, not `[hardware-ecdsa]`.
- PID gate before present, My QR, or portal Fresh reissue on detail ([credentialGuard](../../src/services/credentials/credentialGuard.ts) / [pidGateDialog](../../src/services/credentials/pidGateDialog.ts)). Hardware P3 **ขอเอกสาร** of another card is not blocked by PID `renewal-required`.
- Detail phases: `detail` | `issuerAck` | `renewalProcessing` | `revokeSubmitting` | `security` | `approve`. Focus reset clears the session.
- Holder names **and birth date** on DL cards (detail, receive preview, OID4VP info) use the **issuer’s own claims** first via `resolveDisplayHolderProfile`. Stored PID fills a field only when that document omitted it. Driving-licence and transcript **English name** on the card is the mock `MOCK_HOLDER_ENGLISH_NAME` (`Ms. Thodsopp Eekkasandigital`). Transcript cards hide birth date. OID4VP consent/info disclosure **values** keep the issuer string when present (`overlayPresentationDisclosureValue`); empty name fields fall back to PID. VP tokens still send document claims. PID religion is hidden (ThaID does not send it). Driving-licence left column shows **เลขที่ใบอนุญาต** above **ประเภทยานพาหนะ**; vehicle type maps ISO `B` to Thai/English labels on the card; the VP token still sends the raw claim.

## Scan and issuance

Tab: [app/(tabs)/scan.tsx](../../app/(tabs)/scan.tsx). Hidden offer route: [app/(tabs)/credential-offer.tsx](../../app/(tabs)/credential-offer.tsx) → [CredentialOfferClaimScreen.tsx](../../src/screens/CredentialOfferClaimScreen.tsx).

Same-device portal return: [app/callback.tsx](../../app/callback.tsx), rewrite hook [app/+native-intent.tsx](../../app/+native-intent.tsx). Intake store: [deeplinkStore.ts](../../src/store/deeplinkStore.ts).

**Panels:** [ScanCameraPermissionPanel](../../src/components/ScanCameraPermissionPanel.tsx), [ScanCaptureSurface](../../src/components/ScanCaptureSurface.tsx), [ThaiIdSuccessConfirmationPanel](../../src/components/ThaiIdSuccessConfirmationPanel.tsx) → [IssuanceTrustConfirmationPanel](../../src/components/IssuanceTrustConfirmationPanel.tsx), [ThaiIdReceivePanel](../../src/components/ThaiIdReceivePanel.tsx) / [DrivingLicencePreviewPanel](../../src/components/DrivingLicencePreviewPanel.tsx) / [TranscriptPreviewPanel](../../src/components/TranscriptPreviewPanel.tsx) (shared [CredentialReceiveCardPanel](../../src/components/CredentialReceiveCardPanel.tsx) → same `CredentialDocumentDetailCard` as detail; no My QR/NFC), [ScanSuccessPanel](../../src/components/ScanSuccessPanel.tsx). One component per issuance phase — do not merge them.

**Copy / layout:** `cardSchemas` issuance confirmation; `WALLET_HOME_COPY` for PID-gate; camera permission copy is inline Thai in `ScanCameraPermissionPanel`; Scan errors often inline English.

**Steps**

1. Scan QR: OID4VCI offer → `credential-offer`; OID4VP request → `#oid4vp-request`. A P3 `renewal-required` card with a pending key reuses that key on same-type claim, then pairs cleanup.
2. Claim screen: resolve offer → optional auth-code portal / `tx_code` → DOPA confirm (PID) → preview → issuer confirm (DL/transcript) → save → success.
3. Portal return lands on `/callback` (native-intent rewrite), then claim or VP.

**Canvas:** P1 issuance.

**Gotchas**

- Explicit Scan reopen of a dismissed URI is a user action — clear `dismissedUri` before re-queue ([scan.tsx](../../app/(tabs)/scan.tsx)). Replay-consumed VP is ignored + intake notify.
- Dual URL intake: `Linking.useURL` + `getInitialURL`; callback also merges `useLocalSearchParams` (Android Custom Tabs can stale Linking).
- Claim screen uses pending/active/dismissed deeplink state plus a missing-offer grace; PID gate blocks non-PID offers until PID exists. P3 Home **ขอเอกสาร** can finish via Scan; dismissing the portal discards the pending key, and Scan then mints at claim before pairing.
- After claim **success**, the offer URI is dismissed immediately and the same-device session is cleared. Header / Android Back leaves to Wallet home — it must not restore DOPA confirm, preview, or a consumed offer. Remount of a dismissed offer must not call `resolveOffer` again.
- A consumed-offer DOPA confirm keeps fail-closed issuer auth (`toFriendlyError`). Show that error panel; do not hide it behind “Opening Credential Offer” when the pending URI is the same offer that just failed.

## My QR

Tab: [app/(tabs)/qr.tsx](../../app/(tabs)/qr.tsx).

**Panels / hook:** [MyQrPidGatePanel](../../src/components/MyQrPidGatePanel.tsx), [WalletInitiatedVpQrPanel](../../src/components/WalletInitiatedVpQrPanel.tsx), [useWalletInitiatedVpQrSession.ts](../../src/hooks/useWalletInitiatedVpQrSession.ts). When the verifier posts a request, the same tab switches to [Oid4VpDisclosureFlow](../../src/components/Oid4VpDisclosureFlow.tsx). Detail-card My QR uses [VpQrModal](../../src/components/VpQrModal.tsx) (same hook/panel) and routes here when the request is ready.

**Copy:** `WALLET_HOME_COPY` (`myQr*`, including `myQrPidGateReason` / `myQrPidGateNote`); PID-gate titles via `readPidGateUserCopy(..., 'present')`.

**Steps**

1. Idle / loading → waiting_scan (QR + timer) → request_ready → disclosure flow, or expired / error.
2. Missing PID: hide the My QR title; [MyQrPidGatePanel](../../src/components/MyQrPidGatePanel.tsx) + request-PID portal CTA.

**Canvas:** P4 wallet-initiated presentation.

**Gotchas**

- Dual UI on one route: QR panel vs full disclosure. Session runs only when the tab is focused, storage is ready, and PID is ready (or `brokerSessionId` resume).
- Hook phases: `idle` | `loading` | `waiting_scan` | `request_ready` | `expired` | `error`. Poll interval 2s.

## OID4VP request

Hidden route: [app/(tabs)/presentation-request.tsx](../../app/(tabs)/presentation-request.tsx) remounts [PresentationRequestScreen.tsx](../../src/screens/PresentationRequestScreen.tsx) on `vpGeneration`.

**Orchestrator:** [Oid4VpDisclosureFlow.tsx](../../src/components/Oid4VpDisclosureFlow.tsx).

**Panels:** [FacePreparePanel](../../src/components/FacePreparePanel.tsx), [IssuerPidPresentationPanel](../../src/components/IssuerPidPresentationPanel.tsx), [PresentationConsentPanel](../../src/components/PresentationConsentPanel.tsx), [PresentationInfoPanel](../../src/components/PresentationInfoPanel.tsx) (same document card as wallet detail + device + PoP + requested items; Thai and English names from PID overlay), [PresentationFailurePanel](../../src/components/PresentationFailurePanel.tsx), [PresentationResultPanel](../../src/components/PresentationResultPanel.tsx) → [PresentationSuccessPanel](../../src/components/PresentationSuccessPanel.tsx). Chrome: [PresentationStepScaffold](../../src/components/PresentationStepScaffold.tsx).

**Copy:** `issuerPidPresentationCopy`; disclosure labels in `cardSchemas`; consent party + hero icons in [presentationVerifierMocks.ts](../../src/config/presentationVerifierMocks.ts); failure kinds in [presentationFailureUi.ts](../../src/services/vp/presentationFailureUi.ts).

**Steps** (`FlowPhase` tags)

1. `resolving`
2. `facePrepare` **or** `issuerPidConsent` (issuer PID) **or** `consent`
3. `info` (review then submit)
4. `success` | `failure` | `error`

**Canvas:** P4 Verifier QR; P5 audit/history on success.

**Gotchas**

- Prefers pending URI over active; dismissed redelivery grace; remount recovery. Replay-consumed exits with intake notify — do not flash loading for a stale dismissed URI.
- `key={vpGeneration}` on the screen forces a clean state for a new request.
- One biometric prompt on the sign path (approve/submit) — do not add a second app-level biometric in front of it.
- After presentation **success**, consume/dismiss the VP URI immediately. Header / Android Back leaves to Wallet (`onCancel`) and must not open DOPA / credential-offer. **เสร็จสิ้น** (`onDone`) may resume an in-progress same-device claim after issuer PID VP.
- Driving-licence DCQL may use Thai-ID-style paths (`full_name`, `license_type`, `photo`). Schema aliases / `matchAliases` map those to ISO/wallet claims (`given_name`+`family_name`, `licenceClass`, `portrait`) so consent shows **ชื่อ-นามสกุล**, **ประเภทใบอนุญาต**, **รูปถ่าย** instead of **ข้อมูลที่ร้องขอ**. OID4VP info uses `CredentialDocumentDetailCard` for every type. DL/transcript **English** on that card is `MOCK_HOLDER_ENGLISH_NAME`; transcript hides birth date. Consent and requested-item **values** keep issuer strings; empty name fields fall back to PID. VP wire stays the document claims. Driving-licence vehicle type on that card maps `B`; the VP wire value stays the issuer claim.
- Holder-facing consent and info requested-item lists (`readConsentItems` / `prepareHolderFacingDisclosureItems`) hide **ศาสนา / religion** even if the verifier asked for it. Schema `religion` stays for matching; `readInitialSelectedClaimKeys` still includes it so the VP token can send the claim. Driving-licence lists that show **ชื่อ** and **นามสกุล** as separate rows put given name above family name (display only; submit keys keep match order). NFC [PreTapConsentPanel](../../src/components/proximity/PreTapConsentPanel.tsx) uses the same helper.

## Present and NFC

Hidden route: [app/(tabs)/present.tsx](../../app/(tabs)/present.tsx). Opened from credential detail (`credentialId` param). Store: [proximityStore.ts](../../src/store/proximityStore.ts).

**Panels:** [PreTapConsentPanel](../../src/components/proximity/PreTapConsentPanel.tsx) → [WaitingForTapPanel](../../src/components/proximity/WaitingForTapPanel.tsx) → [proximity/PresentationResultPanel](../../src/components/proximity/PresentationResultPanel.tsx). Older unused: [proximity/ConsentPanel](../../src/components/proximity/ConsentPanel.tsx), [ProximityPresentButton](../../src/components/proximity/ProximityPresentButton.tsx).

**Copy / layout:** reader profile fields; `cardSchemas` disclosure labels; consent hero icon from `presentationVerifierMocks` by `documentType`; **waiting copy is inline Thai** in `WaitingForTapPanel`. Result wrapper uses `WALLET_HISTORY_COPY`.

**Steps** (`proximityStore.status`)

1. `idle` → open presentation when mdoc is stored
2. `awaiting-consent` → pre-tap consent (fixed reader-profile fields, no toggles)
3. `approved` → waiting (preparing)
4. `hce-armed` / `engaged` → waiting (hold on reader)
5. `complete` → result; `error` / blocked (expired, hardware reissue, PID, no mdoc)

**Canvas:** P4 proximity; spec [2026-08-17-mdl-nfc-static-handover-tap-only-design.md](../superpowers/specs/2026-08-17-mdl-nfc-static-handover-tap-only-design.md). Channel matrix: ARCHITECTURE §3.

**Gotchas**

- Tap-only static NFC handover — Waiting for tap shows **no** holder QR.
- Ensure native mdoc is stored before arming; reset the proximity store on unmount; HCE arm window from `HCE_ARM_WINDOW_MS` ([dualFormatPolicy](../../src/config/dualFormatPolicy.ts)).
- NFC DeviceResponse **session overlay**: at arm/presentment, PID Thai `given_name` / `family_name` overlay ISO mDL names **only when those fields are missing** on the presenting document (`displayNameOverlay` → Kotlin `MdocDisplayNameOverlay`). If the issuer already sent names, the stored mdoc values go on the wire. Stored mdoc is never rewritten. Logs `fieldCount` only (no PII). Overlaying missing names still means `issuerAuth` / MSO digests will not match those items — the lab extractor does not verify; production ISO verifiers that check MSO would reject.
- Pre-tap consent hides **ศาสนา / religion** if a reader profile lists it, and shows **ชื่อ** above **นามสกุล** when those are separate rows. Display only; the mdoc field set sent on tap is still the reader profile.

## History

Tab: [app/(tabs)/history.tsx](../../app/(tabs)/history.tsx). Hidden detail: [app/(tabs)/history-event/[id].tsx](../../app/(tabs)/history-event/[id].tsx).

**Panels:** [HistoryFilterChips](../../src/components/HistoryFilterChips.tsx), [HistoryItem](../../src/components/HistoryItem.tsx), [HistoryEmptyState](../../src/components/HistoryEmptyState.tsx), [HistoryEventDetailPanel](../../src/components/HistoryEventDetailPanel.tsx).

**Copy:** `historyDisplayNames`, `walletHistoryCopy`; list projection [walletHistory.ts](../../src/services/history/walletHistory.ts). Filters: [walletHistoryFilters.ts](../../src/services/history/walletHistoryFilters.ts).

**Steps**

1. List with chips (`issuance` | `presentation` | `lifecycle`). Missing/invalid `?filter=` defaults to issuance (รับเอกสาร).
2. Row → event detail. Hide → replace History with a kind-derived filter.

**Canvas:** P5 presentation audit; P6 lifecycle events.

**Gotchas**

- Revoke / delete / used push History with `filter=lifecycle` (จัดการเอกสาร).
- ISO mdoc keys map to Thai `presentationLabel`s on read; protocol field keys stay namespaced.

## Auth and PIN

| Route | File | UI |
|---|---|---|
| Auth wizard | [app/auth.tsx](../../app/auth.tsx) | [AuthWizard](../../src/components/auth/AuthWizard.tsx) |
| Legacy aliases | [app/login.tsx](../../app/login.tsx), [app/register.tsx](../../app/register.tsx) | Redirect → `/auth` |
| Forgot PIN | [app/forgot-pin.tsx](../../app/forgot-pin.tsx) | [ForgotPinFlow](../../src/components/auth/ForgotPinFlow.tsx) (WalletHeader; OTP OS keyboard padded above the pad) |
| First PIN | [app/pin-setup.tsx](../../app/pin-setup.tsx) | [PinEntrySurface](../../src/components/PinEntrySurface.tsx) |
| Resume unlock | [app/pin-lock.tsx](../../app/pin-lock.tsx) | [PinUnlockPrompt](../../src/components/PinUnlockPrompt.tsx) |

Startup overlays in [app/_layout.tsx](../../app/_layout.tsx): [StoragePinMigrationStep](../../src/components/auth/StoragePinMigrationStep.tsx) (WalletHeader + white card; biometric then PIN keypad below the card), `ForgotPinFlow`, [StartupStoragePinUnlock](../../src/components/StartupStoragePinUnlock.tsx).

**Copy:** mostly inline in auth components; PIN length `PIN_ENTRY_LENGTH`.

**Steps**

1. Register/login wizard → pin-setup (first time) or tabs.
2. Cold start / idle grace → pin-lock (PIN and/or biometric).
3. After unlock, pending offer/VP is routed; forgot PIN logs out to `/auth` and keeps on-device documents (new PIN, then sign in again).

**Gotchas**

- Access redirect: `/auth` | `/pin-setup` | `/pin-lock` | tabs ([walletPinNavigation](../../src/services/auth/walletPinNavigation.ts)).
- Pin-lock: skip consumed VP; deferred `setWalletPin` after unlock; 15s biometric timeout.
- Forgot PIN OTP uses the OS number pad; `ForgotPinFlow` adds keyboard-height `paddingBottom` so the six boxes stay above the pad on Android edge-to-edge. Do not change global `softwareKeyboardLayoutMode`.
- Forgot PIN does **not** wipe credential MMKV. Startup complete is `completeForgotPinRecovery` (logout + `/auth` only). Confirm writes PIN meta even when credential MMKV is still locked. `hasWalletPin()` must not throw `StorageNotInitialized` — RootLayout reads it on the first render after logout.
- There is no `src/screens/PinLockScreen.tsx` — the route file is the screen (`PinLockScreen.test.tsx` imports `app/pin-lock.tsx`).

## Global hosts

[app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx) mounts:

- [WalletKeyExpiryHost](../../src/components/WalletKeyExpiryHost.tsx) → [WalletKeyExpiredModal](../../src/components/WalletKeyExpiredModal.tsx) (wallet-wide P3-1; hidden when hardware P-256 or crypto v2)
- [CredentialExpiryHost](../../src/components/CredentialExpiryHost.tsx) (null UI; [useCredentialExpiryWatch](../../src/hooks/useCredentialExpiryWatch.ts) also syncs per-credential `k_cred` TTL via [credentialKeyExpiry.ts](../../src/services/credentials/credentialKeyExpiry.ts))
- [PresentationIntakeErrorHost](../../src/components/PresentationIntakeErrorHost.tsx) (dialog from `deeplinkStore.presentationIntakeError`)

Root [app/_layout.tsx](../../app/_layout.tsx): [StartupLoadingPanel](../../src/components/StartupLoadingPanel.tsx) (app logo + indeterminate bar) during `loading`; PIN/storage gates; deeplink intake; Stack (`(tabs)`, auth, PIN, callback). Web skips native crypto/storage imports. Native splash uses `assets/images/icon.png` (next native/EAS build).

Visible tabs: Wallet, My QR, Scan, History Log. Hidden (`href: null`): `present`, `credential-offer`, `presentation-request`, `credential/[id]`, `history-event/[id]`.

## App route index

Every `app/` route belongs to a section above.

| File | Section |
|---|---|
| [app/_layout.tsx](../../app/_layout.tsx) | Global hosts |
| [app/+native-intent.tsx](../../app/+native-intent.tsx) | Scan and issuance |
| [app/callback.tsx](../../app/callback.tsx) | Scan and issuance |
| [app/auth.tsx](../../app/auth.tsx), [login.tsx](../../app/login.tsx), [register.tsx](../../app/register.tsx) | Auth and PIN |
| [app/forgot-pin.tsx](../../app/forgot-pin.tsx), [pin-setup.tsx](../../app/pin-setup.tsx), [pin-lock.tsx](../../app/pin-lock.tsx) | Auth and PIN |
| [app/(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx) | Global hosts |
| [app/(tabs)/index.tsx](../../app/(tabs)/index.tsx), [credential/[id].tsx](../../app/(tabs)/credential/[id].tsx) | Wallet |
| [app/(tabs)/scan.tsx](../../app/(tabs)/scan.tsx), [credential-offer.tsx](../../app/(tabs)/credential-offer.tsx) | Scan and issuance |
| [app/(tabs)/qr.tsx](../../app/(tabs)/qr.tsx) | My QR |
| [app/(tabs)/presentation-request.tsx](../../app/(tabs)/presentation-request.tsx) | OID4VP request |
| [app/(tabs)/present.tsx](../../app/(tabs)/present.tsx) | Present and NFC |
| [app/(tabs)/history.tsx](../../app/(tabs)/history.tsx), [history-event/[id].tsx](../../app/(tabs)/history-event/[id].tsx) | History |

## Unwired components

Present in `src/components/` but not imported by current screens (keep headers; do not delete here): `CredentialCard`, `CredentialRenewalCleanupBanner`, `IssuerSuspensionAckOverlay`, `proximity/ConsentPanel`, `proximity/ProximityPresentButton`.
