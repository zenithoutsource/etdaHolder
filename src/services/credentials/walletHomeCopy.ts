export const WALLET_HOME_COPY = {
  emptyState: 'ไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet',
  verifiedBadge: 'ตรวจสอบสำเร็จ',
  newBadge: 'เอกสารใหม่',
  activeBadge: 'ใช้งานได้',
  pidRequiredTitle: 'ต้องมี ThaID ก่อน',
  pidRequiredMessage: 'กรุณาขอ ThaID ก่อนขอเอกสารอื่น',
  cancel: 'ยกเลิก',
  requestCredential: 'ขอเอกสาร',
  requestThaId: 'ขอ ThaID',
  walletKeyExpiredTitle: '!! กุญแจหมดอายุ !!',
  walletKeyExpiredMessage: 'กุญแจ Wallet หมดอายุแล้ว กรุณาสร้างกุญแจใหม่เพื่อต่ออายุเอกสารทั้งหมด',
  createNewWalletKey: 'สร้างกุญแจใหม่',
  renewalRevokedTitle: 'ถูกเพิกถอนแล้ว',
  renewalRevokedMessage: 'เอกสารเดิมถูกเพิกถอนแล้ว เอกสารใหม่พร้อมใช้งาน',
  renewalDeleteTitle: '!! ดำเนินการลบเอกสาร !!',
  renewalDeleteMessage: 'เอกสารเดิมไม่สามารถใช้งานได้แล้ว กรุณาลบเอกสารเดิมเพื่อดำเนินการต่อ',
  confirmDelete: 'ยืนยัน',
  acknowledge: 'รับทราบ',
  renewalReceivedTitle: 'ได้รับเอกสารใหม่แล้ว',
  renewalReceivedMessage:
    'ผู้ออกเอกสารตรวจสอบและส่งเอกสารใหม่มาแล้ว กรุณาลบเอกสารเก่าและทำลายกุญแจเก่า',
  renewalCleanupCta: 'ลบเอกสารเก่าและทำลายกุญแจเก่า',
  viewCredential: 'ดูเอกสาร',
  renewThaIdRequiredTitle: 'ต้องต่ออายุ ThaID ก่อน',
  renewThaIdRequiredMessage:
    'กรุณาขอและรับ ThaID ใหม่ให้เสร็จก่อนขอเอกสารอื่น',
  thaIdAlreadyActiveMessage: 'คุณมี ThaID ที่ใช้งานได้อยู่แล้ว',
} as const

export function readWalletHomeBadgeLabel(
  kind: 'verified' | 'new' | 'active',
): string {
  if (kind === 'verified') return WALLET_HOME_COPY.verifiedBadge
  if (kind === 'active') return WALLET_HOME_COPY.activeBadge
  return WALLET_HOME_COPY.newBadge
}
