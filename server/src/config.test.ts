import { readConfig } from './config'

const ORIGINAL_ENV = process.env

const TEST_ISSUER_PUBLIC_KEY_JWK = JSON.stringify({
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
})

describe('server config', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, VP_ISSUER_PUBLIC_KEY_JWK: TEST_ISSUER_PUBLIC_KEY_JWK }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('allows deterministic default JWT secret only in tests', () => {
    delete process.env.JWT_SECRET
    process.env = { ...process.env, NODE_ENV: 'test', VP_ISSUER_PUBLIC_KEY_JWK: TEST_ISSUER_PUBLIC_KEY_JWK }

    expect(readConfig().jwtSecret).toBe('local-dev-change-me')
  })

  test('rejects default JWT secret for real local runs', () => {
    delete process.env.JWT_SECRET
    process.env = { ...process.env, NODE_ENV: 'development', VP_ISSUER_PUBLIC_KEY_JWK: TEST_ISSUER_PUBLIC_KEY_JWK }

    expect(() => readConfig()).toThrow('ConfigInvalid: JWT_SECRET')
  })

  test('reads VP session TTL and issuer key from env', () => {
    process.env.VP_SESSION_TTL_MS = '120000'
    process.env.VP_ISSUER_PUBLIC_KEY_JWK = TEST_ISSUER_PUBLIC_KEY_JWK
    const config = readConfig()
    expect(config.vpSessionTtlMs).toBe(120_000)
    expect(config.vpIssuerPublicKeyJwk?.crv).toBe('Ed25519')
  })

  test('reads verifier presentation config from env', () => {
    process.env.VERIFIER_PRESENTATION_BASE_URL = 'https://verifier.example'
    const config = readConfig()
    expect(config.verifierPresentationBaseUrl).toBe('https://verifier.example')
    expect(config.presentationGatewayBaseUrl).toBe('https://verifier.example')
  })

  test('reads presentation gateway config from env fallback', () => {
    delete process.env.VERIFIER_PRESENTATION_BASE_URL
    process.env.PRESENTATION_SESSION_TTL_MS = '240000'
    process.env.PRESENTATION_GATEWAY_BASE_URL = 'https://gateway.example'
    process.env.PRESENTATION_ISSUER_JWKS_CACHE_MS = '7200000'
    const config = readConfig()
    expect(config.presentationSessionTtlMs).toBe(240_000)
    expect(config.verifierPresentationBaseUrl).toBe('https://gateway.example')
    expect(config.presentationGatewayBaseUrl).toBe('https://gateway.example')
    expect(config.presentationIssuerJwksCacheMs).toBe(7_200_000)
  })

  test('allows missing VP issuer key outside tests', () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    delete process.env.VP_ISSUER_PUBLIC_KEY_JWK
    delete process.env.VP_ISSUER_PUBLIC_KEY_PATH
    expect(readConfig().vpIssuerPublicKeyJwk).toBeUndefined()
  })

  test('rejects placeholder JWT secret in production', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'local-dev-change-me',
      DB_HOST: 'db.example',
      DB_NAME: 'wallet',
      DB_USER: 'wallet-user',
      DB_PASSWORD: 'database-password',
      WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example',
    }

    expect(() => readConfig()).toThrow('ConfigInvalid: JWT_SECRET')
  })

  test('rejects loopback database host in production', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret',
      DB_HOST: '127.0.0.1',
      DB_NAME: 'wallet',
      DB_USER: 'wallet-user',
      DB_PASSWORD: 'database-password',
      WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example',
    }

    expect(() => readConfig()).toThrow('ConfigInvalid: DB_HOST')
  })

  test('rejects HTTP verifier endpoint in production', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret',
      DB_HOST: 'db.example',
      DB_NAME: 'wallet',
      DB_USER: 'wallet-user',
      DB_PASSWORD: 'database-password',
      WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example',
      MAIL_FROM: 'wallet@example.com',
      VERIFIER_PRESENTATION_BASE_URL: 'http://verifier.example',
    }

    expect(() => readConfig()).toThrow('ConfigInvalid: VERIFIER_PRESENTATION_BASE_URL')
  })

  test('rejects missing required database password in production', () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'production-secret',
      PORT: '4000',
      WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example',
      DB_HOST: 'db.example',
      DB_PORT: '3306',
      DB_NAME: 'wallet',
      DB_USER: 'wallet-user',
      DB_PASSWORD: '',
      MAIL_FROM: 'wallet@example.com',
      VERIFIER_PRESENTATION_BASE_URL: 'https://verifier.example',
    }

    expect(() => readConfig()).toThrow('ConfigInvalid: DB_PASSWORD')
  })
})
