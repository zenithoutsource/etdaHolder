/** Strip non-digits and keep the first `length` characters (default 6). */
export function normalizeNumericCode(input: string, length = 6): string {
  const digits = input.replace(/\D/g, '')
  return digits.slice(0, length)
}
