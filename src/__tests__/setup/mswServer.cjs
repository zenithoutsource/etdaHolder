const { createRequire } = require('module')

function createMswHandlers() {
  const mswPackageJson = require.resolve('msw/package.json')
  const mswRoot = mswPackageJson.replace(/package\.json$/, '')
  const requireMswLib = createRequire(mswPackageJson)

  const { http } = requireMswLib(`${mswRoot}lib/core/http.js`)
  const { HttpResponse } = requireMswLib(`${mswRoot}lib/core/HttpResponse.js`)

  const walletApiHandlers = [
    http.post('/wallet-api/wallet/:walletId/credentials/import', () =>
      HttpResponse.json({ id: 'mock-credential-id' }, { status: 201 }),
    ),
  ]

  const issuerHandlers = [
    http.get('https://issuer.example.com/.well-known/openid-credential-issuer', () =>
      HttpResponse.json({
        credential_issuer: 'https://issuer.example.com',
        credential_endpoint: 'https://issuer.example.com/credential',
        credential_configurations_supported: {
          ThaiNationalID: {
            format: 'jwt_vc_json',
            credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
            display: [{ name: 'Thai National ID', locale: 'en' }],
          },
        },
      }),
    ),
    http.post('https://issuer.example.com/token', () =>
      HttpResponse.json({
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        c_nonce: 'mock-c-nonce',
      }),
    ),
    http.post('https://issuer.example.com/credential', () =>
      HttpResponse.json({
        credentials: [{ credential: 'eyJhbGciOiJFUzI1NiJ9.mock.signature' }],
        format: 'jwt_vc_json',
      }),
    ),
  ]

  const verifierHandlers = [
    http.post('https://issuer.example.com/oid4vp/direct-post', async ({ request }) => {
      const body = await request.text()
      if (!body.includes('vp_token')) {
        return HttpResponse.json({ error: 'invalid_request' }, { status: 400 })
      }
      return HttpResponse.json({ status: 'accepted' }, { status: 200 })
    }),
    http.post('https://verifier.example.com/oid4vp/direct-post', async () =>
      HttpResponse.json({ status: 'verified' }, { status: 200 }),
    ),
  ]

  return [...walletApiHandlers, ...issuerHandlers, ...verifierHandlers]
}

function createMswServer() {
  const mswPackageJson = require.resolve('msw/package.json')
  const mswRoot = mswPackageJson.replace(/package\.json$/, '')
  const requireMswLib = createRequire(mswPackageJson)
  const { setupServer } = requireMswLib(`${mswRoot}lib/node/index.js`)

  return setupServer(...createMswHandlers())
}

module.exports = { createMswHandlers, createMswServer }
