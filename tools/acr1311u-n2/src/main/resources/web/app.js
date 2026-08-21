const engagementEl = document.getElementById('engagement')
const statusEl = document.getElementById('status')
const resultEl = document.getElementById('result')
const claimsEl = document.getElementById('claims')
const verifyBannerEl = document.getElementById('verifyBanner')
const previewEl = document.getElementById('preview')
const presentBtn = document.getElementById('present')
const scanBtn = document.getElementById('scan')
const labEl = document.getElementById('lab')

let scanStream = null

function setStatus(text, kind) {
  statusEl.textContent = text
  statusEl.className = kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'muted'
}

presentBtn.addEventListener('click', async () => {
  const engagement = engagementEl.value.trim()
  presentBtn.disabled = true
  resultEl.hidden = true
  setStatus(
    engagement
      ? 'Waiting for tap on ACR1311… keep the wallet screen on.'
      : 'Waiting for tap on ACR1311… hold the phone still.',
    'muted',
  )
  try {
    const payload = engagement ? { engagement } : {}
    const response = await fetch('/api/present', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json()
    if (!body.ok) {
      setStatus(body.message || 'Presentment failed', 'err')
      return
    }
    const CLAIM_LABELS = {
      given_name: 'ชื่อ',
      family_name: 'นามสกุล',
      birth_date: 'วันเดือนปีเกิด',
      age_over_18: 'อายุเกิน 18',
      driving_privileges: 'ประเภทใบอนุญาต',
      issue_date: 'วันที่ออกใบอนุญาต',
      expiry_date: 'วันหมดอายุ',
    }
    const CLAIM_ORDER = [
      'given_name',
      'family_name',
      'birth_date',
      'age_over_18',
      'driving_privileges',
      'issue_date',
      'expiry_date',
    ]
    const OMITTED_COPY = 'ผู้ถือบัตรไม่ยินยอมเปิดเผย'
    const NOT_SENT = 'ไม่ได้ส่ง'
    claimsEl.innerHTML = ''
    const claims = body.claims || {}
    CLAIM_ORDER.forEach((key) => {
      if (claims[key] == null || claims[key] === '') return
      const dt = document.createElement('dt')
      dt.textContent = CLAIM_LABELS[key] || key
      const dd = document.createElement('dd')
      dd.textContent = claims[key]
      claimsEl.append(dt, dd)
    })
    ;(body.omittedFields || []).forEach((row) => {
      if (!row || row.key === 'age_over_18') return
      if (claims[row.key] != null && claims[row.key] !== '') return
      const dt = document.createElement('dt')
      dt.textContent = CLAIM_LABELS[row.key] || row.key
      const dd = document.createElement('dd')
      dd.className = 'omitted'
      dd.textContent = NOT_SENT + ' — ' + OMITTED_COPY
      claimsEl.append(dt, dd)
    })
    verifyBannerEl.hidden = true
    resultEl.hidden = false
    setStatus('DeviceResponse received.', 'ok')
  } catch (error) {
    setStatus(error.message || 'Request failed', 'err')
  } finally {
    presentBtn.disabled = false
  }
})

scanBtn.addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) {
    setStatus('This browser has no BarcodeDetector. Paste the mdoc: QR instead.', 'err')
    return
  }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] })
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    previewEl.srcObject = scanStream
    previewEl.hidden = false
    await previewEl.play()
    setStatus('Point the camera at the wallet Waiting for tap QR.', 'muted')
    const timer = setInterval(async () => {
      try {
        const codes = await detector.detect(previewEl)
        const raw = codes[0] && (codes[0].rawValue || codes[0].rawValue === '' ? codes[0].rawValue : null)
        if (raw && String(raw).startsWith('mdoc')) {
          engagementEl.value = String(raw)
          labEl.open = true
          clearInterval(timer)
          stopScan()
          setStatus('QR captured. Click Wait for tap, then hold the phone to the reader.', 'ok')
        }
      } catch (_) {
        /* keep scanning */
      }
    }, 400)
  } catch (error) {
    setStatus(error.message || 'Camera unavailable. Paste the QR instead.', 'err')
  }
})

function stopScan() {
  if (!scanStream) return
  scanStream.getTracks().forEach((track) => track.stop())
  scanStream = null
  previewEl.hidden = true
}
