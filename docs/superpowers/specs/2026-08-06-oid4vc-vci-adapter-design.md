# OID4VC VCI Adapter — `@openid4vc/openid4vci` Phase 2

**Date:** 2026-08-06  
**Status:** Phase 2/2.5/3 complete (2026-08-06) — legacy VCI client packages removed; `@openid4vc/openid4vci` is the only VCI path.  
**Related:** `docs/superpowers/specs/2026-07-31-oid4vc-vp-adapter-design.md` (Phase 1 VP), `src/services/vci/exchangeService.ts`, `src/services/oid4vc/oid4vcCallbacks.ts`, `docs/TASKS.md`

## Summary

Introduce a **replaceable OID4VCI protocol adapter** using `@openid4vc/openid4vci` (OpenWallet Foundation `oid4vc-ts`). **Phase 3 (complete):** all VCI protocol plumbing (offer parse, Pre-Authorized Code + Authorization Code token exchange, credential request, dual-format offers) runs through the adapter; legacy protocol client packages removed. Wallet orchestration (issuer metadata validation, configuration ID matching, PoP signing via Keychain, issuer `did:web` verify, mdoc storage, proof retries, wallet attestations) stays in `exchangeService.ts` and existing VCI modules.

This completes the **3-phase initiative** to align with the OWF stack (Phase 1 VP adapter; Phase 2 VCI adapter; Phase 3 legacy client removal).

## Goals

1. **Reduce maintenance** of legacy protocol-client code in `exchangeService.ts`.
2. **Ecosystem alignment** — same library family as Phase 1 VP adapter (`@openid4vc/openid4vp@0.5.4`).
3. **Safe rollout** — ~~`EXPO_PUBLIC_OID4VC_VCI_ADAPTER` build-time flag~~ **Removed in Phase 3**; oid4vc is always-on.
4. **Replaceable boundary** — mirror Phase 1 VP adapter module layout under `src/services/vci/oid4vc/`.

## Non-goals (Phase 2)

- Authorization Code grant / same-device issuance (legacy protocol client path always).
- Wallet crypto v2 WUA/WIA attestations and per-credential pending keys (legacy when `isWalletCryptoV2Enabled()`).
- Removing legacy VCI client packages (Phase 3 — complete).
- UI changes.
- Deferred issuance parity beyond existing wallet retry/poll helpers (adapter uses lib `retrieveCredentials`; deferred path reuses wallet `DeferredIssuancePending`).

## Background

| Layer | Today | Phase 2 target |
|-------|-------|----------------|
| VCI parse/token/request | Legacy protocol client in `exchangeService.ts` | `@openid4vc/openid4vci` adapter when flag on **and** in-scope |
| VCI orchestration | `exchangeService.ts` (~2.3k lines) | **No change** — finalize, verify, storage, sync |
| PoP signing | Keychain Ed25519 via `crypto.ts` | **No change** — wallet-owned; lib receives pre-signed JWT proof |
| VP | Phase 1 `@openid4vc/openid4vp` adapter | **No change** |

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Rollout flag | `EXPO_PUBLIC_OID4VC_VCI_ADAPTER` — boolean, default `false`, **build-time** |
| Scope | Pre-Authorized Code grant only |
| Protocol path persistence | `ResolvedCredentialOffer.protocolPath` (`legacy` \| `oid4vc`) chosen at `resolveOffer()`; claim reuses same path |
| Adapter context | `Oid4vcVciAdapterContext` stores lib `credentialOfferObject` + `issuerMetadataResult` for token/credential calls |
| Adapter placement | `src/services/vci/oid4vc/` |
| Shared callbacks | `src/services/oid4vc/oid4vcCallbacks.ts` — VP mode (`signJwt` fail-closed); VCI mode accepts optional `signJwtImpl` for future DPoP/client-attestation |
| PoP signing | Wallet-owned — `signProof()` / proof signing session; **one biometric per claim action** |
| Issuer metadata | Wallet `fetchIssuerMetadata()` for UI/config resolution; lib `resolveIssuerMetadata()` stored in adapter context for protocol |
| Error prefixes | Preserve existing (`CredentialOfferParseFailed`, `CredentialTokenExchangeFailed`, `CredentialRequestFailed`, etc.) |
| Logging | `logWalletStep` / `logWalletError` with `oid4vci` scope; no tokens, VC payloads, claims, or key material |

## Architecture

### Data flow (Phase 2 first slice)

```text
openid-credential-offer:// or credential_offer_uri
        │
        ▼
resolveOffer(offerUri)
        │
        ├─ resolveCredentialOfferUriForTransport()   (wallet — credential_offer_uri fetch)
        ├─ shouldUseOid4vcVciAdapter()               (flag + pre-auth + not v2 crypto)
        │
        ├─ protocolPath === 'oid4vc':
        │    parseCredentialOfferViaOid4vc()
        │    resolveIssuerMetadataViaOid4vc()
        │    mapCredentialOfferObjectToWalletOffer()
        │    fetchIssuerMetadata() + resolveCredentialConfigurations()
        │    ResolvedCredentialOffer { protocolPath, oid4vcContext }
        │
        └─ protocolPath === 'legacy':
             legacy protocol client offer parse
        │
        ▼
claimCredential(resolvedOffer)
        │
        ├─ acquireCredentialRecord()
        │    signProof() — wallet Keychain (unchanged)
        │    acquireAccessToken:
        │      oid4vc → retrievePreAuthorizedTokenViaOid4vc()
        │      legacy → requestPreAuthorizedAccessToken()
        │    requestCredential:
        │      oid4vc → retrieveCredentialViaOid4vc(proof jwt)
        │      legacy → CredentialRequestClientBuilder
        │
        ├─ finalizeCredentialRecord() — issuer verify, claims normalize (wallet)
        └─ saveCredentialRecord() — MMKV (wallet)
```

### Flag routing (`shouldUseOid4vcVciAdapter`)

Return `true` only when **all** hold:

1. `EXPO_PUBLIC_OID4VC_VCI_ADAPTER === 'true'`
2. Offer includes `grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'].pre-authorized_code`
3. `isWalletCryptoV2Enabled()` is **false** (WUA/WIA + per-credential keys stay legacy until adapter parity)

Otherwise `protocolPath: 'legacy'`.

### Preserved wallet behavior (all paths)

| Concern | Owner |
|---------|--------|
| Configuration ID alias matching (`IdCard_dc+sd-jwt` → `idcard`) | `exchangeService.ts` |
| `credential_identifier` from token `authorization_details` | `readCredentialIdentifierFromTokenResponse()` |
| PoP JWT EdDSA + holder DID / per-credential key | `crypto.ts` |
| `invalid_proof` + refreshed `c_nonce` retry | `acquireCredentialRecord()` |
| Issuer `did:web` signature verify on receive | `issuerDidWebVerify.ts` |
| mdoc native storage | `mdocStorage.ts` |
| Wallet attestations (`wua`/`wia`) | Legacy path only in Phase 2 |
| Backend sync | Unchanged |

### New modules

| File | Responsibility |
|------|----------------|
| `src/services/oid4vc/oid4vcCallbacks.ts` | Shared `@openid4vc/oauth2` `CallbackContext` for VP + VCI |
| `src/services/vci/oid4vc/types.ts` | `ProtocolPath`, `Oid4vcVciAdapterContext` |
| `src/services/vci/oid4vc/isOid4vcVciAdapterEnabled.ts` | Build-time flag reader |
| `src/services/vci/oid4vc/shouldUseOid4vcVciAdapter.ts` | Post-parse routing |
| `src/services/vci/oid4vc/createOid4vcVciClient.ts` | `Openid4vciClient` factory |
| `src/services/vci/oid4vc/parseCredentialOfferViaOid4vc.ts` | Offer parse + issuer metadata resolve |
| `src/services/vci/oid4vc/mapOid4vcOfferToWalletShape.ts` | Lib offer → wallet-compatible offer shape |
| `src/services/vci/oid4vc/retrieveViaOid4vc.ts` | Token exchange + credential retrieve |
| `src/services/vci/oid4vc/*.test.ts` | Unit + Hermes smoke |

### Modified modules

| File | Change |
|------|--------|
| `src/services/vci/exchangeService.ts` | Flag routing at `resolveOffer()` + `createDefaultClaimCredentialDependencies()` |
| `src/services/vp/oid4vc/oid4vcCallbacks.ts` | Re-export shared callbacks (VP mode) |
| `.env.example` | Document `EXPO_PUBLIC_OID4VC_VCI_ADAPTER` |
| `docs/TASKS.md` | Track Phase 2 progress |
| `package.json` | Pin `@openid4vc/openid4vci@0.5.4` |

### Dependencies

```json
"@openid4vc/openid4vci": "0.5.4"
```

Legacy VCI client packages removed in Phase 3.

## Callbacks (VCI PoP)

Phase 2 **does not** delegate PoP signing to lib callbacks. Flow:

1. Wallet `createProofSigningSession()` → single Keychain biometric gate.
2. Wallet `signProof(cNonce, issuer)` → compact PoP JWT.
3. Adapter `retrieveCredentialViaOid4vc({ proofJwt })` passes proof to `Openid4vciClient.retrieveCredentials()`.

`signJwt` in shared callbacks remains fail-closed for VP; VCI client accepts optional `signJwtImpl` for future DPoP/client-attestation without restructuring.

## Testing

### Unit / smoke

1. **Hermes smoke** — `parseCredentialOfferViaOid4vc` on inline pre-auth offer URI.
2. **Flag reader** — `isOid4vcVciAdapterEnabled.test.ts`.
3. **Routing** — `shouldUseOid4vcVciAdapter.test.ts` (flag off, auth-code-only, v2 crypto fallback).
4. **Integration** — flag-on subset of `exchangeService.test.ts` (deferred to plan Task 8).

### Regression gate

```bash
yarn test src/services/vci/oid4vc/
yarn tsc --noEmit
yarn lint
```

### Manual E2E (Phase 2 done)

Setup: `EXPO_PUBLIC_OID4VC_VCI_ADAPTER=true` + dev issuer.

| # | Step | Expected |
|---|------|----------|
| 1 | Scan pre-auth credential offer QR | Confirmation screen, correct config |
| 2 | Approve + biometric | Credential saved |
| 3 | Flag `false` rebuild | Legacy protocol client path still works |
| 4 | Same-device auth-code issuance | Legacy path (not adapter) |

## Rollout

Same build-time model as Phase 1 VP adapter. Enable in dev/staging EAS env; production after soak.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Lib API mismatch vs legacy request shapes | Adapter wrap layer; wallet-owned proof; parity tests |
| v2 crypto / attestations blocked on legacy | Explicit routing guard in `shouldUseOid4vcVciAdapter` |
| Dual dependency bloat | Accepted until Phase 3; documented in TASKS |
| signJwt required for some issuers | Optional `signJwtImpl` hook; expand in Phase 2.5 |

## Phase 2 definition of done (incremental)

- [x] Phase 0 spike: `@openid4vc/openid4vci@0.5.4` + Hermes smoke
- [x] Design spec + implementation plan
- [x] `src/services/vci/oid4vc/` foundation + shared callbacks
- [x] First boundary slice: `resolveOffer()` + claim token/credential routing
- [ ] Parity tests vs legacy fixtures
- [ ] Flag-on integration tests in `exchangeService.test.ts`
- [ ] Manual E2E with flag-on dev build
- [ ] Authorization Code adapter path (Phase 2.5)
- [ ] Wallet crypto v2 attestations on adapter path (Phase 2.5)

## Phase 2.5 (this session)

- [x] Authorization Code grant on adapter path (`retrieveAuthorizationCodeTokenViaOid4vc`, `resolveAuthorizationCodeIssuance`)
- [x] Dual-format offers eligible for adapter when flag on
- [x] Wallet crypto v2 guard → legacy (`isWalletCryptoV2Enabled()` in routing)
- [ ] WUA/WIA attestations via adapter (deferred — v2 stays legacy)
- [ ] DPoP `signJwt` wiring (deferred)

## Future phases

| Phase | Scope |
|-------|-------|
| 2.6 | v2 WUA/WIA + per-credential keys on adapter path |
| 3 | Remove legacy VCI client packages (complete) |
