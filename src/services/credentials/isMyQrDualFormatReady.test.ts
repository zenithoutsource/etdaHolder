import type { VerifiableCredentialRecord } from '../vci/exchangeService'

import { isMyQrDualFormatReady } from './isMyQrDualFormatReady'

jest.mock('./logicalCredentialStorage', () => ({
  findLogicalCredentialBySdJwtRecordId: jest.fn(),
}))
jest.mock('../proximity/mdocStorage', () => ({
  hasStoredMdoc: jest.fn(),
}))
jest.mock('./credentialLifecycle', () => ({
  isCredentialPresentable: jest.fn(() => true),
}))

import { findLogicalCredentialBySdJwtRecordId } from './logicalCredentialStorage'
import { hasStoredMdoc } from '../proximity/mdocStorage'
import { isCredentialPresentable } from './credentialLifecycle'

const record: VerifiableCredentialRecord = {
  id: 'dl-1',
  type: 'DLTDrivingLicence',
  rawVc: 'issuer.jwt~d~',
  claims: {},
  issuedAt: '2026-01-01T00:00:00.000Z',
}

const linkedLogical = {
  logicalCredentialId: 'logical-1',
  issuer: 'issuer',
  documentType: 'DLTDrivingLicence',
  formats: {
    'dc+sd-jwt': { format: 'dc+sd-jwt' as const, credentialConfigurationId: 'x', rawCredentialRef: 'dl-1' },
    'mso_mdoc': { format: 'mso_mdoc' as const, credentialConfigurationId: 'y', rawCredentialRef: 'dl-1' },
  },
  consistencyStatus: 'verified' as const,
  warnings: [],
}

describe('isMyQrDualFormatReady', () => {
  test('returns true when logical credential has both formats and mdoc is stored', async () => {
    jest.mocked(findLogicalCredentialBySdJwtRecordId).mockReturnValue(linkedLogical)
    jest.mocked(hasStoredMdoc).mockResolvedValue(true)

    await expect(isMyQrDualFormatReady(record)).resolves.toBe(true)
  })

  test('returns false when mdoc is not stored', async () => {
    jest.mocked(findLogicalCredentialBySdJwtRecordId).mockReturnValue(linkedLogical)
    jest.mocked(hasStoredMdoc).mockResolvedValue(false)

    await expect(isMyQrDualFormatReady(record)).resolves.toBe(false)
  })

  test('returns false when logical link is missing a format', async () => {
    jest.mocked(findLogicalCredentialBySdJwtRecordId).mockReturnValue({
      ...linkedLogical,
      formats: { 'dc+sd-jwt': linkedLogical.formats['dc+sd-jwt'] },
    })
    jest.mocked(hasStoredMdoc).mockResolvedValue(true)

    await expect(isMyQrDualFormatReady(record)).resolves.toBe(false)
  })

  test('returns false when credential is not presentable', async () => {
    jest.mocked(isCredentialPresentable).mockReturnValue(false)

    await expect(isMyQrDualFormatReady(record)).resolves.toBe(false)
  })
})
