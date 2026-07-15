import { http, HttpResponse } from 'msw'

export const verifierHandlers = [
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
