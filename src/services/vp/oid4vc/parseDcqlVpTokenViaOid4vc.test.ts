import { parseDcqlVpTokenViaOid4vc } from './parseDcqlVpTokenViaOid4vc'

describe('parseDcqlVpTokenViaOid4vc', () => {
  it('parses object_array DCQL vp_token from JSON string', () => {
    const vpToken = JSON.stringify({ idcard_credential: ['vp.jwt'] })

    expect(parseDcqlVpTokenViaOid4vc(vpToken)).toEqual({
      idcard_credential: ['vp.jwt'],
    })
  })

  it('parses object_string DCQL vp_token and normalizes to array', () => {
    expect(parseDcqlVpTokenViaOid4vc({ idcard_credential: 'vp.jwt' })).toEqual({
      idcard_credential: ['vp.jwt'],
    })
  })

  it('parses dual-format envelopes with multiple query ids', () => {
    const vpToken = {
      sd_jwt_entry: ['sd.jwt~kb'],
      mdoc_entry: ['base64mdoc'],
    }

    expect(parseDcqlVpTokenViaOid4vc(vpToken)).toEqual({
      sd_jwt_entry: ['sd.jwt~kb'],
      mdoc_entry: ['base64mdoc'],
    })
  })

  it('maps parser failures to PresentationSubmissionFailed', () => {
    expect(() => parseDcqlVpTokenViaOid4vc({ bad: [] })).toThrow(
      'PresentationSubmissionFailed: invalid DCQL vp_token',
    )
  })
})
