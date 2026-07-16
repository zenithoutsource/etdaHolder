# My QR — Broker Engagement + OID4VP Disclosure

> **Date:** 2026-07-16  
> **Status:** Approved — production My QR path  
> **Supersedes (production My QR):**  
> - `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md` (Option A VP-by-reference)  
> - Wallet-as-authority framing in `docs/superpowers/specs/2026-07-09-production-my-qr-presentation-gateway-design.md`  
> **Related:** `src/services/vp/presentationService.ts`, `src/hooks/useWalletInitiatedVpQrSession.ts`, `docs/superpowers/specs/2026-06-29-push-notifications-design.md`

## Summary

**Production My QR** uses a **Wallet Broker** engagement session. The holder shows a broker QR. After the checkpoint Verifier scans it, the Broker holds a standard OID4VP Authorization Request. The wallet then enters the **existing Scan-tab disclosure flow** (resolve → consent → sign → `direct_post`).

| Concern | Owner |
|---------|--------|
| Engagement / QR / push relay | Wallet Broker (`192.100.10.49`) |
| `nonce`, DCQL, crypto verify | Verifier API (`192.100.10.48`) |
| Sign + `direct_post` | Wallet app (existing OID4VP path) |

Wallet company backend does **not** verify VPs. Verifier does **not** need new product APIs beyond the existing OID4VP surface plus `/verifier/scan` (already updated).

## Holder UX (locked)

1. Holder opens **My QR**.
2. Checkpoint Verifier scans the QR.
3. Wallet enters the **existing** presentation / disclosure UI (same panels as Scan).

## Hosts (dev LAN)

| Role | Base URL |
|------|----------|
| Broker | `http://192.100.10.49` |
| Verifier | `http://192.100.10.48` |

Production uses the same path shapes on HTTPS hosts via env.

## End-to-end flow

```text
Wallet App                      Wallet Broker (.49)                 Verifier (.48)
   │                                 │                                   │
   │ 1. POST /broker/session         │                                   │
   │    { walletId, deviceToken,     │                                   │
   │      platform }                 │                                   │
   │ ───────────────────────────────►│ create session_id                 │
   │ ◄── session_id, qr_payload,     │                                   │
   │     expires_at,                 │                                   │
   │     broker_request_endpoint     │                                   │
   │                                 │                                   │
   │ 2. Show QR = qr_payload         │                                   │
   │    (waiting_scan)               │                                   │
   │                                 │                                   │
   │                                 │  3. POST /verifier/scan           │
   │                                 │     { scannedValue: qr_payload,   │
   │                                 │       docType?: "IDCard" }        │
   │                                 │ ◄─────────────────────────────────│
   │                                 │                                   │
   │                                 │  Verifier: generate OID4VP req    │
   │                                 │  (existing generate-vp-qr /       │
   │                                 │   openid4vc/request)              │
   │                                 │                                   │
   │                                 │  4. POST .../request              │
   │                                 │ ◄── deposit Authorization Request │
   │                                 │                                   │
   │ 5. Push (preferred) and/or      │                                   │
   │    poll GET .../request         │                                   │
   │ ◄───────────────────────────────│                                   │
   │                                 │                                   │
   │ 6. Existing disclosure flow     │                                   │
   │    resolvePresentationRequest → │                                   │
   │    consent → sign →             │                                   │
   │    submitPresentationResponse   │                                   │
   │ 7. direct_post ────────────────────────────────────────────────────►│
   │                                 │              8. Verifier verifies │
```

## Broker API

### `POST /broker/session`

**Request:**

```json
{
  "walletId": "<session wallet id>",
  "deviceToken": "<Expo push token>",
  "platform": "android"
}
```

**Response (locked from live sample):**

```json
{
  "session_id": "989cc1b5-6443-41be-b0e2-7c38fabfd14b",
  "broker_request_endpoint": "http://192.100.10.49/broker/session/989cc1b5-6443-41be-b0e2-7c38fabfd14b/request",
  "expires_at": "2026-07-16T03:54:33.1725204+00:00",
  "qr_payload": "http://192.100.10.49/broker/session/989cc1b5-6443-41be-b0e2-7c38fabfd14b/request"
}
```

| Field | Wallet use |
|-------|------------|
| `session_id` | Poll key, push correlation, diagnostics |
| `qr_payload` | Encode **verbatim** into the QR (do not rebuild URL) |
| `broker_request_endpoint` | Same as QR in current sample; use for `GET`/`POST` |
| `expires_at` | My QR countdown / `expired` phase |

### `POST /broker/session/{sessionId}/request`

Called by **Verifier** (not the wallet) after scan. Body is the OID4VP Authorization Request deposit (opaque to wallet until GET).

### `GET /broker/session/{sessionId}/request`

Called by **wallet** after push or while polling.

**Open contract (confirm with Broker team before merge):** response must be consumable by `resolvePresentationRequest()` either as:

1. An `openid4vp://…` string (preferred — matches Scan QR path), or  
2. A JSON object that includes a `request_uri` / Authorization Request URI the wallet can pass into `resolvePresentationRequest()`, or  
3. A thin adapter that maps Broker JSON → that URI string.

Until the sample is confirmed, implementation polls until a non-empty request is present and normalizes it to a string suitable for `resolvePresentationRequest`.

**Poll policy (v1):** while phase is `waiting_scan`, poll `GET` every 2s (same cadence as current My QR status poll). Stop on request ready, session expiry, or unrecoverable error.

## Verifier API (existing + scan)

| Method | Path | Role |
|--------|------|------|
| `POST` | `/verifier/scan` | Checkpoint posts `{ scannedValue, docType? }` |
| `POST` | `/generate-vp-qr` | Create OID4VP request (`documentType`) |
| `GET` | `/openid4vc/request/{id}` | Request Object |
| `POST` | `/openid4vc/verify/{id}` | `direct_post` (`vp_token`, `state`) |

My QR v1 uses ThaID / `IDCard` as the checkpoint `docType` when the Verifier requires it. Wallet does not call `/verifier/scan`.

## Session model

| ID | Creator | Purpose |
|----|---------|---------|
| `session_id` | Broker | QR / push / poll bridge **before** Verifier request exists |
| Verifier request id | Verifier | OID4VP session (`nonce`, `response_uri`, verify) |

Verifier does **not** need to persist wallet `session_id`. Broker binds `session_id` ↔ Verifier request after scan.

Wallet **never** invents `nonce` or Verifier session id. KB-JWT binds to Verifier `nonce` + `client_id` / audience rules from the deposited Authorization Request (same as Scan).

## Mobile design

### Config

| Env | Purpose | Default (dev) |
|-----|---------|-----------------|
| `EXPO_PUBLIC_BROKER_BASE_URL` | Broker host for `POST /broker/session` | `http://192.100.10.49` |

Document in `.env.example`. Deprecate My QR reliance on `EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL` for the production path (may remain for legacy Option A behind a flag during migration).

### Client

Add `src/services/vp/brokerSessionClient.ts` (neutral naming — no customer org names in identifiers):

```typescript
type BrokerCreateSessionRequest = {
  walletId: string
  deviceToken: string
  platform: 'android' | 'ios'
}

type BrokerCreateSessionResponse = {
  session_id: string
  broker_request_endpoint: string
  expires_at: string
  qr_payload: string
}

interface BrokerSessionClient {
  createSession(input: BrokerCreateSessionRequest): Promise<BrokerCreateSessionResponse>
  fetchPresentationRequest(sessionId: string): Promise<unknown> // normalize to resolvePresentationRequest input
}
```

`walletId` from `authStore`. `deviceToken` from the Expo push token already obtained in `pushNotificationService` (reuse; do not invent a second token path).

### Hook / UI phases

Replace Option A “sign + upload VP then show verify URL” in `useWalletInitiatedVpQrSession` (or a successor hook) with:

| Phase | Meaning |
|-------|---------|
| `loading` | Creating broker session |
| `waiting_scan` / `ready` | Showing `qr_payload` QR + TTL |
| `request_ready` | Broker has request; hand off to disclosure |
| `presenting` | Existing Scan panels (face prepare → consent → info → submit) |
| `verified` / `error` / `expired` | Terminal |

Reuse Scan presentation components (`PresentationConsentPanel`, `PresentationInfoPanel`, `PresentationSuccessPanel`, etc.) — do **not** fork a second disclosure UI for My QR.

On request ready:

1. Normalize Broker GET body → URI string.  
2. `resolvePresentationRequest(uri, credentials, { trustedVerifiers })`.  
3. Run the same consent / sign / `submitPresentationResponse` path as Scan.  
4. Record history with `channel: 'wallet'` and party name `Verifier` (or trusted verifier display name).

**One biometric per user action:** only the sign-time Keychain gate when building the presentation token — no extra app-level biometric in front of the same action.

### Push

Extend notification routing with a presentation-request event (exact event key to confirm with Broker; proposed: `presentation-request`):

```typescript
data: {
  event: 'presentation-request',
  session_id: string,
}
```

Tap / foreground handler focuses My QR (or credential detail My QR) and triggers `GET .../request` for that `session_id`. Poll remains the reliability fallback if push is delayed or skipped in dev.

## What this replaces

| Old (Option A) | New (this spec) |
|----------------|-----------------|
| `POST /v1/presentation-sessions` on verifier presentation host | `POST /broker/session` on Broker |
| Sign + upload VP **before** showing QR | Wait for scan; sign only in disclosure flow |
| QR = verifier `verifyUrl` | QR = Broker `qr_payload` |
| Poll verifier session status | Poll Broker `GET .../request` then OID4VP `direct_post` outcome |

Local `server/` `/v1/presentation-sessions` and `/dev/vp-session` may remain for LAN experiments but are **not** the production My QR path.

## Security

- Verifier owns `nonce` and VP verification.  
- Broker stores engagement + deposited request only — no §2.1 verify on Broker.  
- Do not log `vp_token`, JWT payloads, claims, or push tokens.  
- Trust gate for deposited requests uses the same `TRUSTED_VERIFIERS` / did:web allowlist as Scan.

## Non-goals (v1)

- Multi-broker / multi-verifier picker UI  
- Wallet Backend as crypto verifier  
- DC API / `origin:` audience  
- Non-ThaID My QR unless Broker + Verifier `docType` policy expands  
- Keeping Option A as the default production My QR path after cutover

## Open items (confirm before implementation merge)

1. Exact JSON body of `GET /broker/session/{id}/request` after Verifier deposit.  
2. Push event name + payload fields from Broker.  
3. Whether `deviceToken` on create session must be Expo token vs FCM-native (assume Expo token matching existing wallet push registration unless Broker documents otherwise).

## Acceptance

- [ ] My QR creates session on `EXPO_PUBLIC_BROKER_BASE_URL` and displays `qr_payload`.  
- [ ] After Verifier `/verifier/scan`, wallet obtains request and shows existing disclosure UI.  
- [ ] Approve → one sign-time biometric → `direct_post` to Verifier succeeds.  
- [ ] History records success/failure for the wallet-initiated channel.  
- [ ] Focused tests for broker client + hook phases; `yarn tsc --noEmit` + `yarn lint` clean for touched files.  
- [ ] Physical golden path: Galaxy + Honeywell against `.49` / `.48`.

## Architecture doc follow-up

Update `docs/ARCHITECTURE.md` “Wallet-Initiated My QR” section to point at this broker + OID4VP disclosure model and mark Option A superseded for production.
