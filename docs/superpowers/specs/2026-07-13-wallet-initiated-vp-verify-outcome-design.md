# Wallet-Initiated VP Verification Outcome (P5 #16 / #18)

> **Date:** 2026-07-13  
> **Status:** Approved — 2026-07-13  
> **Related:** `docs/User_Journey/id_card/P5.md`, `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md`, `server/src/services/presentationGatewayService.ts`, `src/hooks/useWalletInitiatedVpQrSession.ts`

## Summary

Close the **Wallet-scope** gap in P5 steps **#16** and **#18** for the **My QR / wallet-initiated** path only: after the Verifier scans the QR and runs §2.1 crypto, the Wallet must receive an **explicit terminal outcome** (`verified` or `verify_failed`) via the existing session status poll — not infer success from `consumed` alone, and not hang until TTL when verification fails.

Verifier-side checks (Trust Registry, Schema Registry, VC Status Registry, Audit Trail) remain **peer** and out of scope.

## Problem

Today:

| Event | Gateway session state | Wallet poll sees |
|-------|----------------------|------------------|
| Verifier verify **success** | `consumeSession()` → `consumed` | `consumed` → phase `verified` + history ✅ |
| Verifier verify **fail** | unchanged (`ready`) | keeps polling until `expired` ❌ |
| Session TTL | `expired` | phase `expired` (ambiguous vs verify fail) |

Failure is visible only to the checkpoint browser (HTML). The Holder Wallet never learns the Verifier rejected the VP.

## Goal

One cohesive slice (single implementation round):

1. Gateway records a **terminal verification outcome** on both success and failure.
2. Status API exposes that outcome to the Wallet poll.
3. Wallet maps outcome → UI phase + History Log event.

**Non-goals:**

- OID4VP Scan tab (`scan.tsx` / `direct_post`) — already records `presentation-failed` on submit errors; no change in v1.
- Unifying Scan and My QR status models.
- Verifier Audit Trail, Trust/Schema/Status registries.
- Returning disclosed claims or issuer name to Wallet on success (HTML scanner keeps rich view; Wallet keeps simple “verified” UX).

## Status contract

### Replace `consumed` with terminal outcomes

`PresentationSessionStatus` becomes:

| Status | Meaning |
|--------|---------|
| `pending` | Session created; no VP uploaded yet |
| `ready` | VP uploaded; awaiting Verifier scan |
| `verified` | Verifier ran §2.1; checks passed (terminal) |
| `verify_failed` | Verifier ran §2.1; checks failed (terminal) |
| `expired` | TTL elapsed before terminal outcome (terminal) |

`consumed` is **removed** from the public API. Reference server and Wallet client ship together in this slice.

### Status response shape

`GET /v1/presentation-sessions/{id}/status` (and dev `/dev/vp-session/{id}/status` parity):

```json
{
  "status": "verified",
  "expiresAt": "2026-07-13T10:00:00.000Z"
}
```

On failure:

```json
{
  "status": "verify_failed",
  "expiresAt": "2026-07-13T10:00:00.000Z",
  "reason": "issuer-signature-invalid"
}
```

- `reason` is the internal `sdJwtVerifier` reason code (e.g. `kb-nonce-mismatch`, `issuer-signature-invalid`).
- Wallet **must not** display raw `reason` in UI (generic Holder message only).
- Wallet **may** map `reason` → `WalletHistoryFailureReason` for History Log.

Dev `/dev/*` routes mirror the same status values for LAN golden path.

## Server design

### Session store

Extend `PresentationSession`:

```typescript
verificationOutcome: 'pending' | 'verified' | 'verify_failed'
verificationReason?: string  // set when verify_failed
```

Replace `consumeSession()` with `finalizeVerification(sessionId, outcome)`:

- Sets `verificationOutcome` and `consumed: true` (internal flag retained for idempotency).
- Idempotent: second finalize on same session is no-op (scanner refresh).
- Only callable when `vpToken` is set and session not expired.

`resolveStatus()`:

1. `not-found` if missing
2. `expired` if past TTL (even if never verified)
3. `verified` / `verify_failed` if `verificationOutcome` terminal
4. `pending` / `ready` otherwise

### Verify handler

In `verifyPresentationSession()`:

| `verifySdJwtKbPresentation*` result | Action |
|-------------------------------------|--------|
| `ok: true` | `finalizeVerification(id, 'verified')` → return success HTML |
| `ok: false` | `finalizeVerification(id, 'verify_failed', reason)` → return fail HTML |

Previously, failure did not finalize — that is the bug being fixed.

### Files (server)

| File | Change |
|------|--------|
| `server/src/services/presentationSessionStore.ts` | outcome fields, `finalizeVerification`, status resolver |
| `server/src/services/presentationGatewayService.ts` | finalize on fail; status type export |
| `server/src/routes/presentationGateway.ts` | status JSON includes `reason` when failed |
| `server/src/routes/vpSession.ts` | dev status parity |
| `server/src/services/*test.ts` | success + fail poll scenarios |

## Mobile design

### Client types

`PresentationSessionStatus` in `presentationGatewayClient.ts` matches server enum (`verified`, `verify_failed` replace `consumed`).

`fetchSessionStatus` returns `{ status, reason?: string }` (adapter parses JSON body).

### Hook phases

`WalletInitiatedVpQrPhase` adds `verify_failed`:

| Poll status | Phase | History |
|-------------|-------|---------|
| `ready` / `pending` | `ready` (keep polling) | — |
| `verified` | `verified` | `presentation-success` (`channel: 'wallet'`) — existing |
| `verify_failed` | `verify_failed` | `presentation-failed` (`channel: 'wallet'`) — **new** |
| `expired` | `expired` | — |

Record history **once** per session (existing `historyRecorded` guard applies to both outcomes).

### History helper

Add `recordWalletInitiatedPresentationFailure(record, reasonCode)` in `walletHistoryRecording.ts` (or `walletInitiatedPresentation.ts` wrapper):

- `kind: 'presentation-failed'`
- `partyName: 'Verifier'`
- `disclosedClaims`: same labels as success path (`readWalletInitiatedClaimLabels`)
- `reasonCode`: from `mapVerifierReasonToHistory(reason)`:

| Verifier `reason` | `WalletHistoryFailureReason` |
|-------------------|------------------------------|
| `issuer-signature-invalid` | `signature-invalid` |
| `cnf-missing`, `kb-signature-invalid`, `holder-binding-*` | `holder-binding-mismatch` |
| `kb-nonce-mismatch`, `kb-aud-mismatch`, `sd-hash-mismatch`, `kb-iat-stale` | `verifier-rejected` |
| other / missing | `verifier-rejected` |

### UI

`WalletInitiatedVpQrPanel` — new `verify_failed` branch:

- Title: **ไม่ผ่านการตรวจสอบ** (generic; no raw reason)
- Action: **สร้างใหม่** → `onRetry`

Mirror `expired` styling (danger text + retry).

### Files (mobile)

| File | Change |
|------|--------|
| `src/services/vp/presentationGatewayClient.ts` | status types + response shape |
| `src/services/vp/verifierPresentationAdapter.ts` | parse `reason` |
| `src/services/vp/walletInitiatedPresentation.ts` | status type, failure recorder |
| `src/hooks/useWalletInitiatedVpQrSession.ts` | handle `verified` / `verify_failed` |
| `src/components/WalletInitiatedVpQrPanel.tsx` | `verify_failed` UI |
| `src/services/history/walletHistoryRecording.ts` | failure helper + reason map |
| `src/components/VpQrModal.test.tsx` | fail poll scenario |
| `src/services/vp/walletInitiatedPresentation.test.ts` | adapter status parsing |

## Data flow (after change)

```text
Wallet                          Verifier presentation service
  │ POST /presentation-sessions
  │ PUT  .../sessions/{id}  (vpToken)
  │ show QR (verifyUrl)
  │ poll GET .../status
  │                                 Scanner GET /present/verify?s=
  │                                 ├─ §2.1 pass → finalize(verified)
  │                                 └─ §2.1 fail → finalize(verify_failed, reason)
  │ poll → verified | verify_failed
  ├─ verified      → UI success + presentation-success history
  └─ verify_failed → UI fail + presentation-failed history
```

## Error handling

- Poll network errors: log via `logWalletError`; keep polling (unchanged).
- `verify_failed` is terminal: stop poll, clear QR, show retry.
- Double finalize from scanner refresh: idempotent; Wallet already recorded history.
- Expired before scan: still `expired` — distinct from `verify_failed`.

## Testing

### Server

- Upload VP → verify success → status `verified`
- Upload VP → verify fail (bad nonce fixture) → status `verify_failed` + `reason`
- Expired session → `expired` without outcome
- Second verify GET after finalize → HTML consumed/already-done (existing 409 or idempotent HTML)

### Mobile

- Mock status `verified` → phase `verified`, history success once
- Mock status `verify_failed` + reason → phase `verify_failed`, `presentation-failed` with mapped `reasonCode`
- Mock `expired` unchanged

Run: `cd server && yarn test` (gateway/store), `yarn test` (hook/panel tests).

## Security

- Do not log VP tokens or disclosed claims in new paths.
- `reason` in status API is diagnostic for Wallet mapping only — not shown raw to Holder.
- One biometric prompt per session start unchanged (sign-time gate only).

## P5 mapping (Wallet lens)

| Step | After this slice |
|------|------------------|
| 1 Submit VP | Done (unchanged) |
| 16 Return result (fail) | **Done** — Wallet receives `verify_failed` |
| 18 Return result (success) | **Done** — Wallet receives `verified` (replaces ambiguous `consumed`) |
| 2–15, 17 | peer (unchanged) |

## Rollout

Single PR / implementation plan — not incremental UI-only or backend-only deploys. Reference verifier service and Wallet app ship the new status contract together.

Update `docs/superpowers/specs/2026-07-09-verifier-owned-wallet-initiated-presentation-design.md` status table (replace `consumed` with `verified` / `verify_failed`) when implementing.
