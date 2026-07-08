import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  formatVpIssuerPublicKeyEnvLine,
  resolveVpIssuerPublicKeyFromRawVc,
} from '../src/services/resolveVpIssuerKey'

type CliArgs = {
  rawVc?: string
  rawVcFile?: string
  issuer?: string
  writeEnv: boolean
}

function readArgs(argv: string[]): CliArgs {
  const args: CliArgs = { writeEnv: false }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--write-env') {
      args.writeEnv = true
      continue
    }
    if (token === '--raw-vc') {
      args.rawVc = argv[index + 1]
      index += 1
      continue
    }
    if (token === '--raw-vc-file') {
      args.rawVcFile = argv[index + 1]
      index += 1
      continue
    }
    if (token === '--issuer') {
      args.issuer = argv[index + 1]
      index += 1
    }
  }

  return args
}

function upsertEnvLine(envPath: string, line: string): void {
  const key = 'VP_ISSUER_PUBLIC_KEY_JWK='
  const existing = readFileSync(envPath, 'utf8')
  const lines = existing.split(/\r?\n/)
  let replaced = false
  const nextLines = lines.map((entry) => {
    if (!entry.startsWith(key)) return entry
    replaced = true
    return line
  })

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('')
    }
    nextLines.push('# Resolved from wallet rawVc (issuer SD-JWT signature key)')
    nextLines.push(line)
  }

  writeFileSync(envPath, `${nextLines.join('\n').replace(/\n?$/, '\n')}`, 'utf8')
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2))
  const rawVc =
    args.rawVc ??
    (args.rawVcFile ? readFileSync(args.rawVcFile, 'utf8').trim() : undefined)

  if (!rawVc) {
    console.error('Usage: yarn resolve-vp-issuer-key --raw-vc "<sd-jwt rawVc>" [--issuer http://192.100.10.46] [--write-env]')
    console.error('   or: yarn resolve-vp-issuer-key --raw-vc-file path/to/rawVc.txt [--write-env]')
    process.exit(1)
  }

  const jwk = await resolveVpIssuerPublicKeyFromRawVc(rawVc, args.issuer)
  const envLine = formatVpIssuerPublicKeyEnvLine(jwk)

  console.log('Resolved issuer public JWK:')
  console.log(JSON.stringify(jwk, null, 2))
  console.log('')
  console.log('Add to server/.env:')
  console.log(envLine)

  if (args.writeEnv) {
    const envPath = resolve(__dirname, '../.env')
    upsertEnvLine(envPath, envLine)
    console.log('')
    console.log(`Updated ${envPath}`)
    console.log('Restart the wallet backend: cd server && yarn dev')
  }
}

main().catch((error: unknown) => {
  console.error('[resolve-vp-issuer-key] failed', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
