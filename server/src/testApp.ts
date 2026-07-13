import cors from 'cors'
import express from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'

import { readConfig } from './config'
import { authRouter } from './routes/auth'
import { credentialsRouter } from './routes/credentials'
import { devIssuerProxyRouter, devVerifierProxyRouter } from './routes/devIssuerProxy'
import { devWalletRouter } from './routes/devWallet'
import { vpSessionRouter } from './routes/vpSession'
import { presentationGatewayRouter } from './routes/presentationGateway'
import { pushTokensRouter } from './routes/pushTokens'
import { walletsRouter } from './routes/wallets'

type HttpParserError = Error & {
  status?: number
  statusCode?: number
  type?: string
}

function isJsonParserError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const parserError = error as HttpParserError
  return (
    parserError instanceof SyntaxError ||
    parserError.type === 'entity.parse.failed' ||
    parserError.type === 'entity.too.large' ||
    parserError.status === 400 ||
    parserError.status === 413 ||
    parserError.statusCode === 400 ||
    parserError.statusCode === 413
  )
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) {
    return
  }

  if (isJsonParserError(error)) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  res.status(500).json({ message: 'Internal Server Error' })
}

function createCorsMiddleware(): RequestHandler {
  const allowedOrigins = new Set(readConfig().allowedOrigins)

  return cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(null, false)
    },
  })
}

function createAuthRateLimiter(): RequestHandler {
  const maxAttempts = 10
  const windowMs = 60_000
  const attempts = new Map<string, { count: number; resetAt: number }>()

  return (req, res, next) => {
    if (
      req.method !== 'POST' ||
      !['/login', '/register', '/email-status', '/pin-reset/request', '/pin-reset/verify', '/pin-reset/confirm'].includes(req.path)
    ) {
      next()
      return
    }

    const now = Date.now()
    const key = `${req.ip}:${req.path}`
    const current = attempts.get(key)

    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    current.count += 1
    if (current.count > maxAttempts) {
      res.status(429).json({ message: 'Too Many Requests' })
      return
    }

    next()
  }
}

export function createTestApp(): express.Express {
  const app = express()

  app.use(createCorsMiddleware())

  app.use('/dev', express.json({ limit: '1mb' }), vpSessionRouter)
  app.use('/v1', express.json({ limit: '1mb' }), presentationGatewayRouter)

  if (process.env.ENABLE_DEV_ISSUER_PROXY === 'true') {
    app.use('/dev-issuer-proxy', devIssuerProxyRouter)
  }
  if (process.env.ENABLE_DEV_VERIFIER_PROXY === 'true') {
    app.use('/dev-verifier-proxy', devVerifierProxyRouter)
  }

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  app.use('/wallet-api/auth', createAuthRateLimiter())
  app.use('/wallet-api/auth', authRouter)
  app.use('/wallet-api/dev', devWalletRouter)
  app.use('/wallet-api/wallet', walletsRouter)
  app.use('/wallet-api/wallet', pushTokensRouter)
  app.use('/wallet-api/wallet', credentialsRouter)
  app.use(errorHandler)

  return app
}
