# Production My QR — Presentation Gateway (Approach 1)

> **Date:** 2026-07-09  
> **Status:** Superseded for production authority model — see `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md` (Option A: verifier-owned presentation service).  
> **Supersedes (production path):** dev-only semantics in `docs/superpowers/specs/2026-06-29-vp-qr-wallet-initiated-design.md` §Production roadmap  
> **Related:** `docs/superpowers/specs/2026-06-29-vp-qr-wallet-initiated-design.md` (§2.1 crypto checklist), `src/hooks/useWalletInitiatedVpQrSession.ts`, `server/src/services/sdJwtVerifier.ts`

## Summary

Ship **production My QR** by hardening the proven **VP-by-reference relay** into a **Presentation Gateway**, while the mobile app talks through a **`PresentationGatewayClient`** interface so gateway host and OID4VP profile can change later without UI rewrites.

**v1 ships:** relay-shaped adapter + ThaID only + browser HTML verify.  
**v1 designs for (does not implement):** pluggable gateway host, OID4VP wallet-initiated adapter, verifier DCQL, verifier backend callback, non-ThaID credentials.

## Problem

Dev relay (`/dev/vp-session`, in-memory store, pinned issuer JWK) validated the golden path (Galaxy A36 + Honeywell) but is not production-grade: no persistent sessions, no `/v1` API, wallet couples to `/dev/*` URLs, issuer key is env-pinned only.

## Goals (v1)

1. Holder presents **ThaID** via **My QR tab** and credential-detail modal using an **online** gateway.
2. Wallet depends on **`PresentationGatewayClient`**, not raw `/dev/*` fetch paths.
3. Reference gateway exposes **`/v1/presentation-sessions`** and **`/v1/present/verify`** with the **§2.1 SD-JWT-KB checklist** (same as dev spec).
4. Verifier golden path: scan QR → HTTPS verify URL → HTML pass/fail.
5. Wallet shows success only when gateway reports **`consumed`** (existing poll behaviour).
6. Issuer public key resolved from **JWKS/metadata** on gateway (pinned JWK remains dev fallback).
7. Dev `/dev/*` routes **remain** for LAN testing.

## Non-goals (v1)

- Offline My QR (ISO 18013-5 NFC is separate per ADR 0003)
- Replacing Scan-tab verifier-initiated OID4VP
- Issuer API calls during presentation
- Verifier OID4VP `direct_post` in My QR flow
- Verifier webhook delivery (session model may carry optional fields; no implementation)
- Verifier-driven DCQL disclosure (wallet-decided disclosure only)
- Non-`ThaiNationalID` credentials on gateway policy
- OID4VP wallet-initiated adapter implementation

## Locked product decisions

| Topic | Decision |
|-------|----------|
| Gateway host | Pluggable; deployment target TBD (company / the customer / other) |
| Protocol v1 | `RelayPresentationGatewayAdapter` (VP-by-reference) |
| Disclosure v1 | Wallet-decided (full presentable SD-JWT upload) |
| Verifier outcome v1 | Browser HTML only |
| Credentials v1 | `ThaiNationalID` only on gateway enforce |
| Code location | Spec + reference gateway in this repo; production deploy TBD |
| Backend count | **One new logical service** (Presentation Gateway); separate from wallet-api recommended in production |

## Architecture

```text
Wallet  --PresentationGatewayClient-->  Presentation Gateway  <--GET verify--  Verifier browser
   |                                        |
   | sign KB-JWT (Keychain, on-device)      | §2.1 verify + session store
   v                                        v
 stored ThaID SD-JWT                    JWKS cache (issuer)
```

**Not in My QR path:** Issuer issuance API, Verifier OID4VP API, Wallet Backend (except optional co-location on same VM).

## Mobile boundary

### `PresentationGatewayClient`

```typescript
type PresentationSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  verifyUrl: string
}

type PresentationSessionStatus = 'pending' | 'ready' | 'consumed' | 'expired'

interface PresentationGatewayClient {
  createSession(input?: { credentialType?: string }): Promise<PresentationSession>
  uploadPresentation(
    sessionId: string,
    input: { vpToken: string; credentialType: string },
  ): Promise<void>
  fetchSessionStatus(sessionId: string): Promise<PresentationSessionStatus>
}
```

### `RelayPresentationGatewayAdapter` (v1 only shipped adapter)

Maps to HTTP API below. Base URL: `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` (falls back to `EXPO_PUBLIC_VP_RELAY_BASE_URL` then wallet-api origin strip for dev compatibility).

### Wallet flow (unchanged behaviour)

1. `createSession` → `signSdJwtKbPresentationToken({ audience: gatewayBaseUrl, nonce, sdJwt })` — **one biometric** at sign time only.
2. `uploadPresentation` → show QR (`verifyUrl`) → poll until `consumed` | `expired`.
3. Gating: `resolvePidVpQrCredential` / `isCredentialPresentable` / `isSdJwtCredential`.

## Gateway API (v1)

Base: `PRESENTATION_GATEWAY_BASE_URL` (server env, HTTPS in production)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/presentation-sessions` | Create session; return `sessionId`, `nonce`, `expiresAt`, `verifyUrl` |
| `PUT` | `/v1/presentation-sessions/{id}` | Upload `vpToken` + `credentialType` (single write) |
| `GET` | `/v1/presentation-sessions/{id}/status` | `pending` \| `ready` \| `consumed` \| `expired` |
| `GET` | `/v1/present/verify?s={id}` | Verify + HTML result; mark `consumed` on success |

### Session model

```typescript
type PresentationSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  vpToken: string | null
  consumed: boolean
  credentialType: string
  // Extension (optional, ignored v1): presentationRequestId?, verifierCallbackUrl?
}
```

### Create session response `201`

```json
{
  "sessionId": "uuid",
  "nonce": "hex-64-chars",
  "expiresAt": "ISO-8601",
  "verifyUrl": "https://gateway.example/v1/present/verify?s=uuid"
}
```

### Upload `PUT` body

```json
{ "vpToken": "<sd-jwt~...~kb-jwt>", "credentialType": "ThaiNationalID" }
```

Gateway **rejects** non-`ThaiNationalID` with `400` in v1.

## Verification (§2.1 — required)

Reuse `sdJwtVerifier.ts` checklist:

1. Parse SD-JWT-KB  
2. Issuer SD-JWT signature (JWKS resolver with cache; env pin fallback)  
3. Holder KB-JWT vs `cnf.jwk` or `cnf.kid`  
4. `nonce` === session.nonce  
5. `aud` === gateway base URL  
6. `sd_hash` over SD-JWT portion including trailing `~`  
7. `iat` within TTL window ±60s skew  
8. On failure → HTML error with reason code (no claim values in logs)

## Issuer key resolution (production)

| Priority | Source |
|----------|--------|
| 1 | JWKS from issuer metadata (`resolveVpIssuerPublicKeyFromRawVc` / existing JWKS probe logic) |
| 2 | `VP_ISSUER_PUBLIC_KEY_JWK` env fallback (dev / break-glass) |

Cache TTL: `PRESENTATION_ISSUER_JWKS_CACHE_MS` (default 3600000 ms). Document in `server/.env.example`.

## Security

- HTTPS required in production (`NODE_ENV=production` rejects verify on HTTP).
- Session single-use (`consumed` after successful verify).
- TTL: `PRESENTATION_SESSION_TTL_MS` (default 300000); wallet countdown from `expiresAt`.
- Rate limit create/upload/verify per IP (reuse existing express patterns or minimal middleware).
- No `vpToken`, `nonce`, claims, or JWT bodies in production logs.

## Deployment

| Environment | Topology |
|-------------|----------|
| Staging | 1 VM, reference gateway, in-memory or single DB store |
| Production | Gateway service separate from wallet-api; 2+ instances + LB; **persistent session store** (Redis or DB — not in-memory) |

## Extension hooks (phase 2 — not v1)

- `Oid4vpPresentationGatewayAdapter`
- `presentationRequestId` + DCQL on create session
- `verifierCallbackUrl` + signed webhook
- `allowedCredentialTypes` policy
- `GET /v1/presentation-sessions/{id}/result` JSON for verifier backends

## Success criteria

- [ ] ThaID My QR → scan → HTML **ตรวจสอบสำเร็จ** on `/v1/present/verify`
- [ ] Wallet success only after `status === consumed`
- [ ] Session expired / reused QR handled correctly
- [ ] Issuer verify works via JWKS without manual env pin (pin still works as fallback)
- [ ] Dev `/dev/*` LAN path still works unchanged
- [ ] `yarn test`, `yarn tsc --noEmit`, `yarn lint` pass

## References

- `docs/superpowers/specs/2026-06-29-vp-qr-wallet-initiated-design.md` — §2.1 checklist, dev relay  
- `docs/superpowers/plans/2026-07-06-wallet-initiated-vp-qr.md` — implemented dev slice  
- `docs/ARCHITECTURE.md` §3 — presentation channels
