import {
  renderVpExpiredHtml,
  renderVpPendingHtml,
  renderVpSuccessHtml,
  VP_HTML_CONTENT_TYPE,
} from './vpSessionHtml'

test('VP_HTML_CONTENT_TYPE includes utf-8 charset', () => {
  expect(VP_HTML_CONTENT_TYPE).toBe('text/html; charset=utf-8')
})

test('HTML templates declare UTF-8 charset in head', () => {
  for (const html of [
    renderVpPendingHtml(),
    renderVpExpiredHtml(),
    renderVpSuccessHtml({
      credentialType: 'ThaiNationalID',
      issuerName: 'Issuer',
      presentedAt: '2026-07-09T00:00:00.000Z',
      claims: [{ label: 'ชื่อ', value: 'ทดสอบ' }],
    }),
  ]) {
    expect(html).toContain('<meta charset="utf-8" />')
    expect(html).toContain('content="text/html; charset=utf-8"')
    expect(html).toContain('lang="th"')
  }
})

test('renderVpExpiredHtml shows expiry copy without success marker', () => {
  const html = renderVpExpiredHtml()
  expect(html).toContain('QR หมดอายุ')
  expect(html).not.toContain('ยืนยันแล้ว')
})
