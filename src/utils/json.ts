export function safeJsonParse<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`JsonParseError(${label}): unexpected content: ${raw.slice(0, 40)}`)
  }
}
