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
    verifyPassword: jest.fn(async (password: string) => password === 'correct-password'),
    issueToken: jest.fn(() => 'session.jwt'),
    storeSession: jest.fn(async () => undefined),
    sessionExpiryFromNow: jest.fn(() => new Date('2026-06-04T00:00:00.000Z')),
  }
})

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

  it('register creates user and default wallet', async () => {
    const response = await request(app).post('/wallet-api/auth/register').send({
      type: 'email',
      name: 'Test User',
      email: 'TEST@Example.COM',
      password: 'correct-password',
    })

    expect(response.status).toBe(201)
    expect(hashPasswordMock).toHaveBeenCalledWith('correct-password')
    expect(withTransactionMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(executeMock.mock.calls[0][0]).toContain('INSERT INTO users')
    expect(executeMock.mock.calls[0][1]).toEqual([
      expect.any(String),
      'Test User',
      'test@example.com',
      'hashed-password',
    ])
    expect(executeMock.mock.calls[1][0]).toContain('INSERT INTO wallets')
    expect(executeMock.mock.calls[1][1]).toEqual([expect.any(String), expect.any(String), 'Default Wallet'])
  })

  it('duplicate email returns 409', async () => {
    withTransactionMock.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }))

    const response = await request(app).post('/wallet-api/auth/register').send({
      type: 'email',
      name: 'Test User',
      email: 'test@example.com',
      password: 'correct-password',
    })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ message: 'Email already exists' })
  })

  it('login returns id and token for valid credentials', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 'user-1', password_hash: 'hashed-password' }]])

    const response = await request(app).post('/wallet-api/auth/login').send({
      type: 'email',
      email: 'TEST@Example.COM',
      password: 'correct-password',
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'user-1', token: 'session.jwt' })
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('FROM users'), ['test@example.com'])
    expect(verifyPasswordMock).toHaveBeenCalledWith('correct-password', 'hashed-password')
    expect(issueTokenMock).toHaveBeenCalledWith('user-1', expect.any(String))
    expect(sessionExpiryFromNowMock).toHaveBeenCalledTimes(1)
    expect(storeSessionMock).toHaveBeenCalledWith(
      pool,
      expect.any(String),
      'user-1',
      'session.jwt',
      new Date('2026-06-04T00:00:00.000Z'),
    )
  })

  it('login rejects invalid password', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 'user-1', password_hash: 'hashed-password' }]])

    const response = await request(app).post('/wallet-api/auth/login').send({
      type: 'email',
      email: 'test@example.com',
      password: 'wrong-password',
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid email or password' })
    expect(verifyPasswordMock).toHaveBeenCalledWith('wrong-password', 'hashed-password')
    expect(storeSessionMock).not.toHaveBeenCalled()
  })
})
