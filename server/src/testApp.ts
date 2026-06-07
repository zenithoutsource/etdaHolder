import cors from 'cors'
import express from 'express'
import type { ErrorRequestHandler } from 'express'

import { authRouter } from './routes/auth'
import { credentialsRouter } from './routes/credentials'
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

export function createTestApp(): express.Express {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.use('/wallet-api/auth', authRouter)
  app.use('/wallet-api/wallet', walletsRouter)
  app.use('/wallet-api/wallet', credentialsRouter)
  app.use(errorHandler)

  return app
}
