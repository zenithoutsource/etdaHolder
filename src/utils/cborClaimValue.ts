/**
 * Normalizes CBOR-tagged claim values (ISO mdoc full-date tag 1004) for display.
 */

export function readCborTaggedValue(value: unknown): unknown {
  if (value instanceof Map) {
    const tag = value.get('tag') ?? value.get('__tag')
    if (typeof tag === 'number') return value.get('value')
    return undefined
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const tag = record.tag ?? record.__tag
    if (typeof tag === 'number' && 'value' in record) return record.value
  }

  return undefined
}

export function isCborTaggedDateValue(value: unknown): boolean {
  return readCborTaggedValue(value) !== undefined
}

export function readIsoDateClaimValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    return match?.[1]
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const taggedValue = readCborTaggedValue(value)
  if (taggedValue !== undefined) {
    return readIsoDateClaimValue(taggedValue)
  }

  return undefined
}
