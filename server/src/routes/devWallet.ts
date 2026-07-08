import { Router } from 'express'

import { readPushToken } from './pushTokens'
import { requestIssuerRenewalOffer } from '../services/devRenewalOffer'
import { sendExpoPush, type ExpoPushEvent, type ExpoPushPayload } from '../services/expoPushClient'

type DevHolderRevocationRecord = {
  credentialId: string
  holderDid: string
  confirmedAt: string
}

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
const usedCredentials = new Set<string>()
const holderRevocations = new Map<string, DevHolderRevocationRecord>()
const renewalReadyTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function sendCredentialEventPush(
  event: ExpoPushEvent,
  holderDid: string,
  credentialId: string,
  credentialType: string,
): Promise<boolean> {
  const pushToken = readPushToken(holderDid)
  if (!pushToken) {
    console.warn('[push-notifications] token-missing', {
      event,
      credentialId,
      credentialType,
      holderDidLength: holderDid.length,
    })
    return false
  }

  const copy = readNotificationCopy(event, credentialType)
  try {
    await sendExpoPush(pushToken, {
      ...copy,
      data: {
        event,
        credentialId,
        credentialType,
      },
    })
  } catch (error) {
    console.error('[push-notifications] expo-send-failed', {
      event,
      credentialId,
      credentialType,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  return true
}

function clearRenewalReadyTimer(credentialId: string): void {
  const timer = renewalReadyTimers.get(credentialId)
  if (!timer) return

  clearTimeout(timer)
  renewalReadyTimers.delete(credentialId)
}

function transitionRenewalToOfferReadyIfElapsed(credentialId: string, now = Date.now()): void {
  const record = renewals.get(credentialId)
  if (!record || record.state !== 'requested') return

  const requestedAt = Date.parse(record.requestedAt)
  if (!Number.isFinite(requestedAt) || now - requestedAt < readDevRenewalDelayMs()) {
    return
  }

  clearRenewalReadyTimer(credentialId)
  renewals.set(credentialId, {
    ...record,
    state: 'offer-ready',
    updatedAt: new Date().toISOString(),
  })

  void sendCredentialEventPush(
    'renewal-ready',
    record.newHolderDid,
    record.credentialId,
    record.credentialType,
  ).catch(() => undefined)
}

function scheduleRenewalReadyTransition(credentialId: string): void {
  clearRenewalReadyTimer(credentialId)

  const timer = setTimeout(() => {
    console.info('[push-notifications] renewal-ready-timer-fired', { credentialId })
    renewalReadyTimers.delete(credentialId)
    transitionRenewalToOfferReadyIfElapsed(credentialId)
  }, readDevRenewalDelayMs())
  renewalReadyTimers.set(credentialId, timer)
}

export function readNotificationCopy(
  event: ExpoPushEvent,
  credentialType: string,
): Pick<ExpoPushPayload, 'title' | 'body'> {
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
  usedCredentials.clear()
  holderRevocations.clear()
  for (const timer of renewalReadyTimers.values()) {
    clearTimeout(timer)
  }
  renewalReadyTimers.clear()
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
    if (now - Date.parse(record.requestedAt) < delayMs) continue
    transitionRenewalToOfferReadyIfElapsed(record.credentialId, now)
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

const presentationAccessSuspensions: { eventId: string; credentialId: string; partyName: string; requestedAt: string }[] = []

devWalletRouter.post('/presentation/suspend-access', (req, res) => {
  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : ''
  const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''
  const partyName = typeof req.body?.partyName === 'string' ? req.body.partyName.trim() : ''

  if (!eventId || !credentialId || !partyName) {
    res.status(400).json({ message: 'eventId, credentialId, and partyName are required' })
    return
  }

  const record = {
    eventId,
    credentialId,
    partyName,
    requestedAt: new Date().toISOString(),
  }
  presentationAccessSuspensions.push(record)
  res.status(201).json(record)
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

devWalletRouter.post('/wallet/mark-used', (req, res) => {
  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''

  if (!credentialId) {
    res.status(400).json({ message: 'credentialId is required' })
    return
  }

  usedCredentials.add(credentialId)
  res.status(201).json({ used: true, credentialId })
})

devWalletRouter.get('/wallet/used-status', (req, res) => {
  const credentialId = typeof req.query.credentialId === 'string' ? req.query.credentialId.trim() : ''
  if (!credentialId) {
    res.status(400).json({ message: 'credentialId is required' })
    return
  }

  res.json({ used: usedCredentials.has(credentialId), credentialId })
})

devWalletRouter.post('/issuer/holder-revoke', (req, res) => {
  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''
  const holderDid =
    typeof req.body?.holderDid === 'string' ? req.body.holderDid.trim() : ''

  if (!credentialId || !holderDid) {
    res.status(400).json({ message: 'credentialId and holderDid are required' })
    return
  }

  const confirmedAt = new Date().toISOString()
  const record: DevHolderRevocationRecord = {
    credentialId,
    holderDid,
    confirmedAt,
  }
  holderRevocations.set(credentialId, record)
  res.status(201).json({
    status: 'revoked',
    credentialId,
    confirmedAt,
  })
})

devWalletRouter.get('/wallet/revoke-status', (req, res) => {
  const credentialId = typeof req.query.credentialId === 'string' ? req.query.credentialId.trim() : ''
  if (!credentialId) {
    res.status(400).json({ message: 'credentialId is required' })
    return
  }

  const record = holderRevocations.get(credentialId)
  if (!record) {
    res.json({ status: 'none', credentialId })
    return
  }

  res.json({
    status: 'revoked',
    credentialId,
    confirmedAt: record.confirmedAt,
  })
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

  const delivered = await sendCredentialEventPush(
    event,
    holderDid,
    credentialId,
    credentialType,
  ).catch(() => false)
  if (!delivered) {
    res.status(200).json({ delivered: false })
    return
  }

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
  scheduleRenewalReadyTransition(credentialId)

  void sendCredentialEventPush(
    'renewal-required',
    newHolderDid,
    credentialId,
    credentialType,
  ).catch(() => undefined)

  res.status(201).json({ accepted: true })
})
