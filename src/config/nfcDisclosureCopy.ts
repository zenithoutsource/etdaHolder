/**
 * Holder-facing NFC omit copy. Keys/reason codes stay English on the wire.
 */

export const NFC_DISCLOSURE_COPY = {
  holderDeclined: 'ผู้ถือบัตรไม่ยินยอมเปิดเผย',
  notInDocument: 'ไม่มีในเอกสารที่ส่ง',
  omittedValue: 'ไม่ได้ส่ง',
} as const

export function readNfcOmittedReasonCopy(reason: string): string {
  if (reason === 'not_in_document') return NFC_DISCLOSURE_COPY.notInDocument
  return NFC_DISCLOSURE_COPY.holderDeclined
}
