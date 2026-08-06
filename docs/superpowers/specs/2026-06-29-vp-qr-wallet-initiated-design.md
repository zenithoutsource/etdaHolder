# Wallet-Initiated VP QR (VP-by-Reference) — Design Spec

> **Date:** 2026-06-29 (revised 2026-07-06 after security review)
> **Status:** Approved for implementation planning

---

## 1. Context

Currently etdaWallet only supports **verifier-initiated OID4VP**: verifier shows QR → wallet scans → wallet submits VP to verifier's `response_uri`.

This spec adds the **reverse flow**: wallet shows QR → verifier web app scans → verifier fetches and verifies VP. Use case: user walks up to a checkpoint where it is more natural for the user to present their own QR than to scan one.

**Pattern:** Holder-Initiated Presentation via VP-by-Reference (custom dev relay — **not** OID4VP cross-device)
**Security model:** Server-side one-time session (relay) prevents VP replay; full SD-JWT-KB verification at relay GET

### Production roadmap

This `/dev/` relay is a **development shortcut**. Production path:

1. **OID4VP cross-device** — wallet presents a standards-compliant request/response URI; verifier fetches VP from wallet or a standards-based endpoint.
2. **ISO 18013-5 reverse engagement** — proximity presentation where the verifier initiates or reads from the device.

The custom in-memory relay is **retired** when either production path ships. Do not build product features on relay semantics beyond dev validation.

---

## 2. Architecture

```
Wallet App (credential detail screen)
  │
  │ 1. POST /dev/vp-session
  │    ← { sessionId, nonce, expiresAt }
  │
  │ 2. Build SD-JWT-KB VP (all claims disclosed in v1)
  │    KB-JWT: aud = relay server URL, nonce = server-provided nonce
  │    signSdJwtKbPresentationToken() — Keychain sign-time gate (one biometric)
  │
  │ 3. PUT /dev/vp-session/{sessionId}
  │    → { vpToken }
  │
  │ 4. Display QR
  │    content: https://<server>/dev/vp-verify?s={sessionId}
  │    TTL countdown: derived from server expiresAt (not hardcoded)
  │
  ▼
Relay Server (server/ — dev)
  │ Stores: Map<sessionId, VpSession>
  │
  │ GET /dev/vp-verify?s={sessionId}
  │   - Fetch session
  │   - Check not consumed, not expired, vpToken present
  │   - Full SD-JWT-KB verification (see §2.1)
  │   - Mark consumed
  │   - Return HTML result page
  ▼
Verifier Web Browser
  Sees HTML page: ✓ Verified + disclosed claims
  (or error if session expired / already used / VP not yet uploaded)
```

### 2.1 Relay verification checklist (required)

`GET /dev/vp-verify` must run **all** steps below. Verifying only the issuer SD-JWT signature is insufficient — without KB-JWT checks, any stolen SD-JWT (no KB) could replay through the relay.

| Step | Check |
|------|-------|
| 1 | Parse SD-JWT-KB presentation token into SD-JWT body + disclosures + KB-JWT |
| 2 | **Issuer SD-JWT** — verify issuer JWS signature using issuer public key (see §2.2) |
| 3 | **Holder binding** — read `cnf.jwk` or `cnf.kid` from SD-JWT payload; verify KB-JWT signature against that holder key (`alg: EdDSA`) |
| 4 | **Nonce binding** — `KB-JWT.payload.nonce === session.nonce` |
| 5 | **Audience binding** — `KB-JWT.payload.aud === server base URL` (same origin the wallet used when building VP) |
| 6 | **SD hash binding** — `KB-JWT.payload.sd_hash === SHA-256(base64url)` of the SD-JWT portion **including the trailing `~` separator**, exactly as transmitted before the KB-JWT segment (matches `normalizeSdJwtWithoutKb` in `crypto.ts`) |
| 7 | **Freshness** — `KB-JWT.payload.iat` within configured max age (default: session TTL window), with ±60 s clock-skew tolerance vs server time |
| 8 | Reject if any step fails → HTML "✗ ไม่ผ่านการตรวจสอบ" with reason code (no claim values in logs) |

Only after steps 1–7 pass may the relay mark the session consumed and render disclosed claims.

### 2.2 Issuer public key resolution (dev)

"Verify against issuer public key" must name a concrete mechanism:

| Environment | Mechanism |
|-------------|-----------|
| **Dev relay (v1)** | Pin issuer Ed25519 public key (JWK or PEM) in server config via `VP_ISSUER_PUBLIC_KEY_JWK` (JSON) or `VP_ISSUER_PUBLIC_KEY_PATH`. Single known dev issuer only. |
| **Future production** | Resolve from issuer JWKS URL (`credential_issuer` metadata) or `did:key` / `did:web` document — out of scope for this relay slice. |

`sdJwtVerifier.ts` reads the pinned key from `readConfig()`; no runtime DID resolution in v1.

---

## 3. Session Data Model

```typescript
type VpSession = {
  sessionId: string        // UUID v4
  nonce: string            // 32-byte random hex
  expiresAt: string        // ISO 8601, now + VP_SESSION_TTL_MS
  vpToken: string | null   // null until wallet submits (first PUT only)
  consumed: boolean        // true after first successful verifier GET
  credentialType: string   // e.g. 'ThaiNationalID', for display (set on PUT from wallet metadata)
}
```

Storage: in-memory `Map<string, VpSession>` (dev only)

**TTL:** `VP_SESSION_TTL_MS` server env (default `300000` = 5 minutes). Document in `server/.env.example` with unit, default, and effect. Wallet countdown **must** derive from `expiresAt` returned by `POST /dev/vp-session` — never hardcode 5 minutes client-side.

---

## 4. Server API Endpoints

### `POST /dev/vp-session`

Request: empty body

Response `201`:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "nonce": "a3f7c2...",
  "expiresAt": "2026-06-29T10:05:00.000Z"
}
```

### `PUT /dev/vp-session/:sessionId`

Request body:
```json
{
  "vpToken": "<sd-jwt-kb-string>",
  "credentialType": "ThaiNationalID"
}
```

| Status | Condition |
|--------|-----------|
| `200` | First successful upload |
| `404` | Session not found |
| `409` | `vpToken` already set (second PUT rejected) |
| `410` | Session expired |
| `409` | Session already consumed (verifier fetched; no re-upload) |

**Hardening:** exactly one PUT per session. Store rejects any PUT when `vpToken !== null` or `consumed === true`.

### `GET /dev/vp-verify?s=:sessionId`

Called by verifier browser from QR scan.

| Status | Condition |
|--------|-----------|
| `404` | Session not found |
| `410` | Session expired |
| `409` | Already consumed (replay) |
| `202` | Session valid but `vpToken === null` (verifier scanned before wallet finished PUT — rare if wallet shows QR only after step 3; return minimal HTML "รอ Wallet อัปโหลด VP…" or JSON `{ "status": "pending" }` with `Retry-After: 2`) |
| `200` | Verification complete — HTML result page |

Normal order (POST → build VP → PUT → show QR) prevents the `202` case; define behavior anyway for race/debug.

HTML result page shows:
- ✓ Verified / ✗ Invalid (with reason)
- Credential type + disclosed claims (label + value)
- Issuer name
- Presented at timestamp

---

## 5. Wallet-Side VP Construction

Re-uses existing SD-JWT-KB VP building logic (`signSdJwtKbPresentationToken` in `crypto.ts`, same path as `presentationApproval.ts`) with overrides:

- **nonce**: server-provided (not from OID4VP authorization request)
- **aud**: relay server base URL (e.g. `http://192.168.x.x:3000` — dev LAN OK; no HTTPS in v1)
- **Disclosures**: all claims disclosed in v1 (see §5.1)
- **Format**: SD-JWT-KB — same as existing DCQL flow

**Authentication:** tapping "แสดง QR" triggers VP build + upload. User consent = that button tap. **No extra app-level biometric or consent prompt** — the single user action ends at sign-time Keychain gate inside `signSdJwtKbPresentationToken()` (per one-prompt rule in `CLAUDE.md`).

**Gating:** hide "แสดง QR" when credential is not presentable. Reuse `filterPresentableCredentials()` from `credentialLifecycle.ts` (covers inactive, suspended, renewal-required, **and** document expiry) — do not reimplement ad-hoc checks. Implementation: function takes `VerifiableCredentialRecord[]` and returns a filtered array; on the detail screen call `filterPresentableCredentials([record]).length > 0`, or add a thin `isCredentialPresentable(record)` wrapper alongside it.

New service: `src/services/vp/walletInitiatedPresentation.ts`
- `createVpSession(serverBaseUrl: string): Promise<{ sessionId, nonce, expiresAt }>`
- `submitVpToSession(sessionId: string, vpToken: string, credentialType: string): Promise<void>`
- `buildQrUrl(serverBaseUrl: string, sessionId: string): string`

### 5.1 All-claims disclosure (v1 tradeoff)

v1 discloses **all** SD-JWT claims because there is no verifier-specified DCQL filter in wallet-initiated mode.

| Tradeoff | Detail |
|----------|--------|
| **Accepted for v1** | Faster dev validation; matches "show my ID" checkpoint UX |
| **Deferred** | Selective disclosure picker — Holder chooses which claims appear in QR VP before build (follow-up spec) |
| **Risk** | Verifier receives full credential surface area; relay holds full VP for session TTL |

State explicitly in UI copy: QR presents the credential for verifier scan (all fields on the card schema).

---

## 6. New Files

### Mobile

| File | Purpose |
|------|---------|
| `src/services/vp/walletInitiatedPresentation.ts` | Session creation, VP submission, QR URL builder |
| `src/components/VpQrModal.tsx` | Modal: QR display + countdown (from `expiresAt`) + instructions |

### Server

| File | Purpose |
|------|---------|
| `server/src/routes/vpSession.ts` | POST / PUT / GET session endpoints |
| `server/src/services/vpSessionStore.ts` | In-memory session Map + TTL cleanup from `VP_SESSION_TTL_MS` |
| `server/src/services/sdJwtVerifier.ts` | Full §2.1 verification at relay GET; issuer key from pinned config |

---

## 7. Modified Files

| File | Change |
|------|---------|
| `app/(tabs)/credential/[id].tsx` | Add "แสดง QR" button → open `VpQrModal`; gate via `filterPresentableCredentials` |
| `server/src/testApp.ts` | Mount `vpSession` router (same pattern as `devWallet.ts`, `devIssuerProxy.ts`) |
| `server/src/config.ts` | Add `vpSessionTtlMs`, `vpIssuerPublicKeyJwk` |
| `server/.env.example` | Document `VP_SESSION_TTL_MS`, `VP_ISSUER_PUBLIC_KEY_JWK` |

---

## 8. UI Flow (Wallet)

```
Credential Detail Screen
  └── [แสดง QR สำหรับ Verifier] button
      (hidden unless credential passes filterPresentableCredentials)
        │
        ▼
  VpQrModal
  ┌────────────────────────────┐
  │  QR Code (large, centered) │
  │                            │
  │  ⏱ หมดอายุใน 4:32          │  ← countdown from expiresAt
  │                            │
  │  ให้ Verifier สแกน QR นี้  │
  │  ใช้ได้ครั้งเดียวเท่านั้น    │
  │                            │
  │  [ยกเลิก]                  │
  └────────────────────────────┘
  Countdown ถึง 0 → "QR หมดอายุ" + [สร้างใหม่]
```

Flow timing: VP is built and uploaded (steps 2–3) **before** QR is shown (step 4). Verifier does not exist yet at consent time — consent is the button tap; sign-time gate fires during build.

---

## 9. Dependency

```bash
npx expo install react-native-qrcode-svg
# react-native-svg@15.12.1 already in package.json — no additional svg install
```

---

## 10. Security

| Concern | Mitigation |
|---------|------------|
| Replay attack | Session consumed on first successful GET — subsequent returns 409 |
| Session hijack | sessionId = UUID v4 (128-bit random) + configurable TTL |
| VP forgery (issuer) | Issuer JWS verified against pinned dev issuer public key (§2.2) |
| VP forgery (holder) | KB-JWT verified against `cnf` key in SD-JWT payload (§2.1 step 3) |
| Nonce / aud / sd_hash binding | KB-JWT checks at relay GET (§2.1 steps 4–6) — not wallet-only theater |
| Stolen SD-JWT without KB | Rejected at step 3/4 — KB-JWT mandatory |
| Double upload | PUT returns 409 if `vpToken` already set |
| Inactive credential | `filterPresentableCredentials()` blocks QR button |
| PII in logs | See §10.1 |

Not covered in v1: HTTPS on dev server, mTLS between wallet and relay

### 10.1 Server logging (no PII)

Extend wallet no-PII rule to the relay server:

- **Never log:** `vpToken`, full VP/JWT payloads, claim values, `nonce`, session IDs in production-style logs (dev diagnostic tags may log `sessionId` prefix only).
- **Safe to log:** verification step failures (reason codes), HTTP status, credential type string, timestamps, byte lengths.
- HTML result page may render claim values to the verifier browser — that is intentional display, not server logs.

Relay holds full VP in memory for session TTL — minimize retention; delete on consume or expiry.

---

## 11. History log integration

This flow bypasses `submitPresentationResponse` in `scan.tsx` (where verifier-initiated OID4VP records `presentation-success`).

**v1 decision:** append `presentation-success` to `walletEventLog` on **successful PUT** (wallet knows VP was submitted to relay; it does **not** know whether a verifier scanned).

| Field | Value |
|-------|-------|
| `kind` | `presentation-success` |
| `channel` | `wallet` (holder-initiated relay — see history spec channel mapping) |
| `partyName` | `"VP Relay (dev)"` or configurable relay display name |
| `disclosedClaims` | all claim labels from credential schema |
| `credentialId` | presenting credential |

If product later requires verifier-confirmed events only, add `presentation-relay-submitted` kind in a follow-up; v1 uses `presentation-success` for Wallet Home badge parity.

---

## 12. Error Handling

| Failure | Wallet | Verifier browser |
|---------|--------|------------------|
| Server unreachable | Dialog "ไม่สามารถสร้าง QR ได้" | — |
| VP build fails | Dialog with error | — |
| PUT rejected (409) | Dialog "อัปโหลด VP ไม่สำเร็จ" | — |
| QR expired | "QR หมดอายุ" + [สร้างใหม่] | 410 HTML error page |
| Already consumed | — | 409 HTML "QR นี้ถูกใช้แล้ว" |
| VP not uploaded yet | — | 202 pending page |
| VP invalid signature / KB binding | — | 200 HTML "✗ ไม่ผ่านการตรวจสอบ" + reason |

---

## 13. Verification Steps

1. Tap "แสดง QR" on presentable credential → biometric (sign-time) → `VpQrModal` opens with QR + countdown from `expiresAt`
2. Scan QR → browser opens server URL → shows "✓ ยืนยันแล้ว" + claims
3. Scan same QR again → browser shows "QR นี้ถูกใช้แล้ว" (409)
4. Wait for TTL without scanning → QR shows expired, browser shows 410
5. Second PUT to same session → 409
6. History tab shows `presentation-success` after successful PUT
7. `yarn tsc --noEmit` — no type errors
8. `yarn test` — existing tests pass; add `sdJwtVerifier` unit tests for §2.1 checklist
