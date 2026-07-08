# History Log v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a unified Holder audit journal — append-only encrypted event log, Thai History list + detail UI, presentation declines, lifecycle events with `initiatedBy`, and preserved Wallet Home badge behavior.

**Architecture:** New `walletEventLog.ts` owns storage (`wallet:history:*`). Protocol/lifecycle choke points call `appendWalletHistoryEvent`. One-time backfill runs immediately after storage init in `_layout.tsx`. `presentationHistory.ts` becomes a thin badge wrapper over the event log. UI reads projected rows via `projectWalletHistoryRow()`.

**Tech Stack:** React Native (Expo SDK 54), encrypted MMKV (`getCredentialStorage`), Jest, NativeWind, expo-router hidden tab routes.

**Spec:** `docs/superpowers/specs/2026-07-06-history-log-design.md`

## Global Constraints

- History append is **best-effort** — never block OID4VCI/OID4VP/lifecycle flows on logging failure.
- Store claim **labels** only in events — no JWT/VP/PII in history payloads or logs.
- Dedupe on backfill: legacy presentation `id` for presentations; `credentialId + kind` for issuance/lifecycle only.
- Never key dedupe or index on denormalized `status`.
- Keep `presentation:badge-cleared:{credentialId}` keys independent of event log.
- Thai UI copy for all History labels (no English action strings in UI).
- NativeWind for styling; no new `StyleSheet` unless animated values require it.
- Run `yarn tsc --noEmit`, `yarn lint`, focused tests after each task group.
- Update `docs/TASKS.md` when slice completes.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/services/history/walletEventLog.ts` | **Create** — types, append, read, backfill, badge helpers |
| `src/services/history/walletEventLog.test.ts` | **Create** — storage + backfill tests |
| `src/services/history/walletHistory.ts` | **Modify** — `projectWalletHistoryRow()`, remove derive-on-read |
| `src/services/history/walletHistory.test.ts` | **Modify** — projection tests |
| `src/services/history/presentationHistory.ts` | **Modify** — delegate to event log; keep badge key constants |
| `src/services/history/presentationHistory.test.ts` | **Modify** — migration + badge tests |
| `src/services/credentials/credentialLifecycle.ts` | **Modify** — `initiatedBy` param + history append |
| `src/services/credentials/credentialLifecycle.test.ts` | **Modify** — `initiatedBy` + history |
| `src/services/credentials/documentExpiryCleanup.ts` | **Modify** — pass `'system'` |
| `src/services/vci/exchangeService.ts` | **Modify** — append on `saveCredentialRecord` |
| `app/_layout.tsx` | **Modify** — backfill after `storage-init-complete` |
| `app/(tabs)/scan.tsx` | **Modify** — success + decline events |
| `app/(tabs)/history.tsx` | **Modify** — read event log |
| `app/(tabs)/history-event/[id].tsx` | **Create** — detail screen |
| `app/(tabs)/_layout.tsx` | **Modify** — hide `history-event/[id]` tab |
| `src/components/HistoryItem.tsx` | **Modify** — projected row, `onPress`, remove delete btn |
| `src/components/HistoryEmptyState.tsx` | **Modify** — copy mentions declines |
| `src/components/HistoryEventDetailPanel.tsx` | **Create** — detail body |
| `src/services/vp/walletInitiatedPresentation.ts` | **Modify (if exists)** — relay `presentation-success` append after PUT |

---

### Task 1: `walletEventLog` core types and append/read

**Files:**
- Create: `src/services/history/walletEventLog.ts`
- Create: `src/services/history/walletEventLog.test.ts`

**Interfaces:**
- Produces:
  - `WalletHistoryEventKind`, `WalletHistoryEvent`, `AppendWalletHistoryEventInput`
  - `appendWalletHistoryEvent(input): WalletHistoryEvent | undefined`
  - `readWalletHistoryEvents(): WalletHistoryEvent[]`
  - `readWalletHistoryEvent(id): WalletHistoryEvent | undefined`

- [ ] **Step 1: Write failing tests**

```typescript
// src/services/history/walletEventLog.test.ts
import { createMMKV } from 'react-native-mmkv'

jest.mock('../storage/storage', () => {
  const { createMMKV: createTestMmkv } = jest.requireActual('react-native-mmkv')
  const storage = createTestMmkv({ id: 'wallet-event-log-test' })
  return { getCredentialStorage: () => storage }
})

import {
  appendWalletHistoryEvent,
  readWalletHistoryEvents,
  readWalletHistoryEvent,
} from './walletEventLog'
import { getCredentialStorage } from '../storage/storage'

beforeEach(() => {
  getCredentialStorage().clearAll()
})

test('appendWalletHistoryEvent stores and reads newest first', () => {
  appendWalletHistoryEvent({
    kind: 'presentation-success',
    credentialId: 'cred-1',
    documentType: 'บัตรประชาชน',
    partyName: 'ร้านอาหาร',
    disclosedClaims: ['อายุ'],
    channel: 'oid4vp',
  })
  const events = readWalletHistoryEvents()
  expect(events).toHaveLength(1)
  expect(events[0].kind).toBe('presentation-success')
  expect(events[0].status).toBe('completed')
  expect(readWalletHistoryEvent(events[0].id)).toEqual(events[0])
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/history/walletEventLog.test.ts --runInBand`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal `walletEventLog.ts`**

```typescript
// src/services/history/walletEventLog.ts
import { getCredentialStorage } from '../storage/storage'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type WalletHistoryEventKind =
  | 'credential-received'
  | 'presentation-success'
  | 'presentation-declined'
  | 'credential-revoked'
  | 'credential-deleted'

export type WalletHistoryEvent = {
  id: string
  kind: WalletHistoryEventKind
  status: 'completed' | 'cancelled' | 'revoked' | 'deleted'
  occurredAt: string
  credentialId: string
  documentType: string
  partyName: string
  disclosedClaims: string[]
  channel: 'oid4vp' | 'oid4vci' | 'wallet'
  initiatedBy?: 'holder' | 'system'
}

export type AppendWalletHistoryEventInput = {
  id?: string
  kind: WalletHistoryEventKind
  credentialId: string
  documentType: string
  partyName: string
  disclosedClaims?: string[]
  channel: WalletHistoryEvent['channel']
  initiatedBy?: 'holder' | 'system'
  occurredAt?: string
  now?: Date
}

const HISTORY_INDEX_KEY = 'wallet:history:index'
const HISTORY_EVENT_PREFIX = 'wallet:history:event:'

function statusForKind(
  kind: WalletHistoryEventKind,
): WalletHistoryEvent['status'] {
  switch (kind) {
    case 'presentation-declined':
      return 'cancelled'
    case 'credential-revoked':
      return 'revoked'
    case 'credential-deleted':
      return 'deleted'
    default:
      return 'completed'
  }
}

export function appendWalletHistoryEvent(
  input: AppendWalletHistoryEventInput,
): WalletHistoryEvent | undefined {
  try {
    const occurredAt = input.occurredAt ?? (input.now ?? new Date()).toISOString()
    const event: WalletHistoryEvent = {
      id:
        input.id ??
        `${input.kind}:${input.credentialId}:${occurredAt}:${Math.random().toString(36).slice(2, 8)}`,
      kind: input.kind,
      status: statusForKind(input.kind),
      occurredAt,
      credentialId: input.credentialId,
      documentType: input.documentType,
      partyName: input.partyName,
      disclosedClaims: input.disclosedClaims ?? [],
      channel: input.channel,
      ...(input.initiatedBy ? { initiatedBy: input.initiatedBy } : {}),
    }
    const storage = getCredentialStorage()
    storage.set(`${HISTORY_EVENT_PREFIX}${event.id}`, JSON.stringify(event))
    const ids = readHistoryIds(storage)
    if (!ids.includes(event.id)) {
      storage.set(HISTORY_INDEX_KEY, JSON.stringify([...ids, event.id]))
    }
    logWalletStep('history', 'event-appended', { kind: event.kind, credentialId: event.credentialId })
    return event
  } catch (error) {
    logWalletError('history', 'event-append-failed', error, { kind: input.kind })
    return undefined
  }
}

export function readWalletHistoryEvents(): WalletHistoryEvent[] {
  const storage = getCredentialStorage()
  return readHistoryIds(storage)
    .map((id) => storage.getString(`${HISTORY_EVENT_PREFIX}${id}`))
    .filter((raw): raw is string => Boolean(raw))
    .map(parseWalletHistoryEvent)
    .filter((event): event is WalletHistoryEvent => Boolean(event))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
}

export function readWalletHistoryEvent(id: string): WalletHistoryEvent | undefined {
  const raw = getCredentialStorage().getString(`${HISTORY_EVENT_PREFIX}${id}`)
  return raw ? parseWalletHistoryEvent(raw) : undefined
}

function readHistoryIds(storage: { getString: (key: string) => string | undefined }): string[] {
  const raw = storage.getString(HISTORY_INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseWalletHistoryEvent(raw: string): WalletHistoryEvent | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<WalletHistoryEvent>
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.kind === 'string' &&
      typeof parsed.status === 'string' &&
      typeof parsed.occurredAt === 'string' &&
      typeof parsed.credentialId === 'string' &&
      typeof parsed.documentType === 'string' &&
      typeof parsed.partyName === 'string' &&
      Array.isArray(parsed.disclosedClaims) &&
      typeof parsed.channel === 'string'
    ) {
      return parsed as WalletHistoryEvent
    }
  } catch {
    logWalletStep('history', 'event-parse-failed', {})
  }
  return undefined
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `yarn test src/services/history/walletEventLog.test.ts --runInBand`

- [ ] **Step 5: Commit**

```bash
git add src/services/history/walletEventLog.ts src/services/history/walletEventLog.test.ts
git commit -m "feat(history): add wallet event log append and read"
```

---

### Task 2: Backfill, legacy migration, badge helpers

**Files:**
- Modify: `src/services/history/walletEventLog.ts`
- Modify: `src/services/history/walletEventLog.test.ts`

**Interfaces:**
- Consumes: `readStoredCredentials`, `readCredentialLifecycleStatus`, legacy `presentation:history:*` keys
- Produces:
  - `ensureWalletHistoryBackfill(): void`
  - `readSuccessfullyPresentedCredentialIds(): string[]`
  - `clearSuccessfulPresentationBadge(credentialId, now?): void`
  - `hasCredentialKindInLog(credentialId, kind): boolean` (internal/test export ok)

- [ ] **Step 1: Write failing tests**

Add to `walletEventLog.test.ts`:

```typescript
test('ensureWalletHistoryBackfill migrates two presentation events with same credentialId', () => {
  const storage = getCredentialStorage()
  const id1 = 'cred-1:2026-01-01T00:00:00.000Z:abc123'
  const id2 = 'cred-1:2026-01-02T00:00:00.000Z:def456'
  storage.set('presentation:history:index', JSON.stringify([id1, id2]))
  storage.set(
    `presentation:history:${id1}`,
    JSON.stringify({
      id: id1,
      credentialId: 'cred-1',
      verifierName: 'Seven',
      documentType: 'บัตรประชาชน',
      disclosedClaims: ['อายุ'],
      occurredAt: '2026-01-01T00:00:00.000Z',
    }),
  )
  storage.set(
    `presentation:history:${id2}`,
    JSON.stringify({
      id: id2,
      credentialId: 'cred-1',
      verifierName: 'Hospital',
      documentType: 'บัตรประชาชน',
      disclosedClaims: ['ชื่อ'],
      occurredAt: '2026-01-02T00:00:00.000Z',
    }),
  )

  ensureWalletHistoryBackfill()

  const events = readWalletHistoryEvents().filter((e) => e.kind === 'presentation-success')
  expect(events).toHaveLength(2)
  expect(events.map((e) => e.id).sort()).toEqual([id1, id2].sort())
  expect(storage.getString('wallet:history:backfill:v1')).toBe('done')
})

test('readSuccessfullyPresentedCredentialIds respects badge-cleared timestamp', () => {
  appendWalletHistoryEvent({
    kind: 'presentation-success',
    credentialId: 'cred-1',
    documentType: 'บัตรประชาชน',
    partyName: 'Verifier',
    disclosedClaims: [],
    channel: 'oid4vp',
    occurredAt: '2026-06-01T00:00:00.000Z',
  })
  clearSuccessfulPresentationBadge('cred-1', new Date('2026-06-02T00:00:00.000Z'))
  expect(readSuccessfullyPresentedCredentialIds()).toEqual([])
})
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement backfill + badge helpers**

Key logic in `walletEventLog.ts`:

```typescript
const BACKFILL_FLAG_KEY = 'wallet:history:backfill:v1'
const PRESENTATION_HISTORY_INDEX_KEY = 'presentation:history:index'
const PRESENTATION_HISTORY_KEY_PREFIX = 'presentation:history:'
export const PRESENTATION_BADGE_CLEARED_KEY_PREFIX = 'presentation:badge-cleared:'

export function ensureWalletHistoryBackfill(): void {
  const storage = getCredentialStorage()
  if (storage.getString(BACKFILL_FLAG_KEY) === 'done') return

  migratePresentationHistory(storage)
  backfillCredentialReceivedEvents(readStoredCredentials())
  backfillLifecycleEvents(readStoredCredentials())

  storage.set(BACKFILL_FLAG_KEY, 'done')
  logWalletStep('history', 'backfill-complete', { eventCount: readHistoryIds(storage).length })
}

function migratePresentationHistory(
  storage: { getString: (key: string) => string | undefined },
): void {
  const raw = storage.getString(PRESENTATION_HISTORY_INDEX_KEY)
  if (!raw) return

  let legacyIds: string[] = []
  try {
    const parsed = JSON.parse(raw) as unknown
    legacyIds = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return
  }

  for (const legacyId of legacyIds) {
    if (storage.getString(`${HISTORY_EVENT_PREFIX}${legacyId}`)) continue

    const legacyRaw = storage.getString(`${PRESENTATION_HISTORY_KEY_PREFIX}${legacyId}`)
    if (!legacyRaw) continue

    try {
      const legacy = JSON.parse(legacyRaw) as {
        id: string
        credentialId: string
        verifierName: string
        documentType: string
        disclosedClaims: string[]
        occurredAt: string
      }
      if (
        typeof legacy.id !== 'string' ||
        typeof legacy.credentialId !== 'string' ||
        typeof legacy.verifierName !== 'string' ||
        typeof legacy.documentType !== 'string' ||
        !Array.isArray(legacy.disclosedClaims) ||
        typeof legacy.occurredAt !== 'string'
      ) {
        logWalletStep('history', 'event-parse-failed', {})
        continue
      }

      appendWalletHistoryEvent({
        id: legacy.id,
        kind: 'presentation-success',
        credentialId: legacy.credentialId,
        documentType: legacy.documentType,
        partyName: legacy.verifierName,
        disclosedClaims: legacy.disclosedClaims,
        channel: 'oid4vp',
        occurredAt: legacy.occurredAt,
      })
    } catch {
      logWalletStep('history', 'event-parse-failed', {})
    }
  }

  logWalletStep('history', 'presentation-history-migrated', { count: legacyIds.length })
}

function hasCredentialKindInLog(
  credentialId: string,
  kind: WalletHistoryEventKind,
): boolean {
  return readWalletHistoryEvents().some(
    (event) => event.credentialId === credentialId && event.kind === kind,
  )
}

function backfillCredentialReceivedEvents(credentials: VerifiableCredentialRecord[]): void {
  for (const record of credentials) {
    if (hasCredentialKindInLog(record.id, 'credential-received')) continue
    const schema = getCardSchema(record.type)
    appendWalletHistoryEvent({
      kind: 'credential-received',
      credentialId: record.id,
      documentType: schema.title,
      partyName: schema.issuerName,
      channel: 'oid4vci',
      occurredAt: record.issuedAt,
    })
  }
}

function backfillLifecycleEvents(credentials: VerifiableCredentialRecord[]): void {
  for (const record of credentials) {
    const lifecycle = readCredentialLifecycleStatus(record.id)
    if (!lifecycle) continue
    const kind = lifecycle.status === 'revoked' ? 'credential-revoked' : 'credential-deleted'
    if (hasCredentialKindInLog(record.id, kind)) continue
    const schema = getCardSchema(record.type)
    appendWalletHistoryEvent({
      kind,
      credentialId: record.id,
      documentType: schema.title,
      partyName: schema.issuerName,
      channel: 'wallet',
      initiatedBy: 'holder',
      occurredAt: lifecycle.occurredAt,
    })
  }
}

export function readSuccessfullyPresentedCredentialIds(): string[] {
  const latestByCredential = new Map<string, WalletHistoryEvent>()
  for (const event of readWalletHistoryEvents()) {
    if (event.kind !== 'presentation-success') continue
    if (!latestByCredential.has(event.credentialId)) {
      latestByCredential.set(event.credentialId, event)
    }
  }
  const storage = getCredentialStorage()
  return [...latestByCredential.values()]
    .filter((event) => {
      const clearedAt = storage.getString(`${PRESENTATION_BADGE_CLEARED_KEY_PREFIX}${event.credentialId}`)
      return !clearedAt || Date.parse(event.occurredAt) > Date.parse(clearedAt)
    })
    .map((event) => event.credentialId)
}

export function clearSuccessfulPresentationBadge(credentialId: string, now = new Date()): void {
  getCredentialStorage().set(
    `${PRESENTATION_BADGE_CLEARED_KEY_PREFIX}${credentialId}`,
    now.toISOString(),
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test src/services/history/walletEventLog.test.ts --runInBand`

- [ ] **Step 5: Commit**

```bash
git add src/services/history/walletEventLog.ts src/services/history/walletEventLog.test.ts
git commit -m "feat(history): add backfill migration and badge helpers"
```

---

### Task 3: Thai projection layer

**Files:**
- Modify: `src/services/history/walletHistory.ts`
- Modify: `src/services/history/walletHistory.test.ts`

**Interfaces:**
- Consumes: `WalletHistoryEvent` from `walletEventLog.ts`
- Produces:
  - `WalletHistoryRow` (display shape for list/detail)
  - `projectWalletHistoryRow(event: WalletHistoryEvent): WalletHistoryRow`

- [ ] **Step 1: Write failing projection test**

```typescript
test('projectWalletHistoryRow maps system delete subtitle', () => {
  const row = projectWalletHistoryRow({
    id: 'e1',
    kind: 'credential-deleted',
    status: 'deleted',
    occurredAt: '2026-06-01T00:00:00.000Z',
    credentialId: 'c1',
    documentType: 'ใบขับขี่',
    partyName: 'กรมขนส่ง',
    disclosedClaims: [],
    channel: 'wallet',
    initiatedBy: 'system',
  })
  expect(row.actionLabel).toBe('ลบเอกสารแล้ว')
  expect(row.subtitle).toContain('หมดอายุ')
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Replace derive-on-read with projection**

Remove `readWalletHistory(credentials, lifecycle, presentations)` derivation. Keep `WalletHistoryRow` type (rename from `WalletHistoryEvent` display type if needed — use `WalletHistoryRow` for UI, `WalletHistoryEvent` for storage).

Implement `projectWalletHistoryRow` per spec Thai table including `initiatedBy` branch for system delete.

**`partyName` display rule:** use `event.partyName` as-is (already verifier, relay name, or issuer at write time).

**`channelCaption` helper** (for detail screen):

| `channel` | `kind` | Caption |
|-----------|--------|---------|
| `oid4vp` | `presentation-*` | ผ่าน QR Verifier |
| `wallet` | `presentation-success` | ผ่าน VP Relay (dev) |
| `oid4vci` | `credential-received` | รับเอกสารจาก Issuer |
| `wallet` | lifecycle kinds | ดำเนินการใน Wallet |

Export `readWalletHistoryRows(): WalletHistoryRow[]` = `readWalletHistoryEvents().map(projectWalletHistoryRow)`.

- [ ] **Step 4: Update/delete old tests expecting English derive-on-read**

- [ ] **Step 5: Run tests**

Run: `yarn test src/services/history/walletHistory.test.ts --runInBand`

- [ ] **Step 6: Commit**

```bash
git add src/services/history/walletHistory.ts src/services/history/walletHistory.test.ts
git commit -m "feat(history): add Thai projection for wallet history rows"
```

---

### Task 4: Lifecycle choke point + expiry `system`

**Files:**
- Modify: `src/services/credentials/credentialLifecycle.ts`
- Modify: `src/services/credentials/credentialLifecycle.test.ts`
- Modify: `src/services/credentials/documentExpiryCleanup.ts`

**Interfaces:**
- Consumes: `appendWalletHistoryEvent`, `readStoredCredentialById`, `getCardSchema`
- Produces: `recordCredentialLifecycleAction(credentialId, action, initiatedBy = 'holder', now = new Date())`

**Breaking signature change:** today the 3rd parameter is `now: Date`. After this task it is `initiatedBy`, 4th is `now`. Update `credentialLifecycle.test.ts` call `recordCredentialLifecycleAction('transcript-1', 'Revoke', new Date(...))` → pass `'holder'` as 3rd arg.

- [ ] **Step 1: Write failing lifecycle history test**

```typescript
jest.mock('./storedCredentials', () => ({
  readStoredCredentialById: jest.fn(),
}))

jest.mock('../history/walletEventLog', () => ({
  appendWalletHistoryEvent: jest.fn(),
}))

import { readStoredCredentialById } from './storedCredentials'
import { appendWalletHistoryEvent } from '../history/walletEventLog'

const readStoredCredentialByIdMock = readStoredCredentialById as jest.Mock
const appendWalletHistoryEventMock = appendWalletHistoryEvent as jest.Mock

test('recordCredentialLifecycleAction appends revoked history event', () => {
  mockStorage()
  readStoredCredentialByIdMock.mockReturnValue(transcriptRecord)

  recordCredentialLifecycleAction(
    'transcript-1',
    'Revoke',
    'holder',
    new Date('2026-06-08T10:00:00.000Z'),
  )

  expect(appendWalletHistoryEventMock).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'credential-revoked',
      credentialId: 'transcript-1',
      channel: 'wallet',
      initiatedBy: 'holder',
      occurredAt: '2026-06-08T10:00:00.000Z',
    }),
  )
})
```

- [ ] **Step 2: Implement signature + history append inside lifecycle helper**

```typescript
export function recordCredentialLifecycleAction(
  credentialId: string,
  action: CredentialLifecycleAction,
  initiatedBy: 'holder' | 'system' = 'holder',
  now = new Date(),
): CredentialLifecycleStatus {
  const status = { /* existing */ }
  getCredentialStorage().set(`${LIFECYCLE_KEY_PREFIX}${credentialId}`, JSON.stringify(status))

  const record = readStoredCredentialById(credentialId)
  if (record) {
    const schema = getCardSchema(record.type)
    appendWalletHistoryEvent({
      kind: action === 'Revoke' ? 'credential-revoked' : 'credential-deleted',
      credentialId,
      documentType: schema.title,
      partyName: schema.issuerName,
      channel: 'wallet',
      initiatedBy,
      occurredAt: status.occurredAt,
    })
  }
  return status
}
```

- [ ] **Step 3: Update `documentExpiryCleanup.ts`**

```typescript
recordCredentialLifecycleAction(credentialId, 'Delete', 'system')
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/credentials/credentialLifecycle.test.ts --runInBand`

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/credentialLifecycle.ts src/services/credentials/credentialLifecycle.test.ts src/services/credentials/documentExpiryCleanup.ts
git commit -m "feat(history): append lifecycle events from single choke point"
```

---

### Task 5: Issuance + presentation recording + `presentationHistory` shim

**Files:**
- Modify: `src/services/vci/exchangeService.ts`
- Modify: `src/services/history/presentationHistory.ts`
- Modify: `src/services/history/presentationHistory.test.ts`
- Modify: `app/(tabs)/scan.tsx`

- [ ] **Step 1: Append on `saveCredentialRecord`**

After `storeCredentialRecord(...)`:

```typescript
const schema = getCardSchema(record.type)
appendWalletHistoryEvent({
  kind: 'credential-received',
  credentialId: record.id,
  documentType: schema.title,
  partyName: schema.issuerName,
  channel: 'oid4vci',
  occurredAt: record.issuedAt,
})
```

- [ ] **Step 2: Replace `recordSuccessfulPresentation` body**

Delegate to `appendWalletHistoryEvent({ kind: 'presentation-success', channel: 'oid4vp', partyName: input.verifierName, ... })` — **stop writing** `presentation:history:*` keys for new events.

Keep `readSuccessfulPresentationHistory()` as a thin adapter over `readWalletHistoryEvents().filter(kind === 'presentation-success')` mapping `partyName` → `verifierName` for any legacy callers, or remove if unused after grep.

Re-export `readSuccessfullyPresentedCredentialIds` and `clearSuccessfulPresentationBadge` from `walletEventLog.ts` via forwarders in `presentationHistory.ts` so `app/(tabs)/index.tsx` imports stay stable.

- [ ] **Step 3: Wire `scan.tsx`**

Success path — replace `recordSuccessfulPresentation({...})` with `appendWalletHistoryEvent` (or keep wrapper).

Decline path:

```typescript
onReject={() => {
  appendWalletHistoryEvent({
    kind: 'presentation-declined',
    credentialId: phase.request.matchedCredential.id,
    documentType: getCardSchema(phase.request.matchedCredential.type).title,
    partyName: phase.request.verifier.name,
    disclosedClaims: phase.request.disclosures.map((d) => d.label),
    channel: 'oid4vp',
  })
  resetScanner()
}}
```

- [ ] **Step 4: Update `presentationHistory.test.ts`**

Change `records successful presentation events` to assert `wallet:history:event:*` and `wallet:history:index` writes (not `presentation:history:*`). Badge/cleared tests should seed `wallet:history:*` events instead of legacy keys.

- [ ] **Step 5: Update `ScanScreenDeeplink.test.tsx` mocks if needed**

- [ ] **Step 6: Run tests**

Run: `yarn test src/services/history/presentationHistory.test.ts src/screens/ScanScreenDeeplink.test.tsx --runInBand`

- [ ] **Step 7: Commit**

```bash
git add src/services/vci/exchangeService.ts src/services/history/presentationHistory.ts src/services/history/presentationHistory.test.ts app/(tabs)/scan.tsx
git commit -m "feat(history): record issuance, presentation success and decline"
```

---

### Task 5b: VP relay presentation history (skip if file absent)

**Files:**
- Modify: `src/services/vp/walletInitiatedPresentation.ts` (only when VP relay slice is present)

**Interfaces:**
- Consumes: `appendWalletHistoryEvent`, `getCardSchema`, relay display name constant
- Produces: history row on successful `submitVpToSession()` PUT

**Skip condition:** if `walletInitiatedPresentation.ts` does not exist yet, skip this task entirely — relay history is documented in spec for when VP relay lands.

- [ ] **Step 1: After successful PUT in `submitVpToSession`, append event**

```typescript
import { appendWalletHistoryEvent } from '../history/walletEventLog'
import { getCardSchema } from '../../config/cardSchemas'

const VP_RELAY_DISPLAY_NAME = 'VP Relay (dev)'

// inside submitVpToSession after res.ok:
const schema = getCardSchema(credentialType)
appendWalletHistoryEvent({
  kind: 'presentation-success',
  credentialId,
  documentType: schema.title,
  partyName: VP_RELAY_DISPLAY_NAME,
  disclosedClaims: schema.detailFields?.map((field) => field.label) ?? [],
  channel: 'wallet',
})
```

- [ ] **Step 2: Add unit test in `walletInitiatedPresentation.test.ts` (or walletEventLog integration test) asserting append called on 200 PUT**

- [ ] **Step 3: Commit**

```bash
git add src/services/vp/walletInitiatedPresentation.ts
git commit -m "feat(history): record VP relay presentation-success in wallet event log"
```

---

### Task 6: Startup backfill hook

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Import and call after storage init**

Immediately after `logWalletStep('startup', 'storage-init-complete')` (~line 272):

```typescript
const { ensureWalletHistoryBackfill } = await import('@/src/services/history/walletEventLog')
ensureWalletHistoryBackfill()
logWalletStep('startup', 'wallet-history-backfill-complete')
```

Must run **before** `generateWalletKeyIfNeeded()` and before any UI that calls `readCredentialLifecycleStatuses()`.

- [ ] **Step 2: Manual smoke** — app starts without error in dev

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(history): run wallet history backfill at storage init"
```

---

### Task 7: History list UI

**Files:**
- Modify: `app/(tabs)/history.tsx`
- Modify: `src/components/HistoryItem.tsx`
- Modify: `src/components/HistoryEmptyState.tsx`

- [ ] **Step 1: Update `history.tsx`**

```typescript
import { readWalletHistoryRows } from '../../src/services/history/walletHistory'

const items = readWalletHistoryRows()
// map HistoryItem with onPress={() => router.push(`/history-event/${item.id}`)}
```

Remove imports of `readWalletHistory`, `readSuccessfulPresentationHistory`, `readCredentialLifecycleStatuses` for history assembly.

- [ ] **Step 2: Update `HistoryItem`**

- Accept `WalletHistoryRow` + `onPress`
- Remove delete `AppButton`
- Use dynamic info-box label: presentations vs issuance/lifecycle
- Status badge labels: สำเร็จ / ปฏิเสธแล้ว / ถูกระงับ / ถูกลบ

- [ ] **Step 3: Update `HistoryEmptyState` copy**

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/history.tsx src/components/HistoryItem.tsx src/components/HistoryEmptyState.tsx
git commit -m "feat(history): Thai list UI driven by event log"
```

---

### Task 8: History detail screen

**Files:**
- Create: `src/components/HistoryEventDetailPanel.tsx`
- Create: `app/(tabs)/history-event/[id].tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create detail panel component**

Shows party + role ("ผู้ตรวจสอบ" for `presentation-*`, "ผู้ออกเอกสาร" otherwise), document, datetime, status badge, `PresentationDisclosureList` when `disclosedClaims.length > 0`, `channelCaption` from projection helper. No action buttons.

List row info-box label: `ประเภทข้อมูลที่เข้าถึง` for `presentation-*`; `เอกสาร` for issuance/lifecycle.

- [ ] **Step 2: Create route**

```typescript
// app/(tabs)/history-event/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router'
import { readWalletHistoryEvent } from '@/src/services/history/walletEventLog'
import { projectWalletHistoryRow } from '@/src/services/history/walletHistory'

export default function HistoryEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const event = typeof id === 'string' ? readWalletHistoryEvent(id) : undefined
  if (!event) {
    return (/* ไม่พบรายการนี้ + back */)
  }
  const row = projectWalletHistoryRow(event)
  return (/* WalletHeader + HistoryEventDetailPanel */)
}
```

- [ ] **Step 3: Hide tab in `_layout.tsx`**

```typescript
<Tabs.Screen name="history-event/[id]" options={{ href: null, title: 'History Log' }} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/HistoryEventDetailPanel.tsx app/(tabs)/history-event/[id].tsx app/(tabs)/_layout.tsx
git commit -m "feat(history): add event detail screen"
```

---

### Task 9: Verification + docs

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Run quality gates**

```bash
yarn tsc --noEmit
yarn lint
yarn test --runInBand
```

- [ ] **Step 2: Update `docs/TASKS.md`** — mark History Log v1 slice complete with spec/plan links

- [ ] **Step 3: Final commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record History Log v1 implementation complete"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Unified append-only log | Task 1 |
| Presentation migration by legacy id | Task 2 |
| Issuance/lifecycle backfill dedupe | Task 2 |
| Backfill at storage init | Task 6 |
| Badge-cleared keys | Task 2 |
| `initiatedBy` + system delete copy | Task 3, 4 |
| Lifecycle single choke point | Task 4 |
| Issuance on saveCredentialRecord | Task 5 |
| Presentation success + decline | Task 5 |
| VP relay presentation-success | Task 5b (skip if relay service absent) |
| Lifecycle backfill `initiatedBy` defaults holder | Task 2 (accepted legacy limitation per spec) |
| Channel captions in detail | Task 3, 8 |
| Thai UI + detail screen | Task 7, 8 |
| Remove delete button | Task 7 |
| Best-effort append | Task 1 (try/catch) |

No placeholders remain. Types consistent across tasks.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-06-history-log.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — implement tasks in this session with checkpoints

**Which approach?**
