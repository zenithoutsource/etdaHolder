import jwt from 'jsonwebtoken'
import type { Response, NextFunction } from 'express'

jest.mock('./db', () => ({
  pool: {
    execute: jest.fn(),
  },
}))

import type { AuthenticatedRequest } from './auth'
import { issueToken, requireAuth, verifyToken } from './auth'
import { pool } from './db'

const executeMock = pool.execute as jest.Mock

function createResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock }
}

describe('auth helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...process.env, NODE_ENV: 'test' }
    process.env.JWT_SECRET = 'test-secret'
    process.env.JWT_EXPIRES_IN = '7d'
  })

  test('verifyToken accepts only HS256 tokens issued by the backend', () => {
    const token = jwt.sign({ sid: 'session-1' }, 'test-secret', {
      algorithm: 'HS512',
      subject: 'user-1',
    })

    expect(() => verifyToken(token)).toThrow()
  })

  test('requireAuth reports session lookup infrastructure failures as server errors', async () => {
    const token = issueToken('user-1', 'session-1')
    const req = {
      header: jest.fn(() => `Bearer ${token}`),
    } as unknown as AuthenticatedRequest
    const res = createResponse()
    const next = jest.fn() as NextFunction
    executeMock.mockRejectedValueOnce(new Error('database unavailable'))
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await requireAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal Server Error' })
    expect(next).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
