import {
  formatGenericClaimValue,
  humanizeClaimKey,
  readGenericClaimRows,
} from './genericClaimDisplay'

describe('genericClaimDisplay', () => {
  test('humanizes snake_case claim keys', () => {
    expect(humanizeClaimKey('given_name')).toBe('Given Name')
    expect(humanizeClaimKey('age_over_18')).toBe('Age Over 18')
  })

  test('formats CBOR-tagged full-date objects as ISO dates', () => {
    expect(formatGenericClaimValue({ __tag: 1004, value: '1990-01-15' })).toBe('1990-01-15')
    expect(formatGenericClaimValue({ tag: 1004, value: '2031-08-19' })).toBe('2031-08-19')
  })

  test('renders tagged date claims as one row instead of tag and value rows', () => {
    const result = readGenericClaimRows({
      birth_date: { __tag: 1004, value: '1990-01-15' },
      issue_date: { __tag: 1004, value: '2026-08-20' },
      expiry_date: { __tag: 1004, value: '2031-08-19' },
      given_name: 'Ada',
    })

    expect(result.rows).toEqual([
      { key: 'birth_date', label: 'Birth Date', value: '1990-01-15' },
      { key: 'expiry_date', label: 'Expiry Date', value: '2031-08-19' },
      { key: 'given_name', label: 'Given Name', value: 'Ada' },
      { key: 'issue_date', label: 'Issue Date', value: '2026-08-20' },
    ])
  })

  test('formats booleans and nested objects', () => {
    expect(formatGenericClaimValue(true)).toBe('Yes')
    expect(formatGenericClaimValue([{ vehicle_category_code: 'B' }])).toBe('B')
    expect(formatGenericClaimValue([
      {
        vehicle_category_code: 'B',
        issue_date: { __tag: 1004, value: '2026-08-20' },
        expiry_date: { __tag: 1004, value: '2031-08-19' },
      },
    ])).toBe('B · Issue 2026-08-20 · Expiry 2031-08-19')
    expect(formatGenericClaimValue([
      { vehicle_category_code: 'B' },
      { vehicle_category_code: 'A' },
    ])).toBe('B; A')
  })

  test('lists issuer claims with metadata labels and hides protocol keys', () => {
    const result = readGenericClaimRows(
      {
        given_name: 'Ada',
        age_over_18: true,
        iss: 'https://issuer.example.com',
        vct: 'urn:tonyhere:demo:pid-age:1',
        address: { city: 'Bangkok' },
      },
      { given_name: 'Given name' },
    )

    expect(result.rows).toEqual([
      { key: 'address.city', label: 'Address City', value: 'Bangkok' },
      { key: 'age_over_18', label: 'Age Over 18', value: 'Yes' },
      { key: 'given_name', label: 'Given name', value: 'Ada' },
    ])
  })

  test('extracts a portrait data URI as photoUri', () => {
    const result = readGenericClaimRows({
      given_name: 'Ada',
      portrait: 'data:image/jpeg;base64,/9j/abc',
    })
    expect(result.photoUri).toBe('data:image/jpeg;base64,/9j/abc')
    expect(result.rows.map((row) => row.key)).toEqual(['given_name'])
  })

  test('extracts portrait bytes from mdoc claims as photoUri', () => {
    const portrait = Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0x02])
    const result = readGenericClaimRows({
      given_name: 'Ada',
      'org.iso.18013.5.1.portrait': portrait,
    })

    expect(result.photoUri).toBe('data:image/jpeg;base64,/9j/AQI=')
    expect(result.rows.map((row) => row.key)).toEqual(['given_name'])
  })
})
