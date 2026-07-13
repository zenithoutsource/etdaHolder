# Verifier-Owned Wallet-Initiated Presentation (Option A)

> **Date:** 2026-07-09  
> **Status:** Approved — production authority model  
> **Supersedes:** wallet-as-authority framing in `docs/superpowers/specs/2026-07-09-production-my-qr-presentation-gateway-design.md`  
> **Related:** `docs/superpowers/specs/2026-06-29-vp-qr-wallet-initiated-design.md` (§2.1 crypto checklist), `server/src/services/sdJwtVerifier.ts`, `src/hooks/useWalletInitiatedVpQrSession.ts`

## Summary

**Production My QR** uses a **verifier-owned presentation service**. The Verifier backend creates sessions, stores VP tokens, runs §2.1 SD-JWT-KB verification on scan, and returns HTML pass/fail to the checkpoint browser. The wallet company backend is **not** in this path.

**Development:** A reference implementation of the same `/v1/*` API may co-locate on the local `server/` process for LAN testing (Galaxy + Honeywell). That co-location is a deployment convenience only — the authority model remains verifier-owned.

## Production architecture

```text
Wallet App
  │ POST /v1/presentation-sessions       (Verifier API)
  │ PUT  /v1/presentation-sessions/{id}  (upload vpToken)
  │ sign KB-JWT: aud = Verifier presentation base URL, nonce from verifier
  │ show QR = verifyUrl from verifier (HTTPS .../v1/present/verify?s=...)
  │ poll GET .../status until consumed
  ▼
Verifier Presentation Service (verifier-owned backend)
  │ stores session, verifies §2.1 on GET /v1/present/verify
  │ audit log, policy (ThaID v1)
  ▼
Checkpoint scanner (Honeywell → browser) hits VERIFIER URL

Wallet company backend is NOT in this path.
```

## Scan tab vs My QR tab

| Tab | Initiator | Transport | Authority |
|-----|-----------|-----------|-----------|
| **Scan** | Verifier | OID4VP 1.0 `openid4vp://` → `direct_post` | Verifier OID4VP API |
| **My QR** | Wallet (holder) | VP-by-reference relay (`/v1/presentation-sessions`) | Verifier presentation service |

Both channels use on-device Keychain Ed25519 signing with one biometric prompt per user action. §2.1 SD-JWT-KB checklist is identical.

## API (verifier infrastructure)

Same shape as the reference routes in `server/src/routes/presentationGateway.ts`, deployed on **verifier** host:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/presentation-sessions` | Create session; return `sessionId`, `nonce`, `expiresAt`, `verifyUrl` |
| `PUT` | `/v1/presentation-sessions/{id}` | Upload `vpToken` + `credentialType` |
| `GET` | `/v1/presentation-sessions/{id}/status` | Poll `pending` / `ready` / `verified` / `verify_failed` / `expired` |
| `GET` | `/v1/present/verify?s={sessionId}` | Verifier browser verify; §2.1 crypto; HTML outcome |

### Session create response

```json
{
  "sessionId": "uuid",
  "nonce": "64-hex-chars",
  "expiresAt": "ISO-8601",
  "verifyUrl": "https://verifier.example/v1/present/verify?s=uuid"
}
```

### Upload body

```json
{
  "vpToken": "issuer.jwt~disclosures~kb.jwt",
  "credentialType": "ThaiNationalID"
}
```

v1 policy: `credentialType` must be `ThaiNationalID`.

## Mobile boundary

### Client interface

`PresentationGatewayClient` (name retained for interface stability) is implemented by `createVerifierPresentationAdapter()` calling verifier `/v1/*` endpoints.

### Base URL resolution

Primary: `EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL`  
Fallback chain (deprecated): `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` → `EXPO_PUBLIC_VP_RELAY_BASE_URL` → wallet-api origin strip.

KB-JWT `aud` and QR fallback URL construction use `resolveVerifierPresentationBaseUrl()`.

### Wallet flow

1. User opens My QR on ThaID credential.
2. `POST /v1/presentation-sessions` on verifier host.
3. Sign SD-JWT KB-JWT on-device (`aud` = verifier base URL, `nonce` from session).
4. `PUT /v1/presentation-sessions/{id}` with vpToken.
5. Display `verifyUrl` QR.
6. Poll status until `verified` or `verify_failed` → record history with `partyName: 'Verifier'`.

## Server reference implementation

`server/src/routes/presentationGateway.ts` is a **reference verifier presentation service** for local/LAN dev. In production it must run on verifier infrastructure (e.g. external Verifier API at `192.100.10.48` once `/v1/*` endpoints are deployed there).

Dev `/dev/vp-session` + `/dev/vp-verify` remain for backward-compatible LAN golden path.

## Configuration

| Env (mobile) | Env (server) | Purpose |
|--------------|--------------|---------|
| `EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL` | `VERIFIER_PRESENTATION_BASE_URL` | Verifier presentation service public base URL |
| `EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL` (deprecated) | `PRESENTATION_GATEWAY_BASE_URL` (deprecated) | Legacy alias |
| `EXPO_PUBLIC_VP_RELAY_BASE_URL` (deprecated) | `VP_RELAY_BASE_URL` | Dev `/dev/*` + fallback base URL |

## Security

- §2.1 SD-JWT-KB verification unchanged (`sdJwtVerifier.ts`).
- Production verify URL must be HTTPS (`NODE_ENV=production` gate on reference service).
- Wallet backend never receives VP tokens in this flow.
- One biometric prompt per My QR session start (sign-time Keychain gate only).

## Non-goals (v1)

- Wallet company backend as presentation authority
- OID4VP wallet-initiated profile on My QR tab
- Non-ThaID credentials on verifier upload policy
- Verifier webhook delivery after verify

## External Verifier API

The development Verifier API (`192.100.10.48`) already serves Scan-tab OID4VP. Production My QR requires the same host (or successor) to expose `/v1/presentation-sessions` and `/v1/present/verify`. Until deployed, point `EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL` / `VERIFIER_PRESENTATION_BASE_URL` at the local reference service on a LAN-reachable URL.
