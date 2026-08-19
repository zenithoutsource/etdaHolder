import { readCredentialStatusBadge } from './credentialStatusBadge'
import { readCredentialInactiveState } from './credentialInactiveState'
import { isStoredCredentialKeyTtlExpired } from './credentialKeyExpiry'
import { WALLET_HOME_COPY } from './walletHomeCopy'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('./credentialKeyExpiry', () => ({
  isStoredCredentialKeyTtlExpired: jest.fn(() => false),
}))

const isStoredCredentialKeyTtlExpiredMock = isStoredCredentialKeyTtlExpired as jest.MockedFunction<
  typeof isStoredCredentialKeyTtlExpired
>

const renewalRequired = {
  credentialId: 'credential-1',
  state: 'renewal-required' as const,
  previousHolderDid: 'did:key:old',
  updatedAt: '2026-06-25T10:00:00.000Z',
}

function buildRecord(expiresAt?: string): VerifiableCredentialRecord {
  return {
    id: 'credential-1',
    type: 'ThaiNationalID',
    rawVc: 'vc',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
    ...(expiresAt ? { expiresAt } : {}),
  }
}

describe('readCredentialStatusBadge', () => {
  beforeEach(() => {
    isStoredCredentialKeyTtlExpiredMock.mockReset()
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(false)
  })
  test('uses หมดอายุ for leftover P3 renewal-required when the document is still valid', () => {
    const inactiveState = readCredentialInactiveState({
      renewalStatus: renewalRequired,
      credential: buildRecord('2030-06-15T00:00:00.000Z'),
    })

    expect(readCredentialStatusBadge({
      inactiveState,
      credential: buildRecord('2030-06-15T00:00:00.000Z'),
      now: new Date('2026-08-19T12:00:00.000+07:00'),
    })).toEqual({
      label: WALLET_HOME_COPY.documentExpiredBadge,
      className: 'bg-gray-badge',
    })
  })

  test('uses ใกล้หมดอายุ when the document is in the calendar warning window', () => {
    const credential = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-06-01T12:00:00.000+07:00')

    expect(readCredentialStatusBadge({
      inactiveState: { kind: 'active' },
      credential,
      now,
    })).toEqual({
      label: WALLET_HOME_COPY.expiringSoonBadge,
      className: 'bg-warning',
    })
  })

  test('ใกล้หมดอายุ beats leftover P3 Inactive while the document is only expiring soon', () => {
    const credential = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-06-01T12:00:00.000+07:00')
    const inactiveState = readCredentialInactiveState({
      renewalStatus: renewalRequired,
      credential,
    })

    expect(inactiveState.kind).toBe('renewal-required')
    expect(readCredentialStatusBadge({
      inactiveState,
      credential,
      now,
    })).toEqual({
      label: WALLET_HOME_COPY.expiringSoonBadge,
      className: 'bg-warning',
    })
  })

  test('uses หมดอายุ for calendar-expired documents', () => {
    const credential = buildRecord('2020-06-01T00:00:00.000Z')
    const inactiveState = readCredentialInactiveState({ credential })

    expect(readCredentialStatusBadge({
      inactiveState,
      credential,
      now: new Date('2026-08-19T12:00:00.000+07:00'),
    })).toEqual({
      label: WALLET_HOME_COPY.documentExpiredBadge,
      className: 'bg-gray-badge',
    })
  })

  test('keeps ถูกระงับ above the expiring-soon badge', () => {
    const credential = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-06-01T12:00:00.000+07:00')

    expect(readCredentialStatusBadge({
      inactiveState: {
        kind: 'issuer-suspended',
        badgeLabel: 'ถูกระงับ',
        badgeClassName: 'bg-danger',
        panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
      },
      credential,
      now,
    })).toEqual({
      label: 'ถูกระงับ',
      className: 'bg-danger',
    })
  })

  test('uses หมดอายุ for renewed-active when k_cred TTL has elapsed', () => {
    const credential = buildRecord('2030-06-15T00:00:00.000Z')
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(true)

    expect(readCredentialStatusBadge({
      inactiveState: { kind: 'active' },
      credential,
      isRenewedActive: true,
      now: new Date('2026-08-19T12:00:00.000+07:00'),
    })).toEqual({
      label: WALLET_HOME_COPY.documentExpiredBadge,
      className: 'bg-gray-badge',
    })
  })

  test('uses หมดอายุ after cleanup when renewal-required is written', () => {
    const credential = buildRecord('2030-06-15T00:00:00.000Z')
    const inactiveState = readCredentialInactiveState({
      renewalStatus: renewalRequired,
      credential,
    })

    expect(readCredentialStatusBadge({
      inactiveState,
      credential,
      now: new Date('2026-08-19T12:00:00.000+07:00'),
    })).toEqual({
      label: WALLET_HOME_COPY.documentExpiredBadge,
      className: 'bg-gray-badge',
    })
  })

  test('ใกล้หมดอายุ still wins over k_cred TTL หมดอายุ', () => {
    const credential = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-06-01T12:00:00.000+07:00')
    isStoredCredentialKeyTtlExpiredMock.mockReturnValue(true)

    expect(readCredentialStatusBadge({
      inactiveState: { kind: 'active' },
      credential,
      isRenewedActive: true,
      now,
    })).toEqual({
      label: WALLET_HOME_COPY.expiringSoonBadge,
      className: 'bg-warning',
    })
  })
})
