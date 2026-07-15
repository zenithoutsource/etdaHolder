export type RouteErrorScope = 'auth' | 'credentials' | 'wallets'

export function logRouteError(scope: RouteErrorScope, operation: string, error: unknown): void {
  console.error(`[wallet-api:${scope}] ${operation}-failed`, error)
}
