import dotenv from 'dotenv'

dotenv.config()

export type ServerConfig = {
  port: number
  allowedOrigins: string[]
  db: {
    host: string
    port: number
    database: string
    user: string
    password: string
  }
  jwtSecret: string
  jwtExpiresIn: string
  sessionExpiresInDays: number
  mail: {
    smtpHost?: string
    smtpPort: number
    smtpSecure: boolean
    smtpUser?: string
    smtpPassword?: string
    fromAddress: string
    fromName: string
  }
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

function readIntegerInRange(name: string, fallback: string, min: number, max: number): number {
  const value = readNumber(name, fallback)
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`ConfigInvalid: ${name}`)
  return value
}

function readPort(name: string, fallback: string): number {
  return readIntegerInRange(name, fallback, 1, 65535)
}

function readOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

function readBoolean(name: string, fallback: string): boolean {
  const value = (process.env[name] ?? fallback).trim().toLowerCase()
  if (value === 'true' || value === '1' || value === 'yes') return true
  if (value === 'false' || value === '0' || value === 'no') return false
  throw new Error(`ConfigInvalid: ${name}`)
}

export function readConfig(): ServerConfig {
  const jwtSecret = readString('JWT_SECRET', 'local-dev-change-me').trim()
  if (jwtSecret.length === 0) {
    throw new Error('ConfigInvalid: JWT_SECRET')
  }
  if (process.env.NODE_ENV !== 'test' && jwtSecret === 'local-dev-change-me') {
    throw new Error('ConfigInvalid: JWT_SECRET')
  }

  return {
    port: readPort('PORT', '4000'),
    allowedOrigins: readString('WALLET_API_ALLOWED_ORIGINS', 'http://localhost:19006,http://localhost:8081')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    db: {
      host: readString('DB_HOST', '127.0.0.1'),
      port: readPort('DB_PORT', '3306'),
      database: readString('DB_NAME', 'etda_wallet'),
      user: readString('DB_USER', 'root'),
      password: readString('DB_PASSWORD', ''),
    },
    jwtSecret,
    jwtExpiresIn: readString('JWT_EXPIRES_IN', '7d'),
    sessionExpiresInDays: readIntegerInRange('SESSION_EXPIRES_IN_DAYS', '7', 1, 30),
    mail: {
      smtpHost: readOptionalString('SMTP_HOST'),
      smtpPort: readPort('SMTP_PORT', '587'),
      smtpSecure: readBoolean('SMTP_SECURE', 'false'),
      smtpUser: readOptionalString('SMTP_USER'),
      smtpPassword: readOptionalString('SMTP_PASSWORD'),
      fromAddress: readString('MAIL_FROM', 'wallet-noreply@localhost'),
      fromName: readString('MAIL_FROM_NAME', 'ETDA Wallet'),
    },
  }
}
