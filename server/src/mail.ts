import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

import { readConfig } from './config'

let transport: Transporter | null | undefined

function getTransport(): Transporter | null {
  if (transport !== undefined) {
    return transport
  }

  const { mail } = readConfig()
  if (!mail.smtpHost) {
    transport = null
    return null
  }

  transport = nodemailer.createTransport({
    host: mail.smtpHost,
    port: mail.smtpPort,
    secure: mail.smtpSecure,
    auth:
      mail.smtpUser && mail.smtpPassword
        ? {
            user: mail.smtpUser,
            pass: mail.smtpPassword,
          }
        : undefined,
  })
  return transport
}

function buildPinResetContent(otp: string): { subject: string; text: string; html: string } {
  const subject = 'ETDA Wallet PIN reset code'
  const text = [
    'Your ETDA Wallet verification code is:',
    '',
    otp,
    '',
    'This code expires in 10 minutes.',
    'If you did not request a PIN reset, you can ignore this email.',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1a2a42">
      <h2 style="margin:0 0 12px;color:#002887">ETDA Wallet</h2>
      <p style="margin:0 0 16px">Use this verification code to reset your wallet PIN:</p>
      <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p>
      <p style="margin:0 0 8px;color:#6d7a8d">This code expires in 10 minutes.</p>
      <p style="margin:0;color:#6d7a8d">If you did not request a PIN reset, you can ignore this email.</p>
    </div>
  `.trim()

  return { subject, text, html }
}

export async function sendPinResetOtp(email: string, otp: string): Promise<void> {
  const { mail } = readConfig()
  const { subject, text, html } = buildPinResetContent(otp)
  const transporter = getTransport()

  if (!transporter) {
    console.info(`[pin-reset] SMTP not configured. OTP for ${email}: ${otp}`)
    return
  }

  await transporter.sendMail({
    from: `"${mail.fromName}" <${mail.fromAddress}>`,
    to: email,
    subject,
    text,
    html,
  })

  console.info(`[pin-reset] OTP email sent to ${email}`)
}

export function resetMailTransportForTests(): void {
  transport = undefined
}
