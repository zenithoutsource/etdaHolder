import type { NextFunction, Response } from 'express'
import request from 'supertest'

import type { AuthenticatedRequest } from '../auth'

jest.mock('../db', () => ({
  pool: {
    execute: jest.fn(),
  },
}))

jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth')

  return {
    ...actual,
    requireAuth: jest.fn((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.auth = {
        userId: 'user-1',
        token: 'session.jwt',
        tokenHash: 'session-hash',
      }
      next()
    }),
  }
})

import { pool } from '../db'
import { createTestApp } from '../testApp'

const app = createTestApp()
const executeMock = pool.execute as jest.Mock

describe('credential routes', () => {
  beforeEach(() => {
    executeMock.mockReset()
  })

  it('imports credential into owned wallet and returns 201', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 'wallet-1' }]])
    executeMock.mockResolvedValueOnce([{ affectedRows: 1 }])

    const response = await request(app).post('/wallet-api/wallet/wallet-1/credentials/import').send({
      jwt: 'jwt.vc.token',
      associated_did: 'did:key:zHolder',
    })

    expect(response.status).toBe(201)
    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(executeMock.mock.calls[0]).toEqual([
      expect.stringContaining('FROM wallets'),
      ['wallet-1', 'user-1'],
    ])
    expect(executeMock.mock.calls[1]).toEqual([
      expect.stringContaining('INSERT INTO credentials'),
      [expect.any(String), 'wallet-1', 'jwt.vc.token', 'did:key:zHolder'],
    ])
    expect(response.body).toEqual({
      id: expect.any(String),
      wallet: 'wallet-1',
      document: 'jwt.vc.token',
      format: 'jwt_vc_json',
      pending: false,
      addedOn: expect.any(String),
    })
  })

  it("returns 403 when importing into another user's wallet", async () => {
    executeMock.mockResolvedValueOnce([[]])

    const response = await request(app).post('/wallet-api/wallet/wallet-2/credentials/import').send({
      jwt: 'jwt.vc.token',
      associated_did: 'did:key:zHolder',
    })

    expect(response.status).toBe(403)
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('FROM wallets'), ['wallet-2', 'user-1'])
  })
})
