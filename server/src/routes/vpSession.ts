import { Router } from 'express'

import { readConfig } from '../config'
import {
  createDevVpSession,
  fetchPresentationSessionStatus,
  uploadPresentation,
  verifyDevVpSession,
} from '../services/presentationGatewayService'
import { getDefaultPresentationSessionStore } from '../services/presentationSessionStore'
import {
  renderVpConsumedHtml,
  renderVpErrorHtml,
  renderVpPendingHtml,
  renderVpSuccessHtml,
} from '../services/vpSessionHtml'

export const vpSessionRouter = Router()

const store = getDefaultPresentationSessionStore()

function sendVpHtml(res: import('express').Response, statusCode: number, html: string): void {
  res.status(statusCode).type('text/html; charset=utf-8').send(html)
}

vpSessionRouter.post('/vp-session', (_req, res) => {
  const config = readConfig()
  const session = createDevVpSession(store, config.vpSessionTtlMs)
  res.status(201).json(session)
})

vpSessionRouter.put('/vp-session/:sessionId', (req, res) => {
  const vpToken = typeof req.body?.vpToken === 'string' ? req.body.vpToken : ''
  const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType : ''
  const outcome = uploadPresentation(store, req.params.sessionId, vpToken, credentialType)
  if (!outcome.ok) {
    if (outcome.code === 'bad-request') {
      res.status(400).json({ message: 'Bad Request' })
      return
    }
    if (outcome.code === 'not-found') {
      res.status(404).json({ message: 'Not Found' })
      return
    }
    if (outcome.code === 'expired') {
      res.status(410).json({ message: 'Gone' })
      return
    }
    res.status(409).json({ message: 'Conflict' })
    return
  }

  res.status(200).json({ ok: true })
})

vpSessionRouter.get('/vp-session/:sessionId/status', (req, res) => {
  const status = fetchPresentationSessionStatus(store, req.params.sessionId)
  if (status === 'not-found') {
    res.status(404).json({ status })
    return
  }

  const session = store.getSession(req.params.sessionId)
  const body: Record<string, string> = {
    status,
    expiresAt: session?.expiresAt ?? '',
  }
  if (status === 'verify_failed' && session?.verificationReason) {
    body.reason = session.verificationReason
  }
  res.status(200).json(body)
})

vpSessionRouter.get('/vp-verify', async (req, res) => {
  const sessionId = typeof req.query.s === 'string' ? req.query.s : ''
  const config = readConfig()
  const outcome = await verifyDevVpSession(store, sessionId, config)

  if (outcome.kind === 'not-found') {
    sendVpHtml(res, 404, renderVpErrorHtml('ไม่พบ QR'))
    return
  }
  if (outcome.kind === 'expired') {
    sendVpHtml(res, 410, renderVpErrorHtml('QR หมดอายุ'))
    return
  }
  if (outcome.kind === 'consumed') {
    sendVpHtml(res, 409, renderVpConsumedHtml())
    return
  }
  if (outcome.kind === 'pending') {
    res.status(202).set('Retry-After', '2')
    sendVpHtml(res, 202, renderVpPendingHtml())
    return
  }
  if (outcome.kind === 'verify-failed') {
    console.info('[vp-relay] verify-failed', {
      reason: outcome.reason,
      credentialType: outcome.credentialType,
      vpBytes: outcome.vpBytes,
    })
    sendVpHtml(res, 200, renderVpErrorHtml('ไม่ผ่านการตรวจสอบ', outcome.reason))
    return
  }

  sendVpHtml(
    res,
    200,
    renderVpSuccessHtml({
      credentialType: outcome.credentialType,
      issuerName: outcome.issuerName,
      presentedAt: outcome.presentedAt,
      claims: outcome.claims,
    }),
  )
})
