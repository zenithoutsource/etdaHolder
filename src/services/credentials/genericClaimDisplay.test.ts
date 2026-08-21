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

  test('formats booleans and nested objects', () => {
    expect(formatGenericClaimValue(true)).toBe('Yes')
    expect(formatGenericClaimValue([{ vehicle_category_code: 'B' }])).toBe('Vehicle Category Code: B')
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
})
