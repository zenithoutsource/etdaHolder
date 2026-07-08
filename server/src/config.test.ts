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

  test('reads VP relay config from env', () => {
    process.env.VP_SESSION_TTL_MS = '120000'
    process.env.VP_RELAY_BASE_URL = 'http://192.168.1.10:4000'
    process.env.VP_ISSUER_PUBLIC_KEY_JWK = TEST_ISSUER_PUBLIC_KEY_JWK
    const config = readConfig()
    expect(config.vpSessionTtlMs).toBe(120_000)
    expect(config.vpRelayBaseUrl).toBe('http://192.168.1.10:4000')
    expect(config.vpIssuerPublicKeyJwk?.crv).toBe('Ed25519')
  })

  test('allows missing VP issuer key outside tests', () => {
    process.env = { ...process.env, NODE_ENV: 'development' }
    delete process.env.VP_ISSUER_PUBLIC_KEY_JWK
    delete process.env.VP_ISSUER_PUBLIC_KEY_PATH
    expect(readConfig().vpIssuerPublicKeyJwk).toBeUndefined()
  })
})
