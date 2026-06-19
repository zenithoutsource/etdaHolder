import { readConfig } from './config'
import { assertSchemaReady } from './db'
import { createTestApp } from './testApp'

async function main(): Promise<void> {
  const config = readConfig()
  await assertSchemaReady()

  const app = createTestApp()
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Wallet backend listening at http://0.0.0.0:${config.port}`)
  })
}

main().catch((error: unknown) => {
  console.error('Wallet backend startup failed', error)
  process.exit(1)
})
