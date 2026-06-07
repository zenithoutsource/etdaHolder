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
