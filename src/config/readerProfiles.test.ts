import {
  getReaderProfileById,
  getReaderProfileForDocumentType,
  listMdocFieldKeysFromProfile,
  listReaderProfilesForVendor,
  readerProfileUsesCompanion,
} from './readerProfiles'

test('resolves reference profiles from the generic registry', () => {
  const dual = getReaderProfileForDocumentType('ChulalongkornUniversityTranscript', 'dual-format')
  expect(dual?.vendorId).toBe('reference')
  expect(dual?.companion?.transportPluginId).toBe('etda-companion-v1')
  expect(readerProfileUsesCompanion(dual!)).toBe(true)

  const mdocOnly = getReaderProfileForDocumentType('ChulalongkornUniversityTranscript', 'mdoc-only')
  expect(mdocOnly?.profileId).toBe('etda-transcript-mdoc-only')
  expect(readerProfileUsesCompanion(mdocOnly!)).toBe(false)
})

test('looks up profiles by id and vendor', () => {
  expect(getReaderProfileById('etda-transcript-acr1311u-n2')?.vendorDisplayName).toBe('Reference Verifier')
  expect(listReaderProfilesForVendor('reference')).toHaveLength(3)
})

test('resolves mDL mdoc-only profile for DLTDrivingLicence', () => {
  const profile = getReaderProfileForDocumentType('DLTDrivingLicence', 'mdoc-only')
  expect(profile?.profileId).toBe('mdl-acr1311u-n2-mdoc-only')
  expect(profile?.sharingMode).toBe('mdoc-only')
  expect(readerProfileUsesCompanion(profile!)).toBe(false)
  expect(listMdocFieldKeysFromProfile(profile!)).toEqual([
    'org.iso.18013.5.1.family_name',
    'org.iso.18013.5.1.given_name',
    'org.iso.18013.5.1.birth_date',
    'org.iso.18013.5.1.driving_privileges',
    'org.iso.18013.5.1.issue_date',
    'org.iso.18013.5.1.expiry_date',
  ])
})
