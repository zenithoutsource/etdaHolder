import { sendExpoPush } from './expoPushClient'

const payload = {
  title: 'Title',
  body: 'Body',
  data: {
    event: 'renewal-ready' as const,
    credentialId: 'cred-1',
    credentialType: 'ThaiNationalID',
  },
}

describe('sendExpoPush', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  test('logs ticket status when Expo returns a single ticket object', async () => {
    const infoMock = jest.spyOn(console, 'info').mockImplementation(() => undefined)
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await sendExpoPush('ExponentPushToken[device-1]', payload, fetchMock)

    expect(infoMock).toHaveBeenCalledWith('[push-notifications] expo-ticket', {
      status: 'ok',
      id: 'ticket-1',
      message: undefined,
      details: undefined,
    })
  })

  test('logs ticket errors when Expo returns a single error object', async () => {
    const errorMock = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: 'error',
            message: 'DeviceNotRegistered',
            details: { error: 'DeviceNotRegistered' },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    await sendExpoPush('ExponentPushToken[device-1]', payload, fetchMock)

    expect(errorMock).toHaveBeenCalledWith('[push-notifications] expo-ticket-error', {
      message: 'DeviceNotRegistered',
      details: { error: 'DeviceNotRegistered' },
    })
  })
})
