# Demo Interop VP Submit Design

**Date:** 2026-08-25  
**Status:** Approved (brainstorming)  
**Reference:** [eudi-dev v1.26.2](https://github.com/dominikschlosser/eudi-dev) — golden trace: eudi-test.dev → TonyHere verifier (HTTP 200, `direct_post.jwt`)

## Problem

The wallet completes consent and signing for OID4VP presentation, but multiple verifiers fail when the wallet submits the VP token. Symptoms include verifier-side JARM decrypt failures and HTTP 500 responses after `POST` to `response_uri`. The failure point is the encrypted `direct_post.jwt` wire format, not credential matching or user consent.

VC claim from Animo Playground works for most credentials. VC claim from eudi-dev issuer is out of scope for this slice.

## Goals (Demo Stage)

1. Present VP successfully to TonyHere (`decentralized_identifier:did:web:...`) and Animo Playground (`x509_hash`).
2. Work without per-verifier allowlist configuration during demo.
3. Match eudi-dev wire format for SD-JWT + `direct_post.jwt`.
4. Keep production release builds strict; demo permissiveness is opt-in via env.

## Non-Goals

- Production trust policy redesign (allowlists, accreditation).
- OID4VP client_id schemes permanently blocked today: `openid_federation`, `verifier_attestation`, bare pre-1.0 `did:`.
- mDoc ISO 18013-7 JWE `apu`/`apv` binding.
- NFC / proximity presentation.
- eudi-dev issuer VCI parity (separate slice).
- Disabling biometric or KB signing by default in demo profile.

## Recommended Approach

**Demo Interop Profile + surgical wire-format fixes** (brainstorming options B + A).

Do not migrate VP submit entirely to `@openid4vc/openid4vp` adapter for this slice. Keep the existing `buildDirectPostFormBody` + `jweEcdhEs` path and align it with eudi-dev behavior.

## VP Submit Pipeline (Target)

```
User approves
  → sign SD-JWT + KB-JWT (aud = client_id, nonce = request nonce)
  → formatVpTokenForResponse()
      DCQL object_array: {"<query_id>":["<sd-jwt~kb>"]}
  → buildDirectPostFormBody()  [direct_post.jwt only]
      encrypt { vp_token: <object>, state }
      (no presentation_submission for DCQL)
  → POST response_uri  body: response=<compact-jwe>
  → Verifier decrypts JWE and validates VP
```

### Already Aligned with eudi-dev

| Behavior | Wallet implementation |
|----------|----------------------|
| DCQL `vp_token` shape | `object_array` default (`readVerifierDcqlVpTokenShape`) |
| KB-JWT `aud` | `client_id` default (`readVerifierKbAudienceMode`) |
| No `presentation_submission` for DCQL | `standardDcqlPresentationBuilder` omits it |
| `enc` selection | First supported from `encrypted_response_enc_values_supported` |
| JWE header `kid` | Set from recipient JWK when present |
| ECDH-ES + AES-GCM | `encryptCompactJweEcdhEsP256` |

### Gaps to Fix

| Gap | eudi-dev | Wallet (before) | Fix |
|-----|----------|-----------------|-----|
| JWK coordinate width | Left-pad short x/y (debug) | Strict 32-byte check throws | Lenient padding for encryption recipient JWK only when demo interop enabled |
| JWE `apv` for SD-JWT | Not set | Optional via `EXPO_PUBLIC_OID4VP_JWE_APV` | Demo profile never enables `apv`; document clearly |
| Verifier trust | Debug: proceed without allowlist | Empty allowlist blocks unknown verifiers | Demo profile enables trust-any verifier + x509 client_id schemes |

## Demo Interop Profile

### Env Var

```
EXPO_PUBLIC_WALLET_DEMO_INTEROP=true
```

Read via `readWalletDemoInteropEnabled()` in `src/config/runtimeFlags.ts`.

**Activation rule:** Enabled when env is `true` and build is development or EAS preview. Must be **false** in production release builds regardless of env value.

### Bundled Behaviors

When demo interop is enabled:

| Behavior | Mechanism |
|----------|-----------|
| Trust unlisted HTTPS verifiers | `readTrustAnyOid4vcVerifierEnabled()` returns true |
| Allow `x509_hash` / `x509_san_dns` client_id | `clientIdInteropPolicy.ts` |
| Lenient encryption JWK coordinate padding | `p256JwkToPublicKey` lenient mode for enc JWK path only |
| Wire defaults | `object_array`, KB `aud=client_id`, no JWE `apv`, `A128GCM` first |

Demo profile does **not** automatically enable: biometric bypass, KB signing bypass, or `EXPO_PUBLIC_OID4VC_VP_ADAPTER`.

### Documentation

Add recommended block to `.env.development.local.example`:

```
# Demo interop: trust any HTTPS verifier + eudi-dev-compatible VP submit wire format
EXPO_PUBLIC_WALLET_DEMO_INTEROP=true
```

## Components and File Changes

| File | Change |
|------|--------|
| `src/config/runtimeFlags.ts` | Add `readWalletDemoInteropEnabled()` |
| `src/config/oid4vcPeerTrustPolicy.ts` | Demo profile cascades to verifier trust-any |
| `src/services/vp/clientIdInteropPolicy.ts` | Demo profile allows x509 schemes |
| `src/services/crypto/p256Identity.ts` | Lenient coord padding option for enc JWK |
| `src/services/vp/oid4vpResponseEncryption.ts` | Use lenient JWK parse when demo interop on |
| `src/services/vp/directPostFormBody.ts` | Assert no `apv` when demo interop (guard against misconfigured env) |
| `src/screens/CredentialOfferClaimScreen.tsx` | Skip PID prerequisite when demo interop (UI gate only) |
| `.env.example` / `.env.development.local.example` | Document new var |
| Tests | See Testing section |

## Error Handling

### Pre-Submit (Encryption Setup)

| Error | Cause | Demo behavior |
|-------|-------|---------------|
| `InvalidP256JwkCoordinateLength` | Short JWK x/y | Left-pad + `logWalletStep` warning |
| Missing encryption JWK | No `client_metadata.jwks` | Fail fast; user-visible verifier misconfiguration message |
| `PresentationSubmissionFailed` (encrypt) | JWE build failure | Log raw error; include existing transport diagnostic |

### Post-Submit (Verifier Response)

| HTTP | Meaning | UI |
|------|---------|-----|
| 200 + `{}` | Success (TonyHere pattern) | Success screen |
| 4xx/5xx with JARM error | Verifier decrypt/validate failure | Safe hint + diagnostic panel |
| Network error | Timeout / no connection | Retry; return to scan |

### Diagnostics Additions

Extend `describeEncryptedSubmitAttempt` / presentation diagnostics:

- `jwe_apv_present: boolean` — must be `false` for SD-JWT demo path
- `jwk_coord_padded: boolean` — set when lenient padding applied

## Testing

### Unit Tests (Jest)

1. `p256Identity` — short x/y coordinates pad successfully; garbage coords still fail
2. `jweEcdhEs` — round-trip without `apu`/`apv` (eudi-dev golden pattern)
3. `directPostFormBody` — DCQL JWE inner payload is object; no `presentation_submission`
4. `runtimeFlags` — demo profile reader respects dev/preview vs production
5. `oid4vcPeerTrustPolicy` — demo profile enables verifier trust-any

### Manual Device Acceptance

| Target | Pass criteria |
|--------|---------------|
| TonyHere verifier | HTTP 200 after approve + submit |
| Animo playground VP | No "Failed to decrypt jarm auth response" |
| Animo VCI regression | Credential claim still works |

## Security Notes

- Demo interop is intentionally permissive (mirrors eudi-dev debug mode). It must not ship enabled in production release builds.
- Lenient JWK padding applies only to verifier encryption keys, not holder signing keys.
- Holder signing, MMKV encryption, and biometric sign-time gate are unchanged.
- Trust-on-first-use for arbitrary verifiers is acceptable for demo; production will require explicit trust policy (future slice).

## Future Work (Out of Scope)

- eudi-dev issuer VCI parity analysis and fixes
- Persistent trust store (trust-on-first-use with user confirmation)
- `openid_federation` and `verifier_attestation` client_id key resolution
- Automated E2E against live TonyHere / Animo endpoints
