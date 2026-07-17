import { Router } from 'express'

import { readPushToken } from './pushTokens'
import { requestIssuerRenewalOffer } from '../services/devRenewalOffer'
import { verifyHolderRevokePop } from '../services/holderRevokePopVerifier'
import { sendExpoPush, type ExpoPushEvent, type ExpoPushPayload } from '../services/expoPushClient'

type DevHolderRevocationRecord = {
  credentialId: string
  holderDid: string
  confirmedAt: string
}

type DevHolderRevokeNonceRecord = {
  credentialId: string
  holderDid: string
  nonce: string
  audience: string
  expiresAt: string
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
  authorizationRequest: string
  nonce: string
  vpAccepted: boolean
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
const holderRevokeNonces = new Map<string, DevHolderRevokeNonceRecord>()

const DEV_HOLDER_REVOKE_AUDIENCE = 'urn:wallet:dev:issuer:holder-revoke'
const DEV_HOLDER_REVOKE_NONCE_TTL_MS = 5 * 60 * 1000

function holderRevokeNonceKey(credentialId: string, holderDid: string): string {
  return `${credentialId}:${holderDid}`
}
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
  if (!record || record.state !== 'requested' || !record.vpAccepted) return

  const requestedAt = Date.parse(record.updatedAt)
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
  holderRevokeNonces.clear()
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
    if (record.state !== 'requested' || !record.vpAccepted) continue
    if (now - Date.parse(record.updatedAt) < delayMs) continue
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

devWalletRouter.post('/issuer/holder-revoke/nonce', (req, res) => {
  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''
  const holderDid =
    typeof req.body?.holderDid === 'string' ? req.body.holderDid.trim() : ''

  if (!credentialId || !holderDid) {
    res.status(400).json({ message: 'credentialId and holderDid are required' })
    return
  }

  const nonce = `holder-revoke-${credentialId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const expiresAt = new Date(Date.now() + DEV_HOLDER_REVOKE_NONCE_TTL_MS).toISOString()
  const record: DevHolderRevokeNonceRecord = {
    credentialId,
    holderDid,
    nonce,
    audience: DEV_HOLDER_REVOKE_AUDIENCE,
    expiresAt,
  }
  holderRevokeNonces.set(holderRevokeNonceKey(credentialId, holderDid), record)
  res.status(201).json({
    nonce,
    audience: DEV_HOLDER_REVOKE_AUDIENCE,
    expiresAt,
  })
})

devWalletRouter.post('/issuer/holder-revoke', (req, res) => {
  const credentialId =
    typeof req.body?.credentialId === 'string' ? req.body.credentialId.trim() : ''
  const holderDid =
    typeof req.body?.holderDid === 'string' ? req.body.holderDid.trim() : ''
  const popJwt =
    typeof req.body?.popJwt === 'string' ? req.body.popJwt.trim() : ''

  if (!credentialId || !holderDid || !popJwt) {
    res.status(400).json({ message: 'credentialId, holderDid, and popJwt are required' })
    return
  }

  const nonceRecord = holderRevokeNonces.get(holderRevokeNonceKey(credentialId, holderDid))
  if (!nonceRecord) {
    res.status(400).json({ message: 'Holder revoke nonce not found or expired' })
    return
  }

  if (Date.parse(nonceRecord.expiresAt) < Date.now()) {
    holderRevokeNonces.delete(holderRevokeNonceKey(credentialId, holderDid))
    res.status(400).json({ message: 'Holder revoke nonce expired' })
    return
  }

  const verification = verifyHolderRevokePop(popJwt, {
    holderDid,
    credentialId,
    nonce: nonceRecord.nonce,
    audience: nonceRecord.audience,
  })
  if (!verification.ok) {
    res.status(400).json({ message: `Holder PoP verification failed: ${verification.reason}` })
    return
  }

  holderRevokeNonces.delete(holderRevokeNonceKey(credentialId, holderDid))

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
    if (message === 'IssuerBaseUrlMissing') {
      res.status(503).json({ message: 'ISSUER_BASE_URL is not configured' })
      return
    }
    res.status(502).json({ message: 'Renewal offer creation failed' })
    return
  }

  const updatedAt = new Date().toISOString()
  const publicBaseUrl = readRenewalPublicBaseUrl(req)
  const responseUri = `${publicBaseUrl}/wallet-api/dev/wallet/renewal-vp/response`
  const nonce = `renewal-nonce-${credentialId}-${Date.now()}`
  const authorizationRequest = buildRenewalAuthorizationRequest({
    credentialId,
    credentialType,
    rawVc,
    responseUri,
    nonce,
  })

  renewals.set(credentialId, {
    credentialId,
    credentialType,
    oldHolderDid,
    newHolderDid,
    state: 'requested',
    rawVc,
    offerUri,
    authorizationRequest,
    nonce,
    vpAccepted: false,
    requestedAt: updatedAt,
    updatedAt,
  })

  void sendCredentialEventPush(
    'renewal-required',
    newHolderDid,
    credentialId,
    credentialType,
  ).catch(() => undefined)

  res.status(201).json({
    accepted: true,
    authorizationRequest,
  })
})

devWalletRouter.post('/wallet/renewal-vp/response', (req, res) => {
  const vpToken =
    typeof req.body?.vp_token === 'string'
      ? req.body.vp_token
      : typeof req.body?.vp_token === 'object' && req.body?.vp_token !== null
        ? JSON.stringify(req.body.vp_token)
        : ''
  const state = typeof req.body?.state === 'string' ? req.body.state.trim() : ''

  if (!vpToken || !state) {
    res.status(400).json({ message: 'vp_token and state are required' })
    return
  }

  const record = renewals.get(state)
  if (!record) {
    res.status(404).json({ message: 'Renewal session not found' })
    return
  }

  if (record.state !== 'requested') {
    res.status(409).json({ message: 'Renewal session is not awaiting VP' })
    return
  }

  if (!isDevAcceptableRenewalVpToken(vpToken, record.oldHolderDid)) {
    res.status(400).json({ message: 'VP verification failed' })
    return
  }

  const updatedAt = new Date().toISOString()
  renewals.set(state, {
    ...record,
    vpAccepted: true,
    updatedAt,
  })
  scheduleRenewalReadyTransition(state)

  res.status(200).json({ status: 'verified' })
})

function readRenewalPublicBaseUrl(req: { protocol: string; get: (name: string) => string | undefined; headers: Record<string, unknown> }): string {
  const envBase =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.VERIFIER_PRESENTATION_BASE_URL?.trim() ||
    process.env.PRESENTATION_GATEWAY_BASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL?.trim()
  if (envBase) return envBase.replace(/\/$/, '')

  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto'].split(',')[0]?.trim()
    : undefined
  const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string'
    ? req.headers['x-forwarded-host'].split(',')[0]?.trim()
    : undefined
  const proto = forwardedProto || req.protocol || 'http'
  const host = forwardedHost || req.get('host') || 'localhost:4000'
  return `${proto}://${host}`
}

function buildRenewalAuthorizationRequest(input: {
  credentialId: string
  credentialType: string
  rawVc: string
  responseUri: string
  nonce: string
}): string {
  const typeValue = mapCredentialTypeToDcqlTypeValue(input.credentialType)
  const format = input.rawVc.includes('~') ? 'dc+sd-jwt' : 'jwt_vc_json'
  const params = new URLSearchParams({
    response_type: 'vp_token',
    client_id: `redirect_uri:${input.responseUri}`,
    response_mode: 'direct_post',
    response_uri: input.responseUri,
    nonce: input.nonce,
    state: input.credentialId,
    dcql_query: JSON.stringify({
      credentials: [
        {
          id: 'renewal_old_vc',
          format,
          meta: { type_values: [typeValue] },
        },
      ],
    }),
  })
  return `openid4vp://authorize?${params.toString()}`
}

function mapCredentialTypeToDcqlTypeValue(credentialType: string): string {
  switch (credentialType) {
    case 'ThaiNationalID':
      return 'IDCardCredential'
    case 'DLTDrivingLicence':
      return 'DrivingLicence'
    case 'BangkokUniversityTranscript':
    case 'UniversityTranscript':
      return 'Transcript'
    default:
      return credentialType
  }
}

function isDevAcceptableRenewalVpToken(vpToken: string, oldHolderDid: string): boolean {
  if (vpToken.trim().length < 10) return false

  // Dev stub: accept JWT VP or SD-JWT+KB shapes. Prefer oldHolderDid presence when payload is readable.
  try {
    if (vpToken.includes('~')) {
      return vpToken.split('~').length >= 2
    }

    if (vpToken.trim().startsWith('{')) {
      const parsed = JSON.parse(vpToken) as Record<string, unknown>
      const values = Object.values(parsed)
      return values.some((value) => typeof value === 'string' || Array.isArray(value))
    }

    const parts = vpToken.split('.')
    if (parts.length === 3 && parts[1]) {
      const payloadJson = Buffer.from(
        parts[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8')
      if (payloadJson.includes(oldHolderDid)) return true
      // Compact JWT VP without embedded DID string still accepted in local stub after shape check.
      return true
    }
  } catch {
    return false
  }

  return false
}
