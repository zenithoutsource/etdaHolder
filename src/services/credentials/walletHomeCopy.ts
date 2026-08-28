/**
 * Holder-facing Thai copy for Wallet home, PID gates, key expiry, request CTAs, and My QR errors.
 * Journey: Wallet home, global key-expiry host, My QR.
 * Map: docs/CODEMAPS/frontend.md#copy-and-layout
 */

export const WALLET_HOME_COPY = {
  emptyState: 'ไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet',
  verifiedBadge: 'ตรวจสอบสำเร็จ',
  newBadge: 'เอกสารใหม่',
  activeBadge: 'ใช้งานได้',
  pidRequiredTitle: 'ต้องมี PID ก่อน',
  pidRequiredMessage: 'กรุณาขอ PID ก่อนขอเอกสารอื่น',
  pidRequiredToPresentMessage: 'กรุณาขอ PID ก่อนแสดงเอกสารอื่น',
  pidExpiredTitle: 'ต้องมี PID ก่อน',
  pidExpiredMessage: 'PID หมดอายุแล้ว กรุณาขอ PID ใหม่ก่อนขอเอกสารอื่น',
  pidExpiredToPresentMessage: 'PID หมดอายุแล้ว กรุณาขอ PID ใหม่ก่อนแสดงเอกสารอื่น',
  pidSuspendedTitle: 'PID ถูกระงับ',
  pidSuspendedMessage: 'PID ถูกระงับแล้ว กรุณาขอ PID \n ใหม่ก่อนขอเอกสารอื่น',
  pidSuspendedToPresentMessage:
    'เอกสารอื่นไม่สามารถแสดงได้ \n จนกว่าจะมี PID ที่ใช้งานได้',
  hardwarePidReissueRequiredTitle: 'ต้องขอ PID ใหม่ก่อน',
  hardwarePidReissueRequiredMessage:
    'กรุณาขอ PID ใหม่บนกุญแจฮาร์ดแวร์ก่อนขอเอกสารอื่น',
  hardwareReissueRequiredBadge: 'ต้องขอใหม่',
  hardwareReissueRequiredMessage:
    'เอกสารนี้ยังผูกกับกุญแจเก่า กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
  legacyKeyRenewalUnsupportedMessage:
    'ไม่สามารถต่ออายุด้วยกุญแจเดิมได้ กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
  cancel: 'ยกเลิก',
  expandDocument: 'ขยายเอกสาร',
  collapseDocument: 'ย่อเอกสาร',
  requestCredential: 'ขอเอกสาร',
  requestThaId: 'ขอ PID',
  walletKeyExpiredTitle: '!! กุญแจหมดอายุ !!',
  walletKeyExpiredMessage: 'กุญแจ Wallet หมดอายุแล้ว กรุณาสร้างกุญแจใหม่เพื่อต่ออายุเอกสารทั้งหมด',
  createNewWalletKey: 'สร้างกุญแจใหม่',
  walletKeyRotationBlockedTitle: 'ยังสร้างกุญแจใหม่ไม่ได้',
  walletKeyRotationBlockedMessage:
    'กรุณาต่ออายุเอกสารที่ค้างอยู่ให้เสร็จก่อน จึงจะสร้างกุญแจใหม่ได้',
  walletKeyPendingRenewalsTitle: 'ยังมีเอกสารที่ต้องต่ออายุ',
  walletKeyPendingRenewalsMessage:
    'กรุณาต่ออายุหรือลบเอกสารที่ค้างอยู่ให้เสร็จก่อน จึงจะสร้างกุญแจใหม่ได้อีกครั้ง',
  goFinishRenewals: 'ไปต่ออายุเอกสาร',
  renewalKeyUnavailableTitle: 'ไม่สามารถต่ออายุเอกสารนี้ได้',
  renewalKeyUnavailableMessage:
    'กุญแจที่ผูกกับเอกสารนี้ถูกแทนที่ไปแล้ว ไม่สามารถต่ออายุได้ กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
  renewalIssuerOfferFailedTitle: 'ไม่สามารถต่ออายุเอกสารได้',
  renewalIssuerOfferFailedMessage:
    'ผู้ออกเอกสารยังไม่สามารถสร้างข้อเสนอต่ออายุได้ เอกสารยังใช้งานได้ กรุณาลองขอเอกสารอีกครั้งในภายหลัง หรือขอเอกสารใหม่จากผู้ออกเอกสาร',
  renewalRequestFailedTitle: 'ไม่สามารถขอเอกสารได้',
  renewalRequestFailedMessage: 'กรุณาลองใหม่อีกครั้ง',
  renewalRevokedTitle: 'ถูกเพิกถอนแล้ว',
  renewalRevokedMessage: 'เอกสารเดิมถูกเพิกถอนแล้ว เอกสารใหม่พร้อมใช้งาน',
  renewalDeleteTitle: '!! ดำเนินการลบเอกสาร !!',
  renewalDeleteMessage: 'เอกสารเดิมไม่สามารถใช้งานได้แล้ว กรุณาลบเอกสารเดิมเพื่อดำเนินการต่อ',
  supersededDocumentPanelMessage:
    'มีเอกสารฉบับใหม่แล้ว เอกสารนี้จะถูกเก็บไว้จนกว่าคุณจะลบ',
  confirmDelete: 'ยืนยัน',
  acknowledge: 'รับทราบ',
  renewalReceivedTitle: 'ได้รับเอกสารใหม่แล้ว',
  renewalReceivedMessage:
    'ผู้ออกเอกสารตรวจสอบและส่งเอกสารใหม่มาแล้ว กรุณาลบเอกสารเก่าและทำลายกุญแจเก่า',
  renewalCleanupCta: 'ลบเอกสารเก่าและทำลายกุญแจเก่า',
  viewCredential: 'ดูเอกสาร',
  renewThaIdRequiredTitle: 'ต้องต่ออายุ PID ก่อน',
  renewThaIdRequiredMessage:
    'กรุณาขอและรับ PID ใหม่ให้เสร็จก่อนขอเอกสารอื่น',
  thaIdAlreadyActiveMessage: 'คุณมี PID ที่ใช้งานได้อยู่แล้ว',
  expiringSoonBadge: 'ใกล้หมดอายุ',
  documentExpiredBadge: 'หมดอายุ',
  documentExpiringSoonMessage:
    'เอกสารจะหมดอายุในอีกไม่นาน กรุณาติดต่อผู้ออกเอกสารเพื่อขอเอกสารใหม่',
  documentExpiredMessage: 'เอกสารหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
  requestNewCredential: 'ขอเอกสารใหม่',
  documentExpiredCleanupTitle: '!! ดำเนินการลบเอกสาร !!',
  documentExpiredCleanupMessage:
    'เอกสารเดิมหมดอายุแล้ว กรุณาลบเอกสารเดิมเพื่อดำเนินการต่อ',
  deleteDocumentCta: 'ลบเอกสารนี้',
  documentExpiringSoonNotificationTitle: 'เอกสารใกล้หมดอายุ',
  documentExpiringSoonNotificationBody:
    'เอกสารใน Wallet ของคุณจะหมดอายุในอีกไม่นาน กรุณาติดต่อผู้ออกเอกสารเพื่อขอเอกสารใหม่',
  documentExpiredNotificationTitle: 'เอกสารหมดอายุ',
  documentExpiredNotificationBody:
    'เอกสารใน Wallet ของคุณหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
  portalMisconfiguredTitle: 'ไม่สามารถเปิดหน้าขอเอกสารได้',
  portalMisconfiguredMessage: 'ยังไม่ได้ตั้งค่า Issuer portal สำหรับเอกสารประเภทนี้',
  portalErrorTitle: 'ไม่สามารถเปิดหน้าขอเอกสารได้',
  portalErrorMessage: 'กรุณาลองใหม่อีกครั้ง',
  portalEmptyOfferTitle: 'ยังไม่ได้รับเอกสาร',
  portalEmptyOfferMessage:
    'เข้าสู่ระบบเสร็จแล้ว แต่ผู้ออกเอกสารยังไม่ได้ส่งเอกสารมาให้ กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ออกเอกสาร',
  portalEmptyOfferRetry: 'ลองใหม่อีกครั้ง',
  portalNoCallbackTitle: 'ไม่สามารถรับเอกสารได้',
  portalNoCallbackMessage:
    'ไม่ได้รับการตอบกลับจากผู้ออกเอกสาร กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง',
  portalUnrecognizedReturnMessage:
    'ได้รับการตอบกลับจากผู้ออกเอกสารแล้ว แต่ไม่สามารถอ่านข้อมูลเอกสารได้ กรุณาลองใหม่อีกครั้ง',
  portalPidVpRequiredTitle: 'ยืนยันตัวตนด้วย PID',
  portalPidVpRequiredMessage:
    'เมื่อ Issuer ส่งคำขอยืนยันตัวตน (OID4VP) ให้เปิดแท็บ Scan เพื่อให้ความยินยอมและส่ง PID',
  staleExpiryNotificationTitle: 'สถานะเอกสารอัปเดตแล้ว',
  staleExpiryNotificationMessage:
    'การแจ้งเตือนนี้ไม่ตรงกับสถานะปัจจุบันของเอกสาร กรุณาตรวจสอบวันหมดอายุอีกครั้ง',
  myQrScanHint: 'สแกน QR Code ของฉัน',
  myQrPidGateReason: 'ต้องมี PID ที่ใช้งานได้ก่อน ผู้ตรวจสอบจึงจะสแกน QR นี้ได้',
  myQrPidGateNote: 'ต้องรับบัตรประชาชน (PID) ใน Wallet ก่อน',
  myQrNoEligibleDocumentTitle: 'ไม่สามารถแสดง QR ได้',
  myQrNoEligibleDocumentMessage: 'ยังไม่มีเอกสารที่พร้อมสำหรับการนำเสนอ',
  myQrExpiredTitle: 'QR หมดอายุ',
  myQrExpiredMessage: 'QR นี้ใช้ไม่ได้แล้ว กรุณาสร้างใหม่เพื่อให้ผู้ตรวจสอบสแกน',
  myQrExpiredAction: 'สร้างใหม่',
  myQrCreateErrorTitle: 'ไม่สามารถสร้าง QR ได้',
  myQrCreateErrorMessage: 'เกิดข้อผิดพลาดขณะสร้าง QR กรุณาลองใหม่อีกครั้ง',
  myQrCreateErrorAction: 'ลองอีกครั้ง',
} as const

export function readWalletHomeBadgeLabel(
  kind: 'verified' | 'new' | 'active',
): string {
  if (kind === 'verified') return WALLET_HOME_COPY.verifiedBadge
  if (kind === 'active') return WALLET_HOME_COPY.activeBadge
  return WALLET_HOME_COPY.newBadge
}
