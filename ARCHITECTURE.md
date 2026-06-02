# Architecture

> For domain terms → `CONTEXT.md` | For locked decisions → `docs/adr/` | For task state → `AGENTS.md`

---

## 1. High-Level Architecture Overview

This project is an OID4VCI 1.0 Holder Wallet built on Expo SDK 54 (TypeScript, Hermes Engine, React Compiler). It targets iOS and Android via Expo Prebuild / Development Builds. The runtime is Hermes, which requires all cryptographic operations on the signing path to be offloaded to native modules — no pure-JS `BigInt`-dependent cryptography is permitted for PoP JWT signing.

The wallet fulfills the Holder role in the W3C Verifiable Credentials data model and the OID4VCI 1.0 specification. It acquires credentials from Issuer services, stores them locally on-device with AES-256 encryption, and presents them to Verifier services via ISO 18013-5 NFC proximity exchange.

```
+-----------------------------------------------------------------------------------+
|                                 MOBILE APPLICATION                                |
|                                                                                   |
|  +-------------------+   QR / NFC / SDK Call  +--------------------------------+  |
|  |  NativeWind UI    | ---------------------> |   @sphereon/oid4vci-client     |  |
|  |  (Config-Driven)  |                        |   (Strict OID4VCI 1.0 Flow)    |  |
|  +-------------------+                        +--------------------------------+  |
|           ^                                                    |                  |
|           | Refresh                                            | VC JWT           |
|           | Trigger                                            v                  |
|  +-------------------+                        +--------------------------------+  |
|  |   Zustand Store   | <--------------------- |  src/services/vci/exchange.ts  |  |
|  |   (Local State)   |                        |  (Adapter & Hybrid Layer)      |  |
|  +-------------------+                        +--------------------------------+  |
|                                                                |                  |
|                                                                | Secure Payload   |
|                                                                v                  |
|                                               +--------------------------------+  |
|                                               |   Orval SDK + TanStack Query   |  |
|                                               |   (src/sdk/ — company backend) |  |
|                                               +--------------------------------+  |
+---------------------------------------------------------------+-------------------+
                                                                |
                                                                | HTTPS
                                                                v
                                                +--------------------------------+
                                                |    Company API Gateway         |
                                                |    (auth + offer brokering)    |
                                                +--------------------------------+
                                                                |
                                                                v
                                                +--------------------------------+
                                                |         MySQL Database         |
                                                +--------------------------------+
```

---

## 2. Hybrid Protocol Layer

Credential acquisition is split across two execution environments. The boundary between them is a deliberate security decision documented in ADR 0001 and ADR 0002.

### Client-Side (On-Device) — @sphereon/oid4vci-client

All OID4VCI 1.0 protocol negotiation runs entirely on-device using `@sphereon/oid4vci-client`:

1. Resolve credential offer URI (`openid-credential-offer://...`) received via QR scan or NFC tag read.
2. Fetch Issuer metadata from `/.well-known/openid-credential-issuer`.
3. Execute the token endpoint exchange (pre-authorized code flow or authorization code flow) to obtain an access token and `c_nonce`.
4. Construct the Proof of Possession (PoP) JWT:
   - Header: `{ alg: "ES256", typ: "openid4vci-proof+jwt", kid: "<holderDid>#<keyFragment>" }`
   - Payload: `{ iss: "<holderDid>", aud: "<issuerUrl>", iat, nonce }`
   - Signed via `@animo-id/expo-secure-environment` under alias `etda_wallet_signing_key`. Biometric authentication gates every sign call at the hardware layer.
5. Submit the credential request to the Issuer's credential endpoint and receive the Verifiable Credential JWT.

No network call to the company backend occurs during steps 1 through 5. These steps run entirely in the Hermes runtime with native JSI calls for cryptography.

### Server-Side Import — Orval-Generated Company SDK

After step 5 succeeds and the VC JWT is validated on-device, the wallet forwards the finalized credential to the company database via the Orval-generated SDK:

```
POST /wallet-api/wallet/{walletId}/credentials/import
Authorization: Bearer <session-token>
Content-Type: application/json

{ "vc": "<signed-vc-jwt>" }
```

This is the sole permitted write operation to the backend during credential acquisition. The Issuer's credential endpoint and the company backend are independent services. The wallet does not proxy or relay OID4VCI traffic through the company backend. See `docs/API.md` for the full Protocol Boundary Matrix.

### Credential Offer Delivery Channels

| Channel | Flow |
|---|---|
| QR Scan | Camera reads `openid-credential-offer://` URI → passed to `@sphereon/oid4vci-client` |
| NFC (issuance) | NDEF tag read → extract offer URI → same flow as QR |
| NFC (presentation) | ISO 18013-5 proximity mdoc exchange (ADR 0003) |
| In-app | User taps "claim" → SDK call → backend returns offer URL → `@sphereon/oid4vci-client` |

---

## 3. Security Boundary and Hardware Sandbox

See `docs/SECURITY.md` for the full cryptographic policy and storage standard.

**Non-Extractable Signing Key (ADR 0001, ADR 0002)**

- Generated inside iOS Secure Enclave / Android Keystore via `@animo-id/expo-secure-environment`.
- Key alias: `etda_wallet_signing_key` — the JS runtime never sees the private key bytes.
- Biometric verification required on every `signProof()` call at the native hardware layer.
- No software fallback — fail loudly on devices without hardware attestation.

**Holder DID**

- `did:key` derived deterministically from compressed P-256 public key.
- Format: `did:key:z<base58btc(varint(0x1200) + compressedKey)>`
- Self-contained — no server required for DID resolution.

**Local Storage**

- `AsyncStorage` is unconditionally forbidden. Blocked at lint and CI level.
- VC storage: `react-native-mmkv` (`createMMKV({ id: 'wallet-credentials' })`) with AES-256 encryption.
- MMKV encryption key: hardware-derived random key stored in `react-native-keychain` (biometric-gated on first unlock).

---

## 4. Config-Driven Dynamic UI Engine

Layouts are strictly decoupled from rendering logic. No issuer-specific screen files (no `ThaiIdCard.tsx`).

The app matches `VerifiableCredentialRecord.type` against local JSON schema configs to resolve styling, display fields, and brand assets dynamically from Issuer metadata `display` arrays.

```typescript
interface CardStyle {
  title: string
  issuerName: string
  primaryColor: string
  logo: string
}

interface VerifiableCredentialRecord {
  id: string
  type: string
  rawVc: string
  claims: Record<string, unknown>
  issuedAt: string
  expiresAt?: string
}
```

---

## 5. Directory Structure

| Path | Responsibility |
|---|---|
| `src/services/vci/` | OID4VCI 1.0 protocol adapter: credential offer parsing, Issuer metadata discovery, token exchange, PoP JWT construction, credential request/response handling via `@sphereon/oid4vci-client`. |
| `src/services/crypto/` | Hardware key management via `@animo-id/expo-secure-environment`. Key alias `etda_wallet_signing_key`. Non-signing hashing and encoding via `react-native-quick-crypto`. No software fallback on signing path. |
| `src/services/storage/` | Encrypted MMKV VC store, keychain encryption key management. |
| `src/sdk/` | Orval-generated TanStack Query hooks from `walletApi.json` (company OpenAPI spec). Only allowed endpoints are generated. See `docs/API.md`. |
| `src/store/` | Zustand global state — thin slices, no heavy arrays. Persisted via MMKV storage adapter. |
| `src/screens/` | Expo Router file-based route screens. Screen-level state stays local unless shared via a store slice. |
| `src/components/` | Atomic UI (Buttons, Cards, Scanner Views) via NativeWind. Safe Area aware. React Compiler compatible. |

---

## 6. Key Dependencies

| Package | Role |
|---|---|
| `@sphereon/oid4vci-client` | OID4VCI 1.0 client-side credential acquisition protocol |
| `@animo-id/expo-secure-environment` | Hardware-bound EC P-256 key generation and signing (Secure Enclave / Android Keystore) |
| `react-native-quick-crypto` | Non-signing crypto: hashing, HMAC, base64url encoding |
| `react-native-mmkv` | AES-256 encrypted local key-value storage |
| `zustand` | Global state management with persisted slices |
| `expo-router` | File-system-based navigation |
| `nativewind` | Utility-first styling via Tailwind CSS class names |
| `orval` | TypeScript API client generation from `walletApi.json` |

---

## 7. Architecture Decision Records

All significant, hard-to-reverse technical choices are recorded as ADRs in `docs/adr/`. Once accepted, ADRs are immutable. Superseding an ADR requires a new numbered record that references the original.

| ADR | Decision |
|---|---|
| 0001 | Hardware-backed non-extractable signing key over software key |
| 0002 | `@animo-id/expo-secure-environment` as the native signing module |
| 0003 | ISO 18013-5 for NFC proximity credential presentation |

---

## 8. Reference Documents

| Document | Contents |
|---|---|
| `docs/ROADMAP.md` | 2-month, 4-phase delivery plan with week-by-week milestones |
| `docs/SECURITY.md` | Cryptographic policy, storage standard, biometric auth gate specification |
| `docs/TESTING.md` | Coverage thresholds, native module mock patterns, MSW usage |
| `docs/API.md` | Orval configuration and Protocol Boundary Matrix |
| `CONTEXT.md` | Domain glossary and OID4VCI 1.0 terminology |
| `docs/adr/` | Numbered, immutable architecture decision records |
