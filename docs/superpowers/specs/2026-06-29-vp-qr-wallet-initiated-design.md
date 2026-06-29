# Wallet-Initiated VP QR (VP-by-Reference) — Design Spec

> **Date:** 2026-06-29
> **Status:** Draft — pending user review

---

## 1. Context

Currently etdaWallet only supports **verifier-initiated OID4VP**: verifier shows QR → wallet scans → wallet submits VP to verifier's `response_uri`.

This spec adds the **reverse flow**: wallet shows QR → verifier web app scans → verifier fetches and verifies VP. Use case: user walks up to a checkpoint where it is more natural for the user to present their own QR than to scan one.

**Pattern:** Holder-Initiated Presentation via VP-by-Reference
**Security model:** Server-side one-time session (relay) prevents VP replay

---

## 2. Architecture

```
Wallet App (credential detail screen)
  │
  │ 1. POST /dev/vp-session
  │    ← { sessionId, nonce, expiresAt }
  │
  │ 2. Build SD-JWT-KB VP
  │    KB-JWT: aud = relay server URL, nonce = server-provided nonce
  │
  │ 3. PUT /dev/vp-session/{sessionId}
  │    → { vpToken }
  │
  │ 4. Display QR
  │    content: https://<server>/dev/vp-verify?s={sessionId}
  │    TTL countdown: 5 minutes
  │
  ▼
Relay Server (server/ — dev)
  │ Stores: Map<sessionId, VpSession>
  │
  │ GET /dev/vp-verify?s={sessionId}
  │   - Fetch session
  │   - Check not consumed, not expired
  │   - Verify SD-JWT signature
  │   - Mark consumed
  │   - Return HTML result page
  ▼
Verifier Web Browser
  Sees HTML page: ✓ Verified + disclosed claims
  (or error if session expired / already used)
```

---

## 3. Session Data Model

```typescript
type VpSession = {
  sessionId: string        // UUID v4
  nonce: string            // 32-byte random hex
  expiresAt: string        // ISO 8601, now + 5 minutes
  vpToken: string | null   // null until wallet submits
  consumed: boolean        // true after first verifier fetch
  credentialType: string   // e.g. 'ThaiNationalID', for display
}
```

Storage: in-memory `Map<string, VpSession>` (dev only)

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
{ "vpToken": "<sd-jwt-kb-string>" }
```

Response `200` on success, `404` if session not found, `410` if expired

### `GET /dev/vp-verify?s=:sessionId`

Called by verifier browser from QR scan.

| Status | Condition |
|---|---|
| `404` | Session not found |
| `410` | Session expired |
| `409` | Already consumed (replay) |
| `200` | HTML result page |

HTML result page shows:
- ✓ Verified / ✗ Invalid (with reason)
- Credential type + disclosed claims (label + value)
- Issuer name
- Presented at timestamp

---

## 5. Wallet-Side VP Construction

Re-uses existing SD-JWT-KB VP building logic with overrides:

- **nonce**: server-provided (not from OID4VP authorization request)
- **aud**: relay server base URL (e.g. `http://192.168.x.x:3000`)
- **Disclosures**: all claims disclosed (no verifier-specified filter in v1)
- **Format**: SD-JWT-KB — same as existing DCQL flow

New service: `src/services/vp/walletInitiatedPresentation.ts`
- `createVpSession(serverBaseUrl: string): Promise<{ sessionId, nonce, expiresAt }>`
- `submitVpToSession(sessionId: string, vpToken: string): Promise<void>`
- `buildQrUrl(serverBaseUrl: string, sessionId: string): string`

---

## 6. New Files

### Mobile

| File | Purpose |
|---|---|
| `src/services/vp/walletInitiatedPresentation.ts` | Session creation, VP submission, QR URL builder |
| `src/components/VpQrModal.tsx` | Modal: QR display + countdown + instructions |

### Server

| File | Purpose |
|---|---|
| `server/src/routes/vpSession.ts` | POST / PUT / GET session endpoints |
| `server/src/services/vpSessionStore.ts` | In-memory session Map + TTL cleanup |
| `server/src/services/sdJwtVerifier.ts` | Verify SD-JWT-KB signature at relay GET |

---

## 7. Modified Files

| File | Change |
|---|---|
| `app/(tabs)/credential/[id].tsx` | Add "แสดง QR" button → open `VpQrModal` |
| `server/src/testApp.ts` | Mount `vpSession` router |

---

## 8. UI Flow (Wallet)

```
Credential Detail Screen
  └── [แสดง QR สำหรับ Verifier] button
      (hidden if credential inactive / suspended / renewal-required)
        │
        ▼
  VpQrModal
  ┌────────────────────────────┐
  │  QR Code (large, centered) │
  │                            │
  │  ⏱ หมดอายุใน 4:32          │
  │                            │
  │  ให้ Verifier สแกน QR นี้  │
  │  ใช้ได้ครั้งเดียวเท่านั้น    │
  │                            │
  │  [ยกเลิก]                  │
  └────────────────────────────┘
  Countdown ถึง 0 → "QR หมดอายุ" + [สร้างใหม่]
```

---

## 9. Dependency

```bash
npx expo install react-native-qrcode-svg
# requires react-native-svg — check if already installed
```

---

## 10. Security

| Concern | Mitigation |
|---|---|
| Replay attack | Session consumed on first GET — subsequent returns 409 |
| Session hijack | sessionId = UUID v4 (128-bit random) + short 5-min TTL |
| VP forgery | Server verifies SD-JWT signature against issuer public key |
| Nonce binding | KB-JWT nonce = server-provided, aud = server URL |
| Inactive credential | Wallet blocks QR generation if credential suspended/renewal-required |

Not covered in v1: HTTPS on dev server, mTLS between wallet and relay

---

## 11. Error Handling

| Failure | Wallet | Verifier browser |
|---|---|---|
| Server unreachable | Dialog "ไม่สามารถสร้าง QR ได้" | — |
| VP build fails | Dialog with error | — |
| QR expired | "QR หมดอายุ" + [สร้างใหม่] | 410 HTML error page |
| Already consumed | — | 409 HTML "QR นี้ถูกใช้แล้ว" |
| VP invalid signature | — | 200 HTML "✗ ไม่ผ่านการตรวจสอบ" + reason |

---

## 12. Verification Steps

1. Tap "แสดง QR" on credential detail → `VpQrModal` opens with QR + countdown
2. Scan QR → browser opens server URL → shows "✓ ยืนยันแล้ว" + claims
3. Scan same QR again → browser shows "QR นี้ถูกใช้แล้ว" (409)
4. Wait 5 min without scanning → QR shows expired, browser shows 410
5. `yarn tsc --noEmit` — no type errors
6. `yarn test` — existing tests pass
