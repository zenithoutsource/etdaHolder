const http = require('http')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const scriptPath = path.join(__dirname, 'generate-oid4vci-pop-jwt.mjs')
const FIXED_SEED = '11'.repeat(32)

function runGenerate(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
  })
}

function runGenerateAsync(args, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args])
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`generate script timed out: ${args.join(' ')}`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    })
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

    expect(output.credentialRequest).toEqual({
      credential_configuration_id: 'org.iso.18013.5.1.mDL',
      proofs: { jwt: [output.proofJwt] },
    })
    expect(output.credentialRequests).toEqual({
      mso_mdoc: output.credentialRequest,
    })
    expect(output.credentialRequest).not.toHaveProperty('doctype')
    expect(output.credentialRequest).not.toHaveProperty('format')
    expect(output.credentialRequest).not.toHaveProperty('proof')
    expect(output.swaggerUsage.join(' ')).toMatch(/single-use|burns the token nonce/)
  })

  test('trims quoted nonce values copied from Swagger JSON', () => {
    const result = runGenerate([
      '--nonce="c-nonce-1"',
      `--seed=${FIXED_SEED}`,
    ])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).nonce).toBe('c-nonce-1')
  })

  test('--format=both keeps both bodies and warns the nonce cannot be posted twice', () => {
    const result = runGenerate([
      '--nonce=c-nonce-1',
      '--format=both',
      `--seed=${FIXED_SEED}`,
    ])
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.credentialRequests['dc+sd-jwt'].proofs.jwt).toEqual([output.proofJwt])
    expect(output.credentialRequests.mso_mdoc.proofs.jwt).toEqual([output.proofJwt])
    expect(output.sameNonceCannotBePostedTwice).toBe(true)
  })

  test('--fetch-nonce uses c_nonce from POST /nonce', async () => {
    let authorization
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/nonce') {
        authorization = req.headers.authorization
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ c_nonce: 'from-endpoint' }))
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    try {
      const withoutToken = await runGenerateAsync([
        '--fetch-nonce',
        `--nonce-endpoint=http://127.0.0.1:${port}/nonce`,
        `--seed=${FIXED_SEED}`,
      ])
      expect(withoutToken.status).toBe(0)
      expect(JSON.parse(withoutToken.stdout).nonce).toBe('from-endpoint')
      expect(authorization).toBeUndefined()

      const withToken = await runGenerateAsync([
        '--fetch-nonce',
        '--access-token=swagger-access-token',
        `--nonce-endpoint=http://127.0.0.1:${port}/nonce`,
        `--seed=${FIXED_SEED}`,
      ])
      expect(withToken.status).toBe(0)
      expect(JSON.parse(withToken.stdout).accessToken).toBeUndefined()
      expect(authorization).toBe('Bearer swagger-access-token')
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
