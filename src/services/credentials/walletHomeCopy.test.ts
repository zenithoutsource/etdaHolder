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
    expect(WALLET_HOME_COPY.pidRequiredTitle).toBe('ต้องมี PID ก่อน')
    expect(WALLET_HOME_COPY.pidRequiredMessage).toBe(
      'กรุณาขอ PID ก่อนขอเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.pidRequiredToPresentMessage).toBe(
      'กรุณาขอ PID ก่อนแสดงเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.pidExpiredTitle).toBe('ต้องมี PID ก่อน')
    expect(WALLET_HOME_COPY.pidExpiredMessage).toBe(
      'PID หมดอายุแล้ว กรุณาขอ PID ใหม่ก่อนขอเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.pidExpiredToPresentMessage).toBe(
      'PID หมดอายุแล้ว กรุณาขอ PID ใหม่ก่อนแสดงเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.pidSuspendedTitle).toBe('PID ถูกระงับ')
    expect(WALLET_HOME_COPY.pidSuspendedMessage).toBe(
      'PID ถูกระงับแล้ว กรุณาขอ PID \n ใหม่ก่อนขอเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.pidSuspendedToPresentMessage).toBe(
      'เอกสารอื่นไม่สามารถแสดงได้ \n จนกว่าจะมี PID ที่ใช้งานได้',
    )
    expect(WALLET_HOME_COPY.cancel).toBe('ยกเลิก')
    expect(WALLET_HOME_COPY.expandDocument).toBe('ขยายเอกสาร')
    expect(WALLET_HOME_COPY.collapseDocument).toBe('ย่อเอกสาร')
    expect(WALLET_HOME_COPY.requestCredential).toBe('ขอเอกสาร')
    expect(WALLET_HOME_COPY.requestThaId).toBe('ขอ PID')
    expect(WALLET_HOME_COPY.hardwarePidReissueRequiredTitle).toBe(
      'ต้องขอ PID ใหม่ก่อน',
    )
    expect(WALLET_HOME_COPY.hardwarePidReissueRequiredMessage).toBe(
      'กรุณาขอ PID ใหม่บนกุญแจฮาร์ดแวร์ก่อนขอเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.renewThaIdRequiredTitle).toBe('ต้องต่ออายุ PID ก่อน')
    expect(WALLET_HOME_COPY.renewThaIdRequiredMessage).toBe(
      'กรุณาขอและรับ PID ใหม่ให้เสร็จก่อนขอเอกสารอื่น',
    )
    expect(WALLET_HOME_COPY.portalPidVpRequiredTitle).toBe(
      'ยืนยันตัวตนด้วย PID',
    )
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
    expect(WALLET_HOME_COPY.renewalKeyUnavailableTitle).toBe(
      'ไม่สามารถต่ออายุเอกสารนี้ได้',
    )
    expect(WALLET_HOME_COPY.renewalIssuerOfferFailedTitle).toBe(
      'ไม่สามารถต่ออายุเอกสารได้',
    )
    expect(WALLET_HOME_COPY.renewalIssuerOfferFailedMessage).toContain(
      'ผู้ออกเอกสารยังไม่สามารถสร้างข้อเสนอต่ออายุได้',
    )
    expect(WALLET_HOME_COPY.renewalRequestFailedTitle).toBe(
      'ไม่สามารถขอเอกสารได้',
    )
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

  test('provides portal empty-offer copy in user-friendly Thai', () => {
    expect(WALLET_HOME_COPY.portalEmptyOfferTitle).toBe('ยังไม่ได้รับเอกสาร')
    expect(WALLET_HOME_COPY.portalEmptyOfferRetry).toBe('ลองใหม่อีกครั้ง')
    expect(WALLET_HOME_COPY.portalEmptyOfferMessage).toContain('ผู้ออกเอกสาร')
    expect(WALLET_HOME_COPY.portalNoCallbackTitle).toBe('ไม่สามารถรับเอกสารได้')
  })

  test('provides My QR expired and create-error copy', () => {
    expect(WALLET_HOME_COPY.myQrExpiredTitle).toBe('QR หมดอายุ')
    expect(WALLET_HOME_COPY.myQrExpiredAction).toBe('สร้างใหม่')
    expect(WALLET_HOME_COPY.myQrCreateErrorTitle).toBe('ไม่สามารถสร้าง QR ได้')
    expect(WALLET_HOME_COPY.myQrCreateErrorAction).toBe('ลองอีกครั้ง')
    expect(WALLET_HOME_COPY.myQrPidGateReason).toBe(
      'ต้องมี PID ที่ใช้งานได้ก่อน ผู้ตรวจสอบจึงจะสแกน QR นี้ได้',
    )
    expect(WALLET_HOME_COPY.myQrPidGateNote).toBe(
      'ต้องรับบัตรประชาชน (PID) ใน Wallet ก่อน',
    )
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
