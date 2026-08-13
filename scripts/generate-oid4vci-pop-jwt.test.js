const path = require('path')
const { spawnSync } = require('child_process')

const scriptPath = path.join(__dirname, 'generate-oid4vci-pop-jwt.mjs')
const FIXED_SEED = '11'.repeat(32)

function runGenerate(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
  })
}

function decodeJwtPart(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
}

describe('generate-oid4vci-pop-jwt', () => {
  test('defaults to driving-licence hardware PoP (ES256 jwk+kid) and OID4VCI 1.0 request bodies', () => {
    const result = runGenerate([
      '--nonce=c-nonce-1',
      `--seed=${FIXED_SEED}`,
    ])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')

    const output = JSON.parse(result.stdout)
    expect(output.alg).toBe('ES256')
    expect(output.keyBinding).toBe('jwk')
    expect(output.audience).toBe('https://issuer.zenithcomp.co.th:455')
    expect(output.nonce).toBe('c-nonce-1')

    const [headerB64, payloadB64] = output.proofJwt.split('.')
    const header = decodeJwtPart(headerB64)
    const payload = decodeJwtPart(payloadB64)

    expect(header).toEqual({
      alg: 'ES256',
      typ: 'openid4vci-proof+jwt',
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: expect.any(String),
        y: expect.any(String),
      },
      kid: output.kid,
    })
    expect(header).not.toHaveProperty('cose_key')
    expect(header.kid).toMatch(/^did:key:zDnae.+#zDnae/)
    expect(header.jwk).toEqual(output.publicJwk)

    expect(payload).toEqual({
      aud: 'https://issuer.zenithcomp.co.th:455',
      iat: output.iat,
      nonce: 'c-nonce-1',
    })
    expect(payload).not.toHaveProperty('iss')
    expect(payload).not.toHaveProperty('sub')

    expect(output.header).toEqual(header)
    expect(output.payload).toEqual(payload)

    expect(output.credentialRequests['dc+sd-jwt']).toEqual({
      credential_configuration_id: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
      proofs: { jwt: [output.proofJwt] },
    })
    expect(output.credentialRequests.mso_mdoc).toEqual({
      credential_configuration_id: 'org.iso.18013.5.1.mDL',
      proofs: { jwt: [output.proofJwt] },
    })
    expect(output.credentialRequests.mso_mdoc).not.toHaveProperty('doctype')
    expect(output.credentialRequests.mso_mdoc).not.toHaveProperty('format')
    expect(output.credentialRequests.mso_mdoc).not.toHaveProperty('proof')
  })
})
