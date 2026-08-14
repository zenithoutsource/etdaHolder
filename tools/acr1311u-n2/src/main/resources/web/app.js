const engagementEl = document.getElementById('engagement')
const statusEl = document.getElementById('status')
const resultEl = document.getElementById('result')
const claimsEl = document.getElementById('claims')
const verifyBannerEl = document.getElementById('verifyBanner')
const previewEl = document.getElementById('preview')
const presentBtn = document.getElementById('present')
const scanBtn = document.getElementById('scan')

let scanStream = null

function setStatus(text, kind) {
  statusEl.textContent = text
  statusEl.className = kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'muted'
}

presentBtn.addEventListener('click', async () => {
  const engagement = engagementEl.value.trim()
  if (!engagement) {
    setStatus('Paste or scan the wallet Waiting for tap QR first.', 'err')
    return
  }
  presentBtn.disabled = true
  resultEl.hidden = true
  setStatus('Waiting for tap on ACR1311… keep the wallet screen on.', 'muted')
  try {
    const response = await fetch('/api/present', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engagement }),
    })
    const body = await response.json()
    if (!body.ok) {
      setStatus(body.message || 'Presentment failed', 'err')
      return
    }
    claimsEl.innerHTML = ''
    const claims = body.claims || {}
    ;['family_name', 'given_name', 'birth_date'].forEach((key) => {
      const dt = document.createElement('dt')
      dt.textContent = key
      const dd = document.createElement('dd')
      dd.textContent = claims[key] || '(missing)'
      claimsEl.append(dt, dd)
    })
    verifyBannerEl.hidden = Boolean(body.issuerAttestationVerified)
    verifyBannerEl.textContent = body.diagnostic || 'Issuer attestation not verified.'
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
