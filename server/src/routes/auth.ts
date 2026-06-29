import crypto from 'node:crypto'
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
import { sendPinResetOtp } from '../mail'
import { createRateLimiter } from '../rateLimit'
import { displayNameValidationMessage, normalizeDisplayName } from '../validation/displayName'
import { isValidPin, pinValidationMessage } from '../validation/pin'

type UserRow = RowDataPacket & {
  id: string
  password_hash: string
}

type UserIdRow = RowDataPacket & {
  id: string
}

type PinResetRow = RowDataPacket & {
  id: string
  user_id: string
  otp_hash: string
  expires_at: Date
  used_at: Date | null
  attempt_count: number
}

type MysqlError = Error & {
  code?: string
}

const authRouter = Router()

const emailStatusIpLimiter = createRateLimiter(10, 60_000)
const emailStatusEmailLimiter = createRateLimiter(5, 60_000)
const loginFailureLimiter = createRateLimiter(5, 15 * 60_000)

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

const OTP_TTL_MS = 10 * 60_000
const MAX_OTP_ATTEMPTS = 3

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

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex')
}

function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function readClientIp(req: { ip?: string }): string {
  return req.ip ?? 'unknown'
}

authRouter.post('/email-status', async (req, res) => {
  const body: unknown = req.body
  if (!isRecord(body) || !isNonEmptyString(body.email)) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const email = normalizeEmail(body.email)
  if (!isValidEmailFormat(email)) {
    res.status(400).json({ message: 'Invalid email format' })
    return
  }

  const ip = readClientIp(req)
  if (emailStatusIpLimiter.consume(`ip:${ip}`) || emailStatusEmailLimiter.consume(`email:${email}`)) {
    res.status(429).json({ message: 'Too Many Requests' })
    return
  }

  try {
    const [rows] = await pool.execute<UserIdRow[]>(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email],
    )
    res.status(200).json({ exists: rows.length > 0 })
  } catch {
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

authRouter.post('/register', async (req, res) => {
  const body: unknown = req.body
  if (
    !isRecord(body) ||
    body.type !== 'email' ||
    !isNonEmptyString(body.name) ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.pin)
  ) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const name = normalizeDisplayName(body.name)
  const email = normalizeEmail(body.email)
  const pin = body.pin

  const nameError = displayNameValidationMessage(name)
  if (nameError) {
    res.status(400).json({ message: nameError })
    return
  }

  if (!isValidEmailFormat(email)) {
    res.status(400).json({ message: 'Invalid email format' })
    return
  }

  const pinError = pinValidationMessage(pin)
  if (pinError) {
    res.status(400).json({ message: pinError })
    return
  }

  try {
    const passwordHash = await hashPassword(pin)

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
    !isNonEmptyString(body.pin)
  ) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const email = normalizeEmail(body.email)
  const pin = body.pin

  if (!isValidEmailFormat(email)) {
    res.status(400).json({ message: 'Invalid email format' })
    return
  }

  if (!isValidPin(pin)) {
    res.status(400).json({ message: 'Invalid PIN' })
    return
  }

  if (loginFailureLimiter.isLimited(`login:${email}`)) {
    res.status(429).json({ message: 'Too Many Requests' })
    return
  }

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
    const isPinValid = await verifyPassword(pin, passwordHash)

    if (!user || !isPinValid) {
      if (loginFailureLimiter.recordFailure(`login:${email}`)) {
        res.status(429).json({ message: 'Too Many Requests' })
        return
      }
      res.status(400).json({ message: 'Invalid email or PIN' })
      return
    }

    loginFailureLimiter.reset(`login:${email}`)

    const sessionId = uuid()
    const token = issueToken(user.id, sessionId)
    await storeSession(pool, sessionId, user.id, token, sessionExpiryFromNow())

    res.status(200).json({ id: user.id, token })
  } catch {
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

authRouter.post('/pin-reset/request', async (req, res) => {
  const body: unknown = req.body
  if (!isRecord(body) || !isNonEmptyString(body.email)) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const email = normalizeEmail(body.email)
  if (!isValidEmailFormat(email)) {
    res.status(204).end()
    return
  }

  try {
    const [rows] = await pool.execute<UserIdRow[]>(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email],
    )
    const user = rows[0]
    if (!user) {
      res.status(204).end()
      return
    }

    const otp = generateOtp()
    const otpId = uuid()
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)

    await pool.execute<ResultSetHeader>(
      `INSERT INTO pin_reset_otps (id, user_id, otp_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [otpId, user.id, hashOtp(otp), expiresAt],
    )

    await sendPinResetOtp(email, otp)
    res.status(204).end()
  } catch {
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

authRouter.post('/pin-reset/confirm', async (req, res) => {
  const body: unknown = req.body
  if (
    !isRecord(body) ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.otp) ||
    !isNonEmptyString(body.pin)
  ) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const email = normalizeEmail(body.email)
  const otp = body.otp.trim()
  const pin = body.pin

  if (!isValidEmailFormat(email) || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const pinError = pinValidationMessage(pin)
  if (pinError) {
    res.status(400).json({ message: pinError })
    return
  }

  try {
    const [userRows] = await pool.execute<UserIdRow[]>(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email],
    )
    const user = userRows[0]
    if (!user) {
      res.status(400).json({ message: 'Invalid or expired OTP' })
      return
    }

    const [otpRows] = await pool.execute<PinResetRow[]>(
      `SELECT id, user_id, otp_hash, expires_at, used_at, attempt_count
         FROM pin_reset_otps
        WHERE user_id = ?
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id],
    )
    const otpRecord = otpRows[0]
    if (!otpRecord) {
      res.status(400).json({ message: 'Invalid or expired OTP' })
      return
    }

    if (otpRecord.attempt_count >= MAX_OTP_ATTEMPTS) {
      res.status(429).json({ message: 'Too Many Requests' })
      return
    }

    const otpMatches = hashOtp(otp) === otpRecord.otp_hash
    if (!otpMatches) {
      await pool.execute<ResultSetHeader>(
        `UPDATE pin_reset_otps SET attempt_count = attempt_count + 1 WHERE id = ?`,
        [otpRecord.id],
      )
      res.status(400).json({ message: 'Invalid or expired OTP' })
      return
    }

    const passwordHash = await hashPassword(pin)

    await withTransaction(async (connection) => {
      await connection.execute<ResultSetHeader>(
        `UPDATE users SET password_hash = ? WHERE id = ?`,
        [passwordHash, user.id],
      )
      await connection.execute<ResultSetHeader>(
        `UPDATE pin_reset_otps SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [otpRecord.id],
      )
      await connection.execute<ResultSetHeader>(
        `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND revoked_at IS NULL`,
        [user.id],
      )
    })

    res.status(204).end()
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
