import {
  WALLET_HOME_COPY,
  readWalletHomeBadgeLabel,
} from './walletHomeCopy'

describe('walletHomeCopy', () => {
  test('provides the expected Thai badge labels', () => {
    expect(readWalletHomeBadgeLabel('verified')).toBe('ตรวจสอบสำเร็จ')
    expect(readWalletHomeBadgeLabel('new')).toBe('เอกสารใหม่')
  })

  test('provides the expected Thai dialog and empty-state labels', () => {
    expect(WALLET_HOME_COPY.emptyState).toBe(
      'ไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet',
    )
    expect(WALLET_HOME_COPY.pidRequiredTitle).toBe('ต้องมี ThaID ก่อน')
    expect(WALLET_HOME_COPY.pidRequiredMessage).toBe(
      'กรุณาขอ ThaID ก่อนขอเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.cancel).toBe('ยกเลิก')
    expect(WALLET_HOME_COPY.requestCredential).toBe('ขอเอกสาร')
    expect(WALLET_HOME_COPY.requestThaId).toBe('ขอ ThaID')
  })

  test('provides P3 wallet key expiry copy', () => {
    expect(WALLET_HOME_COPY.walletKeyExpiredTitle).toBe('!! กุญแจหมดอายุ !!')
    expect(WALLET_HOME_COPY.walletKeyExpiredMessage).toBe(
      'กุญแจ Wallet หมดอายุแล้ว กรุณาสร้างกุญแจใหม่เพื่อต่ออายุเอกสารทั้งหมด',
    )
    expect(WALLET_HOME_COPY.createNewWalletKey).toBe('สร้างกุญแจใหม่')
    expect(WALLET_HOME_COPY.walletKeyPendingRenewalsTitle).toBe(
      'ยังมีเอกสารที่ต้องต่ออายุ',
    )
    expect(WALLET_HOME_COPY.walletKeyPendingRenewalsMessage).toBe(
      'กรุณาต่ออายุหรือลบเอกสารที่ค้างอยู่ให้เสร็จก่อน จึงจะสร้างกุญแจใหม่ได้อีกครั้ง',
    )
    expect(WALLET_HOME_COPY.goFinishRenewals).toBe('ไปต่ออายุเอกสาร')
  })

  test('provides P3 renewal dialog copy', () => {
    expect(WALLET_HOME_COPY.renewalRevokedTitle).toBe('ถูกเพิกถอนแล้ว')
    expect(WALLET_HOME_COPY.renewalRevokedMessage).toBe(
      'เอกสารเดิมถูกเพิกถอนแล้ว เอกสารใหม่พร้อมใช้งาน',
    )
    expect(WALLET_HOME_COPY.renewalDeleteTitle).toBe('!! ดำเนินการลบเอกสาร !!')
    expect(WALLET_HOME_COPY.renewalDeleteMessage).toBe(
      'เอกสารเดิมไม่สามารถใช้งานได้แล้ว กรุณาลบเอกสารเดิมเพื่อดำเนินการต่อ',
    )
    expect(WALLET_HOME_COPY.confirmDelete).toBe('ยืนยัน')
    expect(WALLET_HOME_COPY.acknowledge).toBe('รับทราบ')
    expect(WALLET_HOME_COPY.renewalReceivedTitle).toBe('ได้รับเอกสารใหม่แล้ว')
    expect(WALLET_HOME_COPY.renewalCleanupCta).toBe(
      'ลบเอกสารเก่าและทำลายกุญแจเก่า',
    )
  })

  test('readWalletHomeBadgeLabel returns active badge label', () => {
    expect(readWalletHomeBadgeLabel('active')).toBe(WALLET_HOME_COPY.activeBadge)
  })

  test('provides P7 document expiry copy', () => {
    expect(WALLET_HOME_COPY.expiringSoonBadge).toBe('ใกล้หมดอายุ')
    expect(WALLET_HOME_COPY.documentExpiredBadge).toBe('หมดอายุ')
    expect(WALLET_HOME_COPY.documentExpiringSoonMessage).toBe(
      'เอกสารจะหมดอายุในอีกไม่นาน กรุณาติดต่อผู้ออกเอกสารเพื่อขอเอกสารใหม่',
    )
    expect(WALLET_HOME_COPY.requestNewCredential).toBe('ขอเอกสารใหม่')
  })
})
