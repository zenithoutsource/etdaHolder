# OID4VCI Wallet — Domain Glossary

> Pure glossary. No implementation details, no specs, no scratch notes.

## Holder
The Thai citizen end-user. Receives Verifiable Credentials from issuers via OID4VCI 1.0 and stores them on-device.

## Issuer
A government or institutional authority that issues Verifiable Credentials. Initial issuers: ThaID (national ID), DLT (Driving License), Bangkok University (Transcript). Issuers are identified by `did:web` DIDs.

## Verifier
A party that requests and checks Verifiable Credentials from the Holder during a presentation. Examples: traffic police, border control, a car-rental agency. Distinct from the Issuer — a Verifier consumes credentials, it does not issue them.

## Verifiable Credential (VC)
A signed, tamper-evident digital claim issued by an Issuer to the Holder. Stored in encrypted MMKV storage.

## Wallet Signing Key
A single EC P-256 keypair scoped to the device (not per-credential). Generated inside iOS Secure Enclave / Android Keystore via `@animo-id/expo-secure-environment`. Private key is non-extractable — it never exists in JavaScript memory. Key alias: `etda_wallet_signing_key`.

## Holder DID
The Holder's decentralized identifier, derived deterministically from the Wallet Signing Key using the `did:key` method. Format: `did:key:z<base58btc(multicodec_prefix + compressed_P256_key)>`. Self-contained — no server required for resolution.

## Proof of Possession (PoP)
A JWT signed with the Wallet Signing Key, sent to the Issuer during credential request. Uses `jwt` proof type per OID4VCI 1.0. Header contains `kid: "<holderDid>#<holderDid>"` (not `jwk`). Payload `iss` is the Holder DID. Biometric fires on every sign operation (sign-time gate).

## Self-Sovereign Architecture
The app runs the full OID4VCI 1.0 protocol on-device. Keys never leave device hardware. The company backend authenticates the user and returns a Credential Offer URL. The app claims credentials directly from the Issuer, signing the PoP locally with the Wallet Signing Key.

## Credential Offer URL
A URL (`openid-credential-offer://...`) returned by the company backend, read from a QR code, or received via NFC. Consumed by `@sphereon/oid4vci-client` to run the full issuance flow.

## Offer Delivery Channels
1. **QR Scan** — camera reads a QR code containing the offer URL
2. **NFC** — NDEF tag read (issuance) or ISO 18013-5 proximity exchange (presentation)
3. **In-app SDK call** — backend returns offer URL via Generated SDK

## NFC Presentation
Proximity credential presentation via ISO 18013-5 — one of two presentation channels (contrast Online Presentation). User taps phone to the Verifier's NFC reader. Requires a native mdoc module (separate ADR pending). iOS uses BLE engagement fallback; Android supports full HCE. Decided in ADR 0003.

## Online Presentation
Remote credential presentation via OID4VP 1.0 (OpenID for Verifiable Presentations). The Verifier sends an Authorization Request (cross-device QR or same-device redirect) and the Holder returns a signed Verifiable Presentation. Distinct from NFC Presentation — online transport rather than tap-to-reader proximity. Planned post-v1; protocol mechanics not yet decided.

## Generated SDK
TypeScript API client generated from the company's Swagger/OpenAPI spec via `orval`. Produces TanStack Query hooks directly. Lives in `src/sdk/`. All company backend calls go through this SDK — no raw fetch/axios.

## Config-Driven UI
Card rendering controlled by schema configuration files, not hardcoded screen components. Layouts converted from company-supplied HTML/CSS files into React Native + NativeWind components.
