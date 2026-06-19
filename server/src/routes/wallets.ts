import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'

import { requireAuth, type AuthenticatedRequest } from '../auth'
import { pool } from '../db'

type WalletRow = RowDataPacket & {
  id: string
  name: string
  created_at: Date
}

const walletsRouter = Router()

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

walletsRouter.get('/accounts/wallets', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.userId
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  try {
    const [rows] = await pool.execute<WalletRow[]>(
      `SELECT id, name, created_at
         FROM wallets
        WHERE user_id = ?
        ORDER BY created_at ASC, id ASC`,
      [userId],
    )

    res.status(200).json({
      account: userId,
      wallets: rows.map((row) => {
        const createdOn = toIsoString(row.created_at)
        return {
          id: row.id,
          name: row.name,
          createdOn,
          addedOn: createdOn,
          permission: 'ADMINISTRATE',
        }
      }),
    })
  } catch {
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

export { walletsRouter }
