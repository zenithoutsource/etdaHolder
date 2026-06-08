import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import type { SignOptions } from 'jsonwebtoken'
import type { RowDataPacket } from 'mysql2'

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

const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOeP7gKdz1A7fN8AtJ5QyH88f6g1z5F2Re'

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
  const signOptions: SignOptions = {
    subject: userId,
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  }

  return jwt.sign({ sid: sessionId }, config.jwtSecret, {
    ...signOptions,
    algorithm: 'HS256',
  })
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, readConfig().jwtSecret, { algorithms: ['HS256'] })
  if (typeof decoded !== 'object' || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
    throw new Error('AuthTokenInvalid')
  }
  return { sub: decoded.sub, sid: decoded.sid }
}

export function getDummyPasswordHash(): string {
  return DUMMY_PASSWORD_HASH
}

export async function storeSession(
  db: DbExecutor,
  sessionId: string,
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  await db.execute(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [sessionId, userId, hashToken(token), expiresAt],
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
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  let payload: JwtPayload
  try {
    payload = verifyToken(token)
  } catch {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  try {
    const tokenHash = hashToken(token)
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM sessions
        WHERE id = ?
          AND user_id = ?
          AND token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        LIMIT 1`,
      [payload.sid, payload.sub, tokenHash],
    )
    if (rows.length === 0) {
      res.status(401).json({ message: 'Unauthorized' })
      return
    }
    req.auth = { userId: payload.sub, token, tokenHash }
    next()
  } catch (error) {
    console.error('requireAuth session lookup failed', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
}

export function sessionExpiryFromNow(days = readConfig().sessionExpiresInDays): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}
