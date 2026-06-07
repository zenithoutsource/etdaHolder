# Architecture

For domain terms see `../CONTEXT.md`. For locked decisions see `./adr/`. For task state see `../AGENTS.md` and `./TASKS.md`.

## 1. High-Level Overview

This project is an OID4VCI 1.0 Holder Wallet built on Expo SDK 54, TypeScript, Hermes, React Compiler, Expo Router, and NativeWind. It targets iOS and Android through Expo Prebuild and Development Builds.

The wallet acquires credentials directly from Issuer services, stores them locally with AES-256 encrypted MMKV, renders credentials through config-driven UI schemas, and can sync finalized credentials to the company Wallet Backend through an Orval-generated SDK.

```text
Mobile UI
  -> QR / NFC / SDK offer delivery
  -> @sphereon/oid4vci-client
  -> src/services/vci/exchangeService.ts
  -> src/services/crypto/crypto.ts for biometric-gated PoP signing
  -> src/services/storage/storage.ts encrypted MMKV
  -> optional src/sdk/walletApi.ts backend import
```

The mobile app never connects directly to MySQL. The local development backend under `server/` exists only behind the same SDK/API boundary used by the mobile app.

## 2. Protocol Boundary

### On-Device OID4VCI

All OID4VCI issuance mechanics run on-device:

1. Resolve `openid-credential-offer://...` from QR, NFC NDEF, or backend-provided offer.
2. Fetch Issuer metadata.
3. Execute Pre-Authorized Code token exchange.
4. Build a PoP JWT with `kid` header and Holder DID `iss`.
5. Sign with the hardware Wallet Signing Key under alias `etda_wallet_signing_key`.
6. Submit credential request to the Issuer credential endpoint.
7. Normalize compact JWT VC or compact SD-JWT VC into `VerifiableCredentialRecord`.
8. Save locally in encrypted MMKV.

Authorization Code flow is intentionally unsupported in the current implementation.

### Backend Import

Backend sync is separate from credential acquisition. After local storage succeeds, callers may invoke:

```http
POST /wallet-api/wallet/{walletId}/credentials/import
Authorization: Bearer <session-token>
Content-Type: application/json

{ "jwt": "<compact-signed-credential>", "associated_did": "<holder-did>" }
```

Only HTTP 201 is a sync success. TanStack Query invalidation belongs in caller/UI code, not the VCI service.

## 3. Offer Delivery and Presentation Channels

| Channel | Purpose | Status |
|---|---|---|
| QR Scan | Reads `openid-credential-offer://...` and routes to `resolveOffer()` | Implemented with `expo-camera` |
| NFC NDEF | Reads issuance offer URI from an NFC tag | Deferred until test device |
| In-app SDK | Backend returns an offer URL | Supported boundary; UI wiring is incremental |
| NFC Presentation | ISO 18013-5 mdoc proximity presentation | Decided by ADR 0003; native module TBD |
| Online Presentation | OID4VP 1.0 remote/cross-device presentation | Post-v1 scope only |

Presentation is separate from acquisition. OID4VP online presentation does not supersede ADR 0003 because it uses a different transport.

## 4. Security Boundary

### Wallet Signing Key

- Generated inside iOS Secure Enclave or Android Keystore through `@animo-id/expo-secure-environment`.
- Key alias: `etda_wallet_signing_key`.
- Private key is non-extractable and never available to JavaScript.
- Biometric authentication gates every sign operation.
- Production startup fails when a hardware secure environment is unavailable.

### Holder DID

`did:key` is derived from compressed P-256 public key bytes:

```text
did:key:z<base58btc(varint(0x1200) + compressed_P256_public_key)>
```

### Local Storage

- `AsyncStorage` is forbidden.
- Credential records live in encrypted `react-native-mmkv`.
- The MMKV encryption key is generated with a CSPRNG and stored in `react-native-keychain`.
- Production storage uses hardware-backed Keychain constraints where available.

## 5. Dynamic Card Engine

Credential rendering is config-driven:

- Schema registry: `src/config/cardSchemas.ts`
- Generic card: `src/components/CredentialCard.tsx`
- Detail route: `app/(tabs)/credential/[id].tsx`
- Record hook: `src/hooks/useStoredCredentials.ts`

`VerifiableCredentialRecord.type` maps to a `CardSchemaConfig`. Initial configs:

- `ThaiNationalID`
- `DLTDrivingLicence`
- `BangkokUniversityTranscript`

No issuer-specific card components should be added. Extend schemas instead.

## 6. Directory Structure

| Path | Responsibility |
|---|---|
| `app/` | Expo Router app shell, auth screens, tabs, scanner, credential detail |
| `src/services/crypto/` | Hardware key policy, Holder DID, PoP signing |
| `src/services/storage/` | Encrypted MMKV and Keychain integration |
| `src/services/vci/` | OID4VCI offer resolution, acquisition, credential normalization, backend sync |
| `src/services/auth/` | Wallet Account login/register/logout and session persistence |
| `src/config/` | Dynamic credential card schema registry |
| `src/components/` | Reusable UI components |
| `src/hooks/` | UI-facing credential storage hooks |
| `src/sdk/` | Orval-generated Wallet Backend SDK and fetch base URL adapter |
| `src/store/` | Thin Zustand state |
| `server/` | Local development Wallet Backend backed by XAMPP MySQL |
| `docs/` | Architecture, API, security, testing, roadmap, ADRs |

## 7. Key Dependencies

| Package | Role |
|---|---|
| `@sphereon/oid4vci-client` | OID4VCI credential acquisition |
| `@animo-id/expo-secure-environment` | Hardware-backed key generation and signing |
| `react-native-quick-crypto` | Non-signing hashing, random bytes, encoding support |
| `react-native-mmkv` | Encrypted local key-value storage |
| `react-native-keychain` | Native keychain storage for MMKV key and session |
| `expo-camera` | QR scanner |
| `nativewind` | Tailwind-style React Native styling |
| `expo-router` | File-based navigation |
| `@tanstack/react-query` | Generated SDK hooks and API state |
| `orval` | TypeScript SDK generation |
| `zustand` | Local UI/session state |

## 8. ADR Index

| ADR | Decision |
|---|---|
| 0001 | Hardware-backed non-extractable signing key |
| 0002 | `@animo-id/expo-secure-environment` as native signing module |
| 0003 | ISO 18013-5 for NFC proximity credential presentation |

OID4VP 1.0 online presentation remains post-v1 and has no ADR until its mechanics are decided.
