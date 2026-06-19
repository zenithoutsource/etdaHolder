import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'

import { requireAuth, type AuthenticatedRequest } from '../auth'
import { pool } from '../db'

type WalletOwnershipRow = RowDataPacket & {
  id: string
}

const credentialsRouter = Router()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

credentialsRouter.post('/:wallet/credentials/import', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.userId
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const body: unknown = req.body
  if (!isRecord(body) || !isNonEmptyString(body.jwt) || !isNonEmptyString(body.associated_did)) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const walletId = req.params.wallet
  const jwt = body.jwt
  const associatedDid = body.associated_did

  try {
    const [walletRows] = await pool.execute<WalletOwnershipRow[]>(
      `SELECT id
         FROM wallets
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [walletId, userId],
    )
    if (walletRows.length === 0) {
      res.status(403).json({ message: 'Forbidden' })
      return
    }

    const credentialId = uuid()
    await pool.execute<ResultSetHeader>(
      `INSERT INTO credentials (id, wallet_id, jwt, associated_did)
       VALUES (?, ?, ?, ?)`,
      [credentialId, walletId, jwt, associatedDid],
    )

    res.status(201).json({
      id: credentialId,
      wallet: walletId,
      document: jwt,
      format: 'jwt_vc_json',
      pending: false,
      addedOn: new Date().toISOString(),
    })
  } catch {
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

export { credentialsRouter }
