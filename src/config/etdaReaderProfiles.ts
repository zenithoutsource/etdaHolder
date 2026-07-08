/** @deprecated Import from `@/src/config/readerProfiles` */
export type {
  ReaderProfile as EtdaReaderProfile,
  ReaderProfileField as EtdaReaderProfileField,
  ReaderSharingMode as EtdaReaderSharingMode,
} from './readerProfiles'

export {
  READER_PROFILES as ETDA_READER_PROFILES,
  getReaderProfileForDocumentType as getEtdaReaderProfileForDocumentType,
  listMdocFieldKeysFromProfile,
} from './readerProfiles'
