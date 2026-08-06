type AttemptWindow = {
  count: number
  resetAt: number
}

export function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, AttemptWindow>()

  return {
    isLimited(key: string): boolean {
      const now = Date.now()
      const current = attempts.get(key)
      if (!current || current.resetAt <= now) {
        return false
      }
      return current.count > maxAttempts
    },
    recordFailure(key: string): boolean {
      const now = Date.now()
      const current = attempts.get(key)

      if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs })
        return false
      }

      current.count += 1
      return current.count > maxAttempts
    },
    consume(key: string): boolean {
      const now = Date.now()
      const current = attempts.get(key)

      if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs })
        return false
      }

      current.count += 1
      return current.count > maxAttempts
    },
    reset(key: string): void {
      attempts.delete(key)
    },
  }
}
