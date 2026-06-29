import {
  isParseableCredentialOfferUri,
  mapCredentialTypeToIssuerDocumentType,
  parseIssuerCredentialOfferResponse,
  requestIssuerRenewalOffer,
} from './devRenewalOffer'

describe('devRenewalOffer', () => {
  test('maps wallet credential types to issuer document types', () => {
    expect(mapCredentialTypeToIssuerDocumentType('ThaiNationalID')).toBe('IdCard')
    expect(mapCredentialTypeToIssuerDocumentType('DLTDrivingLicence')).toBe('DriverLicense')
    expect(mapCredentialTypeToIssuerDocumentType('BangkokUniversityTranscript')).toBe('Transcript')
    expect(mapCredentialTypeToIssuerDocumentType('Unknown')).toBeUndefined()
  })

  test('parses issuer offerUri responses', () => {
    const offerUri =
      'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Dabc'

    expect(parseIssuerCredentialOfferResponse({ offerUri }, 'http://issuer.example')).toBe(offerUri)
    expect(parseIssuerCredentialOfferResponse(offerUri, 'http://issuer.example')).toBe(offerUri)
  })

  test('builds credential_offer_uri from issuer offer id', () => {
    const offerUri = parseIssuerCredentialOfferResponse(
      { id: 'renewal-offer-1' },
      'http://192.100.10.46',
    )

    expect(offerUri).toContain('credential_offer_uri=')
    expect(offerUri).toContain(
      encodeURIComponent('http://192.100.10.46/openid4vc/credentialOffer?id=renewal-offer-1'),
    )
    expect(isParseableCredentialOfferUri(offerUri)).toBe(true)
  })

  test('requests issuer renewal offers using document_type', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json({
        offerUri:
          'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.office.example%2Fopenid4vc%2FcredentialOffer%3Fid%3Drenewal-1',
      }),
    )

    const offerUri = await requestIssuerRenewalOffer('ThaiNationalID', {
      fetchImpl,
      issuerTarget: 'https://issuer.office.example',
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://issuer.office.example/credential-offer', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_type: 'IdCard' }),
    })
    expect(isParseableCredentialOfferUri(offerUri)).toBe(true)
  })
})
