export function readCompactTokenSignature(token: string): string | undefined {
  const jwt = token.split('~').find((segment) => segment.split('.').length >= 3)
  const signature = jwt?.split('.')[2]
  return signature && signature.length > 0 ? signature : undefined
}
