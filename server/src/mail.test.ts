jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => ({ messageId: 'test-message-id' })),
  })),
}))

import nodemailer from 'nodemailer'

import { resetMailTransportForTests, sendPinResetOtp } from './mail'

const ORIGINAL_ENV = process.env
const createTransportMock = nodemailer.createTransport as jest.Mock
const sendMailMock = jest.fn(async () => ({ messageId: 'test-message-id' }))

describe('sendPinResetOtp', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' }
    resetMailTransportForTests()
    createTransportMock.mockClear()
    sendMailMock.mockClear()
    createTransportMock.mockReturnValue({ sendMail: sendMailMock })
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
    resetMailTransportForTests()
  })

  test('logs OTP to console when SMTP is not configured', async () => {
    delete process.env.SMTP_HOST
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)

    await sendPinResetOtp('user@example.com', '482910')

    expect(createTransportMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('[pin-reset] SMTP not configured. OTP for user@example.com: 482910')
    logSpy.mockRestore()
  })

  test('sends email when SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = '587'
    process.env.SMTP_SECURE = 'false'
    process.env.SMTP_USER = 'wallet@example.com'
    process.env.SMTP_PASSWORD = 'secret'
    process.env.MAIL_FROM = 'wallet-noreply@example.com'
    process.env.MAIL_FROM_NAME = 'Wallet'
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)

    await sendPinResetOtp('user@example.com', '482910')

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'wallet@example.com', pass: 'secret' },
    })
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Wallet" <wallet-noreply@example.com>',
        to: 'user@example.com',
        subject: 'Wallet PIN reset code',
        text: expect.stringContaining('482910'),
        html: expect.stringContaining('482910'),
      }),
    )
    expect(logSpy).toHaveBeenCalledWith('[pin-reset] OTP email sent to user@example.com')
    logSpy.mockRestore()
  })
})
