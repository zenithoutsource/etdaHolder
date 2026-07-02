# Plan: Rate-limit the PIN-reset OTP request endpoint

## Context

PR #9 code review (this session) found a HIGH-severity gap: `server/src/routes/auth.ts`'s
`POST /pin-reset/request` handler has zero rate limiting, unlike its siblings in the same file
(`/email-status` uses `emailStatusIpLimiter`/`emailStatusEmailLimiter`, `/login` uses
`loginFailureLimiter`). The handler does a DB lookup then calls `sendPinResetOtp` (an SMTP
send) on every request. An attacker can loop this endpoint to email-bomb any registered address
or exhaust SMTP send quota/cost — pure abuse surface, no auth required. Fix: rate-limit it the
same way `/email-status` already is, using the existing `createRateLimiter` helper.

## Design

Reuse the existing `createRateLimiter(maxAttempts, windowMs)` pattern from
`server/src/rateLimit.ts` (already used by `emailStatusIpLimiter`, `emailStatusEmailLimiter`,
`loginFailureLimiter` at the top of `server/src/routes/auth.ts`).

1. Add two new limiter instances near the existing ones (`server/src/routes/auth.ts` top-level,
   alongside `emailStatusIpLimiter`/`emailStatusEmailLimiter`):
   ```ts
   const pinResetRequestIpLimiter = createRateLimiter(10, 60_000)
   const pinResetRequestEmailLimiter = createRateLimiter(3, 60_000)
   ```
   (Same IP threshold as `email-status`; tighter per-email threshold since this triggers a real
   SMTP send, not just a DB lookup.)

2. In the `POST /pin-reset/request` handler (`server/src/routes/auth.ts:331`), after email
   validation and before the OTP is generated/sent, add the same consume-and-429 pattern already
   used in `/email-status` (lines ~188-192):
   ```ts
   const ip = readClientIp(req)
   if (pinResetRequestIpLimiter.consume(`ip:${ip}`) || pinResetRequestEmailLimiter.consume(`email:${email}`)) {
     res.status(429).json({ message: 'Too Many Requests' })
     return
   }
   ```
   Place this check after the `isValidEmailFormat` check (which already returns 204 early for
   malformed input) so malformed-email requests don't consume limiter budget, matching how
   `/email-status` orders its checks.

3. No change to the "user not found → 204" branch — rate limiting applies regardless of whether
   the email exists, so no new enumeration vector is introduced.

## Test updates

- `server/src/testApp.test.ts` — this file is where rate-limit behavior is actually tested
  end-to-end (see `test('rate limits repeated auth attempts', ...)` at line 40, which loops
  `POST /wallet-api/auth/login` 10x expecting 400 then asserts the 11th returns
  `429 { message: 'Too Many Requests' }`). Add a sibling test doing the same loop-then-assert-429
  against `POST /wallet-api/auth/pin-reset/request`.

## Verification

```bash
cd server
yarn tsc
yarn test src/testApp.test.ts
```

## Critical files

- `server/src/routes/auth.ts` (handler + new limiter instances)
- `server/src/rateLimit.ts` (reused, no change expected)
- `server/src/testApp.test.ts` (new rate-limit test, matching existing pattern at line 40)
