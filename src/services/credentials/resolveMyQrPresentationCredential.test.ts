import type { VerifiableCredentialRecord } from '../vci/exchangeService'

import { resolveMyQrPresentationCredential } from './resolveMyQrPresentationCredential'

jest.mock('./isMyQrDualFormatReady', () => ({
  isMyQrDualFormatReady: jest.fn(),
}))
jest.mock('./resolvePidVpQrCredential', () => ({
  resolvePidVpQrCredential: jest.fn(),
}))

import { isMyQrDualFormatReady } from './isMyQrDualFormatReady'
import { resolvePidVpQrCredential } from './resolvePidVpQrCredential'

const drivingLicence: VerifiableCredentialRecord = {
  id: 'dl-1',
  type: 'DLTDrivingLicence',
  rawVc: 'issuer.jwt~d~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

const thaiId: VerifiableCredentialRecord = {
  id: 'thai-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~d~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

describe('resolveMyQrPresentationCredential', () => {
  beforeEach(() => {
    jest.mocked(isMyQrDualFormatReady).mockReset()
    jest.mocked(resolvePidVpQrCredential).mockReset()
  })

  test('prefers dual-format-ready driving licence over ThaID', async () => {
    jest.mocked(isMyQrDualFormatReady).mockImplementation(async (record) => record.id === 'dl-1')
    jest.mocked(resolvePidVpQrCredential).mockReturnValue(thaiId)

    await expect(resolveMyQrPresentationCredential([thaiId, drivingLicence])).resolves.toEqual(drivingLicence)
  })

  test('falls back to ThaID when driving licence is not dual-format ready', async () => {
    jest.mocked(isMyQrDualFormatReady).mockResolvedValue(false)
    jest.mocked(resolvePidVpQrCredential).mockReturnValue(thaiId)

    await expect(resolveMyQrPresentationCredential([thaiId, drivingLicence])).resolves.toEqual(thaiId)
  })

  test('returns undefined when no eligible credential', async () => {
    jest.mocked(isMyQrDualFormatReady).mockResolvedValue(false)
    jest.mocked(resolvePidVpQrCredential).mockReturnValue(undefined)

    await expect(resolveMyQrPresentationCredential([])).resolves.toBeUndefined()
  })
})
