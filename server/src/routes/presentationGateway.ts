import { Router } from 'express'

import { readConfig } from '../config'
import {
  createPresentationSession,
  fetchPresentationSessionStatus,
  uploadPresentation,
  verifyPresentationSession,
} from '../services/presentationGatewayService'
import { getDefaultPresentationSessionStore } from '../services/presentationSessionStore'
import {
  renderVpConsumedHtml,
  renderVpErrorHtml,
  renderVpPendingHtml,
  renderVpSuccessHtml,
} from '../services/vpSessionHtml'

/** Reference verifier presentation service — deploy on verifier infrastructure in production. */
export const presentationGatewayRouter = Router()

const store = getDefaultPresentationSessionStore()

function sendVpHtml(res: import('express').Response, statusCode: number, html: string): void {
  res.status(statusCode).type('text/html; charset=utf-8').send(html)
}

presentationGatewayRouter.post('/presentation-sessions', (_req, res) => {
  const config = readConfig()
  const session = createPresentationSession(store, config)
  res.status(201).json(session)
})

presentationGatewayRouter.put('/presentation-sessions/:sessionId', (req, res) => {
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

presentationGatewayRouter.get('/presentation-sessions/:sessionId/status', (req, res) => {
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

presentationGatewayRouter.get('/present/verify', async (req, res) => {
  const sessionId = typeof req.query.s === 'string' ? req.query.s : ''
  const config = readConfig()

  if (process.env.NODE_ENV === 'production' && !config.verifierPresentationBaseUrl.startsWith('https://')) {
    sendVpHtml(res, 403, renderVpErrorHtml('ไม่รองรับการตรวจสอบ'))
    return
  }

  const outcome = await verifyPresentationSession(store, sessionId, config)
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
    console.info('[presentation-gateway] verify-failed', {
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
