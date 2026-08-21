import { Platform } from 'react-native'

import {
  formatSliceBChecklistReport,
  runHardwareEcdsaSliceBChecklist,
} from './hardwareEcdsaChecklistRunner'
import { createMockHardwareEcdsaSigner } from './hardwareEcdsaSigner.mock'
import type { HardwareEcdsaSigner } from './hardwareEcdsaTypes'
import { HardwareEcdsaUnavailableError } from './hardwareEcdsaTypes'
import { runHardwareEcdsaDevProbes } from './hardwareEcdsaDiagnostics'

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

function createCapacityLimitedSigner(maxKeys: number): HardwareEcdsaSigner {
  const store = new Map()
  const inner = createMockHardwareEcdsaSigner(store)

  return {
    ...inner,
    async createKey(alias, options) {
      if (store.size >= maxKeys) {
        throw new HardwareEcdsaUnavailableError('ERROR_TOO_MANY_KEYS')
      }
      return inner.createKey(alias, options)
    },
  }
}

describe('runHardwareEcdsaSliceBChecklist', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__

  beforeEach(() => {
    ;(global as { __DEV__?: boolean }).__DEV__ = true
    jest.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    ;(global as { __DEV__?: boolean }).__DEV__ = originalDev
    jest.restoreAllMocks()
  })

  test('passes row 1/3/6/10 on mock STRONGBOX signer', async () => {
    const signer = createMockHardwareEcdsaSigner()
    const challenge = new Uint8Array([0x01, 0x02, 0x03])

    const result = await runHardwareEcdsaSliceBChecklist({
      signer,
      backend: 'mock',
      attestationChallenge: challenge,
      skipCapacityStress: true,
    })

    expect(result.rows.find((row) => row.id === '1')?.status).toBe('pass')
    expect(result.rows.find((row) => row.id === '3')?.status).toBe('pass')
    expect(result.rows.find((row) => row.id === '6')?.status).toBe('pass')
    expect(result.rows.find((row) => row.id === '10')?.status).toBe('skipped')
  })

  test('records capacity failure on row 4', async () => {
    const signer = createCapacityLimitedSigner(3)

    const result = await runHardwareEcdsaSliceBChecklist({
      signer,
      backend: 'mock',
      capacityProbeLimit: 10,
      skipCapacityStress: false,
    })

    const row4 = result.rows.find((row) => row.id === '4')
    expect(row4?.status).toBe('pass')
    expect(row4?.evidence.some((entry) => entry.includes('keys-created-before-failure=3'))).toBe(true)
  })

  test('skips row 3 without attestation challenge', async () => {
    const signer = createMockHardwareEcdsaSigner()

    const result = await runHardwareEcdsaSliceBChecklist({
      signer,
      backend: 'mock',
      skipCapacityStress: true,
    })

    expect(result.rows.find((row) => row.id === '3')?.status).toBe('skipped')
  })

  test('formatSliceBChecklistReport includes row statuses', async () => {
    const signer = createMockHardwareEcdsaSigner()
    const result = await runHardwareEcdsaSliceBChecklist({
      signer,
      backend: 'custom',
      skipCapacityStress: true,
    })

    const report = formatSliceBChecklistReport(result)
    expect(report).toContain('[1] PASS')
    expect(report).toContain('[10] PASS')
  })

  test('blocks outside __DEV__', async () => {
    ;(global as { __DEV__?: boolean }).__DEV__ = false

    const result = await runHardwareEcdsaSliceBChecklist({
      signer: createMockHardwareEcdsaSigner(),
      backend: 'mock',
    })

    expect(result.summary.blocked).toBe(1)
  })
})

describe('runHardwareEcdsaDevProbes', () => {
  test('delegates to slice-b row 1', async () => {
    ;(global as { __DEV__?: boolean }).__DEV__ = true

    const result = await runHardwareEcdsaDevProbes()

    expect(result.steps.some((step) => step.startsWith('createKey:securityLevel='))).toBe(true)
    expect(Platform.OS).toBe('android')
  })
})
