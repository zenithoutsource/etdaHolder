import { createPrivateKey, createPublicKey } from 'crypto'

export const issuingAuthorityCertificatePem = `-----BEGIN CERTIFICATE-----
MIIBrzCCAVWgAwIBAgIQce6weeUysoJCls4psGAxkzAKBggqhkjOPQQDAjBAMQswCQYDVQQGEwJU
SDEYMBYGA1UECgwPRVREQSBXYWxsZXQgRGV2MRcwFQYDVQQDDA5FVERBIFRlc3QgSUFDQTAeFw0y
NjA2MjUwMjQ1MTVaFw0zNjA2MjUwMjU1MTVaMEAxCzAJBgNVBAYTAlRIMRgwFgYDVQQKDA9FVERB
IFdhbGxldCBEZXYxFzAVBgNVBAMMDkVUREEgVGVzdCBJQUNBMFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEGCiGS6AeC23wS/Nkr8saNFhNo7Y5oIM2ipVwuyNWDwchvUV8AJfCxxsilVaqkF9G9JLb
RMEYLzoH77WWVwcu0aMxMC8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBQIdiCQkbh9stVtCkn1
eAKG3YE0pTAKBggqhkjOPQQDAgNIADBFAiEApZlbo6+1BnFjix+7F3bqnXAHTOZjutUFlawhK0fH
aE8CIBVOtW+U/nOLY20Iia21GL5mXzXAzs10753VuNbpcnPq
-----END CERTIFICATE-----`

export const documentSignerCertificatePem = `-----BEGIN CERTIFICATE-----
MIIB4jCCAYegAwIBAgIQEZgK0BQlS7tB9uJe4xY7ujAKBggqhkjOPQQDAjBAMQswCQYDVQQGEwJU
SDEYMBYGA1UECgwPRVREQSBXYWxsZXQgRGV2MRcwFQYDVQQDDA5FVERBIFRlc3QgSUFDQTAeFw0y
NjA2MjUwMjQ1MTZaFw0zMTA2MjUwMjU1MTZaMEMxCzAJBgNVBAYTAlRIMRgwFgYDVQQKDA9FVERB
IFdhbGxldCBEZXYxGjAYBgNVBAMMEUVUREEgVGVzdCBtZG9jIERTMFkwEwYHKoZIzj0CAQYIKoZI
zj0DAQcDQgAEleVLHldsix/MKN3l9egNdGlVHNX1RqYZ49XyfIx+axEjFTFWlIOFH7R1/ZyrLC+d
xAIyQg2UmWIOgda65zrDCaNgMF4wDgYDVR0PAQH/BAQDAgeAMAwGA1UdEwEB/wQCMAAwHwYDVR0j
BBgwFoAUCHYgkJG4fbLVbQpJ9XgCht2BNKUwHQYDVR0OBBYEFNLIxsvTa59ngkKN+svgHtuRkMne
MAoGCCqGSM49BAMCA0kAMEYCIQC46sFgJmLVGmlScCL1GG3rqu5FJiHeWCuyD4wge120LAIhAJsP
/NKj5+hw2RL469tepvO7MmNixUCEG+7+pjGOb2X3
-----END CERTIFICATE-----`

export const documentSignerPrivateKeyPem = `-----BEGIN PRIVATE KEY-----
MIGiAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgVk6VEVhorhm/Ky0KEIvOXsE1MJqw
iBdhIzmHtqTKZAWgCgYIKoZIzj0DAQehRANCAASV5UseV2yLH8wo3eX16A10aVUc1fVGphnj1fJ8
jH5rESMVMVaUg4UftHX9nKssL53EAjJCDZSZYg6B1rrnOsMJoA0wCwYDVR0PMQQDAgCA
-----END PRIVATE KEY-----`

function pemToDer(pem: string): Buffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')

  return Buffer.from(base64, 'base64')
}

export const issuingAuthorityCertificateDer = pemToDer(issuingAuthorityCertificatePem)
export const documentSignerCertificateDer = pemToDer(documentSignerCertificatePem)

function base64UrlToBuffer(value: string | undefined, field: string): Buffer {
  if (!value) throw new Error(`FixtureInvalid: missing ${field}`)
  return Buffer.from(value, 'base64url')
}

// Separate deterministic device key — distinct from document signer
export const deviceKeyPem = (() => {
  const keyObject = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex'),
      Buffer.from('a94e3a26b83b52c82d14dc3eee5e543bc21c1219e2de7e86b5e21e2e3e5dff01', 'hex'),
    ]),
    format: 'der',
    type: 'pkcs8',
  })
  return keyObject.export({ format: 'pem', type: 'pkcs8' }) as string
})()

const deviceKeyJwk = createPublicKey(deviceKeyPem).export({ format: 'jwk' }) as JsonWebKey

export const deviceKeyCose = new Map<number, number | Buffer>([
  [1, 2],
  [3, -7],
  [-1, 1],
  [-2, base64UrlToBuffer(deviceKeyJwk.x, 'x')],
  [-3, base64UrlToBuffer(deviceKeyJwk.y, 'y')],
])
