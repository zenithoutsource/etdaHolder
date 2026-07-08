import { Router } from 'express'

import { readConfig } from '../config'
import {
  formatVpIssuerPublicKeyEnvLine,
  resolveVpIssuerPublicKeyFromRawVc,
} from '../services/resolveVpIssuerKey'
import { verifySdJwtKbPresentation } from '../services/sdJwtVerifier'
import {
  renderVpConsumedHtml,
  renderVpErrorHtml,
  renderVpPendingHtml,
  renderVpSuccessHtml,
} from '../services/vpSessionHtml'
import {
  consumeVpSession,
  createVpSession,
  getVpSession,
  isVpSessionExpired,
  setVpToken,
} from '../services/vpSessionStore'

export const vpSessionRouter = Router()

vpSessionRouter.post('/vp-issuer-key/resolve', async (req, res) => {
  const rawVc = typeof req.body?.rawVc === 'string' ? req.body.rawVc.trim() : ''
  const issuerUrl = typeof req.body?.issuerUrl === 'string' ? req.body.issuerUrl.trim() : undefined
  if (!rawVc) {
    res.status(400).json({ message: 'rawVc is required' })
    return
  }

  try {
    const jwk = await resolveVpIssuerPublicKeyFromRawVc(rawVc, issuerUrl)
    const envLine = formatVpIssuerPublicKeyEnvLine(jwk)
    res.status(200).json({ jwk, envLine })
  } catch (error) {
    console.error('[vp-relay] issuer-key-resolve-failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(422).json({
      message: 'Could not resolve issuer public key from rawVc',
    })
  }
})

vpSessionRouter.post('/vp-session', (_req, res) => {
  const config = readConfig()
  const session = createVpSession(config.vpSessionTtlMs)
  res.status(201).json({
    sessionId: session.sessionId,
    nonce: session.nonce,
    expiresAt: session.expiresAt,
  })
})

vpSessionRouter.put('/vp-session/:sessionId', (req, res) => {
  const vpToken = typeof req.body?.vpToken === 'string' ? req.body.vpToken : ''
  const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType : ''
  if (!vpToken || !credentialType) {
    res.status(400).json({ message: 'Bad Request' })
    return
  }

  const outcome = setVpToken(req.params.sessionId, vpToken, credentialType)
  if (outcome === 'not-found') {
    res.status(404).json({ message: 'Not Found' })
    return
  }
  if (outcome === 'expired') {
    res.status(410).json({ message: 'Gone' })
    return
  }
  if (outcome === 'already-set' || outcome === 'consumed') {
    res.status(409).json({ message: 'Conflict' })
    return
  }

  res.status(200).json({ ok: true })
})

vpSessionRouter.get('/vp-verify', (req, res) => {
  const sessionId = typeof req.query.s === 'string' ? req.query.s : ''
  const session = getVpSession(sessionId)
  if (!session) {
    res.status(404).send(renderVpErrorHtml('ไม่พบ QR'))
    return
  }
  if (isVpSessionExpired(session)) {
    res.status(410).send(renderVpErrorHtml('QR หมดอายุ'))
    return
  }
  if (session.consumed) {
    res.status(409).send(renderVpConsumedHtml())
    return
  }
  if (!session.vpToken) {
    res.status(202).set('Retry-After', '2').send(renderVpPendingHtml())
    return
  }

  const config = readConfig()
  const verified = verifySdJwtKbPresentation(session.vpToken, {
    nonce: session.nonce,
    relayBaseUrl: config.vpRelayBaseUrl,
    maxAgeMs: config.vpSessionTtlMs,
    issuerPublicKeyJwk: config.vpIssuerPublicKeyJwk,
  })

  if (!verified.ok) {
    console.info('[vp-relay] verify-failed', {
      reason: verified.reason,
      credentialType: session.credentialType,
      vpBytes: session.vpToken.length,
    })
    res.status(200).send(renderVpErrorHtml('ไม่ผ่านการตรวจสอบ', verified.reason))
    return
  }

  consumeVpSession(sessionId)
  res.status(200).send(
    renderVpSuccessHtml({
      credentialType: session.credentialType,
      issuerName: verified.issuerName,
      presentedAt: new Date().toISOString(),
      claims: verified.claims,
    }),
  )
})
