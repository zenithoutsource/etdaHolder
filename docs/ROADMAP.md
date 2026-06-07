# Delivery Roadmap

Two-month plan. Four phases. Each phase is two weeks. Phases run sequentially; each output is the input gate for the next.

## Phase 1 - Cryptography, Native Integration, and Storage

Status: Complete.

Delivered:

- Hardware-backed EC P-256 Wallet Signing Key through `@animo-id/expo-secure-environment`.
- Holder DID derivation from compressed P-256 public key.
- Biometric-gated PoP JWT signing.
- Encrypted MMKV credential storage.
- Startup wiring in `app/_layout.tsx`.

Remaining risk:

- Physical device verification is still required before release.

## Phase 2 - OID4VCI 1.0 Client-Side Integration

Status: Complete.

Delivered:

- Orval SDK generation and endpoint filtering.
- Credential offer resolution through `@sphereon/oid4vci-client`.
- OID4VCI 1.0 Pre-Authorized Code acquisition.
- JWT VC, SD-JWT VC, `dc+sd-jwt`, and `vc+sd-jwt` compact credential normalization.
- Encrypted local save before backend sync.
- Separate `syncCredentialToBackend()` with explicit `walletId` and `sessionToken`.

Deferred:

- Authorization Code flow.
- Issuer signature validation against finalized trust metadata.

## Phase 3 - Config-Driven UI Mapping and Workflow Wiring

Status: In progress.

Delivered:

- Wallet home tab translated from `docs/ui-reference/home.html`.
- Bottom tab shell: Wallet, My QR, Scan, History Log.
- Dynamic `CardSchemaConfig` format in `src/config/cardSchemas.ts`.
- Initial schemas for ThaID, DLT Driving Licence, and Bangkok University Transcript.
- Generic `CredentialCard` component.
- Stored credential hook and credential detail route.
- QR scanner using `expo-camera`.
- QR pre-save confirmation screen showing issuer/config-derived claims.
- Transcript display fallback when no ID card exists.

Remaining:

- Fix remaining corrupted UI labels in scanner confirmation screen.
- Add NFC NDEF issuance reader after device testing is available.
- Improve workflow error states and localization.
- Add broader component and scanner tests if test tooling supports it.

## Phase 4 - Security Hardening and Release

Status: Not started.

Planned:

- Screen capture prevention.
- Certificate pinning decision and implementation if required by threat model.
- Jailbreak/root detection.
- Issuer signature validation once trust metadata is finalized.
- ISO 18013-5 mdoc native module selection ADR and integration.
- Release build validation for iOS TestFlight and Android internal track.
- Production log audit for PII and credential payload leakage.
- Physical-device manual scenarios for credential acquisition, biometric cancellation, persistence, and backend sync failure.

## Post-v1 - OID4VP 1.0 Online Presentation

Status: Scope-only, not scheduled.

Open decisions:

- OID4VP 1.0 library.
- Query language: DCQL vs Presentation Exchange.
- `client_id` scheme and Verifier trust model.
- Same-device redirect vs cross-device request URI and QR.
- Response mode.

Fixed constraints:

- `vp_token` signing reuses the hardware Wallet Signing Key through `src/services/crypto`.
- Biometric sign-time gate applies.
- Presentation runs device-to-Verifier directly with no company backend proxy.
