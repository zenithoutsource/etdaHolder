import { isOid4vcVpAdapterEnabled } from './isOid4vcVpAdapterEnabled'

describe('isOid4vcVpAdapterEnabled', () => {
  it('returns false by default', () => {
    expect(isOid4vcVpAdapterEnabled({})).toBe(false)
  })

  it('returns true only when EXPO_PUBLIC_OID4VC_VP_ADAPTER is true', () => {
    expect(isOid4vcVpAdapterEnabled({ EXPO_PUBLIC_OID4VC_VP_ADAPTER: 'true' })).toBe(true)
    expect(isOid4vcVpAdapterEnabled({ EXPO_PUBLIC_OID4VC_VP_ADAPTER: '1' })).toBe(false)
  })
})
