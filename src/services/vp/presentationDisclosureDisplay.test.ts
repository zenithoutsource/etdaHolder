import {
  isHiddenPresentmentDisclosure,
  orderGivenNameBeforeFamilyName,
  prepareHolderFacingDisclosureItems,
} from './presentationDisclosureDisplay'

describe('presentationDisclosureDisplay', () => {
  test('hides religion by key, alias path, and ศาสนา label', () => {
    expect(isHiddenPresentmentDisclosure({ key: 'religion', label: 'Religion' })).toBe(true)
    expect(isHiddenPresentmentDisclosure({ key: 'org.iso.18013.5.1.religion', label: 'Religion' })).toBe(true)
    expect(isHiddenPresentmentDisclosure({ key: 'belief', label: 'ศาสนา' })).toBe(true)
    expect(isHiddenPresentmentDisclosure({ key: 'national_id', label: 'เลขบัตรประจำตัวประชาชน' })).toBe(false)
  })

  test('moves given name above family name without changing other rows or full_name', () => {
    expect(
      orderGivenNameBeforeFamilyName([
        { key: 'family_name' },
        { key: 'licence_number' },
        { key: 'given_name' },
      ]).map((item) => item.key),
    ).toEqual(['given_name', 'family_name', 'licence_number'])

    expect(
      orderGivenNameBeforeFamilyName([{ key: 'full_name' }, { key: 'licence_number' }]).map((item) => item.key),
    ).toEqual(['full_name', 'licence_number'])
  })

  test('filters religion then shows given name before family name', () => {
    expect(
      prepareHolderFacingDisclosureItems([
        { key: 'family_name', label: 'นามสกุล' },
        { key: 'religion', label: 'ศาสนา' },
        { key: 'given_name', label: 'ชื่อ' },
      ]).map((item) => item.key),
    ).toEqual(['given_name', 'family_name'])
  })
})
