import { createServer } from 'node:http'

import { createMdocIssuerApp } from './app'

function readPort(): number {
  const raw = process.env.MDOC_ISSUER_PORT ?? '4100'
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('ConfigInvalid: MDOC_ISSUER_PORT')
  }
  return value
}

function readBaseUrl(port: number): string {
  return (process.env.MDOC_ISSUER_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '')
}

async function main(): Promise<void> {
  const port = readPort()
  const issuerBaseUrl = readBaseUrl(port)
  const app = createMdocIssuerApp({ issuerBaseUrl })
  const server = createServer(app)

  server.listen(port, '0.0.0.0', () => {
    console.log(`mDOC issuer listening at ${issuerBaseUrl}`)
  })
}

main().catch((error: unknown) => {
  console.error('mDOC issuer startup failed', error)
  process.exit(1)
})
