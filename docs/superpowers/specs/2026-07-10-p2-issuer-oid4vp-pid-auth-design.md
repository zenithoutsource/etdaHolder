# P2 Issuer OID4VP PID Auth Design

Status: **Handler shipped** (2026-07-10) · **E2E pending** live Issuer API (step 3 peer)

## Implementation status

| Wallet step | Diagram | Status | Notes |
|-------------|---------|--------|-------|
| 4 | Prompt PID consent | Shipped | Scan OID4VP consent UI |
| 6 | Generate VP | Shipped | `createApprovedPresentationResponse()` |
| 7 | Submit VP | Shipped | `submitPresentationResponse()` → Issuer `response_uri` |
| 3 | Issuer sends OID4VP | Peer | Wallet cannot invent; E2E blocked here |

Wallet steps 4–7 are **not** wired inside the credential-offer claim screen by design. Intake is `openid4vp` QR/deeplink → Scan tab (same path as Verifier OID4VP).

## Goal

Enable the Wallet to answer an Issuer-initiated OID4VP Authorization Request for PID presentation. This covers the Wallet side of steps 3-7:

1. Receive an `openid4vp://` Authorization Request through QR, deeplink, or future portal redirect.
2. Resolve and validate the request with the existing OID4VP service.
3. Match the request to the stored PID VC (`ThaiNationalID`).
4. Show Holder consent for the requested disclosure.
5. Create the VP response and POST it to the Issuer `response_uri`.

Issuer-side continuation after the POST is out of scope for this slice.

## Sequence Mapping

```text
Issuer -> Wallet: openid4vp Authorization Request
Wallet -> Wallet: resolvePresentationRequest()
Wallet -> Holder: consent screen
Holder -> Wallet: approve
Wallet -> Wallet: createApprovedPresentationResponse()
Wallet -> Issuer: submitPresentationResponse() direct_post
Issuer -> Holder/Wallet: later sends credential offer through existing issuance path
```

Wallet steps 3-7 are implemented by the existing Scan OID4VP path. Issuer steps 8-18 remain owned by the real Issuer API and require live `response_uri` availability before E2E validation.

## Intake

The Wallet accepts issuer PID auth only through normal OID4VP request intake:

- `openid4vp://...` deeplink
- QR payload where `isOid4VpAuthorizationRequest()` returns true
- Future portal redirect that delivers the same OID4VP request shape

The Wallet does not generate a sample request and does not fake this inside the credential-offer claim screen.

## Trust Boundary

Issuer OID4VP relying parties use the same `TrustedVerifier` shape as Verifier requests because both are OID4VP requesters:

- exact `did:web` `client_id` match after `decentralized_identifier:` normalization
- exact allowlisted `response_uri` origin
- optional pinned JWK for signed Request Object verification

The trust list is local env configuration. Release builds must not rely on development `redirect_uri:` entries.

## Credential Matching

The initial supported credential is PID:

- Wallet record type: `ThaiNationalID`
- DCQL aliases may include `IDCardCredential`, `ThaiNationalID`, or `idcard` through existing matchers.
- Requested claim labels come from `src/config/cardSchemas.ts`.

No protocol fork is added for Issuers. The Scan path continues to call `resolvePresentationRequest()`, `createApprovedPresentationResponse()`, and `submitPresentationResponse()`.

## Biometric Rule

A signed VP or SD-JWT+KB response uses the Keychain Ed25519 sign-time gate. The Wallet must not add a second app-level biometric prompt for the same Holder approval action. Raw-credential presentation modes may use an app-level gate because they do not sign.

## Non-Goals

- Mock Issuer VP receive API under `server/`
- Authorization Code OID4VCI after VP
- Chaining the resulting credential offer into the same session
- Trust Registry verification on credential receive
- Replacing the P1 ThaID simulation
- Per-credential `did:key`

## Manual Validation (E2E — when Issuer API is live)

Prerequisites: Issuer at `http://issuer.zenithcomp.co.th:455` (or production host) sends a real `openid4vp://` Authorization Request with PID DCQL and a working `response_uri`.

1. Set issuer OID4VP trust env in `.env.development.local` (see `.env.development.local.example`):
   - `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID` — must match Issuer `client_id` (with or without `decentralized_identifier:` prefix)
   - `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN` — origin of Issuer `response_uri`
   - `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME` (optional display label)
   - `EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK` (optional; required if Issuer uses signed Request Objects / JAR)
2. Holder must have stored PID VC (`ThaiNationalID`) before presenting.
3. Launch request via Scan QR or `adb shell am start -a android.intent.action.VIEW -d "openid4vp://authorize?..."`.
4. Approve consent; complete the single sign-time Keychain biometric gate (no second prompt).
5. Confirm Wallet POST reaches Issuer `response_uri` (check Issuer logs or network trace).
6. When Issuer sends the credential offer separately, claim through existing OID4VCI path (`resolveOffer` → claim).

**Blocked until step 1 prerequisites are met by the customer Issuer team.** No Wallet mock server is provided for this slice.
