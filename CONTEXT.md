# OID4VCI Wallet - Domain Glossary

Pure glossary. No implementation details, no scratch notes.

## Holder

The Thai citizen end-user. Receives Verifiable Credentials from Issuers via OID4VCI 1.0 and stores them on-device.

## Wallet Account

The Holder's login identity in the Wallet Backend. Used for authentication, sessions, and wallet ownership. Distinct from any Issuer-side account or eligibility record.

## Wallet PIN

A unified 6-digit secret used for Wallet Account server authentication and local app lock. Set after first login; required on cold start and after a configurable background-idle grace period (`EXPO_PUBLIC_WALLET_PIN_SESSION_GRACE_MS`). Distinct from Issuer `tx_code` and from the biometric sign-time gate on cryptographic operations.

## Issuer

A government or institutional authority that issues Verifiable Credentials. Initial issuers: ThaID for national ID, DLT for driving licence, and Chulalongkorn University for transcript credentials. Issuers are identified by DIDs, initially `did:web`.

## Verifier

A party that requests and checks Verifiable Credentials from the Holder during a presentation. Examples include traffic police, border control, and car-rental agencies. A Verifier consumes credentials; it does not issue them.

## Verifiable Credential (VC)

A signed, tamper-evident digital claim issued by an Issuer to the Holder. Stored in encrypted MMKV storage as a compact JWT VC or compact SD-JWT VC.

## Verifiable Credential Type (`vct`)

The Issuer-defined credential type identifier inside an SD-JWT VC. A Verifier's DCQL `vct_values` must exactly match this signed value; aliases, display names, and Verifier-hosted substitute URLs do not identify the same credential type. The Wallet's local credential type is only an internal classification for storage and display.

## PID VC

The foundational personal identification credential in the Wallet. In this app it is represented by the `ThaiNationalID` credential type and must exist before the Holder requests other credentials.

## VerifiableCredentialRecord

The app's local normalized credential record. It contains `id`, `type`, `rawVc`, decoded display `claims`, `issuedAt`, and optional `expiresAt`. It is the only credential shape the UI should read from local storage.

## Wallet Attestation Key (`k_attest`)

One hardware P-256 key per wallet (`wallet.p256.attest`) used for Wallet Provider attestation (WUA/WIA) at v2 crypto activation. The Wallet Provider receives `pub_k_attest` plus the Android attestation certificate chain; the key is not used for VC Proof of Possession or presentation signing.

## Credential Signing Key (`k_cred`)

One key per issued credential (ADR 0010 topology, ADR 0011 algorithm). Default on Android is hardware P-256 (`alg: ES256`, `did:key` multicodec `0x1200`). The flag-off path is a Keychain-protected Ed25519 seed (`alg: EdDSA`, multicodec `[0xed, 0x01]`). OID4VCI PoP JWTs, OID4VP presentation tokens, and SD-JWT KB-JWTs for that credential are signed with its key. Created at issuance without Wallet Provider WUA. Destroyed on P3 renewal or P6 lifecycle actions that remove the credential's cryptographic binding. Leftover Ed25519 cards while hardware signing is on must be freshly reissued.

## Holder DID

The Holder's decentralized identifier for a credential, derived from that credential's public key using `did:key` (P-256 multicodec `0x1200` on the hardware path; Ed25519 `[0xed, 0x01]` when the hardware flag is off). Self-contained; no server is required for resolution.

## Proof of Possession (PoP)

A JWT signed with the credential's `k_cred` and sent to the Issuer during credential request. Uses `jwt` proof type per OID4VCI 1.0 with `alg: ES256` (hardware) or `alg: EdDSA` (flag-off). Payload `iss`/`sub` is the credential's Holder DID. Biometric authentication fires on every sign operation (the single auth prompt for that action).

## Verifiable Presentation (VP)

A Holder-approved presentation response sent to a Verifier. Depending on the Verifier request, the response may be a signed JWT VP token or a credential presentation token such as a compact SD-JWT VC.

## Key Binding JWT (KB-JWT)

A JWT signed by the credential's `k_cred` and appended to an SD-JWT VC presentation to prove cryptographic Holder Binding. It binds the presentation to the Verifier request using the request nonce, audience, and hash of the presented SD-JWT.

## Trusted Verifier

A Verifier allowed by local Wallet configuration. The current trust model requires an exact `did:web` `client_id` match and an allowlisted `response_uri` origin before the Wallet will present any credential.

## Self-Sovereign Architecture

The app runs OID4VCI and OID4VP protocol steps on-device. Production holder signing uses hardware-backed P-256 keys (ADR 0011); the flag-off Ed25519 seed is Keychain-protected and retrieved only at sign time under biometric/device authentication (ADR 0008). The company backend authenticates the Holder and stores wallet-side backend state, but the app claims credentials directly from Issuers and presents directly to Verifiers.

## Wallet Backend

A company-controlled service distinct from Issuers. Authenticates Holders, manages wallet accounts and sessions, lists wallets, and records backend wallet state without running OID4VCI issuance on behalf of the app.

## Local Wallet Backend

The development backend under `server/`. It mirrors the allowed Wallet Backend boundary for local XAMPP MySQL testing: register, login, logout, list wallets, and import finalized credentials.

## Credential Offer Request

The Wallet asking an Issuer to prepare a Credential Offer for the Holder (P2 sequence: Wallet → Issuer). Distinct from consuming a Credential Offer URL that already exists, and from the OID4VCI Credential Request that carries Proof of Possession after an offer exists.
_Avoid_: Calling the PoP Credential Request a “credential offer request”; calling QR/deeplink intake a Credential Offer Request.

## Credential Offer URL

A URL such as `openid-credential-offer://...` returned by the company backend, read from a QR code, or received via NFC. Consumed by `@openid4vc/openid4vci` via `src/services/vci/oid4vc/` to run issuance.

## Credential Configuration ID

An OID4VCI 1.0 identifier for a credential configuration in Issuer metadata. A Credential Offer names one or more configuration IDs; the Wallet requests issuance using the matched configuration ID.

## Credential Identifier

An OID4VCI 1.0 issuer-issued identifier returned after token exchange for a specific credential instance. When present, it is used in the Credential Request instead of a Credential Configuration ID.

## Holder Confirmation

The Holder's explicit consent to acquire a credential from an Issuer after reviewing the resolved Credential Offer. It occurs before credential issuance, not merely before local wallet storage.
_Avoid_: PID Presentation Consent; Wallet PIN unlock; the success screen after storage.

## PID Presentation Consent

The Holder's approval to present the PID VC in an OID4VP Authorization Request (Issuer or Verifier). Distinct from Holder Confirmation (issuance) and from Wallet PIN.
_Avoid_: Treating DOPA / issuance confirm as this step; a second PIN prompt in front of the sign-time gate.

## Transaction Code (`tx_code`)

A Holder-entered code required by some Issuers during the OID4VCI 1.0 Pre-Authorized Code flow. The Issuer defines input constraints in the Credential Offer. Distinct from device passcode, biometric authentication, and wallet unlock secrets.

## Offer Delivery Channels

How a Credential Offer reaches the Wallet during issuance:

1. QR Scan: camera reads a QR code containing the offer URL.
2. Deep link: `openid-credential-offer://` or issuer portal callback (`walletapp://callback`).
3. NFC: NDEF tag read for issuance (Android, deferred full validation), or ISO 18013-5 proximity exchange for presentation.
4. In-app SDK call: backend returns offer URL via the generated SDK.

_Avoid_: Calling this the History protocol family (`oid4vci` / `oid4vp` / `wallet`); those name the protocol or initiator, not how the offer arrived.

## History Channel Caption (ช่องทาง)

Holder-facing hybrid label on a History Log detail: the delivery or presentation intake path (QR scan, deep link, NFC, etc.) together with the counterparty role (Issuer or Verifier). Answers “how did this enter the Wallet, and with whom?”

Locked hybrid wording uses English role words and glossary “Deep link” spelling: `ผ่าน QR Verifier`, `ผ่าน Deep link Verifier`, `ผ่าน QR Issuer`, `ผ่าน Deep link Issuer`. Verify-failed adds failure sense: `ตรวจสอบเอกสารผ่าน QR Issuer ไม่ผ่าน`, `ตรวจสอบเอกสารผ่าน Deep link Issuer ไม่ผ่าน`.

**History delivery path** (persisted on events when known): `qr` or `deep-link`. Maps from runtime flow origin at write time (e.g. QR scan → `qr`, same-device deep link → `deep-link`). Distinct from History protocol family (`channel`) and from presentation-only flow origins such as My QR or issuer renewal.

**Issuance flow origin** (runtime, pre-history): `scan` or `same-device`, held in deeplink store as `pendingOfferFlowOrigin` / `activeOfferFlowOrigin` — mirrors presentation flow origin. Mapped to History `deliveryPath` (`qr` / `deep-link`) only when the history event is written.

Verifier-initiated OID4VP **ช่องทาง** uses the same hybrid caption for success, failure, and decline when `deliveryPath` is known (`ผ่าน QR Verifier` / `ผ่าน Deep link Verifier`); outcome stays in status and action labels, not in ช่องทาง.

**Legacy history rows** (no `deliveryPath` stored): Verifier-initiated OID4VP success keeps `ผ่าน QR Verifier`; failed/declined keep `ดำเนินการใน Wallet`. Issuance success without path keeps `รับเอกสารจาก Issuer`. Do not guess intake for old rows.

**Unmapped delivery paths** (NFC, In-app SDK, or any intake without explicit origin tracking): omit `deliveryPath` on the history event and use legacy ช่องทาง captions until that path is wired.
_Avoid_: Protocol-only captions that ignore intake; “Deeplink” as one word in this caption; storing raw `PresentationFlowOrigin` on history rows; treating ช่องทาง as a synonym for Offer Delivery Channel alone or for History protocol family alone.

## History Display Name

Holder-facing names shown on History Log for the counterparty (Verifier or Issuer) and the document type. Prefer the name the Issuer or Verifier actually sent. When the name is missing or is only a Wallet/config placeholder (for example a trusted-verifier default such as “Verifier API”, or a built-in English schema title such as “Thai National ID”), the Wallet may show a credential-type mock aligned with the demo UI reference until real metadata is available. An Issuer offer display name that was truly sent is kept even when it is English.

_Avoid_: Treating History Channel Caption wording as the party or document name; inventing names when a real protocol/offer display name is present.

## NFC Presentation

Proximity credential presentation via ISO 18013-5. User taps phone to the Verifier's reader. Requires a native mdoc module. iOS may need BLE engagement fallback; Android supports HCE. Decided in ADR 0003.

## Online Presentation

Remote credential presentation via OID4VP 1.0. Implemented paths: Verifier QR and same-device deeplink (`walletapp://callback`), JAR-signed Authorization Requests, DCQL `credential_sets`, `did:web` verifier trust, holder selective disclosure, and My QR broker engagement. Responses use `direct_post`. SD-JWT credentials include a KB-JWT; mdoc credentials use proximity or dual-format VP assembly where configured.

## Generated SDK

TypeScript API client generated from the company's Swagger/OpenAPI spec via Orval. Lives in `src/sdk/`. All company backend calls go through this SDK; no raw app-level fetch or axios wrappers.

## Config-Driven UI

Credential card rendering is controlled by `CardSchemaConfig` entries, not hardcoded screen components. Initial schemas cover ThaID, DLT Driving Licence, and Chulalongkorn University Transcript.
