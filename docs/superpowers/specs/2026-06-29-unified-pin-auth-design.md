# Unified PIN Authentication Design

**Date:** 2026-06-29  
**Status:** Draft — pending user review  
**Scope:** Replace email+password auth with email+PIN; unify account PIN and local wallet PIN; single email-first auth entry screen.

---

## Summary

Replace the current dual-layer auth (server password + local wallet PIN) with a **single 6-digit PIN** used for:

1. Server login (`bcrypt` in `users.password_hash`)
2. Local app lock (`walletPin.ts` MMKV hash, written after every successful login)

Remove separate `/login` and `/register` routes. New users and returning users both start at **`/auth`**: enter email → **Continue** → server reports whether the email exists → branch to registration or login. Registration auto-logs in and lands on wallet tabs. Forgot PIN uses email OTP reset.

---

## Decisions Log

| Topic | Decision |
|-------|----------|
| PIN scope | One PIN for server auth and local app lock |
| Post-register | Auto-login → `setWalletPin` → `/(tabs)` |
| Forgot PIN | Email OTP (6-digit, 10 min TTL) → set new PIN |
| PIN entry UI | `PinKeypad` on auth, pin-lock, forgot-pin |
| Profanity (name) | Client + server blocklist |
| Auth entry | Single `/auth` wizard; no Register/Login buttons |
| Email branch | **Continue** after email → `POST /auth/email-status` |
| API field | Explicit `pin` in OpenAPI (not `password`) |
| DB column | Keep `password_hash` internally (stores `bcrypt(pin)`) |

---

## User Flows

### 1. App entry (unauthenticated)

```
App start → /auth
```

No `/login` or `/register` links. Startup routing (`readStartupRoute`) sends unauthenticated users to `/auth` only.

### 2. Unified auth wizard (`/auth`)

```
Step 1 — Email
  User enters email → taps "Continue"
  → POST /wallet-api/auth/email-status { email }
  → branch:

  [Email new]
    Step 2 — Display name (English, profanity-checked)
    Step 3 — Set PIN (PinKeypad, 6 digits)
    Step 4 — Confirm PIN
    → POST /register { type, name, email, pin }
    → POST /login { type, email, pin }
    → setWalletPin(pin) [native only]
    → router.replace('/(tabs)')

  [Email exists]
    Step 2 — "Welcome back" + Enter PIN (PinKeypad)
    → POST /login { type, email, pin }
    → setWalletPin(pin) [native only]
    → router.replace('/(tabs)')
```

**Back navigation:** From name/PIN steps, back returns to email step and clears branch state.

### 3. App lock (unchanged semantics, same PIN)

```
Authenticated + has local PIN → resume → /pin-lock
  → verifyWalletPin(pin) → /(tabs)
```

Local verification uses MMKV hash only (offline). PIN value must match account PIN; refreshed on every server login.

### 4. Forgot PIN

```
/pin-lock → "Forgot PIN?" → /forgot-pin
  Step 1 — Email
  Step 2 — Request OTP → POST /auth/pin-reset/request
  Step 3 — Enter OTP (6 digits) + new PIN + confirm PIN
    → POST /auth/pin-reset/confirm { email, otp, pin }
  → logout (revoke session)
  → /auth (user logs in with new PIN)
```

### 5. Edge cases

| Case | Behavior |
|------|----------|
| Authenticated, no local PIN (new device / cleared storage) | After login, `setWalletPin` runs; skip `/pin-setup` on happy path |
| Corrupted / missing local PIN while session valid | Rare: redirect to `/pin-setup` or force re-login via `/auth` |
| Web platform | Skip `setWalletPin`; no pin-lock (existing `Platform.OS !== 'web'` pattern) |
| Existing password users (dev) | Reset DB or re-register; no migration in v1 |

---

## Validation Rules

### Display name

- Length: 2–50 characters after trim
- Charset: `^[a-zA-Z][a-zA-Z\s''-]{0,48}[a-zA-Z]$` (single word allowed: `^[a-zA-Z]{2,50}$`)
- Collapse internal whitespace to single space
- Profanity: blocklist check on client (instant feedback) and server (on register)
- Blocklist: committed JSON at `shared/profanity-blocklist.json` (English)

### Email

- Reuse existing `normalizeEmail` + `isValidEmailFormat` on server
- Client: basic format check before Continue

### PIN (account + wallet)

- Format: exactly 6 digits (`^\d{6}$`)
- Reject weak PINs: all same digit (`000000`–`999999`), `123456`, `654321`, `012345`, `543210`
- Server: `bcrypt(pin, 12)` → `users.password_hash`
- Local: existing `setWalletPin` (salted SHA-256 in MMKV)

### OTP (PIN reset)

- 6-digit numeric, cryptographically random
- TTL: 10 minutes
- Single-use; stored as SHA-256 hash only
- Max 3 failed confirm attempts per issued OTP

---

## API

### Changed schemas (`walletApi.json`)

**Register** — `password` replaced with `pin`:

```json
{ "type": "email", "name": "John Smith", "email": "user@example.com", "pin": "482910" }
```

**Login:**

```json
{ "type": "email", "email": "user@example.com", "pin": "482910" }
```

Server validates `pin` with `^\d{6}$` and weak-PIN rules before bcrypt.

### New endpoints (local dev server)

#### `POST /wallet-api/auth/email-status`

Request:

```json
{ "email": "user@example.com" }
```

Response `200`:

```json
{ "exists": true }
```

- Rate limit: 10 requests per IP per minute; 5 per email per minute
- Always `200` with boolean (email enumeration accepted for v1; rate-limited)

#### `POST /wallet-api/auth/pin-reset/request`

Request:

```json
{ "email": "user@example.com" }
```

Response: `204` regardless of whether email exists (no enumeration on reset path).

- If user exists: generate OTP, store hash, send email
- Dev: log `[pin-reset] OTP for user@example.com: 123456` to server console

#### `POST /wallet-api/auth/pin-reset/confirm`

Request:

```json
{ "email": "user@example.com", "otp": "123456", "pin": "482910" }
```

Response: `204` on success; `400` invalid/expired OTP; `429` too many attempts.

- Updates `users.password_hash`, marks OTP used, revokes all user sessions

### Login rate limiting

- 5 failed login attempts per email per 15 minutes → `429`
- Constant-time bcrypt compare via existing dummy hash pattern

---

## Database

### Existing

`users.password_hash` — semantic change only (stores bcrypt of PIN).

### New migration `002_pin_reset_otps.sql`

```sql
CREATE TABLE IF NOT EXISTS pin_reset_otps (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  otp_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  attempt_count TINYINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pin_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pin_reset_user_active (user_id, used_at, expires_at)
) ENGINE=InnoDB;
```

---

## Mobile Architecture

### Routes

| Route | Action |
|-------|--------|
| `/auth` | **New** — unified email-first wizard |
| `/forgot-pin` | **New** — OTP reset flow |
| `/login` | **Remove** — redirect to `/auth` or delete |
| `/register` | **Remove** — redirect to `/auth` or delete |
| `/pin-setup` | Keep for edge cases; remove from happy path |
| `/pin-lock` | Update Forgot PIN → `/forgot-pin` |

### New / updated modules

| Path | Purpose |
|------|---------|
| `src/services/auth/displayName.ts` | Name + profanity validation |
| `src/services/auth/authService.ts` | `login(email,pin)`, `register(...)`, `checkEmailStatus`, `requestPinReset`, `confirmPinReset`; call `setWalletPin` after login |
| `src/components/auth/AuthWizard.tsx` | Email → branch → name/PIN steps |
| `src/components/auth/PinEntryStep.tsx` | Dots + `PinKeypad` + error (shared) |
| `shared/profanity-blocklist.json` | English blocklist |

### Auth store (`authStore.ts`)

```typescript
checkEmailStatus(email: string): Promise<{ exists: boolean }>
login(email: string, pin: string): Promise<void>   // + setWalletPin inside service
register(name: string, email: string, pin: string): Promise<void>  // register + login
requestPinReset(email: string): Promise<void>
confirmPinReset(email: string, otp: string, pin: string): Promise<void>
```

### Startup routing (`walletPinNavigation.ts`)

- Unauthenticated → `/auth` (not `/login`)
- Remove references to `/register`

### SDK

- Update `walletApi.json` (`pin` field, new endpoints)
- Run `yarn sdk:generate`
- Update `authService.test.ts`, `server/src/routes/auth.test.ts`

---

## Server Architecture

| Path | Purpose |
|------|---------|
| `server/src/routes/auth.ts` | `pin` validation; `email-status`; pin-reset routes |
| `server/src/validation/displayName.ts` | Name + profanity (imports shared blocklist) |
| `server/src/validation/pin.ts` | Format + weak-PIN rules |
| `server/src/mail.ts` | `sendPinResetOtp(email, otp)` — console in dev |
| `server/src/migrations/002_pin_reset_otps.sql` | OTP table |

---

## Security

| Risk | Mitigation |
|------|------------|
| 6-digit PIN brute force | Login rate limit; bcrypt cost 12 |
| Email enumeration (`email-status`) | Rate limits; acceptable for v1 |
| OTP brute force | 3 confirm attempts; 10 min TTL; single-use |
| Profanity bypass | Server-side check on register |
| Offline PIN mismatch | User must login online to refresh local hash |
| Session after PIN reset | Revoke all sessions on confirm |

---

## Out of Scope (v1)

- Production SMTP (dev console only)
- Password-user migration
- Rename `password_hash` column to `pin_hash`
- Biometric enrollment changes
- Company production API deployment (local server + OpenAPI spec first)

---

## Testing

### Server

- `email-status`: exists / not exists / invalid email / rate limit
- Register with `pin`; reject weak PIN and profane name
- Login with `pin`; rate limit failures
- PIN reset: request, confirm, expired OTP, wrong OTP, session revocation
- Duplicate email on register still returns `409` (fallback if client skips status check)

### Mobile

- Auth wizard: new user full path → tabs
- Auth wizard: existing email → PIN only → tabs
- `setWalletPin` called after login on native
- `pin-lock` verifies same PIN
- Forgot PIN end-to-end (mock OTP in test)
- Profanity blocked on client and server
- Startup routes to `/auth` when logged out

---

## Flow Diagram

```mermaid
flowchart TD
  START[App open unauthenticated] --> AUTH[/auth]
  AUTH --> EMAIL[Enter email]
  EMAIL --> CONTINUE[Tap Continue]
  CONTINUE --> STATUS[POST email-status]
  STATUS -->|exists: false| NAME[Enter name]
  NAME --> SETPIN[Set PIN]
  SETPIN --> CONFIRM[Confirm PIN]
  CONFIRM --> REG[POST register]
  REG --> LOGIN1[POST login]
  LOGIN1 --> LOCAL1[setWalletPin]
  LOCAL1 --> TABS[/(tabs)]
  STATUS -->|exists: true| WELCOME[Welcome back]
  WELCOME --> LOGINPIN[Enter PIN]
  LOGINPIN --> LOGIN2[POST login]
  LOGIN2 --> LOCAL2[setWalletPin]
  LOCAL2 --> TABS
  TABS --> LOCK[App resume]
  LOCK --> PINLOCK[pin-lock]
  PINLOCK --> TABS
  PINLOCK -->|Forgot PIN| FORGOT[/forgot-pin]
  FORGOT --> OTP[Email OTP + new PIN]
  OTP --> AUTH
```
