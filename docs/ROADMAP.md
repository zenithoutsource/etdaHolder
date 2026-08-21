# Delivery Roadmap

Original plan was a two-month, four-phase sequential delivery. Phases 1–4 and the EdDSA migration (Phase 5) are complete or substantially complete; OID4VP 1.0 online presentation and proximity work continue on `dev`. Status below reflects `docs/TASKS.md` as of **2026-08-07**.

## Phase 1 - Cryptography, Native Integration, and Storage

Status: **Complete** (superseded at the signing layer by Phase 5 / ADR 0008).

Delivered:

- Encrypted MMKV credential storage with Keychain-held encryption key.
- Biometric-gated signing path and Holder DID derivation.
- Startup wiring in `app/_layout.tsx`.

Note: initial P-256 hardware path (`@animo-id/expo-secure-environment`) was replaced by Keychain-protected Ed25519 (ADR 0008). Per-credential keys added in ADR 0010.

## Phase 2 - OID4VCI 1.0 Client-Side Integration

Status: **Complete**.

Delivered:

- Orval SDK generation and endpoint filtering.
- Credential offer resolution via `@openid4vc/openid4vci` (`src/services/vci/oid4vc/`).
- OID4VCI 1.0 Pre-Authorized Code acquisition, including `credential_offer_uri` by-reference resolution.
- Deferred credential issuance (§8.4) with `pollDeferredCredential()`.
- JWT VC, SD-JWT VC, `dc+sd-jwt`, and `mso_mdoc` normalization.
- Encrypted local save before backend sync; separate `syncCredentialToBackend()`.
- Same-device deeplink intake and issuer portal callback offers.
- Per-credential Ed25519 signing keys (ADR 0010) and shared proof-signing session for dual-format claims.

Deferred:

- Authorization Code flow (Pre-Authorized Code only).
- Issuer signature validation against a production trust registry.

## Phase 3 - Config-Driven UI Mapping and Workflow Wiring

Status: **Substantially complete**.

Delivered:

- Wallet home, My QR, Scan, History Log tab shell.
- Dynamic `CardSchemaConfig` for ThaID, DLT Driving Licence, and Chulalongkorn University Transcript.
- Generic `CredentialCard` and dual-format detail/preview panels.
- QR scanner and pre-save Holder Confirmation flow.
- P1 ThaID bootstrap, P6 issuer suspension / holder actions, P7 document expiry UX.
- History log with lifecycle and presentation events.

Remaining:

- NFC NDEF issuance reader — deferred until target-device validation (A26 + ACR1311).
- Localization polish beyond documented user journeys.

## Phase 4 - Security Hardening and Release

Status: **Substantially complete**; golden-path release validation pending on physical devices.

Delivered:

- Screen capture guard on sensitive screens (restored for production builds).
- SSL public-key pinning for Wallet Backend (`EXPO_PUBLIC_WALLET_API_PINNED_CERTS`).
- Jailbreak/root detection hard block (ADR 0004).
- Android backup and D2D transfer exclusions.
- Production bundle/log leak scan (`yarn scan:bundle-leaks`).
- Local backend hardening (rate limits, JWT secret, CORS).

Remaining:

- Issuer signature validation once trust-list source is decided.
- Final ISO 18013-5 proximity E2E on A26 + ACR1311U-N2.
- EAS production builds and physical-device golden-path walkthrough.

## Phase 5 - EdDSA/Ed25519 Migration

Status: **Complete** (accepted security tradeoff per ADR 0008).

Delivered:

- Keychain-protected Ed25519 seed with `@noble/ed25519` signing (`alg: EdDSA`).
- Ed25519 `did:key` Holder DID (multicodec `[0xed, 0x01]`).
- OID4VCI PoP and OID4VP SD-JWT KB-JWT on Ed25519.

Note: P-256 / ES256 hardware signing spec exists for a future StrongBox migration (`docs/superpowers/specs/2026-08-04-hardware-p256-es256-signing-design.md`); not yet implemented.

Remaining:

- Reissue test credentials under current per-credential Ed25519 keys before production Verifier walkthrough.
- Revisit hardware non-extractable Ed25519 only if target AndroidKeyStore proves Ed25519 on A26-class devices.

## OID4VP 1.0 Online Presentation

Status: **Implemented** (first production slice on `dev`).

Delivered:

- Verifier QR and same-device deeplink intake with fallback handling (cold start, warm reopen, consumed requests).
- JAR trust validation, DCQL `credential_sets`, `did:web` verifier resolution.
- Holder selective disclosure controls.
- My QR broker session path with push engagement.
- Dual-format driving-licence match and VP token assembly.
- Feature-flagged `@openid4vc/openid4vp` adapter with legacy fallback.
- Presentation history recording effective disclosure set.

Remaining:

- Production `did:web` verifier allowlist for customer hosts (env-driven; see GETTING_STARTED checklist).
- Broader verifier compatibility testing beyond current staging/preview contracts.

## Proximity Presentation (ISO 18013-5)

Status: **In progress**.

Delivered:

- Phase 1 NFC NDEF tag read (Android).
- Companion HCE module (`modules/expo-mdoc-proximity`) and wallet proximity service layer.
- Multipaz mDL presentment engine updates.

Remaining:

- Full tap-to-present E2E on Samsung A26 + ACR1311U-N2 (ADR 0003 validation gate).
