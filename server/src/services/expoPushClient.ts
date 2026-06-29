export type ExpoPushEvent =
  | 'renewal-ready'
  | 'renewal-required'
  | 'issuer-suspended'
  | 'cleanup-pending'
  | 'old-revoked'

export type ExpoPushPayload = {
  title: string
  body: string
  data: {
    event: ExpoPushEvent
    credentialId: string
    credentialType: string
  }
}

type ExpoPushMessage = ExpoPushPayload & {
  to: string
  sound: 'default'
  priority: 'high'
}

type ExpoPushApiResponse = {
  data?: {
    status?: string
    message?: string
    details?: unknown
  }[]
}

export async function sendExpoPush(
  token: string,
  payload: ExpoPushPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const message: ExpoPushMessage = {
    to: token,
    ...payload,
    sound: 'default',
    priority: 'high',
  }

  const response = await fetchImpl('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  if (!response.ok) {
    throw new Error(`ExpoPushSendFailed: HTTP ${response.status}`)
  }

  const body = (await response.json()) as ExpoPushApiResponse
  const ticket = body.data?.[0]
  if (ticket?.status === 'error') {
    console.error('[push-notifications] expo-ticket-error', {
      message: ticket.message,
      details: ticket.details,
    })
  }
}
