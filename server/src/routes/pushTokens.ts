import { Router } from 'express'

const pushTokensByHolderDid = new Map<string, string>()

export function resetPushTokens(): void {
  pushTokensByHolderDid.clear()
}

export function readPushToken(holderDid: string): string | undefined {
  return pushTokensByHolderDid.get(holderDid)
}

export const pushTokensRouter = Router()

pushTokensRouter.post('/push-token', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const holderDid = typeof req.body?.holderDid === 'string' ? req.body.holderDid.trim() : ''

  if (!token || !holderDid) {
    res.status(400).json({ message: 'token and holderDid are required' })
    return
  }

  pushTokensByHolderDid.set(holderDid, token)
  console.info('[push-notifications] token-registered', {
    holderDidLength: holderDid.length,
    tokenLength: token.length,
  })
  res.status(200).json({ ok: true })
})
