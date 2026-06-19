declare global {
  var __walletApiOriginalFetch: typeof fetch | undefined
  var __walletApiFetchImpl: typeof fetch | undefined
}

if (!globalThis.__walletApiFetchImpl) {
  const original = globalThis.fetch.bind(globalThis)
  globalThis.__walletApiOriginalFetch = original
  globalThis.__walletApiFetchImpl = original

  globalThis.fetch = ((...args: Parameters<typeof fetch>) => globalThis.__walletApiFetchImpl!(...args)) as typeof fetch
}

export function setFetchImplementation(fetchFn: typeof fetch): void {
  globalThis.__walletApiFetchImpl = fetchFn
}

export function getOriginalFetch(): typeof fetch {
  return globalThis.__walletApiOriginalFetch!
}
