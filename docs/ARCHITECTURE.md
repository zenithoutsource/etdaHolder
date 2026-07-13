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
5. Sign with the Keychain-protected Ed25519 Wallet Signing Key.
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
| Online Presentation | OID4VP 1.0 remote/cross-device presentation | First QR/direct_post slice implemented for ThaiNationalID age-over-20 |

Presentation is separate from acquisition. OID4VP online presentation does not supersede ADR 0003 because it uses a different transport.

### On-Device OID4VP

The first OID4VP slice is intentionally narrow and Verifier-driven:

1. Scan a cross-device `openid4vp://...` Authorization Request QR.
2. Validate `client_id` against the local Verifier allowlist and require the `response_uri` origin to be allowlisted.
3. Accept Presentation Exchange requests only when the requested disclosure is the ThaiNationalID birth date, or the development Verifier API's DCQL IDCard request.
4. Show native Holder consent before signing.
5. Sign a JWT VP token with the Keychain-protected Ed25519 Wallet Signing Key under the same biometric sign-time gate.
6. Send `vp_token`, `presentation_submission`, and optional `state` to the Verifier using `direct_post`.
7. Record successful presentations locally after the Verifier returns a successful HTTP response.

The current development allowlist includes `http://192.100.10.48/openid4vc/verify` for the supplied Verifier API and is emitted only in development builds. Production deployments trust env-configured `decentralized_identifier:did:web:` Verifiers through `EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID`, `EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN`, and optional `EXPO_PUBLIC_VERIFIER_DID_WEB_JWK`; unpinned DID document resolution uses HTTPS `did.json` with the `EXPO_PUBLIC_DID_WEB_FETCH_TIMEOUT_MS` and `EXPO_PUBLIC_DID_WEB_MAX_BYTES` policy.

### Wallet-Initiated My QR (Verifier-Owned)

The **My QR** tab is wallet-initiated: the holder shows a QR from a stored credential. Production authority sits on the **Verifier presentation service**, not the wallet company backend.

```text
Wallet App
  │ POST /v1/presentation-sessions
  │ PUT  /v1/presentation-sessions/{id}  (vpToken)
  │ KB-JWT aud = Verifier presentation base URL
  │ QR = verifyUrl (.../v1/present/verify?s=...)
  │ poll GET .../status → consumed
  ▼
Verifier Presentation Service (verifier-owned)
  │ §2.1 verify on GET /v1/present/verify
  ▼
Checkpoint scanner browser (Honeywell)
```

| Concern | Scan tab | My QR tab |
|---------|----------|-----------|
| Initiator | Verifier (`openid4vp://`) | Wallet (holder) |
| Protocol | OID4VP 1.0 `direct_post` | VP-by-reference `/v1/*` |
| Authority | Verifier OID4VP API | Verifier presentation service |
| Wallet backend in path? | No | No |

Mobile: `createVerifierPresentationAdapter()` → verifier `/v1/*`; base URL from `EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL`.  
Reference implementation: `server/src/routes/presentationGateway.ts` (may co-locate on local `server/` for LAN dev only).  
Spec: `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md`.

## 4. Security Boundary

### Wallet Signing Key

- Generated as a 32-byte Ed25519 seed and stored under Keychain service `etda.wallet.ed25519_seed`.
- Public key is cached in metadata storage as `wallet.ed25519_pub_key`.
- Biometric/device authentication gates every Keychain seed retrieval for signing.
- Signatures use `@noble/curves` Ed25519 and emit `alg: EdDSA`.
- The former Android native Ed25519 diagnostic module was removed after ADR 0008 settled on Keychain-protected software Ed25519 signing.

### Holder DID

`did:key` is derived from raw Ed25519 public key bytes:

```text
did:key:z<base58btc(varint(0xed01) + raw_ed25519_public_key)>
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
| `src/services/crypto/` | Keychain Ed25519 seed policy, Holder DID, PoP signing |
| `src/services/storage/` | Encrypted MMKV and Keychain integration |
| `src/services/vci/` | OID4VCI offer resolution, acquisition, credential normalization, backend sync |
| `src/services/vp/` | OID4VP Authorization Request parsing, Presentation Exchange matching, direct_post submission |
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
| `@noble/curves` | Ed25519 EdDSA signing |
| `react-native-quick-crypto` | Non-signing hashing, random bytes, encoding support |
| `react-native-mmkv` | Encrypted local key-value storage |
| `react-native-keychain` | Native keychain storage for Ed25519 seed, MMKV key, and session |
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
| 0004 | Root/jailbreak detection response |
| 0005 | Backend-only certificate pinning |
| 0006 | ISO 18013-5 mdoc native module selection criteria |
| 0007 | Android-first EdDSA Ed25519 production signing |
| 0008 | Keychain-protected Ed25519 production signing |

OID4VP 1.0 online presentation has an implemented first slice but still needs a full ADR before broader claim sets, Verifier onboarding, or registry-backed trust rules are expanded.
