# Tech Stack

## Mobile App (Wallet)

| Layer | Choice |
|---|---|
| Framework | React Native 0.81.5 (Expo SDK 54, `~54.0.34`), Hermes engine |
| Language | TypeScript `~5.9.2` |
| Routing | `expo-router` (file-based, `app/`) |
| UI | React `19.1.0`, NativeWind `^4.2.4` (Tailwind `3.4.4`) |
| State | Zustand `^5.0.14` |
| Server state / data fetching | TanStack React Query `^5.100.14` |
| Backend SDK | Orval-generated client (`orval.config.ts`) via `src/sdk/walletApi.ts` |
| OID4VCI transport | `@sphereon/oid4vci-client` (offer resolve / token / credential request) |
| Crypto | `@noble/ed25519`, `@noble/hashes`, `react-native-quick-crypto`, `react-native-quick-base64` |
| Secure storage | `react-native-mmkv` (encrypted) + `react-native-keychain` |
| Biometrics | `react-native-keychain` sign-time gate + `expo-local-authentication` app-level gate for non-signing actions |
| NFC (NDEF issuance offers) | `react-native-nfc-manager` |
| NFC (ISO 18013-5 presentation) | Custom module `modules/expo-mdoc-proximity` (see below) |
| Native modules bridge | `react-native-nitro-modules` |
| Push notifications | `expo-notifications` |
| Device/security checks | `jail-monkey`, `expo-device`, `react-native-ssl-pinning` |
| Camera / scanning | `expo-camera` |
| Animations / gestures | `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler` |
| Validation | `zod` |
| Testing | Jest `29`, `jest-expo`, `@testing-library/react-native`, `msw` (API mocking) |
| Lint | ESLint `^9` (`eslint-config-expo`) |
| Native project management | Expo Prebuild / Development Builds (iOS + Android) |

## Own Code vs Library

Rule of thumb used across the codebase: **libraries for transport and platform primitives; all credential-format and presentation-protocol logic is written in-house.** Rationale: the wallet's scope is narrow (known formats, known issuer/verifier partners), so in-repo parsers stay small, testable, and free of heavy generic dependencies that degrade crypto/JSI performance on Hermes (see CLAUDE.md dependency rule).

### Libraries (third-party)

| Concern | Library | Scope of use |
|---|---|---|
| OID4VCI wire flow | `@sphereon/oid4vci-client` | Only in `src/services/vci/exchangeService.ts`: `CredentialOfferClient` (parse `openid-credential-offer://`, fetch issuer metadata) and `CredentialRequestClientBuilder` (token + credential request). Everything after the HTTP response is own code. |
| EdDSA sign/verify | `@noble/ed25519` + `@noble/hashes` | All Ed25519 operations (holder proof JWT, KB-JWT, JAR verification). |
| Hashing / base64 | `react-native-quick-crypto`, `react-native-quick-base64` | SHA digests (SD-JWT disclosure hashing), fast base64 codecs. |
| Seed storage + biometric gate | `react-native-keychain` | Ed25519 seed as Keychain generic-password entry: `SECURITY_LEVEL.SECURE_HARDWARE`, `STORAGE_TYPE.AES_GCM`, `ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE`. Seed read = the single biometric prompt per action (ADR 0008). |
| Credential records at rest | `react-native-mmkv` | Encrypted MMKV instance; stores normalized `VerifiableCredentialRecord`s and logical-credential groups. |
| NDEF tag reading | `react-native-nfc-manager` | Issuance offers from NFC tags only — insufficient for ISO 18013-5 presentation (ADR 0003). |

### Own implementations (in-repo)

| Concern | Where | How it is implemented |
|---|---|---|
| JWT primitives | `src/utils/jwtUtils.ts` | Hand-rolled compact-JWT split, base64url decode (`decodeJsonBase64Url`), record/string type guards. Foundation for every parser below — no `jsonwebtoken`/`jose` dependency in the app. |
| SD-JWT VC (IETF `dc+sd-jwt`, legacy `vc+sd-jwt` accepted) | `src/services/vp/*`, `src/services/crypto/crypto.ts` | Own parser for the `~`-separated compact form (`<issuer-jwt>~<disclosure>~...~<kb-jwt>`). Presentation build keeps only user-approved disclosures and appends a KB-JWT (`nonce`, `aud`, `sd_hash`) signed via the Keychain-gated Ed25519 key (`signSdJwtKbPresentationToken`, `crypto.ts`). Claims parsed into `VerifiableCredentialRecord.claims` for display; the signed `rawVc` string is the presentable artifact. |
| OID4VP 1.0 request handling | `src/services/vp/authorizationRequestJar.ts`, `clientIdScheme.ts` | Own JAR (signed Request Object) verification: `typ: oauth-authz-req+jwt` check, `client_id` scheme parsing (`redirect_uri`, `decentralized_identifier`, `pre_registered`), EdDSA signature check against pinned JWK or resolved `did:web` key, `response_uri`↔`client_id` origin binding. |
| `did:web` resolution | `src/services/vp/didWebResolver.ts` | Own resolver: standards-only HTTPS URL derivation (`/.well-known/did.json` or path form), verification-method selection by `kid`/`assertionMethod`, `publicKeyJwk` extraction. |
| Verifier trust | `src/config/trustedVerifiers.ts` + scheme-aware `findTrustedVerifier()` | Env-driven allowlist (`EXPO_PUBLIC_VERIFIER_*`), scheme-aware matching, optional pinned Ed25519 JWK per verifier. |
| DCQL + credential_sets | `src/services/vp/dcqlCredentialMatch.ts`, `dcqlCredentialSetResolver.ts` | Own DCQL evaluator: format filter (`dc+sd-jwt`, `vc+sd-jwt`, `jwt_vc_json`, `mso_mdoc`), `vct_values`/claims matching against stored records, `credential_sets` option resolution. No `dcql` or presentation-exchange npm package. |
| Presentation Definition fetch | `src/services/vp/presentationDefinitionResolver.ts` + `src/config/presentationDefinitionFetchPolicy.ts` | Own fetch with env-tunable timeout/max-bytes policy. |
| Dual-format credentials | `src/services/credentials/dualFormatIssuance.ts`, `logicalCredential*` | One logical document stored as linked `dc+sd-jwt` + `mso_mdoc` format records; grouping, consistency checks, and dual-format VP token assembly are all own code. |
| Credential normalization + storage | `src/services/vci/exchangeService.ts`, `src/services/storage/` | Issuer responses (SD-JWT VC string, JWT VC, base64-CBOR mdoc issuerSigned) normalized into `VerifiableCredentialRecord { id, type, rawVc, claims, issuedAt, expiresAt }` before encrypted MMKV save. |
| Holder signing | `src/services/crypto/crypto.ts` (+ ADR 0007/0008/0009) | Ed25519 seed generated once, stored in Keychain, signing done in JS with `@noble/ed25519`. Hardware-protected at rest, not hardware non-extractable (target AndroidKeyStore returned EC keys for Ed25519 requests during the superseded native-module probe). |

### Custom native modules (Kotlin, Android)

| Module | Purpose | Method |
|---|---|---|
| `modules/expo-mdoc-proximity` | ISO 18013-5 NFC presentation: `HostApduService` HCE declaring the ISO mDOC AID (`A0000002480400`) and the companion AID (`A00000045444410100`), companion APDU dispatch, session/consent arming from JS. | Local Expo Module (Kotlin). Byte-level companion protocol pinned in the companion APDU spec under `docs/superpowers/specs/` (CBOR command payloads, `61XX`/GET RESPONSE chaining, KB-JWT nonce binding). |

## Local Development Backend (`server/`)

| Layer | Choice |
|---|---|
| Runtime | Node.js + TypeScript `~5.9.2`, run via `tsx` |
| Framework | Express `^4.21.2` |
| Database | MySQL (`mysql2` `^3.11.5`) |
| Auth | `jsonwebtoken`, `bcrypt` |
| Email | `nodemailer` |
| Encoding | `cbor` (mdoc/CBOR issuer support) |
| API docs | `swagger-ui-express` |
| Testing | Jest `29.7.0` + `ts-jest`, `supertest` |

## Protocols & Standards

- **OID4VCI 1.0** — credential issuance, executed on-device (not via backend `/exchange/*`); transport via `@sphereon/oid4vci-client`, response handling own code
- **OID4VP 1.0** — online presentation (JAR, client_id schemes, DCQL, credential_sets, `did:web` verifier trust) — fully own implementation, compliance tracked in `docs/SPEC_COMPLIANCE_OID4VC.md`
- **IETF SD-JWT / SD-JWT VC** (`dc+sd-jwt`) — selective disclosure + key binding, own implementation
- **ISO 18013-5** — proximity presentation (mdoc) per ADR 0003, via `modules/expo-mdoc-proximity`; proprietary companion APDU extension for dual-format NFC transfer

## Tooling

- Package manager: Yarn (mobile + server)
- Codegen: Orval (`orval.config.ts` → `walletApi.json` client)
- CI-relevant local commands: `yarn tsc --noEmit`, `yarn lint`, `yarn test`, `expo prebuild --clean`; server: `yarn tsc`, `yarn test`
