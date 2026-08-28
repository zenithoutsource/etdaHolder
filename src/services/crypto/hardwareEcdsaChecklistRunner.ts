import { Platform } from 'react-native'

import { readDefaultMaxSignatures } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'

import { getActiveHardwareEcdsaBackend, getHardwareEcdsaSigner, type HardwareEcdsaBackend } from './hardwareEcdsaSigner'
import {
  createStrongBoxFallbackProbeSigner,
} from './hardwareEcdsaSigner.mock'
import type { HardwareEcdsaSigner } from './hardwareEcdsaTypes'
import { HardwareEcdsaUnavailableError } from './hardwareEcdsaTypes'
import { p256JwkToPublicKey, verifyEs256Prehash } from './p256Identity'
import { isWalletHardwareEcdsaNativeAvailable } from './walletHardwareEcdsaNative'

const CHECKLIST_PREFIX = 'wallet.p256.checklist'
const PROBE_ALIAS = `${CHECKLIST_PREFIX}.probe`
const SESSION_ALIAS = `${CHECKLIST_PREFIX}.session`
const ATTEST_ALIAS = `${CHECKLIST_PREFIX}.attest`
const CAPACITY_PROBE_LIMIT = 48

export type SliceBChecklistRowId = '1' | '2' | '3' | '4' | '6' | '10'

export type SliceBChecklistRowStatus = 'pass' | 'fail' | 'skipped' | 'blocked'

export type SliceBChecklistRowResult = {
  id: SliceBChecklistRowId
  title: string
  status: SliceBChecklistRowStatus
  evidence: string[]
  error?: string
}

export type SliceBChecklistSummary = {
  pass: number
  fail: number
  skipped: number
  blocked: number
}

export type RunSliceBChecklistOptions = {
  /** Row 3: WP attestation challenge bytes. Omit to skip row 3. */
  attestationChallenge?: Uint8Array
  /** Row 4: stop after this many createKey attempts (default 48). */
  capacityProbeLimit?: number
  skipCapacityStress?: boolean
  /** Inject signer for unit tests. */
  signer?: HardwareEcdsaSigner
  backend?: HardwareEcdsaBackend
}

export type SliceBChecklistResult = {
  backend: HardwareEcdsaBackend | 'blocked'
  platform: string
  nativeProbeAvailable: boolean
  startedAt: string
  finishedAt: string
  rows: SliceBChecklistRowResult[]
  summary: SliceBChecklistSummary
}

function readCapacityProbeLimit(): number {
  return CAPACITY_PROBE_LIMIT
}

function summarizeRows(rows: SliceBChecklistRowResult[]): SliceBChecklistSummary {
  return rows.reduce<SliceBChecklistSummary>(
    (acc, row) => {
      acc[row.status] += 1
      return acc
    },
    { pass: 0, fail: 0, skipped: 0, blocked: 0 },
  )
}

function rowResult(
  id: SliceBChecklistRowId,
  title: string,
  status: SliceBChecklistRowStatus,
  evidence: string[],
  error?: string,
): SliceBChecklistRowResult {
  return { id, title, status, evidence, ...(error ? { error } : {}) }
}

async function deleteIfExists(signer: HardwareEcdsaSigner, alias: string): Promise<void> {
  if (await signer.hasKey(alias)) {
    await signer.deleteKey(alias)
  }
}

async function verifySessionSign(
  signer: HardwareEcdsaSigner,
  alias: string,
  digest: Uint8Array,
): Promise<{ signatureBytes: number; verified: boolean }> {
  const publicKey = p256JwkToPublicKey(await signer.getPublicJwk(alias))
  const session = await signer.openSigningSession(alias, {
    purpose: 'oid4vci',
    maxSignatures: readDefaultMaxSignatures('oid4vci'),
  })

  try {
    const signature = await session.sign(digest)
    const verified = __DEV__ ? verifyEs256Prehash(digest, signature, publicKey) : signature.length === 64
    return { signatureBytes: signature.length, verified }
  } finally {
    await session.close()
  }
}

async function runRow1StrongBoxProbe(signer: HardwareEcdsaSigner): Promise<SliceBChecklistRowResult> {
  const title = 'StrongBox P-256: create → session sign → verify → securityLevel'
  const evidence: string[] = []

  try {
    await deleteIfExists(signer, PROBE_ALIAS)
    const created = await signer.createKey(PROBE_ALIAS)
    evidence.push(`createKey:securityLevel=${created.securityLevel}`)

    const digest = new Uint8Array(32).fill(0x01)
    const signed = await verifySessionSign(signer, PROBE_ALIAS, digest)
    evidence.push(`session-sign:bytes=${signed.signatureBytes}`)
    evidence.push(`session-sign:verified=${signed.verified ? 'yes' : 'no'}`)

    const level = await signer.getSecurityLevel(PROBE_ALIAS)
    evidence.push(`getSecurityLevel:${level}`)

    await deleteIfExists(signer, PROBE_ALIAS)
    evidence.push('deleteKey:ok')

    if (created.securityLevel !== 'STRONGBOX' || level !== 'STRONGBOX') {
      return rowResult('1', title, 'fail', evidence, 'Expected STRONGBOX security level')
    }
    if (!signed.verified || signed.signatureBytes !== 64) {
      return rowResult('1', title, 'fail', evidence, 'ES256 sign/verify failed')
    }

    return rowResult('1', title, 'pass', evidence)
  } catch (error) {
    await deleteIfExists(signer, PROBE_ALIAS).catch(() => undefined)
    return rowResult(
      '1',
      title,
      'fail',
      evidence,
      error instanceof Error ? error.message : 'Row1ProbeFailed',
    )
  }
}

async function runRow2TeeFallbackProbe(
  signer: HardwareEcdsaSigner,
  row1: SliceBChecklistRowResult,
  backend: HardwareEcdsaBackend,
  injectedSigner: boolean,
): Promise<SliceBChecklistRowResult> {
  const title = 'StrongBox-unavailable → TEE create; generic failure fail-closed'
  const evidence: string[] = []

  const row1Level = row1.evidence.find((entry) => entry.startsWith('createKey:securityLevel='))
  if (row1Level === 'createKey:securityLevel=TEE') {
    evidence.push('observed TEE create on row 1 device path')
    evidence.push('StrongBox-first policy fell back or device is TEE-only')
    return rowResult('2', title, 'pass', evidence)
  }

  if (row1.status === 'pass' && row1Level === 'createKey:securityLevel=STRONGBOX') {
    return rowResult('2', title, 'skipped', [
      'Row 1 used STRONGBOX on this device',
      'TEE fallback not observable without StrongBoxUnavailableException',
      'Validate on no-StrongBox hardware or via mock row-2 probe in CI',
    ])
  }

  if (backend !== 'mock' && !injectedSigner) {
    return rowResult('2', title, 'skipped', [
      'Row 1 did not complete STRONGBOX or TEE path',
      'Fix row 1 before assessing TEE fallback on device',
    ])
  }

  try {
    const fallbackSigner = createStrongBoxFallbackProbeSigner()
    const alias = `${CHECKLIST_PREFIX}.tee-fallback`
    await deleteIfExists(fallbackSigner, alias)
    const created = await fallbackSigner.createKey(alias)
    evidence.push(`simulated-fallback:securityLevel=${created.securityLevel}`)
    await deleteIfExists(fallbackSigner, alias)

    if (created.securityLevel !== 'TEE') {
      return rowResult('2', title, 'fail', evidence, 'Simulated fallback did not produce TEE')
    }

    try {
      await fallbackSigner.createKey(alias, { simulateGenericKeygenFailure: true })
      return rowResult('2', title, 'fail', evidence, 'Generic keygen failure did not fail closed')
    } catch (genericError) {
      evidence.push(
        `generic-keygen-fail-closed:${
          genericError instanceof HardwareEcdsaUnavailableError ? 'yes' : 'unexpected-error'
        }`,
      )
    }

    return rowResult('2', title, 'pass', evidence)
  } catch (error) {
    return rowResult(
      '2',
      title,
      'fail',
      evidence,
      error instanceof Error ? error.message : 'Row2ProbeFailed',
    )
  }
}

async function runRow3AttestationProbe(
  signer: HardwareEcdsaSigner,
  attestationChallenge?: Uint8Array,
): Promise<SliceBChecklistRowResult> {
  const title = 'createKey + attestation challenge → non-empty certificate chain'

  if (!attestationChallenge || attestationChallenge.length === 0) {
    return rowResult('3', title, 'skipped', [
      'Pass attestationChallenge in runHardwareEcdsaSliceBChecklist options',
      'Then submit chain to WP/dev endpoint manually for acceptance',
    ])
  }

  const evidence: string[] = []

  try {
    await deleteIfExists(signer, ATTEST_ALIAS)
    const created = await signer.createKey(ATTEST_ALIAS, { attestationChallenge })
    const chainLength = created.certificateChainDer?.length ?? 0
    evidence.push(`certificateChainDer:length=${chainLength}`)
    evidence.push(`createKey:securityLevel=${created.securityLevel}`)

    await deleteIfExists(signer, ATTEST_ALIAS)

    if (chainLength === 0) {
      return rowResult('3', title, 'fail', evidence, 'Attestation chain empty after challenged createKey')
    }

    evidence.push('WP acceptance: manual — record HTTP result separately')
    return rowResult('3', title, 'pass', evidence)
  } catch (error) {
    await deleteIfExists(signer, ATTEST_ALIAS).catch(() => undefined)
    return rowResult(
      '3',
      title,
      'fail',
      evidence,
      error instanceof Error ? error.message : 'Row3AttestationProbeFailed',
    )
  }
}

async function runRow4CapacityStressProbe(
  signer: HardwareEcdsaSigner,
  limit: number,
): Promise<SliceBChecklistRowResult> {
  const title = 'Capacity stress until ERROR_TOO_MANY_KEYS (or probe limit)'
  const evidence: string[] = []
  const createdAliases: string[] = []

  try {
    for (let index = 0; index < limit; index += 1) {
      const alias = `${CHECKLIST_PREFIX}.capacity.${String(index).padStart(3, '0')}`
      try {
        await signer.createKey(alias)
        createdAliases.push(alias)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        evidence.push(`keys-created-before-failure=${createdAliases.length}`)
        evidence.push(`failure-at-index=${index}`)
        evidence.push(`failure-message=${message}`)
        return rowResult('4', title, 'pass', evidence)
      }
    }

    evidence.push(`keys-created=${createdAliases.length}`)
    evidence.push(`probe-limit-reached=${limit}`)
    return rowResult(
      '4',
      title,
      'skipped',
      evidence,
      `No failure within probe limit (${limit}); pass a larger capacityProbeLimit to the checklist runner`,
    )
  } catch (error) {
    return rowResult(
      '4',
      title,
      'fail',
      evidence,
      error instanceof Error ? error.message : 'Row4CapacityProbeFailed',
    )
  } finally {
    for (const alias of createdAliases.reverse()) {
      await deleteIfExists(signer, alias).catch(() => undefined)
    }
  }
}

async function runRow6DualSignSessionProbe(signer: HardwareEcdsaSigner): Promise<SliceBChecklistRowResult> {
  const title = 'Action-scoped session: dual sign (oid4vci maxSignatures=2)'
  const evidence: string[] = []

  try {
    await deleteIfExists(signer, SESSION_ALIAS)
    await signer.createKey(SESSION_ALIAS)

    const publicKey = p256JwkToPublicKey(await signer.getPublicJwk(SESSION_ALIAS))
    const session = await signer.openSigningSession(SESSION_ALIAS, {
      purpose: 'oid4vci',
      maxSignatures: 2,
    })

    const digestA = new Uint8Array(32).fill(0x0a)
    const digestB = new Uint8Array(32).fill(0x0b)

    try {
      const signatureA = await session.sign(digestA)
      const signatureB = await session.sign(digestB)
      evidence.push(`sign-1:bytes=${signatureA.length}`)
      evidence.push(`sign-2:bytes=${signatureB.length}`)

      const verifiedA = verifyEs256Prehash(digestA, signatureA, publicKey)
      const verifiedB = verifyEs256Prehash(digestB, signatureB, publicKey)
      evidence.push(`verify-1:${verifiedA ? 'ok' : 'fail'}`)
      evidence.push(`verify-2:${verifiedB ? 'ok' : 'fail'}`)
      evidence.push('biometric-count:manual — expect one prompt for both signs')

      if (!verifiedA || !verifiedB || signatureA.length !== 64 || signatureB.length !== 64) {
        return rowResult('6', title, 'fail', evidence, 'Dual ES256 sign/verify failed')
      }
    } finally {
      await session.close()
      evidence.push('session-close:ok')
    }

    await deleteIfExists(signer, SESSION_ALIAS)
    return rowResult('6', title, 'pass', evidence)
  } catch (error) {
    await deleteIfExists(signer, SESSION_ALIAS).catch(() => undefined)
    return rowResult(
      '6',
      title,
      'fail',
      evidence,
      error instanceof Error ? error.message : 'Row6SessionProbeFailed',
    )
  }
}

function runRow10AnimoFacadeProbe(backend: HardwareEcdsaBackend): SliceBChecklistRowResult {
  const title = 'Animo vs full facade contract (static + selected backend)'

  if (backend === 'animo') {
    return rowResult('10', title, 'fail', [
      'Backend=animo',
      'Static FAIL: attestation-at-create unsupported',
      'Static FAIL: StrongBox-first policy not exposed',
      'Re-run with EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND=custom',
    ])
  }

  if (backend === 'custom') {
    return rowResult('10', title, 'pass', [
      'Backend=custom (expo-wallet-hardware-ecdsa)',
      'Animo static FAIL documented in spike plan',
      'Device rows 1–6 validate custom module on A26',
    ])
  }

  return rowResult('10', title, 'skipped', [
    `Backend=${backend}`,
    'Row 10 targets animo vs custom comparison on physical A26',
  ])
}

export function formatSliceBChecklistReport(result: SliceBChecklistResult): string {
  const header = `Slice B checklist (${result.backend} / ${result.platform}) — pass=${result.summary.pass} fail=${result.summary.fail} skipped=${result.summary.skipped}`
  const lines = result.rows.map(
    (row) =>
      `[${row.id}] ${row.status.toUpperCase()}: ${row.title}${
        row.error ? ` — ${row.error}` : ''
      }\n  ${row.evidence.join('\n  ')}`,
  )
  return [header, ...lines].join('\n')
}

/**
 * __DEV__ Slice B A26 checklist runner.
 * Logs `[wallet:hardware-ecdsa] slice-b-checklist-*` (wallet logger). Claiming a
 * credential does not run this; use the __DEV__ Home panel.
 */
export async function runHardwareEcdsaSliceBChecklist(
  options: RunSliceBChecklistOptions = {},
): Promise<SliceBChecklistResult> {
  const startedAt = new Date().toISOString()

  if (!__DEV__) {
    const blocked: SliceBChecklistResult = {
      backend: 'blocked',
      platform: Platform.OS,
      nativeProbeAvailable: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      rows: [
        rowResult('1', 'Dev-only gate', 'blocked', [], 'HardwareEcdsaChecklistDevOnly'),
      ],
      summary: { pass: 0, fail: 0, skipped: 0, blocked: 1 },
    }
    logWalletStep('hardware-ecdsa', 'slice-b-checklist-blocked', { reason: 'non-dev-build' })
    return blocked
  }

  const backend = options.backend ?? getActiveHardwareEcdsaBackend()
  const nativeProbeAvailable = isWalletHardwareEcdsaNativeAvailable()
  const signer = options.signer ?? getHardwareEcdsaSigner()
  const injectedSigner = Boolean(options.signer)

  logWalletStep('hardware-ecdsa', 'slice-b-checklist-start', {
    backend,
    nativeProbeAvailable,
    platform: Platform.OS,
    skipCapacityStress: Boolean(options.skipCapacityStress),
    hasAttestationChallenge: Boolean(options.attestationChallenge?.length),
  })

  const rows: SliceBChecklistRowResult[] = []

  if (Platform.OS !== 'android' && !options.signer) {
    const finishedAt = new Date().toISOString()
    const nonAndroidRows = [
      rowResult('1', 'Android-only gate', 'skipped', ['Run on Galaxy A26 dev build']),
      rowResult('2', 'Android-only gate', 'skipped', []),
      rowResult('3', 'Android-only gate', 'skipped', []),
      rowResult('4', 'Android-only gate', 'skipped', []),
      rowResult('6', 'Android-only gate', 'skipped', []),
      runRow10AnimoFacadeProbe(backend),
    ]
    const result: SliceBChecklistResult = {
      backend,
      platform: Platform.OS,
      nativeProbeAvailable,
      startedAt,
      finishedAt,
      rows: nonAndroidRows,
      summary: summarizeRows(nonAndroidRows),
    }
    logWalletStep('hardware-ecdsa', 'slice-b-checklist-complete', { summary: result.summary })
    return result
  }

  try {
    const row1 = await runRow1StrongBoxProbe(signer)
    rows.push(row1)

    rows.push(await runRow2TeeFallbackProbe(signer, row1, backend, injectedSigner))
    rows.push(await runRow3AttestationProbe(signer, options.attestationChallenge))

    if (options.skipCapacityStress) {
      rows.push(
        rowResult('4', 'Capacity stress until ERROR_TOO_MANY_KEYS (or probe limit)', 'skipped', [
          'skipCapacityStress=true',
        ]),
      )
    } else {
      rows.push(await runRow4CapacityStressProbe(signer, options.capacityProbeLimit ?? readCapacityProbeLimit()))
    }

    rows.push(await runRow6DualSignSessionProbe(signer))
    rows.push(runRow10AnimoFacadeProbe(backend))
  } catch (error) {
    logWalletError('hardware-ecdsa', 'slice-b-checklist-failed', error)
    rows.push(
      rowResult('1', 'Unexpected checklist failure', 'fail', [], error instanceof Error ? error.message : 'ChecklistFailed'),
    )
  }

  const result: SliceBChecklistResult = {
    backend,
    platform: Platform.OS,
    nativeProbeAvailable,
    startedAt,
    finishedAt: new Date().toISOString(),
    rows,
    summary: summarizeRows(rows),
  }

  logWalletStep('hardware-ecdsa', 'slice-b-checklist-complete', {
    summary: result.summary,
    rows: result.rows.map((row) => ({ id: row.id, status: row.status, error: row.error })),
  })

  if (__DEV__) {
    console.info(formatSliceBChecklistReport(result))
  }

  return result
}
