# OID4VP over Digital Credentials API (dc_api / dc_api.jwt)

**Date:** 2026-08-25  
**Status:** Approved  
**Plan:** `docs/superpowers/plans/2026-08-25-oid4vp-dc-api.md`  
**Success target:** End-to-end on [digital-credentials.dev](https://digital-credentials.dev/) on Android (Galaxy A26 class), mDL already stored, unsigned + signed + encrypted, same-device and cross-device QR.

## Summary

Add Android Digital Credentials API (DC API) as a Holder presentation transport alongside the existing `openid4vp://` + `direct_post` Scan path. The wallet registers as an Android Credential Manager provider, receives OpenID4VP-over-DC-API requests from Chrome, matches stored mDL, shows existing consent UI, builds ISO mdoc `DeviceResponse` with `OpenID4VPDCAPIHandover`, and returns `dc_api` or `dc_api.jwt` responses to the platform.

## Goals

1. Pass digital-credentials.dev E2E: mDL claims (`family_name`, `given_name`, `birth_date`, `portrait`, `age_over_21`).
2. Support `response_mode` `dc_api` and `dc_api.jwt` with protocol `openid4vp-v1-unsigned` and `openid4vp-v1-signed`.
3. Same-device (Chrome on phone) and cross-device (desktop QR → phone) flows.
4. Wallet-automatic trust policy (no per-verifier manual mode).
5. One biometric prompt per presentation (sign-time gate only).
6. Existing `openid4vp://` + `direct_post` Scan flows unchanged.

## Non-goals

- iOS DC API provider (separate slice).
- SD-JWT credentials over DC API in v1.
- mDL issuance (credential already stored).
- Scan-tab intake of DC API cross-device QR (platform invokes provider, not camera classifier).
- Replacing NFC proximity presentation (ADR 0003).
- Production support for unsigned `dc_api` (dev/preview demo interop only).

## Wallet-automatic trust policy

| Request | Production release | Dev/preview + `EXPO_PUBLIC_WALLET_DEMO_INTEROP=true` |
|---|---|---|
| Unsigned `dc_api` | Reject | Allow if Origin is HTTPS |
| Signed `dc_api` / `dc_api.jwt` | Allow if JAR + `x509_hash` verify and existing verifier trust passes | Same; demo interop may trust unknown HTTPS verifiers |

Implementation: `dcApiTrustPolicy.ts` derives policy from signed vs unsigned JAR, build profile, and existing `findTrustedVerifier` / demo interop helpers. Unsigned requests ignore any present `client_id` per OID4VP DC API rules.

mdoc device-auth audience: `origin:https://<verifier-origin>` (not `client_id`).

## Architecture

```text
Chrome / digital-credentials.dev
  → navigator.credentials.get()
  → Android Credential Manager
  → expo-dc-api-provider (native)
  → dcApiPresentationService (JS)
       → dcApiTrustPolicy
       → DCQL match (reuse dcqlCredentialMatch / resolver)
       → consent (reuse Oid4VpDisclosureFlow / PresentationConsentPanel)
       → buildDcApiDeviceResponse (native, expo-mdoc-proximity)
       → hardware P-256 device auth (one biometric)
       → dcApiResponseBuilder (dc_api plaintext | dc_api.jwt JWE)
  → DigitalCredential → Chrome → verifier UI
```

## Components

| Component | Location | Role |
|---|---|---|
| `expo-dc-api-provider` | `modules/expo-dc-api-provider/` | Credential Manager registration; request/response bridge; cross-device handoff |
| `dcApiPresentationService` | `src/services/vp/dcApi/` | Orchestration: resolve → match → consent → sign → respond |
| `dcApiTrustPolicy` | `src/services/vp/dcApi/` | Automatic unsigned/signed/production rules |
| `dcApiResponseBuilder` | `src/services/vp/dcApi/` | `vp_token` shape + `dc_api.jwt` encryption (reuse `jweEcdhEs`) |
| `buildDcApiDeviceResponse` | `modules/expo-mdoc-proximity/` | CBOR `DeviceResponse` + `OpenID4VPDCAPIHandover` SessionTranscript |
| `dcApiConsentBridge` | `src/services/vp/dcApi/` + app shell | Surface consent from provider callback without Scan tab |

**Reuse unchanged:** `dcqlCredentialMatch`, mdoc storage, `encryptCompactJweEcdhEsP256`, hardware signing, wallet logger (no PII).

**Replace for DC API path:** interim `readMdocVpTokenEntry` raw-issuer-bytes path — digital-credentials.dev requires full `DeviceResponse`.

## DC API DeviceResponse (native)

Per OID4VP Appendix A / ISO 18013-5 SessionTranscript for DC API:

- `DeviceEngagementBytes` = null  
- `EReaderKeyBytes` = null  
- `Handover` = `OpenID4VPDCAPIHandover` with `[origin, nonce, jwkThumbprint|null]`

Selective disclosure limited to DCQL-approved namespace keys. Device auth uses hardware `k_cred` when `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED` is on.

## Error handling

| Condition | Holder outcome |
|---|---|
| Unsigned in production release | Fail closed before consent |
| No matching mDL | User-visible no-credential message; provider returns platform error |
| User cancel | DC API canceled |
| Trust / JAR failure | Fail closed; generic UI; raw diagnostic log |
| DeviceResponse / JWE failure | Generic presentation failure; raw diagnostic log |

No logging of claims, `DeviceResponse` plaintext, JWE keys, or Origin PII beyond redacted wallet logger fields.

## Testing

1. **Unit:** trust policy matrix; `OpenID4VPDCAPIHandover` CBOR golden vectors; JWE payload for `dc_api.jwt`.
2. **Integration:** mock native provider → JS orchestration → mock DeviceResponse.
3. **Device E2E (release gate):** A26 + Chrome + digital-credentials.dev — unsigned, signed, signed+encryption, same-device, cross-device.
4. **Regression:** `openid4vp://` Scan + `direct_post` / `direct_post.jwt` unchanged.

## Documentation follow-up

- New ADR: [`0012-dc-api-online-presentation-transport.md`](../../adr/0012-dc-api-online-presentation-transport.md) for DC API as online presentation transport (complements ADR 0003 NFC).
- Update P4 canvas if Holder steps change.
- Update `docs/CODEMAPS/frontend.md` if consent entry path changes.
- Update `docs/TASKS.md` when implementation lands.
- `.env.example`: document any new DC API tuning vars if added.

## Related specs

- `docs/superpowers/specs/2026-08-25-demo-interop-vp-submit-design.md` (demo interop flag pattern)
- `docs/superpowers/specs/2026-08-21-oid4vp-direct-post-jwt-design.md` (JWE reuse)
- `docs/adr/0003-nfc-presentation-protocol.md` (proximity unchanged)
