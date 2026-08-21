import { readClaimDisplayLabels, readClaimDisplayName } from './claimDisplayMetadata'

describe('claimDisplayMetadata', () => {
  test('prefers Thai display names from OID4VCI claims metadata', () => {
    expect(
      readClaimDisplayName({
        display: [
          { name: 'Given Name', locale: 'en-US' },
          { name: 'ชื่อ', locale: 'th-TH' },
        ],
      }),
    ).toBe('ชื่อ')
  })

  test('builds a claim-key label map and skips placeholder names', () => {
    expect(
      readClaimDisplayLabels({
        claims: {
          given_name: { display: [{ name: 'Given Name', locale: 'en' }] },
          age_over_18: { display: [{ name: 'string' }] },
        },
      }),
    ).toEqual({ given_name: 'Given Name' })
  })
})
