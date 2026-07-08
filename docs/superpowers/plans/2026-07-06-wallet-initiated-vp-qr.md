# Wallet-Initiated VP QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship holder-initiated VP-by-reference: wallet builds SD-JWT-KB VP, uploads to dev relay, displays one-time QR; verifier browser scans and relay runs full §2.1 verification before showing claims.

**Architecture:** Server slice (`vpSessionStore` + `sdJwtVerifier` + `/dev` routes) is independent of mobile slice (`walletInitiatedPresentation` + `VpQrModal` + credential detail button). Wallet uses relay base URL derived from `EXPO_PUBLIC_WALLET_API_BASE_URL` (strip `/wallet-api`). VP build reuses `signSdJwtKbPresentationToken` only — no `confirmPresentationBiometric()` (one-prompt rule).

**Tech Stack:** Express (server/), Jest + supertest, Node `crypto` Ed25519 verify, `@noble/ed25519` (server test fixtures), React Native Expo SDK 54, `react-native-qrcode-svg`, NativeWind, encrypted MMKV history.

**Spec:** `docs/superpowers/specs/2026-06-29-vp-qr-wallet-initiated-design.md`

## Global Constraints

- Relay is **dev-only**; mount at app root `/dev/*` (not under `/wallet-api/`).
- `GET /dev/vp-verify` must implement full §2.1 checklist (issuer JWS, KB-JWT vs `cnf`, nonce, aud, sd_hash with trailing `~`, iat ±60 s skew).
- Issuer key: pinned via `VP_ISSUER_PUBLIC_KEY_JWK` — no runtime DID/JWKS resolution in v1.
- Session TTL: `VP_SESSION_TTL_MS` server env (default `300000`); wallet countdown from `expiresAt` only.
- PUT: single write; `409` if `vpToken` already set or session consumed.
- One biometric per user action: `signSdJwtKbPresentationToken` only — **never** call `confirmPresentationBiometric()` in this flow.
- Gating: `isCredentialPresentable(record)` wrapping `filterPresentableCredentials([record])`; credential must be SD-JWT (`rawVc` contains `~`).
- v1 discloses full `rawVc` (all claims already in stored SD-JWT).
- Server logs: never log `vpToken`, `nonce`, claim values, or full JWT payloads (§10.1).
- History: `presentation-success` with `channel: 'wallet'`, `partyName: 'VP Relay (dev)'` on successful PUT.
- NativeWind for UI; no new `StyleSheet` unless required for QR sizing.
- Run `yarn tsc --noEmit`, `yarn lint`, focused tests after each task; update `docs/TASKS.md` when slice completes.

---

## File map

| File | Responsibility |
|------|----------------|
| `server/src/config.ts` | Add `vpSessionTtlMs`, `vpRelayBaseUrl`, `vpIssuerPublicKeyJwk` |
| `server/.env.example` | Document `VP_SESSION_TTL_MS`, `VP_RELAY_BASE_URL`, `VP_ISSUER_PUBLIC_KEY_JWK` |
| `server/src/services/vpSessionStore.ts` | **Create** — in-memory `VpSession` Map, TTL cleanup, PUT hardening |
| `server/src/services/vpSessionStore.test.ts` | **Create** — store unit tests |
| `server/src/services/sdJwtVerifier.ts` | **Create** — §2.1 verification + parsed claims for HTML |
| `server/src/services/sdJwtVerifier.test.ts` | **Create** — verifier unit tests with Ed25519 fixtures |
| `server/src/services/vpSessionHtml.ts` | **Create** — HTML templates (success, error, pending, consumed) |
| `server/src/routes/vpSession.ts` | **Create** — POST / PUT / GET handlers |
| `server/src/routes/vpSession.test.ts` | **Create** — supertest route tests |
| `server/src/testApp.ts` | **Modify** — `app.use('/dev', vpSessionRouter)` before JSON parser |
| `src/services/vp/vpRelayBaseUrl.ts` | **Create** — resolve relay origin from wallet API URL |
| `src/services/vp/vpRelayBaseUrl.test.ts` | **Create** — URL derivation tests |
| `src/services/credentials/credentialLifecycle.ts` | **Modify** — add `isCredentialPresentable(record)` |
| `src/services/credentials/credentialLifecycle.test.ts` | **Modify** — presentable wrapper tests |
| `src/services/vp/walletInitiatedPresentation.ts` | **Create** — session API, VP build, history hook |
| `src/services/vp/walletInitiatedPresentation.test.ts` | **Create** — service unit tests (mocked fetch/crypto) |
| `src/services/history/recordWalletPresentationSuccess.ts` | **Create** — bridge to history (event log or legacy) |
| `src/components/VpQrModal.tsx` | **Create** — QR modal + countdown from `expiresAt` |
| `app/(tabs)/credential/[id].tsx` | **Modify** — "แสดง QR" button + modal wiring |

---

### Task 1: Server config for VP relay

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/.env.example`
- Test: `server/src/config.test.ts`

**Interfaces:**
- Produces: `readConfig()` returns `{ vpSessionTtlMs: number; vpRelayBaseUrl: string; vpIssuerPublicKeyJwk: JsonWebKey }`

- [ ] **Step 1: Write failing config test**

```typescript
// server/src/config.test.ts — add inside describe block
test('reads VP relay config from env', () => {
  process.env.NODE_ENV = 'test'
  process.env.VP_SESSION_TTL_MS = '120000'
  process.env.VP_RELAY_BASE_URL = 'http://192.168.1.10:4000'
  process.env.VP_ISSUER_PUBLIC_KEY_JWK = JSON.stringify({
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
  })
  const config = readConfig()
  expect(config.vpSessionTtlMs).toBe(120_000)
  expect(config.vpRelayBaseUrl).toBe('http://192.168.1.10:4000')
  expect(config.vpIssuerPublicKeyJwk.crv).toBe('Ed25519')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd server && yarn test src/config.test.ts --runInBand`
Expected: FAIL — `vpSessionTtlMs` undefined

- [ ] **Step 3: Extend `ServerConfig` and `readConfig()`**

```typescript
// server/src/config.ts — extend ServerConfig type
export type ServerConfig = {
  // ...existing fields...
  vpSessionTtlMs: number
  vpRelayBaseUrl: string
  vpIssuerPublicKeyJwk: JsonWebKey
}

// inside readConfig() return object:
vpSessionTtlMs: readIntegerInRange('VP_SESSION_TTL_MS', '300000', 30_000, 3_600_000),
vpRelayBaseUrl: normalizeBaseUrl(readString('VP_RELAY_BASE_URL', 'http://localhost:4000')),
vpIssuerPublicKeyJwk: readIssuerPublicKeyJwk(),

// add helpers at bottom of file:
function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function readIssuerPublicKeyJwk(): JsonWebKey {
  const raw = readOptionalString('VP_ISSUER_PUBLIC_KEY_JWK')
  const path = readOptionalString('VP_ISSUER_PUBLIC_KEY_PATH')
  const json = raw ?? (path ? require('node:fs').readFileSync(path, 'utf8') : undefined)
  if (!json) throw new Error('ConfigMissing: VP_ISSUER_PUBLIC_KEY_JWK or VP_ISSUER_PUBLIC_KEY_PATH')
  const parsed = JSON.parse(json) as JsonWebKey
  if (parsed.kty !== 'OKP' || parsed.crv !== 'Ed25519' || typeof parsed.x !== 'string') {
    throw new Error('ConfigInvalid: VP_ISSUER_PUBLIC_KEY_JWK')
  }
  return parsed
}
```

- [ ] **Step 4: Document env vars in `server/.env.example`**

```bash
# VP relay (wallet-initiated QR, dev only). Session TTL in ms; default 300000 (5 min).
VP_SESSION_TTL_MS=300000
# Public origin verifiers scan — must match KB-JWT aud the wallet uses.
VP_RELAY_BASE_URL=http://localhost:4000
# Pinned dev issuer Ed25519 public JWK (matches credentials from dev issuer).
VP_ISSUER_PUBLIC_KEY_JWK={"kty":"OKP","crv":"Ed25519","x":"<issuer-x>"}
```

- [ ] **Step 5: Run test — expect PASS**

Run: `cd server && yarn test src/config.test.ts --runInBand && yarn tsc`

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/src/config.test.ts server/.env.example
git commit -m "feat(server): add VP relay session config"
```

---

### Task 2: In-memory VP session store

**Files:**
- Create: `server/src/services/vpSessionStore.ts`
- Create: `server/src/services/vpSessionStore.test.ts`

**Interfaces:**
- Produces:
  - `type VpSession = { sessionId: string; nonce: string; expiresAt: string; vpToken: string | null; consumed: boolean; credentialType: string }`
  - `createVpSession(ttlMs: number): VpSession`
  - `getVpSession(sessionId: string): VpSession | undefined`
  - `setVpToken(sessionId: string, vpToken: string, credentialType: string): 'ok' | 'not-found' | 'expired' | 'already-set' | 'consumed'`
  - `consumeVpSession(sessionId: string): VpSession | undefined`
  - `resetVpSessionStore(): void` (tests only)

- [ ] **Step 1: Write failing store tests**

```typescript
// server/src/services/vpSessionStore.test.ts
import { createVpSession, getVpSession, setVpToken, consumeVpSession, resetVpSessionStore } from './vpSessionStore'

beforeEach(() => resetVpSessionStore())

test('createVpSession returns uuid session with 64-char hex nonce', () => {
  const session = createVpSession(60_000)
  expect(session.vpToken).toBeNull()
  expect(session.consumed).toBe(false)
  expect(session.nonce).toMatch(/^[0-9a-f]{64}$/)
  expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now())
})

test('setVpToken rejects second upload with already-set', () => {
  const session = createVpSession(60_000)
  expect(setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')).toBe('ok')
  expect(setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('already-set')
})

test('setVpToken rejects after consumed', () => {
  const session = createVpSession(60_000)
  setVpToken(session.sessionId, 'vp~kb', 'ThaiNationalID')
  consumeVpSession(session.sessionId)
  expect(setVpToken(session.sessionId, 'vp2~kb', 'ThaiNationalID')).toBe('consumed')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd server && yarn test src/services/vpSessionStore.test.ts --runInBand`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `vpSessionStore.ts`**

```typescript
import { randomBytes, randomUUID } from 'node:crypto'

export type VpSession = {
  sessionId: string
  nonce: string
  expiresAt: string
  vpToken: string | null
  consumed: boolean
  credentialType: string
}

const sessions = new Map<string, VpSession>()

export function createVpSession(ttlMs: number): VpSession {
  const session: VpSession = {
    sessionId: randomUUID(),
    nonce: randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    vpToken: null,
    consumed: false,
    credentialType: '',
  }
  sessions.set(session.sessionId, session)
  return session
}

export function getVpSession(sessionId: string): VpSession | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  if (Date.parse(session.expiresAt) <= Date.now()) return { ...session }
  return session
}

function isExpired(session: VpSession): boolean {
  return Date.parse(session.expiresAt) <= Date.now()
}

export function setVpToken(
  sessionId: string,
  vpToken: string,
  credentialType: string,
): 'ok' | 'not-found' | 'expired' | 'already-set' | 'consumed' {
  const session = sessions.get(sessionId)
  if (!session) return 'not-found'
  if (isExpired(session)) return 'expired'
  if (session.consumed) return 'consumed'
  if (session.vpToken !== null) return 'already-set'
  session.vpToken = vpToken
  session.credentialType = credentialType
  return 'ok'
}

export function consumeVpSession(sessionId: string): VpSession | undefined {
  const session = sessions.get(sessionId)
  if (!session || isExpired(session) || session.consumed) return undefined
  session.consumed = true
  return session
}

export function resetVpSessionStore(): void {
  sessions.clear()
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd server && yarn test src/services/vpSessionStore.test.ts --runInBand`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/vpSessionStore.ts server/src/services/vpSessionStore.test.ts
git commit -m "feat(server): add in-memory VP session store"
```

---

### Task 3: SD-JWT-KB verifier (§2.1)

**Files:**
- Create: `server/src/services/sdJwtVerifier.ts`
- Create: `server/src/services/sdJwtVerifier.test.ts`
- Modify: `server/package.json` (add `@noble/ed25519` devDependency for test fixtures)

**Interfaces:**
- Consumes: `vpIssuerPublicKeyJwk`, `vpRelayBaseUrl`, `vpSessionTtlMs` from config; `session.nonce`
- Produces:
  - `type SdJwtVerificationResult = { ok: true; credentialType: string; issuerName: string; claims: Array<{ label: string; value: string }> } | { ok: false; reason: string }`
  - `verifySdJwtKbPresentation(vpToken: string, context: { nonce: string; relayBaseUrl: string; maxAgeMs: number; issuerPublicKeyJwk: JsonWebKey }): SdJwtVerificationResult`

- [ ] **Step 1: Add test crypto dependency**

Run: `cd server && yarn add -D @noble/ed25519`

- [ ] **Step 2: Write failing verifier tests**

```typescript
// server/src/services/sdJwtVerifier.test.ts
import * as ed from '@noble/ed25519'
import { createHash } from 'node:crypto'
import { verifySdJwtKbPresentation, splitSdJwtKbPresentation } from './sdJwtVerifier'

const issuerSeed = ed.utils.randomSecretKey()
const issuerPublicJwk = { kty: 'OKP', crv: 'Ed25519', x: base64Url(ed.getPublicKey(issuerSeed)) }
const holderSeed = ed.utils.randomSecretKey()
const holderPublicJwk = { kty: 'OKP', crv: 'Ed25519', x: base64Url(ed.getPublicKey(holderSeed)) }

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function signEdDSA(header: Record<string, unknown>, payload: Record<string, unknown>, seed: Uint8Array): string {
  const h = base64Url(Buffer.from(JSON.stringify(header)))
  const p = base64Url(Buffer.from(JSON.stringify(payload)))
  const sig = ed.sign(`${h}.${p}`, seed)
  return `${h}.${p}.${base64Url(sig)}`
}

function buildFixtureVp(input: { nonce: string; aud: string }): string {
  const issuerJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'vc+sd-jwt' },
    { iss: 'https://issuer.dev', cnf: { jwk: holderPublicJwk }, givenName: 'Ada' },
    issuerSeed,
  )
  const sdJwtWithoutKb = `${issuerJwt}~`
  const sdHash = base64Url(createHash('sha256').update(sdJwtWithoutKb).digest())
  const kbJwt = signEdDSA(
    { alg: 'EdDSA', typ: 'kb+jwt' },
    { nonce: input.nonce, aud: input.aud, iat: Math.floor(Date.now() / 1000), sd_hash: sdHash },
    holderSeed,
  )
  return `${sdJwtWithoutKb}${kbJwt}`
}

test('verifySdJwtKbPresentation accepts valid token', () => {
  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  const result = verifySdJwtKbPresentation(vp, {
    nonce: 'abc',
    relayBaseUrl: 'http://localhost:4000',
    maxAgeMs: 300_000,
    issuerPublicKeyJwk: issuerPublicJwk,
  })
  expect(result.ok).toBe(true)
})

test('rejects wrong nonce', () => {
  const vp = buildFixtureVp({ nonce: 'abc', aud: 'http://localhost:4000' })
  const result = verifySdJwtKbPresentation(vp, {
    nonce: 'wrong',
    relayBaseUrl: 'http://localhost:4000',
    maxAgeMs: 300_000,
    issuerPublicKeyJwk: issuerPublicJwk,
  })
  expect(result).toEqual({ ok: false, reason: 'kb-nonce-mismatch' })
})

test('rejects sd-jwt without kb segment', () => {
  const issuerJwt = signEdDSA({ alg: 'EdDSA', typ: 'vc+sd-jwt' }, { iss: 'x', cnf: { jwk: holderPublicJwk } }, issuerSeed)
  const result = verifySdJwtKbPresentation(`${issuerJwt}~`, {
    nonce: 'abc',
    relayBaseUrl: 'http://localhost:4000',
    maxAgeMs: 300_000,
    issuerPublicKeyJwk: issuerPublicJwk,
  })
  expect(result.ok).toBe(false)
})
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `cd server && yarn test src/services/sdJwtVerifier.test.ts --runInBand`

- [ ] **Step 4: Implement `sdJwtVerifier.ts`**

Key implementation points (write full file):

```typescript
// server/src/services/sdJwtVerifier.ts
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'

export function splitSdJwtKbPresentation(vpToken: string): { sdJwtWithoutKb: string; kbJwt: string } | undefined {
  const tildeIndex = vpToken.lastIndexOf('~')
  if (tildeIndex < 0) return undefined
  const afterTilde = vpToken.slice(tildeIndex + 1)
  if (!afterTilde.includes('.')) return undefined
  return { sdJwtWithoutKb: vpToken.slice(0, tildeIndex + 1), kbJwt: afterTilde }
}

function decodeJwtPart<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T
}

function verifyEdDSA(jwt: string, publicJwk: JsonWebKey): boolean {
  const [headerB64, payloadB64, sigB64] = jwt.split('.')
  if (!headerB64 || !payloadB64 || !sigB64) return false
  const key = createPublicKey({ key: publicJwk, format: 'jwk' })
  return cryptoVerify(null, Buffer.from(`${headerB64}.${payloadB64}`), key, Buffer.from(sigB64, 'base64url'))
}

export function verifySdJwtKbPresentation(vpToken: string, context: {
  nonce: string
  relayBaseUrl: string
  maxAgeMs: number
  issuerPublicKeyJwk: JsonWebKey
}): SdJwtVerificationResult {
  const parts = splitSdJwtKbPresentation(vpToken)
  if (!parts) return { ok: false, reason: 'kb-missing' }

  const issuerJwt = parts.sdJwtWithoutKb.split('~')[0] ?? ''
  if (!verifyEdDSA(issuerJwt, context.issuerPublicKeyJwk)) return { ok: false, reason: 'issuer-signature-invalid' }

  const issuerPayload = decodeJwtPart<Record<string, unknown>>(issuerJwt.split('.')[1] ?? '')
  const cnf = issuerPayload.cnf as { jwk?: JsonWebKey } | undefined
  const holderJwk = cnf?.jwk
  if (!holderJwk) return { ok: false, reason: 'cnf-missing' }
  if (!verifyEdDSA(parts.kbJwt, holderJwk)) return { ok: false, reason: 'kb-signature-invalid' }

  const kbPayload = decodeJwtPart<Record<string, unknown>>(parts.kbJwt.split('.')[1] ?? '')
  if (kbPayload.nonce !== context.nonce) return { ok: false, reason: 'kb-nonce-mismatch' }
  if (kbPayload.aud !== context.relayBaseUrl) return { ok: false, reason: 'kb-aud-mismatch' }

  const expectedSdHash = createHash('sha256').update(parts.sdJwtWithoutKb).digest('base64url')
  if (kbPayload.sd_hash !== expectedSdHash) return { ok: false, reason: 'sd-hash-mismatch' }

  const iat = typeof kbPayload.iat === 'number' ? kbPayload.iat : NaN
  const nowSec = Math.floor(Date.now() / 1000)
  const maxAgeSec = Math.floor(context.maxAgeMs / 1000) + 60
  if (!Number.isFinite(iat) || iat > nowSec + 60 || nowSec - iat > maxAgeSec) {
    return { ok: false, reason: 'kb-iat-stale' }
  }

  return {
    ok: true,
    credentialType: String(issuerPayload.vct ?? 'Credential'),
    issuerName: String(issuerPayload.iss ?? 'Unknown'),
    claims: extractDisclosedClaims(parts.sdJwtWithoutKb, issuerPayload),
  }
}
```

Implement `extractDisclosedClaims` to decode `~`-separated disclosure strings (SD-JWT spec) into label/value rows for HTML; fall back to issuer payload scalar keys when no disclosures present.

- [ ] **Step 5: Run tests — expect PASS**

Run: `cd server && yarn test src/services/sdJwtVerifier.test.ts --runInBand`

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/yarn.lock server/src/services/sdJwtVerifier.ts server/src/services/sdJwtVerifier.test.ts
git commit -m "feat(server): verify SD-JWT-KB presentations at VP relay"
```

---

### Task 4: VP session HTTP routes + HTML

**Files:**
- Create: `server/src/services/vpSessionHtml.ts`
- Create: `server/src/routes/vpSession.ts`
- Create: `server/src/routes/vpSession.test.ts`

**Interfaces:**
- Consumes: store + verifier from Tasks 2–3; `readConfig()`
- Produces: Express router mounted at `/dev`

- [ ] **Step 1: Write failing route tests**

```typescript
// server/src/routes/vpSession.test.ts
import request from 'supertest'
import { createTestApp } from '../testApp'
import { resetVpSessionStore } from '../services/vpSessionStore'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
  process.env.VP_ISSUER_PUBLIC_KEY_JWK = JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k' })
  resetVpSessionStore()
})

test('POST /dev/vp-session returns session', async () => {
  const app = createTestApp()
  const res = await request(app).post('/dev/vp-session').send()
  expect(res.status).toBe(201)
  expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(res.body.nonce).toHaveLength(64)
  expect(res.body.expiresAt).toBeTruthy()
})

test('PUT rejects duplicate upload with 409', async () => {
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const id = created.body.sessionId
  await request(app).put(`/dev/vp-session/${id}`).send({ vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })
  const dup = await request(app).put(`/dev/vp-session/${id}`).send({ vpToken: 'vp2~kb', credentialType: 'ThaiNationalID' })
  expect(dup.status).toBe(409)
})

test('GET /dev/vp-verify returns 202 when vp not uploaded', async () => {
  const app = createTestApp()
  const created = await request(app).post('/dev/vp-session').send()
  const res = await request(app).get(`/dev/vp-verify?s=${created.body.sessionId}`)
  expect(res.status).toBe(202)
  expect(res.headers['retry-after']).toBe('2')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd server && yarn test src/routes/vpSession.test.ts --runInBand`

- [ ] **Step 3: Implement HTML helper and router**

```typescript
// server/src/routes/vpSession.ts
import { Router } from 'express'
import { readConfig } from '../config'
import { createVpSession, getVpSession, setVpToken, consumeVpSession } from '../services/vpSessionStore'
import { verifySdJwtKbPresentation } from '../services/sdJwtVerifier'
import { renderVpErrorHtml, renderVpPendingHtml, renderVpSuccessHtml, renderVpConsumedHtml } from '../services/vpSessionHtml'

export const vpSessionRouter = Router()

vpSessionRouter.post('/vp-session', (_req, res) => {
  const config = readConfig()
  const session = createVpSession(config.vpSessionTtlMs)
  res.status(201).json({ sessionId: session.sessionId, nonce: session.nonce, expiresAt: session.expiresAt })
})

vpSessionRouter.put('/vp-session/:sessionId', (req, res) => {
  const vpToken = typeof req.body?.vpToken === 'string' ? req.body.vpToken : ''
  const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType : ''
  if (!vpToken || !credentialType) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }
  const outcome = setVpToken(req.params.sessionId, vpToken, credentialType)
  if (outcome === 'not-found') { res.status(404).json({ message: 'Not Found' }); return }
  if (outcome === 'expired') { res.status(410).json({ message: 'Gone' }); return }
  if (outcome === 'already-set' || outcome === 'consumed') { res.status(409).json({ message: 'Conflict' }); return }
  res.status(200).json({ ok: true })
})

vpSessionRouter.get('/vp-verify', (req, res) => {
  const sessionId = typeof req.query.s === 'string' ? req.query.s : ''
  const session = getVpSession(sessionId)
  if (!session) { res.status(404).send(renderVpErrorHtml('ไม่พบ QR')); return }
  if (Date.parse(session.expiresAt) <= Date.now()) { res.status(410).send(renderVpErrorHtml('QR หมดอายุ')); return }
  if (session.consumed) { res.status(409).send(renderVpConsumedHtml()); return }
  if (!session.vpToken) {
    res.status(202).set('Retry-After', '2').send(renderVpPendingHtml())
    return
  }
  const config = readConfig()
  const verified = verifySdJwtKbPresentation(session.vpToken, {
    nonce: session.nonce,
    relayBaseUrl: config.vpRelayBaseUrl,
    maxAgeMs: config.vpSessionTtlMs,
    issuerPublicKeyJwk: config.vpIssuerPublicKeyJwk,
  })
  if (!verified.ok) {
    console.info('[vp-relay] verify-failed', { reason: verified.reason, credentialType: session.credentialType, vpBytes: session.vpToken.length })
    res.status(200).send(renderVpErrorHtml('ไม่ผ่านการตรวจสอบ', verified.reason))
    return
  }
  consumeVpSession(sessionId)
  res.status(200).send(renderVpSuccessHtml({ ...verified, credentialType: session.credentialType, presentedAt: new Date().toISOString() }))
})
```

Implement `vpSessionHtml.ts` with minimal inline CSS, Thai copy per spec §12, claim table on success. **Never** `console.log` vpToken or claim values.

- [ ] **Step 4: Mount router in `testApp.ts`**

```typescript
// server/src/testApp.ts — add import and mount BEFORE express.json()
import { vpSessionRouter } from './routes/vpSession'

// inside createTestApp(), after createCorsMiddleware():
app.use('/dev', vpSessionRouter)
```

- [ ] **Step 5: Run route tests — expect PASS**

Run: `cd server && yarn test src/routes/vpSession.test.ts --runInBand`

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/vpSession.ts server/src/routes/vpSession.test.ts server/src/services/vpSessionHtml.ts server/src/testApp.ts
git commit -m "feat(server): add wallet-initiated VP relay routes"
```

---

### Task 5: Mobile relay base URL helper

**Files:**
- Create: `src/services/vp/vpRelayBaseUrl.ts`
- Create: `src/services/vp/vpRelayBaseUrl.test.ts`

**Interfaces:**
- Produces: `resolveVpRelayBaseUrl(): string`

- [ ] **Step 1: Write failing test**

```typescript
import { resolveVpRelayBaseUrl } from './vpRelayBaseUrl'

test('strips /wallet-api suffix from configured wallet API URL', () => {
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://192.168.1.10:4000/wallet-api'
  delete process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL
  expect(resolveVpRelayBaseUrl()).toBe('http://192.168.1.10:4000')
})

test('prefers EXPO_PUBLIC_VP_RELAY_BASE_URL override', () => {
  process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL = 'http://10.0.0.5:4000'
  expect(resolveVpRelayBaseUrl()).toBe('http://10.0.0.5:4000')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/vp/vpRelayBaseUrl.test.ts`

- [ ] **Step 3: Implement**

```typescript
import { normalizeWalletApiBaseUrl, getConfiguredWalletApiBaseUrl } from '../../sdk/installWalletApiFetch'

export function resolveVpRelayBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  const walletApi = normalizeWalletApiBaseUrl(getConfiguredWalletApiBaseUrl())
  return walletApi.replace(/\/wallet-api$/, '')
}
```

- [ ] **Step 4: Document optional override in `.env.example`**

```bash
# Optional override for VP relay aud + QR URL (defaults to wallet API origin without /wallet-api)
# EXPO_PUBLIC_VP_RELAY_BASE_URL=http://192.168.1.10:4000
```

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/services/vp/vpRelayBaseUrl.ts src/services/vp/vpRelayBaseUrl.test.ts .env.example
git commit -m "feat(vp): resolve dev VP relay base URL"
```

---

### Task 6: Credential presentable helper + SD-JWT gate

**Files:**
- Modify: `src/services/credentials/credentialLifecycle.ts`
- Modify: `src/services/credentials/credentialLifecycle.test.ts`

**Interfaces:**
- Produces: `isCredentialPresentable(record: VerifiableCredentialRecord): boolean`
- Produces: `isSdJwtCredential(record: VerifiableCredentialRecord): boolean` (in `walletInitiatedPresentation.ts` or lifecycle)

- [ ] **Step 1: Write failing test**

```typescript
test('isCredentialPresentable returns true for active credential', () => {
  const record = makeCredential({ id: 'c1' })
  expect(isCredentialPresentable(record)).toBe(true)
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/credentials/credentialLifecycle.test.ts -t isCredentialPresentable`

- [ ] **Step 3: Add wrapper**

```typescript
export function isCredentialPresentable(record: VerifiableCredentialRecord): boolean {
  return filterPresentableCredentials([record]).length > 0
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/services/credentials/credentialLifecycle.ts src/services/credentials/credentialLifecycle.test.ts
git commit -m "feat(credentials): add isCredentialPresentable helper"
```

---

### Task 7: Wallet-initiated presentation service

**Files:**
- Create: `src/services/vp/walletInitiatedPresentation.ts`
- Create: `src/services/vp/walletInitiatedPresentation.test.ts`

**Interfaces:**
- Consumes: `resolveVpRelayBaseUrl()`, `signSdJwtKbPresentationToken`, `getCardSchema`
- Produces:
  - `type VpSessionResponse = { sessionId: string; nonce: string; expiresAt: string }`
  - `createVpSession(): Promise<VpSessionResponse>`
  - `buildWalletInitiatedVpToken(record: VerifiableCredentialRecord, session: { nonce: string }): Promise<string>`
  - `submitVpToSession(sessionId: string, vpToken: string, credentialType: string): Promise<void>`
  - `buildQrUrl(sessionId: string): string`
  - `readWalletInitiatedClaimLabels(record: VerifiableCredentialRecord): string[]`
  - `isSdJwtCredential(record: VerifiableCredentialRecord): boolean`

- [ ] **Step 1: Write failing service tests (mocked fetch + crypto)**

```typescript
jest.mock('../crypto/crypto', () => ({
  signSdJwtKbPresentationToken: jest.fn(async () => 'issuer.jwt~kb.jwt'),
}))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

test('createVpSession posts to relay', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({ sessionId: 's1', nonce: 'n'.repeat(64), expiresAt: '2026-07-06T10:05:00.000Z' }),
  })
  const session = await createVpSession()
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/dev/vp-session'), expect.objectContaining({ method: 'POST' }))
  expect(session.sessionId).toBe('s1')
})

test('buildQrUrl encodes session id', () => {
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://localhost:4000/wallet-api'
  expect(buildQrUrl('abc')).toBe('http://localhost:4000/dev/vp-verify?s=abc')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/vp/walletInitiatedPresentation.test.ts`

- [ ] **Step 3: Implement service**

```typescript
import { getCardSchema } from '../../config/cardSchemas'
import { signSdJwtKbPresentationToken } from '../crypto/crypto'
import { resolveVpRelayBaseUrl } from './vpRelayBaseUrl'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export function isSdJwtCredential(record: VerifiableCredentialRecord): boolean {
  return record.rawVc.includes('~')
}

export async function createVpSession(): Promise<VpSessionResponse> {
  const baseUrl = resolveVpRelayBaseUrl()
  const response = await fetch(`${baseUrl}/dev/vp-session`, { method: 'POST' })
  if (!response.ok) throw new Error(`VpSessionCreateFailed:${response.status}`)
  return response.json() as Promise<VpSessionResponse>
}

export async function buildWalletInitiatedVpToken(
  record: VerifiableCredentialRecord,
  session: { nonce: string },
): Promise<string> {
  return signSdJwtKbPresentationToken({
    audience: resolveVpRelayBaseUrl(),
    nonce: session.nonce,
    sdJwt: record.rawVc,
  })
}

export async function submitVpToSession(sessionId: string, vpToken: string, credentialType: string): Promise<void> {
  const baseUrl = resolveVpRelayBaseUrl()
  const response = await fetch(`${baseUrl}/dev/vp-session/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vpToken, credentialType }),
  })
  if (response.status === 409) throw new Error('VpSessionUploadConflict')
  if (!response.ok) throw new Error(`VpSessionUploadFailed:${response.status}`)
  logWalletStep('vp-relay', 'upload-complete', { sessionPrefix: sessionId.slice(0, 8), vpBytes: vpToken.length })
}

export function buildQrUrl(sessionId: string): string {
  return `${resolveVpRelayBaseUrl()}/dev/vp-verify?s=${encodeURIComponent(sessionId)}`
}

export function readWalletInitiatedClaimLabels(record: VerifiableCredentialRecord): string[] {
  const schema = getCardSchema(record.type)
  return schema.displayFields
    .filter((field) => record.claims[field.key] !== undefined && record.claims[field.key] !== '')
    .map((field) => field.presentationLabel ?? field.label)
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/walletInitiatedPresentation.ts src/services/vp/walletInitiatedPresentation.test.ts
git commit -m "feat(vp): add wallet-initiated presentation service"
```

---

### Task 8: History recording bridge

**Files:**
- Create: `src/services/history/recordWalletPresentationSuccess.ts`
- Create: `src/services/history/recordWalletPresentationSuccess.test.ts`

**Interfaces:**
- Produces: `recordWalletPresentationSuccess(input: { credentialId: string; documentType: string; partyName: string; disclosedClaims: string[]; channel: 'oid4vp' | 'wallet' }): void`

- [ ] **Step 1: Write failing test**

```typescript
test('records relay presentation via legacy history when walletEventLog absent', () => {
  recordWalletPresentationSuccess({
    credentialId: 'c1',
    documentType: 'Thai National ID',
    partyName: 'VP Relay (dev)',
    disclosedClaims: ['ชื่อ-นามสกุล'],
    channel: 'wallet',
  })
  const events = readSuccessfulPresentationHistory()
  expect(events[0]?.verifierName).toBe('VP Relay (dev)')
})
```

- [ ] **Step 2: Implement bridge**

```typescript
import { recordSuccessfulPresentation } from './presentationHistory'

// When walletEventLog.ts lands (history-log plan), switch to appendWalletHistoryEvent with channel.
export function recordWalletPresentationSuccess(input: {
  credentialId: string
  documentType: string
  partyName: string
  disclosedClaims: string[]
  channel: 'oid4vp' | 'wallet'
}): void {
  try {
    recordSuccessfulPresentation({
      credentialId: input.credentialId,
      documentType: input.documentType,
      verifierName: input.partyName,
      disclosedClaims: input.disclosedClaims,
    })
  } catch {
    // best-effort — never block VP flow
  }
}
```

- [ ] **Step 3: Wire into `walletInitiatedPresentation.ts` after successful PUT**

Call `recordWalletPresentationSuccess` with `partyName: 'VP Relay (dev)'`, `channel: 'wallet'`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/services/history/recordWalletPresentationSuccess.ts src/services/history/recordWalletPresentationSuccess.test.ts src/services/vp/walletInitiatedPresentation.ts
git commit -m "feat(history): record wallet-initiated VP relay presentations"
```

---

### Task 9: Install QR dependency

- [ ] **Step 1: Install package**

Run: `npx expo install react-native-qrcode-svg`

- [ ] **Step 2: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: add react-native-qrcode-svg for VP QR modal"
```

---

### Task 10: VpQrModal component

**Files:**
- Create: `src/components/VpQrModal.tsx`

**Interfaces:**
- Consumes: `buildQrUrl`, `createVpSession`, `buildWalletInitiatedVpToken`, `submitVpToSession`, `readWalletInitiatedClaimLabels`, `recordWalletPresentationSuccess`
- Props: `{ visible: boolean; credential: VerifiableCredentialRecord; onClose: () => void }`

- [ ] **Step 1: Implement modal (no separate snapshot test — covered by service tests + manual QA)**

```tsx
// src/components/VpQrModal.tsx — structure
import QRCode from 'react-native-qrcode-svg'
import { Modal, Pressable, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { AppButton } from './AppButton'
import {
  buildQrUrl,
  buildWalletInitiatedVpToken,
  createVpSession,
  submitVpToSession,
} from '../services/vp/walletInitiatedPresentation'
import { recordWalletPresentationSuccess } from '../services/history/recordWalletPresentationSuccess'
import { getCardSchema } from '../config/cardSchemas'
import { readWalletInitiatedClaimLabels } from '../services/vp/walletInitiatedPresentation'
import { logWalletError } from '../services/debug/walletLogger'

type Props = { visible: boolean; credential: VerifiableCredentialRecord; onClose: () => void }

export function VpQrModal({ visible, credential, onClose }: Props) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'expired' | 'error'>('loading')

  const startSession = async () => {
    setPhase('loading')
    try {
      const session = await createVpSession()
      const vpToken = await buildWalletInitiatedVpToken(credential, session)
      await submitVpToSession(session.sessionId, vpToken, credential.type)
      const schema = getCardSchema(credential.type)
      recordWalletPresentationSuccess({
        credentialId: credential.id,
        documentType: schema.title,
        partyName: 'VP Relay (dev)',
        disclosedClaims: readWalletInitiatedClaimLabels(credential),
        channel: 'wallet',
      })
      setQrUrl(buildQrUrl(session.sessionId))
      setExpiresAt(session.expiresAt)
      setPhase('ready')
    } catch (error) {
      logWalletError('vp-relay', 'session-start-failed', error)
      setPhase('error')
    }
  }

  useEffect(() => {
    if (!visible) return
    void startSession()
  }, [visible, credential.id])

  useEffect(() => {
    if (!expiresAt || phase !== 'ready') return
    const tick = () => {
      const ms = Date.parse(expiresAt) - Date.now()
      if (ms <= 0) { setRemainingMs(0); setPhase('expired'); return }
      setRemainingMs(ms)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt, phase])

  const mm = String(Math.floor(remainingMs / 60000)).padStart(1, '0')
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* NativeWind layout: QR centered, countdown หมดอายุใน {mm}:{ss}, ให้ Verifier สแกน QR นี้, ใช้ได้ครั้งเดียวเท่านั้น */}
      {/* phase === 'expired' → สร้างใหม่ calls startSession; phase === 'error' → ไม่สามารถสร้าง QR ได้ */}
      <AppButton label="ยกเลิก" onPress={onClose} />
    </Modal>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `yarn tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/VpQrModal.tsx
git commit -m "feat(ui): add VP QR modal with expiresAt countdown"
```

---

### Task 11: Credential detail screen integration

**Files:**
- Modify: `app/(tabs)/credential/[id].tsx`

- [ ] **Step 1: Add imports and state**

```typescript
import { VpQrModal } from '../../../src/components/VpQrModal'
import { isCredentialPresentable } from '../../../src/services/credentials/credentialLifecycle'
import { isSdJwtCredential } from '../../../src/services/vp/walletInitiatedPresentation'

const [vpQrVisible, setVpQrVisible] = useState(false)
const showVpQrButton = credential && isSdJwtCredential(credential) && isCredentialPresentable(credential)
```

- [ ] **Step 2: Render button + modal in detail phase**

```tsx
{showVpQrButton ? (
  <AppButton
    variant="outline-block"
    label="แสดง QR สำหรับ Verifier"
    onPress={() => setVpQrVisible(true)}
  />
) : null}
<VpQrModal
  visible={vpQrVisible}
  credential={credential!}
  onClose={() => setVpQrVisible(false)}
/>
```

Place button near existing proximity presentation entry; only render modal when `credential` is defined.

- [ ] **Step 3: Run typecheck + lint**

Run: `yarn tsc --noEmit && yarn lint`

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/credential/[id].tsx
git commit -m "feat(credential-detail): add wallet-initiated VP QR entry point"
```

---

### Task 12: End-to-end verification + docs

- [ ] **Step 1: Run full test suites**

```bash
cd server && yarn test --runInBand && yarn tsc
cd .. && yarn test --runInBand && yarn tsc --noEmit && yarn lint
```

- [ ] **Step 2: Manual golden path (physical device or emulator + LAN)**

1. Set `VP_ISSUER_PUBLIC_KEY_JWK` to match dev issuer that signed stored credentials.
2. Set `EXPO_PUBLIC_WALLET_API_BASE_URL=http://<host>:4000/wallet-api`.
3. Tap "แสดง QR สำหรับ Verifier" → biometric → QR appears with countdown.
4. Scan QR in phone browser → ✓ verified page with claims.
5. Scan again → 409 consumed page.
6. Confirm History shows presentation row with `VP Relay (dev)`.

- [ ] **Step 3: Update `docs/TASKS.md`** with completed slice + manual validation note.

- [ ] **Step 4: Commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record wallet-initiated VP QR implementation"
```

---

## Self-review (spec coverage)

| Spec section | Task |
|--------------|------|
| §2.1 verification checklist | Task 3 |
| §2.2 pinned issuer key | Task 1 |
| §3 session model + TTL env | Tasks 1–2 |
| §4 POST/PUT/GET + hardening | Task 4 |
| §5 VP build + gating + consent | Tasks 6–7, 11 |
| §8 UI flow + countdown from expiresAt | Task 10 |
| §9 react-native-qrcode-svg | Task 9 |
| §10 security + §10.1 logging | Tasks 3–4 |
| §11 history on PUT | Task 8 |
| §12 error handling | Tasks 4, 10 |
| §13 verification steps | Task 12 |
| Production roadmap note | Documented in spec only (no code) |

**History-log cross-plan note:** When `walletEventLog.ts` from `docs/superpowers/plans/2026-07-06-history-log.md` lands, update `recordWalletPresentationSuccess` to call `appendWalletHistoryEvent` with `channel: 'wallet'` instead of legacy `recordSuccessfulPresentation`.
