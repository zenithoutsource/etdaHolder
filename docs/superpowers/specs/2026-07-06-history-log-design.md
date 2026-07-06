# History Log — Holder Audit Journal (v1)

**Date:** 2026-07-06  
**Status:** Approved for implementation planning  
**Related:** P1 Audit Trail (issuance), P4/P5 presentation flows, P6 lifecycle, `docs/ui-reference/wallet_fixed5/Wallet P4-P5/index.html`

## Summary

History Log becomes the Holder's **local audit journal**: privacy transparency (who accessed what data) plus document lifecycle (issuance, presentation, revoke/delete). v1 uses a unified append-only event log in encrypted MMKV, Thai UI aligned with the P4/P5 reference, tap-to-detail rows, and recording of Holder-initiated presentation declines. Suspend-access, failed presentations, backend sync, and NFC events are explicitly deferred.

## Goals

1. **Transparency** — Holder can see who requested data, what was or would have been shared, and when.
2. **Lifecycle** — Holder can see when documents were received, successfully presented, declined, revoked, or deleted.
3. **Consistency** — One event model and storage pattern, extensible for future event types.

## Non-goals (v1)

- "ขอให้ระงับสิทธิ์เข้าถึงข้อมูลของฉันทันที" (suspend access) — deferred until Verifier/Issuer protocol or backend API exists.
- Network/Verifier failures, biometric cancel during sign, timeouts.
- Backend sync success/failure events.
- Key renewal, NFC/HCE presentation events.
- List filters, local hide/delete row, retention policy, backend audit sync.

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Primary purpose | Mix of privacy transparency + document lifecycle |
| Row actions v1 | Detail view only (tap row); no delete or suspend buttons |
| Events v1 | Successful events + Holder-initiated presentation cancellations |
| Architecture | Unified append-only `walletEventLog` in encrypted MMKV (Approach 2) |

## Event model

### Type: `WalletHistoryEvent`

```typescript
type WalletHistoryEventKind =
  | 'credential-received'
  | 'presentation-success'
  | 'presentation-declined'
  | 'credential-revoked'
  | 'credential-deleted'

type WalletHistoryEvent = {
  id: string
  kind: WalletHistoryEventKind
  status: 'completed' | 'cancelled' | 'revoked' | 'deleted'  // denormalized; see note below
  occurredAt: string            // ISO-8601
  credentialId: string
  documentType: string            // CardSchemaConfig.title
  partyName: string               // issuer (issuance/lifecycle) or verifier.name (presentation)
  disclosedClaims: string[]       // claim labels; empty for issuance/lifecycle
  channel: 'oid4vp' | 'oid4vci' | 'wallet'
  initiatedBy?: 'holder' | 'system'  // lifecycle events only; default 'holder'
}
```

**`status` is denormalized** — it is 1:1 derivable from `kind` today (see events table). Kept for UI/badge convenience. **Dedupe and index logic must never key on `status`.**

### `channel` mapping (explicit)

| `kind` | `channel` |
|--------|-----------|
| `credential-received` | `oid4vci` |
| `presentation-success`, `presentation-declined` | `oid4vp` |
| `credential-revoked`, `credential-deleted` | `wallet` |

### Events in scope

| Event | `kind` | `status` | Trigger | `initiatedBy` |
|-------|--------|----------|---------|---------------|
| Credential received | `credential-received` | `completed` | `saveCredentialRecord()` | — |
| Presentation succeeded | `presentation-success` | `completed` | Verifier `direct_post` success | — |
| Presentation declined | `presentation-declined` | `cancelled` | `PresentationConsentPanel` → "ไม่ยินยอม" | — |
| Credential revoked | `credential-revoked` | `revoked` | `recordCredentialLifecycleAction('Revoke')` | `holder` |
| Credential deleted (Holder) | `credential-deleted` | `deleted` | P6 `recordCredentialLifecycleAction('Delete')` | `holder` |
| Credential deleted (expiry) | `credential-deleted` | `deleted` | `documentExpiryCleanup` → `deleteExpiredCredentialAfterReissue()` | `system` |

### Thai display projection

| `kind` | `actionLabel` | `subtitle` pattern |
|--------|---------------|-------------------|
| `credential-received` | รับเอกสารแล้ว | บันทึกเอกสารลง Wallet แล้ว |
| `presentation-success` | แสดงเอกสารสำเร็จ | ข้อมูลที่เปิดเผย: {claims} |
| `presentation-declined` | ปฏิเสธการแสดงเอกสาร | ไม่ยินยอมส่งข้อมูลไปยัง {partyName} |
| `credential-revoked` | ระงับเอกสารแล้ว | ยืนยันการระงับเอกสารใน Wallet |
| `credential-deleted` (`holder`) | ลบเอกสารแล้ว | ยืนยันการลบเอกสารใน Wallet |
| `credential-deleted` (`system`) | ลบเอกสารแล้ว | เอกสารหมดอายุ — ระบบลบออกจาก Wallet อัตโนมัติ |

List row `partyName`: verifier for presentation events, issuer for all others.

## Storage

### Keys (encrypted MMKV via `getCredentialStorage()`)

| Key | Purpose |
|-----|---------|
| `wallet:history:index` | Ordered array of event `id` strings |
| `wallet:history:event:{id}` | JSON `WalletHistoryEvent` |
| `wallet:history:backfill:v1` | `"done"` after one-time unified backfill + legacy migration |
| `presentation:badge-cleared:{credentialId}` | **Unchanged** — Wallet Home badge dismiss timestamp (see Badge semantics) |

Legacy keys (`presentation:history:index`, `presentation:history:{id}`) are read once during backfill v1 only; no new writes after migration.

### Service API (`src/services/history/walletEventLog.ts`)

- `appendWalletHistoryEvent(input)` — append event, update index; best-effort (never blocks protocol flows); **no dedupe on live append**
- `readWalletHistoryEvents()` — parse all, sort newest-first, skip corrupt entries (O(n) MMKV reads; acceptable v1 — retention in roadmap)
- `readWalletHistoryEvent(id)` — single event for detail screen
- `ensureWalletHistoryBackfill(credentials)` — single idempotent pass (see Migration); **must run at storage init, not on History tab mount**
- `readSuccessfullyPresentedCredentialIds()` — scan `presentation-success` events **and** `presentation:badge-cleared:*` keys (same semantics as today)
- `clearSuccessfulPresentationBadge(credentialId)` — **keep writing** `presentation:badge-cleared:{credentialId}` (re-export or move alongside event log; callers unchanged)

### Migration (single pass under `wallet:history:backfill:v1`)

All steps run inside `ensureWalletHistoryBackfill()` in one transaction-like sequence. If flag is already `"done"`, return immediately. Set flag only after all steps complete.

1. **Presentation history** — for each legacy `presentation:history:{id}` entry, append `presentation-success` using the **legacy `id` as the wallet event `id`** (format `{credentialId}:{occurredAt}:{nonce}` — already unique). Skip if `wallet:history:event:{legacyId}` already exists. **Do not use `credentialId + kind` dedupe here** — multiple presentations per credential must all migrate.
2. **Issuance** — backfill `credential-received` from stored credentials using `issuedAt`. Dedupe: skip when an event with same `credentialId + kind` already exists in the log.
3. **Lifecycle** — backfill from current `credential:lifecycle:{credentialId}` keys. Dedupe: skip when `credentialId + kind` already exists. **Only the latest lifecycle action per credential is recoverable** (`credential:lifecycle:*` is a single overwritten key per credential — acceptable limitation; state in UI if needed).

**Backfill timing (required):** call `ensureWalletHistoryBackfill(credentials)` immediately after successful `initStorage()` / `initStorageWithPin()` in `app/_layout.tsx` startup — **before** any screen reads lifecycle statuses (which may delete stale `credential:lifecycle:*` keys via `readCredentialLifecycleStatuses()`). Do not defer to History tab mount.

**Re-issue + dedupe note:** live `saveCredentialRecord()` always appends a new `credential-received` (no dedupe). Backfill `credentialId + kind` dedupe applies only to v1 backfill. If a future `backfill:v2` is introduced, re-issue rows must not be collapsed — use per-credential `issuedAt` or event `id` instead of `credentialId + kind` alone.

### Privacy

- Store claim **labels** only (e.g. "Date of Birth") — never JWT, VP token, or claim values.
- `walletLogger` tags: `event-appended`, `backfill-complete`, `presentation-history-migrated`, `event-parse-failed` — metadata only, no PII.

### Badge semantics (Wallet Home)

Preserve existing behavior from `presentationHistory.ts`:

- `readSuccessfullyPresentedCredentialIds()` returns credential IDs whose **latest** `presentation-success` event occurred **after** `presentation:badge-cleared:{credentialId}` (if set).
- `clearSuccessfulPresentationBadge(credentialId)` writes `presentation:badge-cleared:{credentialId}` = now ISO timestamp.
- Badge keys are **independent** of the event log index — do not remove or merge into `wallet:history:*`.

## Recording points

| Event | Call site | Notes |
|-------|-----------|-------|
| `credential-received` | `saveCredentialRecord()` in `exchangeService.ts` | Single choke point for OID4VCI, `scannedCredentialSave`, `dualFormatIssuance` |
| `presentation-success` | `app/(tabs)/scan.tsx` after successful `submitPresentationResponse` | Replaces `recordSuccessfulPresentation()`; writes to unified log only |
| `presentation-declined` | `scan.tsx` — `onReject` before `resetScanner` (`phase.request` has `verifier.name`) | Explicit "ไม่ยินยอม" only |
| `credential-revoked` | `recordCredentialLifecycleAction('Revoke')` | `initiatedBy: 'holder'` |
| `credential-deleted` (Holder) | P6 `recordCredentialLifecycleAction('Delete')` | `initiatedBy: 'holder'` |
| `credential-deleted` (system) | `deleteExpiredCredentialAfterReissue()` in `documentExpiryCleanup.ts` | `initiatedBy: 'system'` — append here or inside lifecycle helper with parameter |

**Re-issue:** new `credential-received` on every `saveCredentialRecord` for a new/replacement record; lifecycle clear on re-issue does not emit a history row.

**Read path:** `history.tsx` reads unified log only; `readWalletHistory()` becomes a display projection helper.

## UI/UX

### List (`app/(tabs)/history.tsx`)

- Keep `WalletHeader`, summary count, scrollable cards.
- Row: icon, `partyName`, Thai date/time, status badge, info box.
- Info box label: `ประเภทข้อมูลที่เข้าถึง` (presentations) or `เอกสาร` (issuance/lifecycle).
- Info box value: disclosed claims, document type, or lifecycle action text.
- Whole card `Pressable` → detail; remove non-functional "ลบรายการ" button.
- No suspend-access button in v1.
- No filters in v1.

**Status badges:** สำเร็จ (green), ปฏิเสธแล้ว (neutral), ถูกระงับ / ถูกลบ (red).

**Empty state:** extend copy to mention declined events.

### Detail (`app/(tabs)/history-event/[id].tsx`)

Hidden tab screen (`href: null` in `_layout.tsx`, same pattern as `credential/[id]`).

Shows: party + role label, document type, date/time, status, disclosures (presentation only via `PresentationDisclosureList`), channel caption. No action buttons.

### Components

| Component | Action |
|-----------|--------|
| `HistoryItem` | Event-driven row + `onPress`; remove delete button |
| `HistoryEmptyState` | Copy update |
| `HistoryEventDetailPanel` | New detail body |
| `projectWalletHistoryRow()` | New projection in `walletHistory.ts` |

## Error handling

| Scenario | Behavior |
|----------|----------|
| Storage not initialized | Show storage error on History screen |
| Corrupt event JSON | Skip entry, log, continue |
| Missing detail event | "ไม่พบรายการนี้" + back |
| Append failure | Log; do not block issuance/presentation |

## Testing

| File | Coverage |
|------|----------|
| `walletEventLog.test.ts` | append, read, sort, issuance/lifecycle backfill dedupe, presentation migration preserves multiple events per credential, corrupt skip |
| `walletHistory.test.ts` | Thai projection per kind/status/initiatedBy |
| `presentationHistory.test.ts` | Legacy migration by legacy id; badge-cleared interaction |
| Badge helper | `readSuccessfullyPresentedCredentialIds()` + `clearSuccessfulPresentationBadge()` unchanged semantics |

## Follow-up roadmap

| Item | Trigger |
|------|---------|
| Suspend access button | Protocol/backend revocation path defined |
| Failed presentations | Product opts into security monitoring |
| Renewal / sync / NFC | Flows stable + sign-off |
| Filter chips | List size warrants filtering |
| Local hide row | Separate privacy requirement |
| Backend audit sync | SDK endpoint + privacy review |
| Retention | `EXPO_PUBLIC_WALLET_HISTORY_RETENTION_DAYS` when ops need it |

## Implementation notes

- History append is **best-effort** — never fail credential save or VP submit because logging failed.
- Replace English action labels throughout History UI with Thai projection.
- `readWalletHistoryEvents()` is O(n) over the index per mount; unbounded growth acceptable for v1 (retention deferred).
- Update `docs/TASKS.md` when implementation slice completes.
