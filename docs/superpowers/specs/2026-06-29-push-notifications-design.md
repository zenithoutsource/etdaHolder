# OS Push Notification — Design Spec

> **Date:** 2026-06-29
> **Status:** Approved

---

## 1. Context

etdaWallet surfaces all credential state changes as UI-only (banners, overlays, badges) — visible only when the user opens the app. The wallet needs to notify users of critical credential lifecycle events even when the app is closed, e.g., when an issuer issues a new VC, suspends a credential, or requires renewal.

**Goal:** Add OS push notifications for 5 credential lifecycle events via Expo Push Notification Service (routes to FCM on Android, APNs on iOS automatically — no Firebase SDK needed).

**Out of scope (v1):** In-app notification inbox, badge counts, notification preferences screen, notification retry/queuing.

---

## 2. Architecture

```
Issuer
  │ POST /webhook/credential-event  { event, holderDid, credentialId, credentialType }
  ▼
Backend (production backend / local dev: server/)
  │ lookup Expo push token by holderDid
  │ POST https://exp.host/--/api/v2/push/send
  ▼
Expo Push Service
  ├─► FCM → Android device
  └─► APNs → iOS device
          │ user taps notification
          ▼
      /credential/[credentialId]
```

**Token registration flow (app startup):**
```
prepareWallet() in app/_layout.tsx
  └── initPushNotifications()
        ├── request OS permission (required: iOS, Android 13+)
        ├── getExpoPushToken()  → ExponentPushToken[xxx]
        └── POST /wallet/push-token  { token, holderDid }
             via walletApi.ts
```

Token is re-registered on every startup — handles re-install and token rotation automatically.

---

## 3. Events

| Event key | Trigger (issuer webhook) | Title (TH) | Body (TH) |
|---|---|---|---|
| `renewal-ready` | offer-ready | "เอกสารใหม่พร้อมแล้ว" | "{type} ออกใหม่ให้คุณแล้ว แตะเพื่อรับ" |
| `renewal-required` | renewal-required | "ถึงเวลาต่ออายุเอกสาร" | "{type} ต้องการการต่ออายุ" |
| `issuer-suspended` | suspended | "เอกสารถูกระงับชั่วคราว" | "{type} ถูกผู้ออกระงับการใช้งาน" |
| `cleanup-pending` | after claim success (server-side) | "รับเอกสารใหม่สำเร็จ" | "ลบเอกสารเก่าเพื่อดำเนินการต่อ" |
| `old-revoked` | revoked | "การต่ออายุเสร็จสมบูรณ์" | "เอกสารเก่าถูกยกเลิกแล้ว" |

---

## 4. Payload Schema

```typescript
// Expo Push Message
{
  to: string,         // ExponentPushToken[xxx]
  title: string,      // Thai title per event table above
  body: string,       // Thai body per event table above
  data: {
    event: 'renewal-ready' | 'renewal-required' | 'issuer-suspended' | 'cleanup-pending' | 'old-revoked',
    credentialId: string,
    credentialType: string,  // e.g. 'ThaiNationalID'
  },
  sound: 'default',
  priority: 'high',
}
```

`data` is not shown in the notification preview — used only for deep link routing on tap.

---

## 5. New Files

### Mobile

**`src/services/notifications/pushNotificationService.ts`**
- `initPushNotifications(holderDid: string): Promise<void>`
  - Request permission via `expo-notifications`
  - Get Expo push token
  - Call `registerPushToken(token, holderDid)` via walletApi
  - Register `Notifications.addNotificationResponseReceivedListener` → `routeNotificationTap()`
- Must be called after `holderDid` is established (after `loadSession()` succeeds)
- Log `[push-notifications] token-registered` — token length only, never token value

**`src/services/notifications/notificationRouter.ts`**
- `routeNotificationTap(data: NotificationData): void`
  - `credentialId` present → `router.push('/credential/' + credentialId)`
  - Unknown event → log warning, no-op

### Server (dev)

**`server/src/routes/pushTokens.ts`**
- `POST /wallet/push-token` body: `{ token: string, holderDid: string }`
- Store in in-memory `Map<holderDid, token>` (dev only)
- Returns 200

**`server/src/services/expoPushClient.ts`**
- `sendExpoPush(token: string, payload: ExpoPushPayload): Promise<void>`
- POST to `https://exp.host/--/api/v2/push/send`
- Log Expo receipt errors (`ticket.status === 'error'`), no retry in v1

---

## 6. Modified Files

| File | Change |
|---|---|
| `app/_layout.tsx` | Call `initPushNotifications(holderDid)` inside `prepareWallet()` after `loadSession()` succeeds |
| `src/sdk/walletApi.ts` | Add `registerPushToken(token, holderDid)` → `POST /wallet/push-token` |
| `server/src/testApp.ts` | Mount `pushTokens` router |
| `server/src/routes/devWallet.ts` | Call `sendExpoPush()` in webhook handlers for each of the 5 events |

---

## 7. Dependency

`expo-notifications` — **already installed**.

No Firebase SDK needed — Expo Push Service handles FCM/APNs routing.

---

## 8. Security & Privacy

- Push token stored server-side linked to `holderDid` only — no credential claims
- Notification body contains `credentialType` (document name) only — no VC JWT, no claims, no PII
- `credentialId` in `data` field is not visible in notification preview
- `initPushNotifications()` called after wallet key ready — never before DID is established

---

## 9. Error Handling

| Failure | Behavior |
|---|---|
| User denies OS permission | Log `[push-notifications] permission-denied`, skip silently — pull-based UI still works |
| Token fetch fails | Log error, skip registration — next startup retries |
| Backend registration fails | Log error, no retry — UI fallback intact |
| Expo push API error | Server logs ticket error, continues — credential state still visible on next app open |

---

## 10. Verification

1. First launch: OS permission dialog appears (iOS + Android 13+)
2. Server log: `POST /wallet/push-token 200` on startup
3. Trigger renewal-ready via dev server webhook → device receives push with correct Thai title/body
4. Tap notification → app navigates to `/credential/[id]`
5. `yarn test` — all existing tests pass
6. `yarn tsc --noEmit` — no type errors
