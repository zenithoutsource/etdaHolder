import {
  buildPresentationResolveCacheKey,
  clearPresentationResolveCacheForTests,
  resolvePresentationRequestCached,
} from './presentationResolveCache'
import { resolvePresentationRequest } from './presentationService'

jest.mock('./presentationService', () => ({
  resolvePresentationRequest: jest.fn(),
}))

const mockResolve = resolvePresentationRequest as jest.MockedFunction<typeof resolvePresentationRequest>

describe('presentationResolveCache', () => {
  beforeEach(() => {
    clearPresentationResolveCacheForTests()
    mockResolve.mockReset()
  })

  test('reuses one in-flight resolve for the same request and credential set', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mockResolve.mockImplementation(async () => {
      await gate
      return { clientId: 'test' } as never
    })

    const options = {
      trustedVerifiers: [],
      presentationFlowOrigin: 'same-device' as const,
    }
    const cacheKey = buildPresentationResolveCacheKey('openid4vp://authorize?x=1', '["cred-1"]')
    expect(cacheKey).toBe('openid4vp://authorize?x=1::["cred-1"]')

    const first = resolvePresentationRequestCached(
      'openid4vp://authorize?x=1',
      '["cred-1"]',
      [],
      options,
    )
    const second = resolvePresentationRequestCached(
      'openid4vp://authorize?x=1',
      '["cred-1"]',
      [],
      options,
    )

    expect(second).toBe(first)
    expect(mockResolve).toHaveBeenCalledTimes(1)

    release()
    await first
  })
})
