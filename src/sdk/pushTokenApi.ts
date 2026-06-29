import { toErrorMessage } from '@/src/utils/jwtUtils'

export async function registerPushToken(token: string, holderDid: string): Promise<void> {
  const response = await fetch('/wallet-api/wallet/push-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      holderDid,
    }),
  })

  if (!response.ok) {
    throw new Error(`PushTokenRegistrationFailed: HTTP ${response.status}`)
  }

  try {
    await response.json()
  } catch (error) {
    throw new Error(`PushTokenRegistrationFailed: ${toErrorMessage(error)}`)
  }
}
