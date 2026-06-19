import express from 'express'
import type { RequestHandler } from 'express'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

function buildForwardHeaders(req: express.Request): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

function createProxyHandler(targetEnvName: string): RequestHandler {
  return async (req, res) => {
    const target = process.env[targetEnvName]
    if (!target) {
      res.status(500).json({ message: `${targetEnvName} not configured` })
      return
    }

    const targetUrl = `${target.replace(/\/$/, '')}${req.url}`
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body instanceof Buffer && req.body.length > 0

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: buildForwardHeaders(req),
        body: hasBody ? req.body : undefined,
      })

      res.status(upstream.status)
      upstream.headers.forEach((value, key) => {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return
        res.setHeader(key, value)
      })

      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.send(buffer)
    } catch {
      res.status(502).json({ message: 'Bad Gateway' })
    }
  }
}

export const devIssuerProxyRouter = express.Router()
devIssuerProxyRouter.use(express.raw({ type: '*/*', limit: '5mb' }))
devIssuerProxyRouter.all('/*', createProxyHandler('ISSUER_PROXY_TARGET'))

export const devVerifierProxyRouter = express.Router()
devVerifierProxyRouter.use(express.raw({ type: '*/*', limit: '5mb' }))
devVerifierProxyRouter.all('/*', createProxyHandler('VERIFIER_PROXY_TARGET'))
