import { readFileSync } from 'node:fs'

import dotenv from 'dotenv'

dotenv.config()

export type Ed25519PublicJwk = {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}

function readVerifierPresentationBaseUrl(): string {
  return normalizeBaseUrl(
    readOptionalString('VERIFIER_PRESENTATION_BASE_URL')
      ?? readOptionalString('PRESENTATION_GATEWAY_BASE_URL')
      ?? 'http://localhost:4000',
  )
}

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
  vpSessionTtlMs: number
  vpIssuerPublicKeyJwk?: Ed25519PublicJwk
  presentationSessionTtlMs: number
  verifierPresentationBaseUrl: string
  /** @deprecated Alias of verifierPresentationBaseUrl — kept for backward compatibility. */
  presentationGatewayBaseUrl: string
  presentationIssuerJwksCacheMs: number
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
      fromName: readString('MAIL_FROM_NAME', 'Wallet'),
    },
    vpSessionTtlMs: readIntegerInRange('VP_SESSION_TTL_MS', '300000', 30_000, 3_600_000),
    vpIssuerPublicKeyJwk: readIssuerPublicKeyJwk(),
    presentationSessionTtlMs: readIntegerInRange('PRESENTATION_SESSION_TTL_MS', '300000', 30_000, 3_600_000),
    verifierPresentationBaseUrl: readVerifierPresentationBaseUrl(),
    presentationGatewayBaseUrl: readVerifierPresentationBaseUrl(),
    presentationIssuerJwksCacheMs: readIntegerInRange('PRESENTATION_ISSUER_JWKS_CACHE_MS', '3600000', 60_000, 86_400_000),
  }
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function readIssuerPublicKeyJwk(): Ed25519PublicJwk | undefined {
  const raw = readOptionalString('VP_ISSUER_PUBLIC_KEY_JWK')
  const path = readOptionalString('VP_ISSUER_PUBLIC_KEY_PATH')
  const json = raw ?? (path ? readFileSync(path, 'utf8') : undefined)
  if (!json) {
    if (process.env.NODE_ENV === 'test') {
      return {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
      }
    }
    return undefined
  }

  const parsed = JSON.parse(json) as Ed25519PublicJwk
  if (parsed.kty !== 'OKP' || parsed.crv !== 'Ed25519' || typeof parsed.x !== 'string') {
    throw new Error('ConfigInvalid: VP_ISSUER_PUBLIC_KEY_JWK')
  }

  return parsed
}
