/**
 * Normalize an SD-JWT presentation input before attaching a KB-JWT.
 * Preserves disclosure segments; only ensures a trailing `~`.
 */
export function normalizeSdJwtWithoutKb(sdJwt: string): string {
  return sdJwt.endsWith('~') ? sdJwt : `${sdJwt}~`
}
