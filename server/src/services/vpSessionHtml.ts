import type { VerifiedVpClaim } from './sdJwtVerifier'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.5rem; }
    .muted { color: #666; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    td, th { border: 1px solid #ddd; padding: 0.5rem; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    .ok { color: #0a7a32; }
    .err { color: #b42318; }
  </style>
</head>
<body>${body}</body>
</html>`
}

export function renderVpSuccessHtml(input: {
  credentialType: string
  issuerName: string
  presentedAt: string
  claims: VerifiedVpClaim[]
}): string {
  const rows = input.claims
    .map((claim) => `<tr><th>${escapeHtml(claim.label)}</th><td>${escapeHtml(claim.value)}</td></tr>`)
    .join('')
  return pageShell(
    'ยืนยันแล้ว',
    `<h1 class="ok">✓ ยืนยันแล้ว</h1>
<p class="muted">${escapeHtml(input.credentialType)} · ${escapeHtml(input.issuerName)}</p>
<p class="muted">Presented at ${escapeHtml(input.presentedAt)}</p>
<table><tbody>${rows}</tbody></table>`,
  )
}

export function renderVpErrorHtml(message: string, reason?: string): string {
  const reasonLine = reason ? `<p class="muted">Reason: ${escapeHtml(reason)}</p>` : ''
  return pageShell('ไม่ผ่านการตรวจสอบ', `<h1 class="err">✗ ${escapeHtml(message)}</h1>${reasonLine}`)
}

export function renderVpConsumedHtml(): string {
  return pageShell('QR ถูกใช้แล้ว', '<h1 class="err">QR นี้ถูกใช้แล้ว</h1>')
}

export function renderVpPendingHtml(): string {
  return pageShell(
    'รอ Wallet',
    '<h1>รอ Wallet อัปโหลด VP…</h1><p class="muted">ลองรีเฟรชในอีกสักครู่</p>',
  )
}
