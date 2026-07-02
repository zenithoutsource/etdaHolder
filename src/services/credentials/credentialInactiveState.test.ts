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

  test('prefers deleted lifecycle state over issuer suspension for inactive rendering', () => {
    expect(
      readCredentialInactiveState({
        lifecycleStatus: deletedLifecycle,
        suspensionStatus: pendingSuspension,
      }),
    ).toEqual({
      kind: 'deleted',
      badgeLabel: 'ถูกลบ',
      badgeClassName: 'bg-[#7a7a7a]',
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
      badgeClassName: 'bg-[#c00000]',
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
      badgeClassName: 'bg-[#c00000]',
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
      badgeClassName: 'bg-[#7a7a7a]',
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
      badgeClassName: 'bg-[#7a7a7a]',
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
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารเดิมถูกเพิกถอนแล้ว กรุณาตรวจสอบเอกสารใหม่และลบเอกสารเดิม',
    })
  })

  test('marks cleanup-pending credentials as inactive', () => {
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
      kind: 'cleanup-pending',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารใหม่พร้อมใช้งานแล้ว กรุณาลบเอกสารเดิมเพื่อดำเนินการต่อ',
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
      badgeClassName: 'bg-[#c00000]',
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
      badgeClassName: 'bg-[#7a7a7a]',
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
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารผูกกับกุญแจ Wallet ที่หมดอายุแล้ว กรุณาขอเอกสารใหม่',
    })
  })
})
