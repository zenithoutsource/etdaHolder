import { readThirdPartyCredentialDisplayRows } from './thirdPartyCredentialDisplay'

describe('thirdPartyCredentialDisplay', () => {
  test('orders rows by claim-time issuer metadata claim definition order', () => {
    const { rows } = readThirdPartyCredentialDisplayRows({
      id: 'interop-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        expiry_date: '2031-08-19',
        given_name: 'SOMCHAI',
        family_name: 'SUKJAI',
        birth_date: '1990-01-15',
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
      claimDisplayLabels: {
        given_name: 'Given name (Latin)',
        family_name: 'Family name (Latin)',
        birth_date: 'Date of birth',
        expiry_date: 'Licence expiry date',
      },
    })

    expect(rows.map((row) => row.key)).toEqual([
      'given_name',
      'family_name',
      'birth_date',
      'expiry_date',
    ])
    expect(rows[0]?.label).toBe('Given name (Latin)')
  })

  test('renders one row per metadata claim when issuer metadata lists short and dotted alias keys', () => {
    const { rows } = readThirdPartyCredentialDisplayRows({
      id: 'interop-meta-dup',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        given_name: 'SOMCHAI',
        family_name: 'SUKJAI',
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
      claimDisplayLabels: {
        given_name: 'Given name (Latin)',
        'org.iso.18013.5.1.given_name': 'Given name (Latin)',
        family_name: 'Family name (Latin)',
        'org.iso.18013.5.1.family_name': 'Family name (Latin)',
      },
    })

    expect(rows).toEqual([
      { key: 'org.iso.18013.5.1.given_name', label: 'Given name (Latin)', value: 'SOMCHAI' },
      { key: 'org.iso.18013.5.1.family_name', label: 'Family name (Latin)', value: 'SUKJAI' },
    ])
  })

  test('renders one row per metadata claim when short and dotted alias keys are both stored', () => {
    const { rows } = readThirdPartyCredentialDisplayRows({
      id: 'interop-dup',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        given_name: 'SOMCHAI',
        'org.iso.18013.5.1.given_name': 'SOMCHAI',
        family_name: 'SUKJAI',
        'org.iso.18013.5.1.family_name': 'SUKJAI',
        vct: 'https://demo.tonyhere.work/credentials/DrivingLicense',
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
      claimDisplayLabels: {
        'org.iso.18013.5.1.given_name': 'Given name (Latin)',
        'org.iso.18013.5.1.family_name': 'Family name (Latin)',
      },
    })

    expect(rows).toEqual([
      { key: 'org.iso.18013.5.1.given_name', label: 'Given name (Latin)', value: 'SOMCHAI' },
      { key: 'org.iso.18013.5.1.family_name', label: 'Family name (Latin)', value: 'SUKJAI' },
    ])
  })

  test('formats tagged date claims from issuer metadata labels', () => {
    const { rows } = readThirdPartyCredentialDisplayRows({
      id: 'interop-tagged-dates',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        birth_date: { __tag: 1004, value: '1990-01-15' },
        issue_date: { __tag: 1004, value: '2026-08-20' },
        expiry_date: { __tag: 1004, value: '2031-08-19' },
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
      claimDisplayLabels: {
        birth_date: 'Date of birth',
        issue_date: 'Issue date',
        expiry_date: 'Expiry date',
      },
    })

    expect(rows).toEqual([
      { key: 'birth_date', label: 'Date of birth', value: '1990-01-15' },
      { key: 'issue_date', label: 'Issue date', value: '2026-08-20' },
      { key: 'expiry_date', label: 'Expiry date', value: '2031-08-19' },
    ])
  })

  test('exposes mdoc portrait bytes as photoUri without rendering a portrait row', () => {
    const portrait = Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0x02])
    const { rows, photoUri } = readThirdPartyCredentialDisplayRows({
      id: 'interop-mdoc',
      type: 'DLTDrivingLicence',
      rawVc: 'mdoc:AQIDBA',
      claims: {
        'org.iso.18013.5.1.given_name': 'Ada',
        'org.iso.18013.5.1.portrait': portrait,
      },
      issuedAt: '2026-08-21T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
      claimDisplayLabels: {
        'org.iso.18013.5.1.given_name': 'Given name',
        'org.iso.18013.5.1.portrait': 'Portrait',
      },
    })

    expect(photoUri).toBe('data:image/jpeg;base64,/9j/AQI=')
    expect(rows).toEqual([
      { key: 'org.iso.18013.5.1.given_name', label: 'Given name', value: 'Ada' },
    ])
  })
})
