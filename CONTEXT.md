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

One Ed25519 keypair per wallet used for Wallet Provider attestation (WUA/WIA) at v2 crypto activation. Stored as a Keychain-protected seed; not used for VC Proof of Possession or presentation signing.

## Credential Signing Key (`k_cred`)

One Ed25519 keypair per issued credential (ADR 0010). Each credential's Holder `did:key` is derived from its public key. OID4VCI PoP JWTs, OID4VP presentation tokens, and SD-JWT KB-JWTs for that credential are signed with its key. Destroyed on P3 renewal or P6 lifecycle actions that remove the credential's cryptographic binding.

## Holder DID

The Holder's decentralized identifier for a credential, derived from that credential's Ed25519 public key using `did:key` with multicodec prefix `[0xed, 0x01]`. Self-contained; no server is required for resolution.

## Proof of Possession (PoP)

A JWT signed with the credential's Ed25519 key and sent to the Issuer during credential request. Uses `jwt` proof type per OID4VCI 1.0 with `alg: EdDSA`. Header contains `kid`, not `jwk`. Payload `iss`/`sub` is the credential's Holder DID. Biometric authentication fires on every sign operation (the single auth prompt for that action).

## Verifiable Presentation (VP)

A Holder-approved presentation response sent to a Verifier. Depending on the Verifier request, the response may be a signed JWT VP token or a credential presentation token such as a compact SD-JWT VC.

## Key Binding JWT (KB-JWT)

A JWT signed by the credential's Ed25519 key and appended to an SD-JWT VC presentation to prove cryptographic Holder Binding. It binds the presentation to the Verifier request using the request nonce, audience, and hash of the presented SD-JWT.

## Trusted Verifier

A Verifier allowed by local Wallet configuration. The current trust model requires an exact `did:web` `client_id` match and an allowlisted `response_uri` origin before the Wallet will present any credential.

## Self-Sovereign Architecture

The app runs OID4VCI and OID4VP protocol steps on-device. Ed25519 seeds are Keychain-protected and retrieved only at sign time under biometric/device authentication (ADR 0008 — software-protected, not hardware non-extractable). The company backend authenticates the Holder and stores wallet-side backend state, but the app claims credentials directly from Issuers and presents directly to Verifiers.

## Wallet Backend

A company-controlled service distinct from Issuers. Authenticates Holders, manages wallet accounts and sessions, lists wallets, and records backend wallet state without running OID4VCI issuance on behalf of the app.

## Local Wallet Backend

The development backend under `server/`. It mirrors the allowed Wallet Backend boundary for local XAMPP MySQL testing: register, login, logout, list wallets, and import finalized credentials.

## Credential Offer URL

A URL such as `openid-credential-offer://...` returned by the company backend, read from a QR code, or received via NFC. Consumed by `@openid4vc/openid4vci` via `src/services/vci/oid4vc/` to run issuance.

## Credential Configuration ID

An OID4VCI 1.0 identifier for a credential configuration in Issuer metadata. A Credential Offer names one or more configuration IDs; the Wallet requests issuance using the matched configuration ID.

## Credential Identifier

An OID4VCI 1.0 issuer-issued identifier returned after token exchange for a specific credential instance. When present, it is used in the Credential Request instead of a Credential Configuration ID.

## Holder Confirmation

The Holder's explicit consent to acquire a credential from an Issuer after reviewing the resolved Credential Offer. It occurs before credential issuance, not merely before local wallet storage.

## Transaction Code (`tx_code`)

A Holder-entered code required by some Issuers during the OID4VCI 1.0 Pre-Authorized Code flow. The Issuer defines input constraints in the Credential Offer. Distinct from device passcode, biometric authentication, and wallet unlock secrets.

## Offer Delivery Channels

1. QR Scan: camera reads a QR code containing the offer URL.
2. Deep link: `openid-credential-offer://` or issuer portal callback (`walletapp://callback`).
3. NFC: NDEF tag read for issuance (Android, deferred full validation), or ISO 18013-5 proximity exchange for presentation.
4. In-app SDK call: backend returns offer URL via the generated SDK.

## NFC Presentation

Proximity credential presentation via ISO 18013-5. User taps phone to the Verifier's reader. Requires a native mdoc module. iOS may need BLE engagement fallback; Android supports HCE. Decided in ADR 0003.

## Online Presentation

Remote credential presentation via OID4VP 1.0. Implemented paths: Verifier QR and same-device deeplink (`walletapp://callback`), JAR-signed Authorization Requests, DCQL `credential_sets`, `did:web` verifier trust, holder selective disclosure, and My QR broker engagement. Responses use `direct_post`. SD-JWT credentials include a KB-JWT; mdoc credentials use proximity or dual-format VP assembly where configured.

## Generated SDK

TypeScript API client generated from the company's Swagger/OpenAPI spec via Orval. Lives in `src/sdk/`. All company backend calls go through this SDK; no raw app-level fetch or axios wrappers.

## Config-Driven UI

Credential card rendering is controlled by `CardSchemaConfig` entries, not hardcoded screen components. Initial schemas cover ThaID, DLT Driving Licence, and Chulalongkorn University Transcript.
