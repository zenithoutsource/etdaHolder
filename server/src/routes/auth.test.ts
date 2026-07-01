import request from 'supertest'

jest.mock('../db', () => {
  const execute = jest.fn()

  return {
    pool: { execute },
    withTransaction: jest.fn(async (operation: (connection: { execute: typeof execute }) => Promise<unknown>) =>
      operation({ execute }),
    ),
  }
})

jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth')

  return {
    ...actual,
    hashPassword: jest.fn(async () => 'hashed-password'),
    verifyPassword: jest.fn(async (pin: string) => pin === '482910'),
    issueToken: jest.fn(() => 'session.jwt'),
    storeSession: jest.fn(async () => undefined),
    sessionExpiryFromNow: jest.fn(() => new Date('2026-06-04T00:00:00.000Z')),
  }
})

jest.mock('../mail', () => ({
  sendPinResetOtp: jest.fn(async () => undefined),
}))

import {
  hashPassword,
  issueToken,
  sessionExpiryFromNow,
  storeSession,
  verifyPassword,
} from '../auth'
import { pool, withTransaction } from '../db'
import { createTestApp } from '../testApp'

const app = createTestApp()
const executeMock = pool.execute as jest.Mock
const withTransactionMock = withTransaction as jest.Mock
const hashPasswordMock = hashPassword as jest.Mock
const verifyPasswordMock = verifyPassword as jest.Mock
const issueTokenMock = issueToken as jest.Mock
const storeSessionMock = storeSession as jest.Mock
const sessionExpiryFromNowMock = sessionExpiryFromNow as jest.Mock

const VALID_PIN = '482910'

describe('auth routes', () => {
  beforeEach(() => {
    executeMock.mockReset()
    withTransactionMock.mockClear()
    hashPasswordMock.mockClear()
    verifyPasswordMock.mockClear()
    issueTokenMock.mockClear()
    storeSessionMock.mockClear()
    sessionExpiryFromNowMock.mockClear()
  })

  it('email-status reports whether an email exists', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 'user-1' }]])

    const response = await request(app).post('/wallet-api/auth/email-status').send({
      email: 'TEST@Example.COM',
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ exists: true })
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('FROM users'), ['test@example.com'])
  })

  it('register creates user and default wallet', async () => {
    const response = await request(app).post('/wallet-api/auth/register').send({
      type: 'email',
      name: 'Test User',
      email: 'TEST@Example.COM',
      pin: VALID_PIN,
    })

    expect(response.status).toBe(201)
    expect(hashPasswordMock).toHaveBeenCalledWith(VALID_PIN)
    expect(withTransactionMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(executeMock.mock.calls[0][0]).toContain('INSERT INTO users')
    expect(executeMock.mock.calls[0][1]).toEqual([
      expect.any(String),
      'Test User',
      'test@example.com',
      'hashed-password',
    ])
  })

  it('register accepts simple PIN', async () => {
    const response = await request(app).post('/wallet-api/auth/register').send({
      type: 'email',
      name: 'Test User',
      email: 'simple-pin@example.com',
      pin: '123456',
    })

    expect(response.status).toBe(201)
    expect(hashPasswordMock).toHaveBeenCalledWith('123456')
  })

  it('duplicate email returns 409', async () => {
    withTransactionMock.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }))

    const response = await request(app).post('/wallet-api/auth/register').send({
      type: 'email',
      name: 'Test User',
      email: 'test@example.com',
      pin: VALID_PIN,
    })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'Email already exists' })
  })

  it('register rejects email addresses with invalid domain suffixes', async () => {
    const response = await request(app).post('/wallet-api/auth/register').send({
      type: 'email',
      name: 'Test User',
      email: 'example@gmail.commmm',
      pin: VALID_PIN,
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid email format' })
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(withTransactionMock).not.toHaveBeenCalled()
  })

  it('login returns id and token for valid credentials', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 'user-1', password_hash: 'hashed-password' }]])

    const response = await request(app).post('/wallet-api/auth/login').send({
      type: 'email',
      email: 'TEST@Example.COM',
      pin: VALID_PIN,
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'user-1', token: 'session.jwt' })
    expect(verifyPasswordMock).toHaveBeenCalledWith(VALID_PIN, 'hashed-password')
    expect(storeSessionMock).toHaveBeenCalled()
  })

  it('login rejects invalid PIN', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 'user-1', password_hash: 'hashed-password' }]])

    const response = await request(app).post('/wallet-api/auth/login').send({
      type: 'email',
      email: 'test@example.com',
      pin: '000001',
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid email or PIN' })
    expect(storeSessionMock).not.toHaveBeenCalled()
  })

  it('login still verifies PIN against a dummy hash when user is unknown', async () => {
    executeMock.mockResolvedValueOnce([[]])

    const response = await request(app).post('/wallet-api/auth/login').send({
      type: 'email',
      email: 'unknown@example.com',
      pin: '000001',
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid email or PIN' })
    expect(verifyPasswordMock).toHaveBeenCalledWith('000001', expect.any(String))
    expect(storeSessionMock).not.toHaveBeenCalled()
  })

  it('pin-reset verify accepts a valid OTP', async () => {
    const crypto = await import('node:crypto')
    const otp = '123456'

    executeMock
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockResolvedValueOnce([[{
        id: 'otp-1',
        user_id: 'user-1',
        otp_hash: crypto.createHash('sha256').update(otp).digest('hex'),
        expires_at: new Date('2099-01-01T00:00:00.000Z'),
        used_at: null,
        attempt_count: 0,
      }]])

    const response = await request(app).post('/wallet-api/auth/pin-reset/verify').send({
      email: 'test@example.com',
      otp,
    })

    expect(response.status).toBe(204)
    expect(withTransactionMock).not.toHaveBeenCalled()
  })

  it('pin-reset verify rejects an invalid OTP', async () => {
    const crypto = await import('node:crypto')

    executeMock
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockResolvedValueOnce([[{
        id: 'otp-1',
        user_id: 'user-1',
        otp_hash: crypto.createHash('sha256').update('123456').digest('hex'),
        expires_at: new Date('2099-01-01T00:00:00.000Z'),
        used_at: null,
        attempt_count: 0,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])

    const response = await request(app).post('/wallet-api/auth/pin-reset/verify').send({
      email: 'test@example.com',
      otp: '000000',
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid or expired OTP' })
    expect(withTransactionMock).not.toHaveBeenCalled()
  })

  it('pin-reset confirm updates PIN and revokes sessions', async () => {
    const crypto = await import('node:crypto')
    const otp = '123456'

    executeMock
      .mockResolvedValueOnce([[{ id: 'user-1' }]])
      .mockResolvedValueOnce([[{
        id: 'otp-1',
        user_id: 'user-1',
        otp_hash: crypto.createHash('sha256').update(otp).digest('hex'),
        expires_at: new Date('2099-01-01T00:00:00.000Z'),
        used_at: null,
        attempt_count: 0,
      }]])

    const response = await request(app).post('/wallet-api/auth/pin-reset/confirm').send({
      email: 'test@example.com',
      otp,
      pin: VALID_PIN,
    })

    expect(response.status).toBe(204)
    expect(withTransactionMock).toHaveBeenCalled()
    expect(hashPasswordMock).toHaveBeenCalledWith(VALID_PIN)
  })
})
