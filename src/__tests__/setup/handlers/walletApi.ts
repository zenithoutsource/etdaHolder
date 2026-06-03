import { http, HttpResponse } from 'msw'

export const walletApiHandlers = [
  http.post('/wallet-api/wallet/:walletId/credentials/import', () =>
    HttpResponse.json({ id: 'mock-credential-id' }, { status: 201 }),
  ),
]
