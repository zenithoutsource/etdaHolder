import { readConfig } from './config'

const ORIGINAL_ENV = process.env

describe('server config', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('allows deterministic default JWT secret only in tests', () => {
    delete process.env.JWT_SECRET
    process.env = { ...process.env, NODE_ENV: 'test' }

    expect(readConfig().jwtSecret).toBe('local-dev-change-me')
  })

  test('rejects default JWT secret for real local runs', () => {
    delete process.env.JWT_SECRET
    process.env = { ...process.env, NODE_ENV: 'development' }

    expect(() => readConfig()).toThrow('ConfigInvalid: JWT_SECRET')
  })
})
