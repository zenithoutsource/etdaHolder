/**
 * Verifies platform DC API event normalization for same-device and cross-device transports.
 */
import crossDeviceFixture from './__fixtures__/cross-device-unsigned-request.json'
import crossDeviceWrappedFixture from './__fixtures__/cross-device-wrapped-request.json'
import sameDeviceFixture from './__fixtures__/same-device-unsigned-request.json'
import {
  normalizePlatformDcApiEvent,
  readDcApiTransport,
  type DcApiPlatformPresentationEvent,
} from './dcApiCrossDevice'

describe('dcApiCrossDevice', () => {
  test('defaults unknown transport values to same_device', () => {
    expect(readDcApiTransport(undefined)).toBe('same_device')
    expect(readDcApiTransport('unexpected')).toBe('same_device')
    expect(readDcApiTransport('cross_device')).toBe('cross_device')
  })

  test('normalizes a cross-device unsigned fixture into the shared incoming request shape', () => {
    const normalized = normalizePlatformDcApiEvent(crossDeviceFixture as DcApiPlatformPresentationEvent)

    expect(normalized).toEqual({
      sessionId: 'fixture-cross-device-session',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      transport: 'cross_device',
      selectedCredentialId: 'mdl-credential-redacted',
      request: {
        response_mode: 'dc_api',
        nonce: 'nonce-redacted',
        dcql_query: {
          credentials: [
            {
              id: 'mdl',
              format: 'mso_mdoc',
              meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
              claims: [{ path: ['org.iso.18013.5.1', 'family_name'] }],
            },
          ],
        },
      },
    })
  })

  test('normalizes a same-device fixture without selectedCredentialId', () => {
    const normalized = normalizePlatformDcApiEvent(sameDeviceFixture as DcApiPlatformPresentationEvent)

    expect(normalized.transport).toBe('same_device')
    expect(normalized.selectedCredentialId).toBeUndefined()
    expect(normalized.request.response_mode).toBe('dc_api')
  })

  test('unwraps a platform requests[] envelope for cross-device callbacks', () => {
    const normalized = normalizePlatformDcApiEvent(
      crossDeviceWrappedFixture as DcApiPlatformPresentationEvent,
    )

    expect(normalized.transport).toBe('cross_device')
    expect(normalized.request).toEqual({
      response_mode: 'dc_api',
      nonce: 'nonce-redacted',
      dcql_query: {
        credentials: [
          {
            id: 'mdl',
            format: 'mso_mdoc',
            meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
            claims: [{ path: ['org.iso.18013.5.1', 'family_name'] }],
          },
        ],
      },
    })
  })
})
