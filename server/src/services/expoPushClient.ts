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
  channelId: 'default'
  sound: 'default'
  priority: 'high'
}

type ExpoPushTicket = {
  status?: string
  id?: string
  message?: string
  details?: unknown
}

type ExpoPushApiResponse = {
  data?: ExpoPushTicket | ExpoPushTicket[]
}

function readFirstExpoTicket(body: ExpoPushApiResponse): ExpoPushTicket | undefined {
  if (Array.isArray(body.data)) {
    return body.data[0]
  }

  return body.data
}

export async function sendExpoPush(
  token: string,
  payload: ExpoPushPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const message: ExpoPushMessage = {
    to: token,
    ...payload,
    channelId: 'default',
    sound: 'default',
    priority: 'high',
  }

  console.info('[push-notifications] expo-send-start', {
    event: payload.data.event,
    credentialId: payload.data.credentialId,
    credentialType: payload.data.credentialType,
    tokenLength: token.length,
  })

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
  const ticket = readFirstExpoTicket(body)
  console.info('[push-notifications] expo-ticket', {
    status: ticket?.status,
    id: ticket?.id,
    message: ticket?.message,
    details: ticket?.details,
  })
  if (ticket?.status === 'error') {
    console.error('[push-notifications] expo-ticket-error', {
      message: ticket.message,
      details: ticket.details,
    })
  }
}
