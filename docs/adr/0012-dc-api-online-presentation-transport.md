# ADR 0012 - Digital Credentials API Online Presentation Transport

Status: Accepted

Date: 2026-08-25

## Context

The wallet needs an online presentation transport that interoperates with
[digital-credentials.dev](https://digital-credentials.dev/) and the W3C Digital
Credentials API (DC API). The Android platform can invoke a registered
Digital Credential provider from Chrome for same-device and cross-device
OpenID4VP requests.

The wallet already has an ISO 18013-5 NFC proximity presentation protocol
recorded in ADR 0003, and the Scan tab already handles QR-based OpenID4VP
requests through `direct_post`. The DC API transport must complement those
paths without changing their protocol or routing behavior.

## Decision

Add an Android Digital Credentials API provider as a separate online
presentation transport. The provider accepts OpenID4VP DC API requests and
supports the `dc_api` and `dc_api.jwt` response modes, using the existing
Holder matching, consent, signing, and encrypted-response boundaries where
they apply.

ADR 0003 remains unchanged: NFC presentation continues to use ISO 18013-5
proximity transport and its existing handover/session behavior. The existing
Scan `direct_post` path also remains unchanged; DC API requests are delivered
by the platform provider rather than by the Scan camera/classifier flow.

iOS DC API provider support is deferred to a separate slice.

## Consequences

- Android requires a new native provider module integrated with Android
  Credential Manager / Digital Credentials.
- The DC API path needs its own request bridge and response handling while
  reusing wallet presentation policy and consent boundaries.
- `dc_api` and `dc_api.jwt` require dedicated DeviceResponse and DC API handover
  handling; NFC handover behavior is not reused or changed.
- Physical Android validation remains required before production support is
  treated as complete.
- iOS remains outside this decision until a separate platform design is
  approved.
