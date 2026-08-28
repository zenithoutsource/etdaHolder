export function readByteArray(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return undefined
}

export function detectImageMimeType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  return undefined
}

export function readImageDataUriFromBytes(bytes: Uint8Array): string | undefined {
  if (bytes.length === 0) return undefined
  const mime = detectImageMimeType(bytes) ?? 'image/jpeg'
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }
  return `data:${mime};base64,${btoa(binary)}`
}
