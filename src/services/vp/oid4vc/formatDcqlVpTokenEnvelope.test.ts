import { formatDcqlVpTokenEnvelope } from './formatDcqlVpTokenEnvelope'

describe('formatDcqlVpTokenEnvelope', () => {
  it('builds object_array envelope by default', () => {
    expect(
      formatDcqlVpTokenEnvelope({
        entries: { idcard_credential: 'vp.jwt' },
        shape: 'object_array',
      }),
    ).toBe(JSON.stringify({ idcard_credential: ['vp.jwt'] }))
  })

  it('builds object_string envelope', () => {
    expect(
      formatDcqlVpTokenEnvelope({
        entries: { idcard_credential: 'vp.jwt' },
        shape: 'object_string',
      }),
    ).toBe(JSON.stringify({ idcard_credential: 'vp.jwt' }))
  })

  it('returns raw token for single-entry raw shape', () => {
    expect(
      formatDcqlVpTokenEnvelope({
        entries: { idcard_credential: 'vp.jwt' },
        shape: 'raw',
      }),
    ).toBe('vp.jwt')
  })

  it('rejects raw shape with multiple query ids', () => {
    expect(() =>
      formatDcqlVpTokenEnvelope({
        entries: {
          sd_jwt_entry: 'sd.jwt',
          mdoc_entry: 'mdoc',
        },
        shape: 'raw',
      }),
    ).toThrow('raw DCQL vp_token shape requires exactly one credential query entry')
  })

  it('validates dual-format envelopes through oid4vc parser', () => {
    const envelope = formatDcqlVpTokenEnvelope({
      entries: {
        sd_jwt_entry: 'sd.jwt~kb',
        mdoc_entry: 'base64mdoc',
      },
      shape: 'object_array',
    })

    expect(JSON.parse(envelope)).toEqual({
      sd_jwt_entry: ['sd.jwt~kb'],
      mdoc_entry: ['base64mdoc'],
    })
  })
})
