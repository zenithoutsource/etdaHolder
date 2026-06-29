import { Router } from 'express'

import { readPushToken } from './pushTokens'
import { requestIssuerRenewalOffer } from '../services/devRenewalOffer'
import { sendExpoPush, type ExpoPushEvent, type ExpoPushPayload } from '../services/expoPushClient'

type DevIssuerSuspensionRecord = {
  credentialId: string
  suspendedAt: string
  acknowledgedAt?: string
  reasonCode?: string
  issuerRef?: string
  updatedAt: string
}

type DevWalletRenewalRecord = {
  credentialId: string
  credentialType: string
  oldHolderDid: string
  newHolderDid: string
  state: 'requested' | 'offer-ready' | 'revoked'
  rawVc: string
  offerUri: string
  requestedAt: string
  revokedAt?: string
  updatedAt: string
}

function readDevRenewalDelayMs(): number {
  const raw = process.env.DEV_RENEWAL_DELAY_MS
  if (!raw) return 8_000
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 8_000
}

const suspensions = new Map<string, DevIssuerSuspensionRecord>()
const renewals = new Map<string, DevWalletRenewalRecord>()

function readNotificationCopy(event: ExpoPushEvent, credentialType: string): Pick<ExpoPushPayload, 'title' | 'body'> {
  const credentialLabel = credentialType === 'ThaiNationalID'
    ? 'Thai National ID'
    : credentialType === 'DLTDrivingLicence'
      ? 'Driving Licence'
      : credentialType === 'BangkokUniversityTranscript'
        ? 'Academic Transcript'
        : credentialType

  switch (event) {
    case 'renewal-ready':
      return {
        title: 'เอกสารใหม่พร้อมแล้ว',
        body: `${credentialLabel} ออกใหม่ให้คุณแล้ว แตะเพื่อรับ`,
      }
    case 'renewal-required':
      return {
        title: 'ถึงเวลาต่ออายุเอกสาร',
        body: `${credentialLabel} ต้องการการต่ออายุ`,
      }
    case 'issuer-suspended':
      return {
        title: 'เอกสารถูกระงับชั่วคราว',
        body: `${credentialLabel} ถูกผู้ออกระงับการใช้งาน`,
      }
    case 'cleanup-pending':
      return {
        title: 'รับเอกสารใหม่สำเร็จ',
        body: 'ลบเอกสารเก่าเพื่อดำเนินการต่อ',
      }
    case 'old-revoked':
      return {
        title: 'การต่ออายุเสร็จสมบูรณ์',
        body: 'เอกสารเก่าถูกยกเลิกแล้ว',
      }
  }
}

export function resetDevWalletState(): void {
  suspensions.clear()
  renewals.clear()
}

export const devWalletRouter = Router()

devWalletRouter.get('/wallet/suspension-status', (_req, res) => {
  res.json({
    suspensions: Array.from(suspensions.values()),
  })
})

devWalletRouter.get('/wallet/renewal-status', (_req, res) => {
  const delayMs = readDevRenewalDelayMs()
  const now = Date.now()

  for (const record of renewals.values()) {
    if (record.state !== 'requested') continue

    const requestedAt = Date.parse(record.requestedAt)
    if (!Number.isFinite(requestedAt) || now - requestedAt < delayMs) {
      continue
    }

    renewals.set(record.credentialId, {
      ...record,
      state: 'offer-ready',
      updatedAt: new Date().toISOString(),
    })
  }

  const output = Array.from(renewals.values()).map((record) => {
    if (record.state === 'requested') {
      return {
        credentialId: record.credentialId,
        state: record.state,
        revokedAt: record.revokedAt,
      }
    }

    return {
      credentialId: record.credentialId,
      state: record.state,
      offerUri: record.state === 'offer-ready' ? record.offerUri : undefined,
      revokedAt: record.revokedAt,
    }
  })

  res.json({ renewals: output })
})

devWalletRouter.post('/issuer/suspend', (req, res) => {
  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''

  if (!credentialId) {
    res.status(400).json({ message: 'credentialId is required' })
    return
  }

  const suspendedAt =
    typeof req.body?.suspendedAt === 'string' ? req.body.suspendedAt : new Date().toISOString()
  const acknowledgedAt =
    typeof req.body?.acknowledgedAt === 'string' ? req.body.acknowledgedAt : undefined
  const reasonCode =
    typeof req.body?.reasonCode === 'string' ? req.body.reasonCode : undefined
  const issuerRef =
    typeof req.body?.issuerRef === 'string' ? req.body.issuerRef : undefined
  const updatedAt =
    typeof req.body?.updatedAt === 'string' ? req.body.updatedAt : new Date().toISOString()

  const record: DevIssuerSuspensionRecord = {
    credentialId,
    suspendedAt,
    acknowledgedAt,
    reasonCode,
    issuerRef,
    updatedAt,
  }
  suspensions.set(credentialId, record)
  res.status(201).json(record)
})

devWalletRouter.post('/webhook/credential-event', async (req, res) => {
  const event = typeof req.body?.event === 'string' ? req.body.event.trim() as ExpoPushEvent : ''
  const holderDid = typeof req.body?.holderDid === 'string' ? req.body.holderDid.trim() : ''
  const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''
  const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType.trim() : ''

  if (!event || !holderDid || !credentialId || !credentialType) {
    res.status(400).json({
      message: 'event, holderDid, credentialId, and credentialType are required',
    })
    return
  }

  const pushToken = readPushToken(holderDid)
  if (!pushToken) {
    res.status(200).json({ delivered: false })
    return
  }

  const copy = readNotificationCopy(event, credentialType)
  await sendExpoPush(pushToken, {
    ...copy,
    data: {
      event,
      credentialId,
      credentialType,
    },
  })

  res.status(200).json({ delivered: true })
})

devWalletRouter.post('/wallet/renewal-request', async (req, res) => {
  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''
  const credentialType =
    typeof req.body?.credentialType === 'string' ? req.body.credentialType.trim() : ''
  const oldHolderDid =
    typeof req.body?.oldHolderDid === 'string' ? req.body.oldHolderDid.trim() : ''
  const newHolderDid =
    typeof req.body?.newHolderDid === 'string' ? req.body.newHolderDid.trim() : ''
  const rawVc =
    typeof req.body?.rawVc === 'string' ? req.body.rawVc : ''

  if (!credentialId || !credentialType || !oldHolderDid || !newHolderDid || !rawVc) {
    res.status(400).json({
      message:
        'credentialId, credentialType, oldHolderDid, newHolderDid, and rawVc are required',
    })
    return
  }

  let offerUri: string
  try {
    offerUri = await requestIssuerRenewalOffer(credentialType)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Renewal offer creation failed'
    if (message.startsWith('UnsupportedCredentialType:')) {
      res.status(400).json({ message })
      return
    }
    if (message === 'IssuerProxyTargetMissing') {
      res.status(503).json({ message: 'ISSUER_PROXY_TARGET is not configured' })
      return
    }
    res.status(502).json({ message: 'Renewal offer creation failed' })
    return
  }

  const updatedAt = new Date().toISOString()

  renewals.set(credentialId, {
    credentialId,
    credentialType,
    oldHolderDid,
    newHolderDid,
    state: 'requested',
    rawVc,
    offerUri,
    requestedAt: updatedAt,
    updatedAt,
  })

  res.status(201).json({ accepted: true })
})
