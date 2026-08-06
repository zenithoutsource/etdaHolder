# OID4VC VP Adapter — Phase 0 Spike Notes

**Date:** 2026-08-05  
**Package:** `@openid4vc/openid4vp@0.5.4` (pinned exact)

## API choice

Use the **functional** exports from `@openid4vc/openid4vp` (not `Openid4vpClient`):

| Stage | Function |
|-------|----------|
| Parse routing input | `parseOpenid4vpAuthorizationRequest` |
| Verify + normalize | `resolveOpenid4vpAuthorizationRequest` |
| Submit `direct_post` | `submitOpenid4vpAuthorizationResponse` |

Rationale: `Openid4vpClient` constructor expects holder signing/encryption callbacks (`signJwt`, `encryptJwe`) that Phase 1 does not use. Functional APIs accept a minimal `Pick<CallbackContext, …>` per call.

## Submit strategy

**Lib submit** via `submitOpenid4vpAuthorizationResponse`:

- Input: stored `authorizationRequestPayload` (from resolve) + wallet-formatted `authorizationResponsePayload` (`vp_token`, optional `state`).
- Callbacks: `{ fetch }` only.
- Wallet-owned `formatVpTokenForResponse()` runs before submit; lib does not assemble VP tokens.

Fallback (wallet-owned `URLSearchParams` POST) deferred — spike confirms lib submit fits Phase 1 DCQL `direct_post`.

## Callbacks (`oid4vcCallbacks.ts`)

| Callback | Phase 1 |
|----------|---------|
| `fetch` | Injectable; default `global.fetch` |
| `hash` | `@noble/hashes` |
| `verifyJwt` | `verifyEdDsaCompactJwt` + JWK from `jwtSigner` |
| `generateRandom` | `react-native-quick-crypto` `randomBytes` |
| `clientAuthentication` | `clientAuthenticationNone()` |
| `decryptJwe`, `getX509CertificateMetadata`, `signJwt`, `encryptJwe` | Fail closed → `PresentationRequestUnsupported` |

## Hermes smoke

`src/services/vp/oid4vc/openid4vpHermesSmoke.test.ts` imports `@openid4vc/openid4vp` and parses a by-value `redirect_uri` + inline DCQL `openid4vp://` URI via `parseOpenid4vpAuthorizationRequest`.

## Persisted adapter context

```typescript
type Oid4vcAdapterContext = {
  authorizationRequestPayload: Record<string, unknown>
}
```

Required for `submitOpenid4vpAuthorizationResponse` round-trip.
