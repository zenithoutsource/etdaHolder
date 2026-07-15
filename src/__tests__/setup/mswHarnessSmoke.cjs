const { createMswServer } = require('./mswServer.cjs')

const undici = require('undici')
global.fetch = undici.fetch
global.Request = undici.Request
global.Response = undici.Response
global.Headers = undici.Headers

const mswServer = createMswServer()
mswServer.listen({ onUnhandledRequest: 'error' })

fetch('https://issuer.example.com/oid4vp/direct-post', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'vp_token=test.jwt',
})
  .then((response) => response.json())
  .then((body) => {
    if (body.status !== 'accepted') {
      console.error(JSON.stringify(body))
      process.exit(1)
    }
    console.log(body.status)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => {
    mswServer.close()
  })
