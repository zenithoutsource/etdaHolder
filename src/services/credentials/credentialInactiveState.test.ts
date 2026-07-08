import {
  readCredentialInactiveState,
  resolveCredentialRevokeBehavior,
} from './credentialInactiveState'
import type { CredentialLifecycleStatus } from './credentialLifecycle'
import type { IssuerSuspensionRecord } from './issuerSuspension'

const revokedLifecycle: CredentialLifecycleStatus = {
  credentialId: 'credential-1',
  action: 'Revoke',
  status: 'revoked',
  occurredAt: '2026-06-25T10:00:00.000Z',
}

const deletedLifecycle: CredentialLifecycleStatus = {
  credentialId: 'credential-1',
  action: 'Delete',
  status: 'deleted',
  occurredAt: '2026-06-25T10:00:00.000Z',
}

const pendingSuspension: IssuerSuspensionRecord = {
  credentialId: 'credential-1',
  suspendedAt: '2026-06-25T09:00:00.000Z',
  updatedAt: '2026-06-25T09:00:00.000Z',
}

describe('credentialInactiveState', () => {
  test('routes revoke to issuer acknowledgment while suspension is pending', () => {
    expect(resolveCredentialRevokeBehavior(pendingSuspension)).toBe('issuer-acknowledgment')
  })

  test('routes revoke to holder revoke flow after issuer suspension is acknowledged', () => {
    expect(
      resolveCredentialRevokeBehavior({
        ...pendingSuspension,
        acknowledgedAt: '2026-06-25T10:30:00.000Z',
      }),
    ).toBe('holder-revoke')
  })

  test('shows used inactive state for consumed credentials', () => {
    expect(
      readCredentialInactiveState({
        lifecycleStatus: {
          credentialId: 'credential-1',
          action: 'Used',
          status: 'used',
          occurredAt: '2026-06-25T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'used',
      badgeLabel: 'ใช้งานแล้ว',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารถูกใช้สิทธิ์แล้ว — ไม่สามารถแสดงซ้ำได้',
    })
  })

  test('prefers deleted lifecycle state over issuer suspension for inactive rendering', () => {
    expect(
      readCredentialInactiveState({
        lifecycleStatus: deletedLifecycle,
        suspensionStatus: pendingSuspension,
      }),
    ).toEqual({
      kind: 'deleted',
      badgeLabel: 'ถูกลบ',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารถูกยกเลิกการใช้งาน',
    })
  })

  test('prefers revoked lifecycle state over issuer suspension for inactive rendering', () => {
    expect(
      readCredentialInactiveState({
        lifecycleStatus: revokedLifecycle,
        suspensionStatus: pendingSuspension,
      }),
    ).toEqual({
      kind: 'revoked',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-danger',
      panelMessage: 'เอกสารถูกยกเลิกการใช้งาน',
    })
  })

  test('marks issuer suspension as inactive when no lifecycle action exists', () => {
    expect(
      readCredentialInactiveState({
        suspensionStatus: pendingSuspension,
      }),
    ).toEqual({
      kind: 'issuer-suspended',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-danger',
      panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
    })
  })

  test('returns active state when no lifecycle or suspension status exists', () => {
    expect(readCredentialInactiveState({})).toEqual({
      kind: 'active',
    })
  })

  test('marks renewal-required credentials as inactive', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-1',
          state: 'renewal-required',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'renewal-required',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารผูกกับกุญแจ Wallet ที่หมดอายุแล้ว กรุณาขอเอกสารใหม่',
    })
  })

  test('prefers renewal-required over local lifecycle inactive state so key rotation can be recovered', () => {
    const renewalStatus = {
      credentialId: 'credential-1',
      state: 'renewal-required' as const,
      previousHolderDid: 'did:key:old',
      updatedAt: '2026-06-29T10:00:00.000Z',
    }

    expect(
      readCredentialInactiveState({
        lifecycleStatus: revokedLifecycle,
        renewalStatus,
      }),
    ).toEqual(readCredentialInactiveState({ renewalStatus }))
  })

  test('treats renewed-active credentials as active for inactive rendering', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-2',
          state: 'renewed-active',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T11:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'active',
    })
  })

  test('marks renewed-active credentials as document-expired when expiresAt has passed', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-2',
          state: 'renewed-active',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T11:00:00.000Z',
        },
        credential: {
          id: 'credential-2',
          type: 'ThaiNationalID',
          rawVc: 'vc',
          claims: {},
          issuedAt: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-06-01T00:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'document-expired',
      badgeLabel: 'หมดอายุ',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
    })
  })

  test('marks renewal-processing credentials as inactive', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-1',
          state: 'renewal-processing',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'renewal-processing',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'ส่งคำขอต่ออายุเอกสารแล้ว กำลังรอผู้ออกเอกสารตรวจสอบ',
    })
  })

  test('marks old-revoked credentials as inactive', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-1',
          state: 'old-revoked',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'old-revoked',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารเดิมถูกเพิกถอนแล้ว กรุณาตรวจสอบเอกสารใหม่และลบเอกสารเดิม',
    })
  })

  test('does not render cleanup-pending through the inactive panel branch', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-1',
          state: 'cleanup-pending',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'active',
    })
  })

  test('issuer suspension takes precedence over P3 renewal-required', () => {
    expect(
      readCredentialInactiveState({
        suspensionStatus: pendingSuspension,
        renewalStatus: {
          credentialId: 'credential-1',
          state: 'renewal-required',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'issuer-suspended',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-danger',
      panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
    })
  })

  test('marks document-expired credentials as inactive', () => {
    expect(
      readCredentialInactiveState({
        credential: {
          id: 'credential-1',
          type: 'ThaiNationalID',
          rawVc: 'vc',
          claims: {},
          issuedAt: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-06-01T00:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'document-expired',
      badgeLabel: 'หมดอายุ',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
    })
  })

  test('P3 renewal-required takes precedence over document-expired', () => {
    expect(
      readCredentialInactiveState({
        renewalStatus: {
          credentialId: 'credential-1',
          state: 'renewal-required',
          previousHolderDid: 'did:key:old',
          updatedAt: '2026-06-25T10:00:00.000Z',
        },
        credential: {
          id: 'credential-1',
          type: 'ThaiNationalID',
          rawVc: 'vc',
          claims: {},
          issuedAt: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-06-01T00:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'renewal-required',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารผูกกับกุญแจ Wallet ที่หมดอายุแล้ว กรุณาขอเอกสารใหม่',
    })
  })
})
