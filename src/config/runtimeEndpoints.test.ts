import { readMobileRuntimeEndpoint } from './runtimeEndpoints'

describe('mobile runtime endpoint configuration', () => {
  const runtime = globalThis as typeof globalThis & { __DEV__: boolean }
  const originalDev = runtime.__DEV__

  afterEach(() => {
    runtime.__DEV__ = originalDev
  })

  test('normalizes a valid endpoint', () => {
    expect(
      readMobileRuntimeEndpoint('API', 'https://api.example/', {
        requiredInRelease: true,
        allowHttpInDev: false,
      }),
    ).toBe('https://api.example')
  })

  test('rejects credentials embedded in an endpoint URL', () => {
    expect(() =>
      readMobileRuntimeEndpoint('API', 'https://user:password@api.example', {
        requiredInRelease: true,
        allowHttpInDev: false,
      }),
    ).toThrow('MobileConfigInvalid:API:credentials')
  })

  test('rejects an empty endpoint value', () => {
    expect(() =>
      readMobileRuntimeEndpoint('API', undefined, {
        requiredInRelease: true,
        allowHttpInDev: false,
      }),
    ).toThrow('MobileConfigInvalid:API:missing')
  })

  test('rejects HTTP and loopback endpoints in release-like runtime', () => {
    runtime.__DEV__ = false

    expect(() =>
      readMobileRuntimeEndpoint('API', 'http://api.example', {
        requiredInRelease: true,
        allowHttpInDev: true,
      }),
    ).toThrow('MobileConfigInvalid:API:https-required')

    expect(() =>
      readMobileRuntimeEndpoint('API', 'https://127.0.0.1:4000', {
        requiredInRelease: true,
        allowHttpInDev: true,
      }),
    ).toThrow('MobileConfigInvalid:API:loopback')
  })

  test('allows HTTP localhost only in development when configured', () => {
    runtime.__DEV__ = true

    expect(
      readMobileRuntimeEndpoint('API', 'http://localhost:4000/', {
        requiredInRelease: true,
        allowHttpInDev: true,
      }),
    ).toBe('http://localhost:4000')
  })
})
