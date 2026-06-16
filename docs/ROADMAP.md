# Delivery Roadmap

Original plan was a two-month, four-phase sequential plan. Phases 1-4 are now complete or substantially complete; OID4VP 1.0 online presentation (originally "post-v1, scope-only") has a working first slice; ETDA's EdDSA/Ed25519 requirement adds a new Phase 5 that gates final release. Status below reflects `docs/TASKS.md` and `AGENTS.md` as of 2026-06-15.

## Phase 1 - Cryptography, Native Integration, and Storage

Status: Complete.

Delivered:

- Hardware-backed EC P-256 Wallet Signing Key through `@animo-id/expo-secure-environment`.
- Holder DID derivation from compressed P-256 public key.
- Biometric-gated PoP JWT signing.
- Encrypted MMKV credential storage.
- Startup wiring in `app/_layout.tsx`.

Remaining risk:

- Physical device verification still required before release (carried into Phase 5 release validation).
- Production signing algorithm must move from P-256/ES256 to Ed25519/EdDSA — see Phase 5.

## Phase 2 - OID4VCI 1.0 Client-Side Integration

Status: Complete.

Delivered:

- Orval SDK generation and endpoint filtering.
- Credential offer resolution via `@sphereon/oid4vci-client` (`CredentialOfferClient`, `CredentialRequestClientBuilder`), with a custom proxy-aware Pre-Authorized Code token exchange for VPN/physical-device testing.
- OID4VCI 1.0 Pre-Authorized Code acquisition, including `credential_offer_uri` by-reference resolution.
- JWT VC, SD-JWT VC, `dc+sd-jwt`, and `vc+sd-jwt` compact credential normalization.
- Encrypted local save before backend sync.
- Separate `syncCredentialToBackend()` with explicit `walletId` and `sessionToken`.

Deferred:

- Authorization Code flow (Pre-Authorized Code only, per Phase 2.3 decision).
- Issuer signature validation against finalized trust metadata (Phase 4 backlog item).
- Deferred Credential Issuance (`transaction_id`) and `c_nonce` retry-on-`invalid_proof` — see `docs/SPEC_COMPLIANCE_OID4VC.md`.

## Phase 3 - Config-Driven UI Mapping and Workflow Wiring

Status: Substantially complete.

Delivered:

- Wallet home tab translated from `docs/ui-reference/home.html`, then re-translated to the `ETDA Wallet.html` reference for Wallet Home, Credential Detail, Scan, My QR, and History Log.
- Bottom tab shell: Wallet, My QR, Scan, History Log.
- Dynamic `CardSchemaConfig` format in `src/config/cardSchemas.ts`, covering ThaID, DLT Driving Licence, and Bangkok University Transcript.
- Generic `CredentialCard` / config-driven detail and summary rendering (`readCredentialSummaryDisplay`, `readCredentialDetailDisplay`).
- Stored credential hook (`useStoredCredentials`) with explicit `storage-not-ready` state.
- QR scanner using `expo-camera`, with resolve → Holder Confirmation (data preview) → confirm → save flow.
- P1 PID VC bootstrap flow: `idcard` → `ThaiNationalID` mapping, `hasPidCredential()` guard, ThaID-first gating on Scan and request rows, ThaID verification interstitial, Holder Confirmation, and post-save success screen.
- History Log lists issuance and OID4VP presentation events with issuer icon, document type, Thai date/time, and status badge.
- P6 Case 1 Transcript revoke/delete lifecycle: Wallet PIN-gated revoke action, local lifecycle status/history, Wallet Home unavailable-document panel.

Remaining:

- NFC NDEF issuance reader, deferred until a test device is available.
- Localization and error-state polish beyond the documented user journeys.

## Phase 4 - Security Hardening and Release

Status: Substantially complete; release validation blocked on physical devices.

Delivered:

- Screen capture prevention was implemented via focus-scoped `useScreenCaptureGuard()`, then temporarily removed from all screens for tester builds (re-enable before release).
- Certificate pinning: backend-only, opt-in via `EXPO_PUBLIC_WALLET_API_PINNED_CERTS`, with a startup hard-block for non-development builds shipping plain HTTP or empty pins (ADR 0005).
- Jailbreak/root detection via `jail-monkey`, hard block at startup with no bypass (ADR 0004).
- ISO 18013-5 mdoc native module selection criteria (ADR 0006); final module choice still blocked on physical iOS/Android validation.
- Production bundle/log scan for credential data leaks (`yarn scan:bundle-leaks`).
- Local development backend hardening: rate-limited auth routes, required non-default `JWT_SECRET` outside tests, restricted CORS, HS256-pinned JWT verification, dummy bcrypt comparison for unknown logins.

Remaining:

- Re-enable screen capture prevention before release.
- Issuer signature validation once the trusted issuer registry / trust-list source is decided.
- Final ISO 18013-5 mdoc native module selection ADR after physical-device validation.
- EAS production builds for iOS and Android, then a physical-device golden-path walkthrough. Manual blocker: user-held EAS credentials, physical iOS device, physical Android device, and a real or test Issuer QR issuance source.
- Both items above are sequenced **after** Phase 5 (EdDSA migration), since current credentials/holder-binding must be reissued under the new signing key before a meaningful golden-path walkthrough.

## Phase 5 - ETDA EdDSA/Ed25519 Migration (new)

Status: Android implementation wired; target-device validation pending.

Why: ETDA requires `alg: EdDSA` (Ed25519) for both the OID4VCI PoP JWT and the OID4VP SD-JWT+KB presentation token. Android app code now signs those tokens through the local native Ed25519 module `EtdaWalletEddsa`; physical target-device validation is still required to prove AndroidKeyStore Ed25519 key generation reports TEE or StrongBox backing. iOS remains deferred because Secure Enclave does not support Ed25519.

Remaining:

- Run Android prebuild/build and physical target-device validation for `EtdaWalletEddsa`.
- Reissue existing test credentials under the new PoP holder binding before re-running OID4VP Verifier checks.
- Resolve iOS Ed25519 in a separate ADR before any iOS release target.

## OID4VP 1.0 Online Presentation

Status: First slice implemented (no longer "scope-only, not scheduled").

Resolved:

- Query language: DCQL (Presentation Exchange retained only for the P5 birth-date slice).
- Response mode: `direct_post`, cross-device QR Authorization Request.
- Verifier trust model: local allowlist matching `client_id` + `response_uri` origin; current entry uses development `redirect_uri:` scheme.
- First claim scopes: ThaiNationalID birth-date disclosure (Presentation Exchange) and Transcript `dc+sd-jwt` DCQL disclosure.
- `vp_token` signing reuses the hardware Wallet Signing Key (`src/services/crypto`); SD-JWT+KB holder binding enforced.
- Biometric sign-time gate applies; presentation runs device-to-Verifier directly with no company backend proxy.
- Successful presentations recorded in encrypted local history and shown in History Log / Wallet Home badges.

Remaining (see `docs/SPEC_COMPLIANCE_OID4VC.md` for spec-level detail):

- Replace the development `redirect_uri:` Verifier entry with registered production `did:web` Verifier(s), including signed Request Object (JAR) signature verification and `client_id_scheme`-aware trust handling.
- Validate native EdDSA SD-JWT+KB signing on target Android hardware (Phase 5).
- `presentation_definition_uri` and DCQL `credential_sets` support, if a Verifier requires them.
- Broader claim sets only after trust and disclosure semantics are documented.
