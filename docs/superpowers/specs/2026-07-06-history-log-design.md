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
  status: 'completed' | 'cancelled' | 'revoked' | 'deleted'
  occurredAt: string            // ISO-8601
  credentialId: string
  documentType: string            // CardSchemaConfig.title
  partyName: string               // issuer (issuance/lifecycle) or verifier.name (presentation)
  disclosedClaims: string[]       // claim labels; empty for issuance/lifecycle
  channel: 'oid4vp' | 'oid4vci' | 'wallet'
}
```

### Events in scope

| Event | `kind` | `status` | Trigger |
|-------|--------|----------|---------|
| Credential received | `credential-received` | `completed` | `saveCredentialRecord()` |
| Presentation succeeded | `presentation-success` | `completed` | Verifier `direct_post` success |
| Presentation declined | `presentation-declined` | `cancelled` | `PresentationConsentPanel` → "ไม่ยินยอม" |
| Credential revoked | `credential-revoked` | `revoked` | `recordCredentialLifecycleAction('Revoke')` |
| Credential deleted | `credential-deleted` | `deleted` | `recordCredentialLifecycleAction('Delete')` |

### Thai display projection

| `kind` | `actionLabel` | `subtitle` pattern |
|--------|---------------|-------------------|
| `credential-received` | รับเอกสารแล้ว | บันทึกเอกสารลง Wallet แล้ว |
| `presentation-success` | แสดงเอกสารสำเร็จ | ข้อมูลที่เปิดเผย: {claims} |
| `presentation-declined` | ปฏิเสธการแสดงเอกสาร | ไม่ยินยอมส่งข้อมูลไปยัง {partyName} |
| `credential-revoked` | ระงับเอกสารแล้ว | ยืนยันการระงับเอกสารใน Wallet |
| `credential-deleted` | ลบเอกสารแล้ว | ยืนยันการลบเอกสารใน Wallet |

List row `partyName`: verifier for presentation events, issuer for all others.

## Storage

### Keys (encrypted MMKV via `getCredentialStorage()`)

| Key | Purpose |
|-----|---------|
| `wallet:history:index` | Ordered array of event `id` strings |
| `wallet:history:event:{id}` | JSON `WalletHistoryEvent` |
| `wallet:history:backfill:v1` | `"done"` after one-time credential backfill |

### Service API (`src/services/history/walletEventLog.ts`)

- `appendWalletHistoryEvent(input)` — append event, update index; best-effort (never blocks protocol flows)
- `readWalletHistoryEvents()` — parse all, sort newest-first, skip corrupt entries
- `readWalletHistoryEvent(id)` — single event for detail screen
- `ensureWalletHistoryBackfill(credentials)` — idempotent backfill + legacy migration
- `readSuccessfullyPresentedCredentialIds()` — reimplemented from `presentation-success` events (preserves Wallet Home badge behavior)

### Migration

1. **Presentation history** — import existing `presentation:history:*` as `presentation-success` on first read; stop writing to legacy keys.
2. **Issuance** — backfill `credential-received` from stored credentials using `issuedAt`.
3. **Lifecycle** — backfill from `credential:lifecycle:*` where not already logged.

Dedupe: skip backfill when `credentialId + kind` already exists in log.

### Privacy

- Store claim **labels** only (e.g. "Date of Birth") — never JWT, VP token, or claim values.
- `walletLogger` tags: `event-appended`, `backfill-complete`, `presentation-history-migrated`, `event-parse-failed` — metadata only, no PII.

## Recording points

| Event | Call site | Notes |
|-------|-----------|-------|
| `credential-received` | `saveCredentialRecord()` in `exchangeService.ts` | Single choke point for OID4VCI, `scannedCredentialSave`, `dualFormatIssuance` |
| `presentation-success` | `app/(tabs)/scan.tsx` after successful `submitPresentationResponse` | Replaces direct `recordSuccessfulPresentation()` |
| `presentation-declined` | `scan.tsx` — `onReject` before `resetScanner` | Explicit "ไม่ยินยอม" only |
| `credential-revoked` / `credential-deleted` | `recordCredentialLifecycleAction()` in `credentialLifecycle.ts` | Covers Credential Detail P6 and `documentExpiryCleanup` |

**Re-issue:** new `credential-received` when `saveCredentialRecord` stores a replacement credential; no extra row for lifecycle clear.

**Read path:** `history.tsx` reads unified log only; `readWalletHistory()` becomes a display projection helper.

**Startup:** `ensureWalletHistoryBackfill(credentials)` on History mount or wallet startup after storage init.

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
| `walletEventLog.test.ts` | append, read, sort, backfill dedupe, corrupt skip |
| `walletHistory.test.ts` | Thai projection per kind/status |
| `presentationHistory.test.ts` | Legacy migration |
| Badge helper | `readSuccessfullyPresentedCredentialIds()` from unified log |

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
- Update `docs/TASKS.md` when implementation slice completes.
