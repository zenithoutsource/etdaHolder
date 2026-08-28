import {
  expandDcqlSelectedKeysForSdJwt,
  readSdJwtDisclosureKeysForDcqlClaim,
} from './dcqlClaimPathKeys'

describe('dcqlClaimPathKeys', () => {
  test('includes nested path segments for EUDI PID age disclosures', () => {
    expect(
      readSdJwtDisclosureKeysForDcqlClaim({
        id: 'age_over_21',
        path: ['age_equal_or_over', '21'],
      }),
    ).toEqual(['age_over_21', 'age_equal_or_over', '21'])
  })

  test('expands holder-selected DCQL keys to nested SD-JWT disclosure keys', () => {
    expect(
      expandDcqlSelectedKeysForSdJwt(
        [
          { path: ['given_name'] },
          { path: ['family_name'] },
          { id: 'age_over_21', path: ['age_equal_or_over', '21'] },
        ],
        ['given_name', 'family_name', 'age_equal_or_over'],
      ),
    ).toEqual(expect.arrayContaining(['given_name', 'family_name', 'age_equal_or_over', '21']))
  })
})
