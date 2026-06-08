import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'

import {
  getDummyPasswordHash,
  hashPassword,
  issueToken,
  readBearerToken,
  revokeSession,
  sessionExpiryFromNow,
  storeSession,
  verifyPassword,
} from '../auth'
import { pool, withTransaction } from '../db'

type UserRow = RowDataPacket & {
  id: string
  password_hash: string
}

type MysqlError = Error & {
  code?: string
}

const authRouter = Router()

const ALLOWED_EMAIL_TLDS = new Set([
  'ac',
  'biz',
  'co',
  'com',
  'edu',
  'go',
  'gov',
  'info',
  'io',
  'mil',
  'net',
  'or',
  'org',
  'th',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isValidEmailFormat(email: string): boolean {
  if (email.length > 254 || email.includes('..')) {
    return false
  }

  const match = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9-]+\.)+([a-z]{2,24})$/i.exec(email)
  if (!match) {
    return false
  }

  const domain = email.slice(email.lastIndexOf('@') + 1)
  if (domain.split('.').some((label) => label.startsWith('-') || label.endsWith('-'))) {
    return false
  }

  return ALLOWED_EMAIL_TLDS.has(match[2].toLowerCase())
}

function isDuplicateEmail(error: unknown): boolean {
  return error instanceof Error && (error as MysqlError).code === 'ER_DUP_ENTRY'
}

authRouter.post('/register', async (req, res) => {
  const body: unknown = req.body
  if (
    !isRecord(body) ||
    body.type !== 'email' ||
    !isNonEmptyString(body.name) ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password)
  ) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const name = body.name.trim()
  const email = normalizeEmail(body.email)
  const password = body.password
  if (!isValidEmailFormat(email)) {
    res.status(400).json({ message: 'Invalid email format' })
    return
  }

  try {
    const passwordHash = await hashPassword(password)

    await withTransaction(async (connection) => {
      const userId = uuid()
      const walletId = uuid()

      await connection.execute<ResultSetHeader>(
        `INSERT INTO users (id, name, email, password_hash)
         VALUES (?, ?, ?, ?)`,
        [userId, name, email, passwordHash],
      )
      await connection.execute<ResultSetHeader>(
        `INSERT INTO wallets (id, user_id, name)
         VALUES (?, ?, ?)`,
        [walletId, userId, 'Default Wallet'],
      )
    })

    res.status(201).end()
  } catch (error) {
    if (isDuplicateEmail(error)) {
      res.status(409).json({ message: 'Email already exists' })
      return
    }
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

authRouter.post('/login', async (req, res) => {
  const body: unknown = req.body
  if (
    !isRecord(body) ||
    body.type !== 'email' ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password)
  ) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const email = normalizeEmail(body.email)

  try {
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT id, password_hash
         FROM users
        WHERE email = ?
        LIMIT 1`,
      [email],
    )
    const user = rows[0]
    const passwordHash = user?.password_hash ?? getDummyPasswordHash()
    const isPasswordValid = await verifyPassword(body.password, passwordHash)

    if (!user || !isPasswordValid) {
      res.status(400).json({ message: 'Invalid email or password' })
      return
    }

    const sessionId = uuid()
    const token = issueToken(user.id, sessionId)
    await storeSession(pool, sessionId, user.id, token, sessionExpiryFromNow())

    res.status(200).json({ id: user.id, token })
  } catch {
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

authRouter.post('/logout', async (req, res) => {
  const token = readBearerToken(req)
  if (token) {
    try {
      await revokeSession(token)
    } catch {
      // Logout is idempotent from the client perspective.
    }
  }
  res.status(200).json({})
})

export { authRouter }
