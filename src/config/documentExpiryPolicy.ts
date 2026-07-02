export const DOCUMENT_EXPIRY_WARNING_WINDOW_DAYS = 30

export const DOCUMENT_EXPIRY_TIMEZONE = 'Asia/Bangkok'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function readDocumentExpiryWarningWindowMs(): number {
  return DOCUMENT_EXPIRY_WARNING_WINDOW_DAYS * MS_PER_DAY
}
