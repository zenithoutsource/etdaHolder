/**
 * Phase 4 pre-release scan: greps a built bundle / log directory for patterns that
 * would indicate credential claims, JWTs, DIDs, or PII leaked into shipped artifacts.
 * Run manually before each release per docs/SECURITY.md §5 ("Metro bundles, Hermes
 * bytecode, and EAS logs must be checked for leaked credential data before release").
 *
 * Usage: npx ts-node scripts/scan-bundle-leaks.ts <path-to-build-output-or-logs>
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { extname, join } from 'path'

type LeakPattern = {
  name: string
  regex: RegExp
}

// Claim key names sourced from src/config/cardSchemas.ts DisplayField configs.
const CLAIM_KEY_NAMES = [
  'birthDate',
  'degree',
  'expiryDate',
  'faculty',
  'familyName',
  'givenName',
  'gpa',
  'licenceClass',
  'licenceNumber',
  'nationalId',
  'studentId',
]

const LEAK_PATTERNS: LeakPattern[] = [
  { name: 'compact JWT / SD-JWT VC', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'did:key holder DID', regex: /did:key:z[1-9A-HJ-NP-Za-km-z]{20,}/g },
  { name: 'stored credential index key', regex: /credential:(index|[A-Za-z0-9_-]{6,})/g },
  { name: 'OID4VCI pre-authorized code grant', regex: /pre-authorized_code|"c_nonce"\s*:/g },
  { name: 'credential claim key name', regex: new RegExp(`\\b(${CLAIM_KEY_NAMES.join('|')})\\b`, 'g') },
]

const SCANNABLE_EXTENSIONS = new Set(['.js', '.hbc', '.map', '.bundle', '.log', '.txt', '.json'])

type Finding = {
  file: string
  line: number
  pattern: string
  excerpt: string
}

function shouldScan(path: string): boolean {
  return SCANNABLE_EXTENSIONS.has(extname(path).toLowerCase())
}

function collectFiles(root: string): string[] {
  const files: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const stats = statSync(current)
    if (stats.isDirectory()) {
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry))
      }
    } else if (stats.isFile() && shouldScan(current)) {
      files.push(current)
    }
  }

  return files
}

function truncate(text: string, maxLength = 160): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

function scanFile(path: string): Finding[] {
  const findings: Finding[] = []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)

  lines.forEach((lineText, index) => {
    for (const { name, regex } of LEAK_PATTERNS) {
      regex.lastIndex = 0
      const match = regex.exec(lineText)
      if (match) {
        findings.push({ file: path, line: index + 1, pattern: name, excerpt: truncate(lineText.trim()) })
      }
    }
  })

  return findings
}

function main(): void {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: npx ts-node scripts/scan-bundle-leaks.ts <path-to-build-output-or-logs>')
    process.exitCode = 2
    return
  }

  const files = collectFiles(target)
  const findings = files.flatMap(scanFile)

  if (findings.length === 0) {
    console.log(`scan-bundle-leaks: clean — scanned ${files.length} file(s) under ${target}, no matches.`)
    return
  }

  console.error(`scan-bundle-leaks: ${findings.length} potential leak(s) found across ${files.length} scanned file(s):\n`)
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: [${finding.pattern}] ${finding.excerpt}`)
  }
  process.exitCode = 1
}

main()
