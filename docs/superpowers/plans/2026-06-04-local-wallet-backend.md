# Local Wallet Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Wallet Backend API that lets the Expo wallet use real sign-up, sign-in, wallet lookup, logout, and credential import against local XAMPP MySQL database `etda_wallet`.

**Architecture:** Add a separate TypeScript Express service under `server/` that owns MySQL access. The mobile app continues to call generated SDK functions; a small fetch adapter prepends `EXPO_PUBLIC_WALLET_API_BASE_URL` to generated relative `/wallet-api/*` URLs.

**Tech Stack:** Expo SDK 54, TypeScript, Express, mysql2, bcrypt, jsonwebtoken, Jest, Supertest, XAMPP MySQL.

---

## File Structure

- Create: `server/package.json` - local backend scripts and dependencies.
- Create: `server/tsconfig.json` - backend TypeScript config.
- Create: `server/.env.example` - local backend environment template.
- Create: `server/src/migrations/001_init.sql` - MySQL schema for `etda_wallet`.
- Create: `server/src/config.ts` - reads and validates backend environment.
- Create: `server/src/db.ts` - MySQL pool, table checks, transaction helper.
- Create: `server/src/auth.ts` - password hashing, JWT issue/verify, session storage helpers.
- Create: `server/src/routes/auth.ts` - register/login/logout endpoints.
- Create: `server/src/routes/wallets.ts` - wallet listing endpoint.
- Create: `server/src/routes/credentials.ts` - credential import endpoint.
- Create: `server/src/server.ts` - Express app composition and listener.
- Create: `server/src/testApp.ts` - builds app for tests without opening a port.
- Create: `server/src/routes/auth.test.ts` - backend auth route tests with fake DB seams.
- Create: `server/src/routes/credentials.test.ts` - backend credential route tests with fake DB seams.
- Create: `src/sdk/installWalletApiFetch.ts` - fetch adapter for generated SDK relative URLs.
- Create: `src/sdk/installWalletApiFetch.test.ts` - mobile fetch adapter tests.
- Modify: `app/_layout.tsx` - install the SDK fetch adapter before auth actions run.
- Modify: `.env.example` - document mobile base URL.
- Modify: `docs/API.md` - align allowed SDK endpoints with current `orval.config.ts`.
- Modify: `docs/TASKS.md` - record local backend status.

---

### Task 1: Backend Package And Schema

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/src/migrations/001_init.sql`

- [ ] **Step 1: Create backend package metadata**

Add `server/package.json`:

```json
{
  "name": "etda-wallet-local-backend",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "jest --runInBand",
    "tsc": "tsc --noEmit"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.11.5",
    "uuid": "^11.0.5"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "jest": "29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "tsx": "^4.19.2",
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 2: Create backend TypeScript config**

Add `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create backend environment template**

Add `server/.env.example`:

```env
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=etda_wallet
DB_USER=root
DB_PASSWORD=
JWT_SECRET=local-dev-change-me
JWT_EXPIRES_IN=7d
```

- [ ] **Step 4: Create MySQL migration**

Add `server/src/migrations/001_init.sql`:

```sql
CREATE DATABASE IF NOT EXISTS etda_wallet
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE etda_wallet;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credentials (
  id VARCHAR(36) PRIMARY KEY,
  wallet_id VARCHAR(36) NOT NULL,
  jwt MEDIUMTEXT NOT NULL,
  associated_did VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_credentials_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);
```

- [ ] **Step 5: Install backend dependencies**

Run:

```powershell
Set-Location server
yarn install
Set-Location ..
```

Expected: `server/yarn.lock` is created and dependencies install successfully.

- [ ] **Step 6: Commit backend scaffold**

Run:

```powershell
git add server/package.json server/tsconfig.json server/.env.example server/src/migrations/001_init.sql server/yarn.lock
git commit -m "chore: scaffold local wallet backend"
```

---

### Task 2: Backend Config, DB, And Auth Core

**Files:**
- Create: `server/src/config.ts`
- Create: `server/src/db.ts`
- Create: `server/src/auth.ts`

- [ ] **Step 1: Create config reader**

Add `server/src/config.ts`:

```ts
import dotenv from 'dotenv'

dotenv.config()

export type ServerConfig = {
  port: number
  db: {
    host: string
    port: number
    database: string
    user: string
    password: string
  }
  jwtSecret: string
  jwtExpiresIn: string
}

function readString(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`ConfigMissing: ${name}`)
  return value
}

function readNumber(name: string, fallback: string): number {
  const value = Number(readString(name, fallback))
  if (!Number.isFinite(value)) throw new Error(`ConfigInvalid: ${name}`)
  return value
}

export function readConfig(): ServerConfig {
  return {
    port: readNumber('PORT', '4000'),
    db: {
      host: readString('DB_HOST', '127.0.0.1'),
      port: readNumber('DB_PORT', '3306'),
      database: readString('DB_NAME', 'etda_wallet'),
      user: readString('DB_USER', 'root'),
      password: readString('DB_PASSWORD', ''),
    },
    jwtSecret: readString('JWT_SECRET', 'local-dev-change-me'),
    jwtExpiresIn: readString('JWT_EXPIRES_IN', '7d'),
  }
}
```

- [ ] **Step 2: Create DB module**

Add `server/src/db.ts`:

```ts
import mysql, { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

import { readConfig } from './config'

export type DbExecutor = Pool | PoolConnection

export const pool = mysql.createPool({
  ...readConfig().db,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
})

const REQUIRED_TABLES = ['users', 'wallets', 'sessions', 'credentials'] as const

export async function assertSchemaReady(db: DbExecutor = pool): Promise<void> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('users', 'wallets', 'sessions', 'credentials')`,
  )
  const found = new Set(rows.map((row) => String(row.TABLE_NAME ?? row.table_name)))
  const missing = REQUIRED_TABLES.filter((table) => !found.has(table))
  if (missing.length > 0) {
    throw new Error(`DatabaseSchemaMissing: run server/src/migrations/001_init.sql (${missing.join(', ')})`)
  }
}

export async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await operation(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
```

- [ ] **Step 3: Create auth core**

Add `server/src/auth.ts`:

```ts
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import type { RowDataPacket } from 'mysql2'
import { v4 as uuid } from 'uuid'

import { readConfig } from './config'
import { pool, type DbExecutor } from './db'

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string
    token: string
    tokenHash: string
  }
}

type JwtPayload = {
  sub: string
  sid: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function issueToken(userId: string, sessionId: string): string {
  const config = readConfig()
  return jwt.sign({ sid: sessionId }, config.jwtSecret, {
    subject: userId,
    expiresIn: config.jwtExpiresIn,
  })
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, readConfig().jwtSecret)
  if (typeof decoded !== 'object' || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
    throw new Error('AuthTokenInvalid')
  }
  return { sub: decoded.sub, sid: decoded.sid }
}

export async function storeSession(db: DbExecutor, userId: string, token: string, expiresAt: Date): Promise<void> {
  await db.execute(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [uuid(), userId, hashToken(token), expiresAt],
  )
}

export async function revokeSession(token: string, db: DbExecutor = pool): Promise<void> {
  await db.execute(
    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(token)],
  )
}

export function readBearerToken(req: Request): string | undefined {
  const authorization = req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authorization.slice('Bearer '.length)
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req)
  if (!token) {
    res.sendStatus(401)
    return
  }

  try {
    const payload = verifyToken(token)
    const tokenHash = hashToken(token)
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM sessions
        WHERE user_id = ?
          AND token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        LIMIT 1`,
      [payload.sub, tokenHash],
    )
    if (rows.length === 0) {
      res.sendStatus(401)
      return
    }
    req.auth = { userId: payload.sub, token, tokenHash }
    next()
  } catch {
    res.sendStatus(401)
  }
}

export function sessionExpiryFromNow(days = 7): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}
```

- [ ] **Step 4: Run backend typecheck**

Run:

```powershell
Set-Location server
yarn tsc
Set-Location ..
```

Expected: TypeScript passes.

- [ ] **Step 5: Commit backend core**

Run:

```powershell
git add server/src/config.ts server/src/db.ts server/src/auth.ts
git commit -m "feat: add local backend auth core"
```

---

### Task 3: Backend API Routes

**Files:**
- Create: `server/src/routes/auth.ts`
- Create: `server/src/routes/wallets.ts`
- Create: `server/src/routes/credentials.ts`
- Create: `server/src/testApp.ts`
- Create: `server/src/server.ts`

- [ ] **Step 1: Create auth routes**

Add `server/src/routes/auth.ts`:

```ts
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { v4 as uuid } from 'uuid'

import { hashPassword, issueToken, readBearerToken, revokeSession, sessionExpiryFromNow, storeSession, verifyPassword } from '../auth'
import { pool, withTransaction } from '../db'

type UserRow = RowDataPacket & {
  id: string
  password_hash: string
}

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const { type, name, email, password } = req.body ?? {}
  if (type !== 'email' || typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    res.sendStatus(400)
    return
  }

  try {
    await withTransaction(async (connection) => {
      const userId = uuid()
      const walletId = uuid()
      await connection.execute<ResultSetHeader>(
        `INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
        [userId, name.trim(), email.trim().toLowerCase(), await hashPassword(password)],
      )
      await connection.execute<ResultSetHeader>(
        `INSERT INTO wallets (id, user_id, name) VALUES (?, ?, ?)`,
        [walletId, userId, 'Default Wallet'],
      )
    })
    res.sendStatus(201)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
      res.sendStatus(409)
      return
    }
    res.sendStatus(500)
  }
})

authRouter.post('/login', async (req, res) => {
  const { type, email, password } = req.body ?? {}
  if (type !== 'email' || typeof email !== 'string' || typeof password !== 'string') {
    res.sendStatus(400)
    return
  }

  const [rows] = await pool.execute<UserRow[]>(
    `SELECT id, password_hash FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()],
  )
  const user = rows[0]
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.sendStatus(400)
    return
  }

  const sessionId = uuid()
  const token = issueToken(user.id, sessionId)
  await storeSession(pool, user.id, token, sessionExpiryFromNow())
  res.status(200).json({ id: user.id, token })
})

authRouter.post('/logout', async (req, res) => {
  const token = readBearerToken(req)
  if (token) {
    await revokeSession(token)
  }
  res.sendStatus(200)
})
```

- [ ] **Step 2: Create wallet routes**

Add `server/src/routes/wallets.ts`:

```ts
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'

import { requireAuth, type AuthenticatedRequest } from '../auth'
import { pool } from '../db'

type WalletRow = RowDataPacket & {
  id: string
  name: string
  created_at: Date
}

export const walletsRouter = Router()

walletsRouter.get('/accounts/wallets', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.userId
  if (!userId) {
    res.sendStatus(401)
    return
  }

  const [rows] = await pool.execute<WalletRow[]>(
    `SELECT id, name, created_at FROM wallets WHERE user_id = ? ORDER BY created_at ASC`,
    [userId],
  )

  res.status(200).json({
    account: userId,
    wallets: rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdOn: row.created_at.toISOString(),
      addedOn: row.created_at.toISOString(),
      permission: 'ADMINISTRATE',
    })),
  })
})
```

- [ ] **Step 3: Create credential routes**

Add `server/src/routes/credentials.ts`:

```ts
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { v4 as uuid } from 'uuid'

import { requireAuth, type AuthenticatedRequest } from '../auth'
import { pool } from '../db'

type WalletOwnerRow = RowDataPacket & {
  id: string
}

export const credentialsRouter = Router()

credentialsRouter.post('/:wallet/credentials/import', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.userId
  const walletId = req.params.wallet
  const { jwt, associated_did } = req.body ?? {}

  if (!userId) {
    res.sendStatus(401)
    return
  }
  if (typeof jwt !== 'string' || typeof associated_did !== 'string') {
    res.sendStatus(400)
    return
  }

  const [walletRows] = await pool.execute<WalletOwnerRow[]>(
    `SELECT id FROM wallets WHERE id = ? AND user_id = ? LIMIT 1`,
    [walletId, userId],
  )
  if (walletRows.length === 0) {
    res.sendStatus(403)
    return
  }

  const credentialId = uuid()
  await pool.execute<ResultSetHeader>(
    `INSERT INTO credentials (id, wallet_id, jwt, associated_did) VALUES (?, ?, ?, ?)`,
    [credentialId, walletId, jwt, associated_did],
  )

  res.status(201).json({
    id: credentialId,
    wallet: walletId,
    document: jwt,
    format: 'jwt_vc_json',
    pending: false,
    addedOn: new Date().toISOString(),
  })
})
```

- [ ] **Step 4: Create test app builder**

Add `server/src/testApp.ts`:

```ts
import cors from 'cors'
import express from 'express'

import { authRouter } from './routes/auth'
import { credentialsRouter } from './routes/credentials'
import { walletsRouter } from './routes/wallets'

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use('/wallet-api/auth', authRouter)
  app.use('/wallet-api/wallet', walletsRouter)
  app.use('/wallet-api/wallet', credentialsRouter)
  return app
}
```

- [ ] **Step 5: Create server listener**

Add `server/src/server.ts`:

```ts
import { readConfig } from './config'
import { assertSchemaReady } from './db'
import { createApp } from './testApp'

async function main(): Promise<void> {
  const config = readConfig()
  await assertSchemaReady()

  const app = createApp()
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Wallet backend listening on http://0.0.0.0:${config.port}`)
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 6: Run backend typecheck**

Run:

```powershell
Set-Location server
yarn tsc
Set-Location ..
```

Expected: TypeScript passes.

- [ ] **Step 7: Commit backend routes**

Run:

```powershell
git add server/src/routes/auth.ts server/src/routes/wallets.ts server/src/routes/credentials.ts server/src/testApp.ts server/src/server.ts
git commit -m "feat: add local wallet backend routes"
```

---

### Task 4: Backend Route Tests

**Files:**
- Create: `server/jest.config.cjs`
- Create: `server/src/routes/auth.test.ts`
- Create: `server/src/routes/credentials.test.ts`

- [ ] **Step 1: Create backend Jest config**

Add `server/jest.config.cjs`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  clearMocks: true,
}
```

- [ ] **Step 2: Add auth route test with mocked DB**

Add `server/src/routes/auth.test.ts`:

```ts
import request from 'supertest'

jest.mock('../db', () => {
  const execute = jest.fn()
  return {
    pool: { execute },
    withTransaction: jest.fn(async (operation: (connection: { execute: typeof execute }) => Promise<unknown>) =>
      operation({ execute }),
    ),
  }
})

jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth')
  return {
    ...actual,
    hashPassword: jest.fn(async () => 'hashed-password'),
    verifyPassword: jest.fn(async (password: string) => password === 'correct-password'),
    issueToken: jest.fn(() => 'session.jwt'),
    storeSession: jest.fn(async () => undefined),
    sessionExpiryFromNow: jest.fn(() => new Date('2026-06-04T00:00:00.000Z')),
  }
})

import { pool } from '../db'
import { createApp } from '../testApp'

const execute = pool.execute as jest.Mock

describe('auth routes', () => {
  beforeEach(() => {
    execute.mockReset()
  })

  it('registers a user and default wallet', async () => {
    const response = await request(createApp())
      .post('/wallet-api/auth/register')
      .send({ type: 'email', name: 'Ada', email: 'ADA@example.com', password: 'secret' })

    expect(response.status).toBe(201)
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['Ada', 'ada@example.com', 'hashed-password']),
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO wallets'),
      expect.arrayContaining(['Default Wallet']),
    )
  })

  it('returns 409 for duplicate email', async () => {
    execute.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })

    const response = await request(createApp())
      .post('/wallet-api/auth/register')
      .send({ type: 'email', name: 'Ada', email: 'ada@example.com', password: 'secret' })

    expect(response.status).toBe(409)
  })

  it('logs in with valid credentials', async () => {
    execute.mockResolvedValueOnce([[{ id: 'user-1', password_hash: 'hash' }]])

    const response = await request(createApp())
      .post('/wallet-api/auth/login')
      .send({ type: 'email', email: 'ada@example.com', password: 'correct-password' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'user-1', token: 'session.jwt' })
  })

  it('rejects invalid password', async () => {
    execute.mockResolvedValueOnce([[{ id: 'user-1', password_hash: 'hash' }]])

    const response = await request(createApp())
      .post('/wallet-api/auth/login')
      .send({ type: 'email', email: 'ada@example.com', password: 'wrong-password' })

    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 3: Add credential route test with mocked auth**

Add `server/src/routes/credentials.test.ts`:

```ts
import request from 'supertest'

jest.mock('../auth', () => ({
  requireAuth: (req: { auth?: { userId: string } }, _res: unknown, next: () => void) => {
    req.auth = { userId: 'user-1' }
    next()
  },
}))

jest.mock('../db', () => ({
  pool: {
    execute: jest.fn(),
  },
}))

import { pool } from '../db'
import { createApp } from '../testApp'

const execute = pool.execute as jest.Mock

describe('credential routes', () => {
  beforeEach(() => {
    execute.mockReset()
  })

  it('imports a credential into an owned wallet', async () => {
    execute
      .mockResolvedValueOnce([[{ id: 'wallet-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])

    const response = await request(createApp())
      .post('/wallet-api/wallet/wallet-1/credentials/import')
      .send({ jwt: 'signed.vc.jwt', associated_did: 'did:key:zHolder' })

    expect(response.status).toBe(201)
    expect(response.body.wallet).toBe('wallet-1')
    expect(response.body.document).toBe('signed.vc.jwt')
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO credentials'),
      expect.arrayContaining(['wallet-1', 'signed.vc.jwt', 'did:key:zHolder']),
    )
  })

  it('rejects a credential import for another user wallet', async () => {
    execute.mockResolvedValueOnce([[]])

    const response = await request(createApp())
      .post('/wallet-api/wallet/wallet-2/credentials/import')
      .send({ jwt: 'signed.vc.jwt', associated_did: 'did:key:zHolder' })

    expect(response.status).toBe(403)
  })
})
```

- [ ] **Step 4: Run backend tests**

Run:

```powershell
Set-Location server
yarn test
yarn tsc
Set-Location ..
```

Expected: tests and TypeScript pass.

- [ ] **Step 5: Commit backend tests**

Run:

```powershell
git add server/jest.config.cjs server/src/routes/auth.test.ts server/src/routes/credentials.test.ts
git commit -m "test: cover local backend routes"
```

---

### Task 5: Mobile SDK Base URL Adapter

**Files:**
- Create: `src/sdk/installWalletApiFetch.ts`
- Create: `src/sdk/installWalletApiFetch.test.ts`
- Modify: `app/_layout.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Add fetch adapter**

Add `src/sdk/installWalletApiFetch.ts`:

```ts
const WALLET_API_PREFIX = '/wallet-api/'

let installed = false

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/${path.replace(/^\/+/g, '')}`
}

export function resolveWalletApiUrl(input: RequestInfo | URL, baseUrl = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL): RequestInfo | URL {
  if (typeof input !== 'string') return input
  if (!input.startsWith(WALLET_API_PREFIX)) return input
  if (!baseUrl) return input
  return joinBaseUrl(baseUrl, input)
}

export function installWalletApiFetch(baseUrl = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL): void {
  if (installed || !baseUrl) return
  const originalFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    return originalFetch(resolveWalletApiUrl(input, baseUrl), init)
  }) as typeof fetch

  installed = true
}

export function resetWalletApiFetchForTest(): void {
  installed = false
}
```

- [ ] **Step 2: Add fetch adapter tests**

Add `src/sdk/installWalletApiFetch.test.ts`:

```ts
import { installWalletApiFetch, resetWalletApiFetchForTest, resolveWalletApiUrl } from './installWalletApiFetch'

describe('wallet API fetch adapter', () => {
  afterEach(() => {
    resetWalletApiFetchForTest()
    jest.restoreAllMocks()
  })

  it('prepends the configured base URL to wallet API paths', () => {
    expect(resolveWalletApiUrl('/wallet-api/auth/login', 'http://192.168.1.10:4000')).toBe(
      'http://192.168.1.10:4000/wallet-api/auth/login',
    )
  })

  it('leaves issuer URLs unchanged', () => {
    expect(resolveWalletApiUrl('https://issuer.example.com/.well-known/openid-credential-issuer', 'http://local:4000')).toBe(
      'https://issuer.example.com/.well-known/openid-credential-issuer',
    )
  })

  it('wraps global fetch once', async () => {
    const originalFetch = jest.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = originalFetch as unknown as typeof fetch

    installWalletApiFetch('http://127.0.0.1:4000')
    installWalletApiFetch('http://127.0.0.1:4000')
    await fetch('/wallet-api/auth/login', { method: 'POST' })

    expect(originalFetch).toHaveBeenCalledTimes(1)
    expect(originalFetch).toHaveBeenCalledWith('http://127.0.0.1:4000/wallet-api/auth/login', { method: 'POST' })
  })
})
```

- [ ] **Step 3: Install adapter in app layout**

Modify `app/_layout.tsx` near existing imports:

```ts
import { installWalletApiFetch } from '@/src/sdk/installWalletApiFetch';
```

Then add after imports and before `SplashScreen.preventAutoHideAsync()`:

```ts
installWalletApiFetch();
```

- [ ] **Step 4: Document mobile environment**

Replace `.env.example` contents with:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://192.168.1.10:4000
```

Use the real Windows LAN IP in local `.env`; do not commit `.env`.

- [ ] **Step 5: Run mobile tests and checks**

Run:

```powershell
yarn.cmd test src/sdk/installWalletApiFetch.test.ts
yarn.cmd tsc --noEmit
yarn.cmd lint
```

Expected: test, TypeScript, and lint pass.

- [ ] **Step 6: Commit mobile adapter**

Run:

```powershell
git add src/sdk/installWalletApiFetch.ts src/sdk/installWalletApiFetch.test.ts app/_layout.tsx .env.example
git commit -m "feat: configure wallet API base URL"
```

---

### Task 6: Auth Service Header Fixes

**Files:**
- Modify: `src/services/auth/authService.ts`
- Create: `src/services/auth/authService.test.ts`

- [ ] **Step 1: Update logout to send Bearer token**

Modify `src/services/auth/authService.ts` so `logout()` reads the stored session and sends the token:

```ts
export async function logout(): Promise<void> {
  try {
    const session = await loadSession()
    await logoutUser(
      session?.token
        ? {
            headers: {
              Authorization: `Bearer ${session.token}`,
            },
          }
        : undefined,
    )
  } catch {
    // best-effort server logout
  }
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE })
}
```

- [ ] **Step 2: Add auth service tests**

Add `src/services/auth/authService.test.ts`:

```ts
import * as Keychain from 'react-native-keychain'

import { login, logout, register } from './authService'
import { getWallets, loginUser, logoutUser, registerUser } from '../../sdk/walletApi'

jest.mock('../../sdk/walletApi', () => ({
  loginUser: jest.fn(),
  registerUser: jest.fn(),
  logoutUser: jest.fn(),
  getWallets: jest.fn(),
}))

const mockedLoginUser = loginUser as jest.Mock
const mockedRegisterUser = registerUser as jest.Mock
const mockedLogoutUser = logoutUser as jest.Mock
const mockedGetWallets = getWallets as jest.Mock

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('stores token, account id, and first wallet id after login', async () => {
    mockedLoginUser.mockResolvedValueOnce({ status: 200, data: { id: 'account-1', token: 'session-token' } })
    mockedGetWallets.mockResolvedValueOnce({
      status: 200,
      data: { account: 'account-1', wallets: [{ id: 'wallet-1' }] },
    })

    const session = await login('ada@example.com', 'secret')

    expect(session).toEqual({ token: 'session-token', accountId: 'account-1', walletId: 'wallet-1' })
    expect(Keychain.setGenericPassword).toHaveBeenCalled()
  })

  it('treats 201 register response as success', async () => {
    mockedRegisterUser.mockResolvedValueOnce({ status: 201, data: undefined })

    await expect(register('ada@example.com', 'secret', 'Ada')).resolves.toBeUndefined()
  })

  it('clears local session even when server logout fails', async () => {
    ;(Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
      username: 'session',
      password: JSON.stringify({ token: 'session-token', walletId: 'wallet-1', accountId: 'account-1' }),
    })
    mockedLogoutUser.mockRejectedValueOnce(new Error('network down'))

    await logout()

    expect(mockedLogoutUser).toHaveBeenCalledWith({
      headers: { Authorization: 'Bearer session-token' },
    })
    expect(Keychain.resetGenericPassword).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run auth service tests**

Run:

```powershell
yarn.cmd test src/services/auth/authService.test.ts
yarn.cmd tsc --noEmit
yarn.cmd lint
```

Expected: test, TypeScript, and lint pass.

- [ ] **Step 4: Commit auth service fixes**

Run:

```powershell
git add src/services/auth/authService.ts src/services/auth/authService.test.ts
git commit -m "fix: send auth token on logout"
```

---

### Task 7: Documentation And Local Runbook

**Files:**
- Modify: `docs/API.md`
- Modify: `docs/TASKS.md`
- Create: `server/README.md`

- [ ] **Step 1: Add backend runbook**

Add `server/README.md`:

```md
# Local Wallet Backend

Development backend for the Expo wallet. It stores Wallet Account data in local XAMPP MySQL database `etda_wallet`.

## Setup

1. Start XAMPP MySQL.
2. Create the database and tables:

```powershell
mysql -u root < server/src/migrations/001_init.sql
```

3. Create `server/.env` from `server/.env.example`.
4. Start the backend:

```powershell
Set-Location server
yarn dev
```

The API listens on `0.0.0.0:4000`.

## Mobile App

Set the app base URL in root `.env`:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000
```

Do not use this local backend for Issuer data. Issuer databases remain separate.
```

- [ ] **Step 2: Update API docs allowed endpoints**

Modify `docs/API.md` so `Allowed SDK Endpoints` includes:

```md
| `POST` | `/wallet-api/auth/register` | Create a Wallet Account for a Holder. |
| `POST` | `/wallet-api/auth/login` | Authenticate a Wallet Account and return a bearer session token. |
| `POST` | `/wallet-api/auth/logout` | Revoke a bearer session token when available. |
| `GET` | `/wallet-api/wallet/accounts/wallets` | List wallets owned by the authenticated Wallet Account. |
| `POST` | `/wallet-api/wallet/{walletId}/keys/generate` | Generate a server-side key record linked to the wallet (not the hardware signing key). |
| `POST` | `/wallet-api/wallet/{walletId}/dids/create/key` | Create a `did:key` DID document from the registered key. |
| `POST` | `/wallet-api/wallet/{walletId}/credentials/import` | Import a finalized VC JWT into the Wallet Backend after successful on-device OID4VCI acquisition. |
```

Also update the Environment Configuration section to show:

```env
EXPO_PUBLIC_WALLET_API_BASE_URL=http://<windows-lan-ip>:4000
```

- [ ] **Step 3: Update task tracker**

Append to `docs/TASKS.md` handoff notes:

```md
- Local Wallet Backend design and implementation plan added for development auth against local XAMPP MySQL database `etda_wallet`. The mobile app remains forbidden from connecting directly to MySQL; it calls `/wallet-api/*` through the local backend.
```

- [ ] **Step 4: Run final checks**

Run:

```powershell
yarn.cmd tsc --noEmit
yarn.cmd lint
Set-Location server
yarn tsc
yarn test
Set-Location ..
```

Expected: all commands pass.

- [ ] **Step 5: Commit documentation**

Run:

```powershell
git add docs/API.md docs/TASKS.md server/README.md docs/superpowers/specs/2026-06-04-local-wallet-backend-design.md docs/superpowers/plans/2026-06-04-local-wallet-backend.md CONTEXT.md
git commit -m "docs: plan local wallet backend"
```

---

## Self-Review

Spec coverage:

- Local backend under `server/`: Tasks 1-4.
- XAMPP MySQL database `etda_wallet`: Task 1 migration and Task 7 runbook.
- Auth/register/login/logout/wallets/import endpoints: Task 3.
- Password hashing and JWT sessions: Task 2.
- Mobile base URL integration: Task 5.
- Logout and session persistence behavior: Task 6.
- Documentation updates: Task 7.

Completeness scan: Each code-writing step includes concrete file content or exact code edits.

Type consistency: Endpoint paths match `src/sdk/walletApi.ts` and `orval.config.ts`; session fields match `src/services/auth/authService.ts`; credential import response fields match the generated wallet credential shape used by the app.
