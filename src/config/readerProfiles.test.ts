import {
  getReaderProfileById,
  getReaderProfileForDocumentType,
  listReaderProfilesForVendor,
  readerProfileUsesCompanion,
} from './readerProfiles'

test('resolves ETDA reference profiles from the generic registry', () => {
  const dual = getReaderProfileForDocumentType('BangkokUniversityTranscript', 'dual-format')
  expect(dual?.vendorId).toBe('etda')
  expect(dual?.companion?.transportPluginId).toBe('etda-companion-v1')
  expect(readerProfileUsesCompanion(dual!)).toBe(true)

  const mdocOnly = getReaderProfileForDocumentType('BangkokUniversityTranscript', 'mdoc-only')
  expect(mdocOnly?.profileId).toBe('etda-transcript-mdoc-only')
  expect(readerProfileUsesCompanion(mdocOnly!)).toBe(false)
})

test('looks up profiles by id and vendor', () => {
  expect(getReaderProfileById('etda-transcript-acr1311u-n2')?.vendorDisplayName).toBe('ETDA')
  expect(listReaderProfilesForVendor('etda')).toHaveLength(2)
})
