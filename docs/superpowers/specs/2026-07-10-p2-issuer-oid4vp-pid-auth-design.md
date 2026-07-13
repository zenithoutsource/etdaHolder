# P2 Issuer OID4VP PID Auth Design

Status: Approved for handler-only implementation

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

## Manual Validation

When the real Issuer API is available:

1. Configure issuer OID4VP trust env to match the real `client_id`, `response_uri` origin, and pinned JWK if signed Request Objects are used.
2. Launch a live request through QR or `adb shell am start ... openid4vp://authorize?...`.
3. Approve consent and complete the sign-time biometric prompt.
4. Confirm the Wallet POST reaches the Issuer `response_uri`.
5. Claim the credential offer through the existing OID4VCI path when the Issuer sends it.
