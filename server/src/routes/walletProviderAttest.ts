import { createHash, randomBytes } from 'node:crypto'

import { Router } from 'express'

import { readConfig } from '../config'

type EcP256Jwk = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

type AttestRequestBody = {
  challengeId?: unknown
  pubKAttestJwk?: unknown
  certificateChainDerBase64?: unknown
  submissionIdempotencyKey?: unknown
}

type ChallengeRecord = {
  expiresAtMs: number
}

type AttestationResponse = {
  wua: string
  wia: string
  expiresAt: string
}

type IdempotentRecord = {
  fingerprint: string
  response: AttestationResponse
  expiresAtMs: number
}

const challenges = new Map<string, ChallengeRecord>()
const idempotentResponses = new Map<string, IdempotentRecord>()

export function resetWalletAttestMockState(): void {
  challenges.clear()
  idempotentResponses.clear()
}

export function expireWalletAttestChallengeForTests(challengeId: string): void {
  const existing = challenges.get(challengeId)
  if (existing) {
    existing.expiresAtMs = 0
  }
}

export function expireWalletAttestIdempotencyForTests(idempotencyKey: string): void {
  const existing = idempotentResponses.get(idempotencyKey)
  if (existing) {
    existing.expiresAtMs = 0
  }
}

export function readWalletAttestMockSizesForTests(): {
  challenges: number
  idempotentResponses: number
} {
  return {
    challenges: challenges.size,
    idempotentResponses: idempotentResponses.size,
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function isP256Jwk(value: unknown): value is EcP256Jwk {
  if (!value || typeof value !== 'object') return false
  const jwk = value as Record<string, unknown>
  return (
    jwk.kty === 'EC' &&
    jwk.crv === 'P-256' &&
    typeof jwk.x === 'string' &&
    jwk.x.length > 0 &&
    typeof jwk.y === 'string' &&
    jwk.y.length > 0
  )
}

function isNonEmptyChain(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  )
}

function jwkThumbprint(jwk: EcP256Jwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
  const digest = createHash('sha256').update(canonical).digest('base64url')
  return `urn:ietf:params:oauth:jwk-thumbprint:sha-256:${digest}`
}

function createMockAttestationJwt(kind: 'wua' | 'wia', sub: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'wallet-attestation+jwt' }))
  const payload = base64UrlEncode(JSON.stringify({ sub, typ: kind, iat: Math.floor(Date.now() / 1000) }))
  return `${header}.${payload}.`
}

function payloadFingerprint(input: {
  challengeId: string
  pubKAttestJwk: EcP256Jwk
  certificateChainDerBase64: string[]
}): string {
  return JSON.stringify({
    challengeId: input.challengeId,
    pubKAttestJwk: {
      kty: input.pubKAttestJwk.kty,
      crv: input.pubKAttestJwk.crv,
      x: input.pubKAttestJwk.x,
      y: input.pubKAttestJwk.y,
    },
    certificateChainDerBase64: input.certificateChainDerBase64,
  })
}

function pruneAttestMockState(now = Date.now()): void {
  for (const [challengeId, record] of challenges) {
    if (now > record.expiresAtMs) challenges.delete(challengeId)
  }
  for (const [idempotencyKey, record] of idempotentResponses) {
    if (now > record.expiresAtMs) idempotentResponses.delete(idempotencyKey)
  }
}

function badRequest(res: { status: (code: number) => { json: (body: unknown) => void } }): void {
  res.status(400).json({ message: 'Bad Request' })
}

export const walletProviderAttestRouter = Router()

walletProviderAttestRouter.post('/wallet-attestations/challenge', (_req, res) => {
  pruneAttestMockState()
  const ttlMs = readConfig().walletAttestTtlMs
  const challengeId = randomBytes(16).toString('hex')
  const attestationChallengeBase64 = randomBytes(32).toString('base64')
  const expiresAtMs = Date.now() + ttlMs
  challenges.set(challengeId, { expiresAtMs })

  res.status(201).json({
    challengeId,
    attestationChallengeBase64,
    expiresAt: new Date(expiresAtMs).toISOString(),
  })
})

walletProviderAttestRouter.post('/wallet-attestations', (req, res) => {
  pruneAttestMockState()
  const body = req.body as AttestRequestBody
  const idempotencyKey = body.submissionIdempotencyKey

  if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
    const replay = idempotentResponses.get(idempotencyKey)
    if (replay) {
      if (
        typeof body.challengeId === 'string' &&
        body.challengeId.length > 0 &&
        isP256Jwk(body.pubKAttestJwk) &&
        isNonEmptyChain(body.certificateChainDerBase64) &&
        payloadFingerprint({
          challengeId: body.challengeId,
          pubKAttestJwk: body.pubKAttestJwk,
          certificateChainDerBase64: body.certificateChainDerBase64,
        }) === replay.fingerprint
      ) {
        res.status(201).json(replay.response)
        return
      }
      badRequest(res)
      return
    }
  }

  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    badRequest(res)
    return
  }

  if (
    typeof body.challengeId !== 'string' ||
    body.challengeId.length === 0 ||
    !isP256Jwk(body.pubKAttestJwk) ||
    !isNonEmptyChain(body.certificateChainDerBase64)
  ) {
    badRequest(res)
    return
  }

  const challenge = challenges.get(body.challengeId)
  if (!challenge || Date.now() > challenge.expiresAtMs) {
    challenges.delete(body.challengeId)
    badRequest(res)
    return
  }

  challenges.delete(body.challengeId)

  const sub = jwkThumbprint(body.pubKAttestJwk)
  const ttlMs = readConfig().walletAttestTtlMs
  const expiresAtMs = Date.now() + ttlMs
  const expiresAt = new Date(expiresAtMs).toISOString()
  const response: AttestationResponse = {
    wua: createMockAttestationJwt('wua', sub),
    wia: createMockAttestationJwt('wia', sub),
    expiresAt,
  }
  idempotentResponses.set(idempotencyKey, {
    fingerprint: payloadFingerprint({
      challengeId: body.challengeId,
      pubKAttestJwk: body.pubKAttestJwk,
      certificateChainDerBase64: body.certificateChainDerBase64,
    }),
    response,
    expiresAtMs,
  })
  res.status(201).json(response)
})
