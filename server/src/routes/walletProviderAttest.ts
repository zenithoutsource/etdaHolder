import { createHash } from 'node:crypto'

import { Router } from 'express'

import { readConfig } from '../config'

type AttestRequestBody = {
  pubKAttestJwk?: {
    kty?: string
    crv?: string
    x?: string
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function jwkThumbprint(jwk: { kty: string; crv: string; x: string }): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })
  const digest = createHash('sha256').update(canonical).digest('base64url')
  return `urn:ietf:params:oauth:jwk-thumbprint:sha-256:${digest}`
}

function createMockAttestationJwt(kind: 'wua' | 'wia', sub: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'wallet-attestation+jwt' }))
  const payload = base64UrlEncode(JSON.stringify({ sub, typ: kind, iat: Math.floor(Date.now() / 1000) }))
  return `${header}.${payload}.`
}

export const walletProviderAttestRouter = Router()

walletProviderAttestRouter.post('/wallet-attestations', (req, res) => {
  const body = req.body as AttestRequestBody
  const jwk = body.pubKAttestJwk
  if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string' || jwk.x.length === 0) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const sub = jwkThumbprint({ kty: jwk.kty, crv: jwk.crv, x: jwk.x })
  const ttlMs = readConfig().walletAttestTtlMs
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()

  res.status(201).json({
    wua: createMockAttestationJwt('wua', sub),
    wia: createMockAttestationJwt('wia', sub),
    expiresAt,
  })
})
