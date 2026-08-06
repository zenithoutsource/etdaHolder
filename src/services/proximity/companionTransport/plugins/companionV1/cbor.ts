import {
  COMPANION_CBOR_KEY,
  COMPANION_MODES,
  COMPANION_PROTOCOL_VERSION,
  type CompanionMode,
} from './constants'
import type { CompanionBeginRequest, CompanionCapabilities, CompanionSharingMode } from '../../types'

const CBOR_TEXT_STRING_BASE = 0x60
const CBOR_BYTE_STRING_BASE = 0x40
const CBOR_UNSIGNED_BASE = 0x00

export function encodeCompanionCapabilities(input: CompanionCapabilities): Uint8Array {
  const modeStrings = input.supportedModes.map((mode) => encodeTextString(mode))
  const arrayHeader = encodeDefiniteArray(modeStrings.length)
  const entries = [
    encodeMapEntry(COMPANION_CBOR_KEY.version, encodeUnsigned(input.version)),
    encodeMapEntry(COMPANION_CBOR_KEY.supportedModes, concatBytes(arrayHeader, ...modeStrings)),
    encodeMapEntry(COMPANION_CBOR_KEY.activeProfileId, encodeTextString(input.activeProfileId)),
    encodeMapEntry(COMPANION_CBOR_KEY.maxCompanionBytes, encodeUnsigned(input.maxCompanionBytes)),
  ]

  return encodeDefiniteMap(entries.length, entries)
}

export function encodeCompanionBeginRequest(input: CompanionBeginRequest): Uint8Array {
  if (input.nonce.length !== 32) {
    throw new Error('CompanionCborInvalid: nonce must be exactly 32 bytes')
  }

  const entries = [
    encodeMapEntry(COMPANION_CBOR_KEY.mode, encodeTextString(input.mode)),
    encodeMapEntry(COMPANION_CBOR_KEY.nonce, encodeByteString(input.nonce)),
    encodeMapEntry(COMPANION_CBOR_KEY.profileId, encodeTextString(input.profileId)),
  ]

  return encodeDefiniteMap(entries.length, entries)
}

export function decodeCompanionCapabilities(bytes: Uint8Array): CompanionCapabilities {
  const reader = new CborReader(bytes)
  const map = reader.readMap()
  const supportedModes = readTextStringArray(map.get(COMPANION_CBOR_KEY.supportedModes))
  const filteredModes = supportedModes.filter((mode): mode is CompanionSharingMode =>
    (COMPANION_MODES as readonly string[]).includes(mode),
  )

  return {
    version: readUnsigned(map.get(COMPANION_CBOR_KEY.version), 'version'),
    supportedModes: filteredModes.length > 0 ? filteredModes : ['mdoc-only'],
    activeProfileId: readTextString(map.get(COMPANION_CBOR_KEY.activeProfileId), 'activeProfileId'),
    maxCompanionBytes: readUnsigned(map.get(COMPANION_CBOR_KEY.maxCompanionBytes), 'maxCompanionBytes'),
  }
}

export function decodeCompanionBeginRequest(bytes: Uint8Array): CompanionBeginRequest {
  const reader = new CborReader(bytes)
  const map = reader.readMap()
  const mode = readTextString(map.get(COMPANION_CBOR_KEY.mode), 'mode')
  if (!(COMPANION_MODES as readonly string[]).includes(mode)) {
    throw new Error(`CompanionCborInvalid: unsupported mode ${mode}`)
  }

  const nonce = readByteString(map.get(COMPANION_CBOR_KEY.nonce), 'nonce')
  if (nonce.length !== 32) {
    throw new Error('CompanionCborInvalid: nonce must be exactly 32 bytes')
  }

  return {
    mode: mode as CompanionSharingMode,
    nonce,
    profileId: readTextString(map.get(COMPANION_CBOR_KEY.profileId), 'profileId'),
  }
}

function encodeDefiniteMap(pairCount: number, entries: Uint8Array[]): Uint8Array {
  return concatBytes(new Uint8Array([0xa0 + pairCount]), ...entries)
}

function encodeMapEntry(key: number, value: Uint8Array): Uint8Array {
  return concatBytes(encodeUnsigned(key), value)
}

function encodeDefiniteArray(length: number): Uint8Array {
  return new Uint8Array([0x80 + length])
}

function encodeUnsigned(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('CompanionCborInvalid: unsigned integer required')
  }
  if (value < 24) return new Uint8Array([CBOR_UNSIGNED_BASE + value])
  if (value < 256) return new Uint8Array([0x18, value])
  if (value <= 0xffff) return new Uint8Array([0x19, value >> 8, value & 0xff])
  if (value <= 0xffffffff) {
    return new Uint8Array([0x1a, (value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff])
  }
  throw new Error('CompanionCborInvalid: unsigned integer too large')
}

function encodeTextString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value)
  return concatBytes(encodeLength(CBOR_TEXT_STRING_BASE, bytes.length), bytes)
}

function encodeByteString(value: Uint8Array): Uint8Array {
  return concatBytes(encodeLength(CBOR_BYTE_STRING_BASE, value.length), value)
}

function encodeLength(major: number, length: number): Uint8Array {
  if (length < 24) return new Uint8Array([major + length])
  if (length < 256) return new Uint8Array([major + 24, length])
  if (length < 65_536) return new Uint8Array([major + 25, length >> 8, length & 0xff])
  throw new Error('CompanionCborInvalid: string too large')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function readUnsigned(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`CompanionCborInvalid: ${field} must be an unsigned integer`)
  }
  return value
}

function readTextString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`CompanionCborInvalid: ${field} must be a text string`)
  }
  return value
}

function readByteString(value: unknown, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`CompanionCborInvalid: ${field} must be a byte string`)
  }
  return value
}

function readTextStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

class CborReader {
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {}

  readMap(): Map<number, unknown> {
    const initial = this.readInitialByte()
    if (initial.major !== 5) throw new Error('CompanionCborInvalid: expected map')
    const map = new Map<number, unknown>()
    for (let i = 0; i < initial.length; i += 1) {
      const key = this.readUnsignedValue()
      map.set(key, this.readValue())
    }
    return map
  }

  private readValue(): unknown {
    const initial = this.readInitialByte()
    if (initial.major === 0) return initial.length
    const { major, length } = initial
    if (major === 2) return this.readBytes(length)
    if (major === 3) return new TextDecoder().decode(this.readBytes(length))
    if (major === 4) {
      const items: unknown[] = []
      for (let i = 0; i < length; i += 1) items.push(this.readValue())
      return items
    }
    throw new Error('CompanionCborInvalid: unsupported CBOR type')
  }

  private readUnsignedValue(): number {
    const initial = this.readInitialByte()
    if (initial.major !== 0) throw new Error('CompanionCborInvalid: expected unsigned integer key')
    return initial.length
  }

  private readInitialByte(): { major: number; length: number } {
    const initial = this.bytes[this.offset]
    if (initial === undefined) throw new Error('CompanionCborInvalid: unexpected end of input')
    this.offset += 1
    const major = initial >> 5
    const additional = initial & 0x1f
    if (additional < 24) return { major, length: additional }
    if (additional === 24) return { major, length: this.readByte() }
    if (additional === 25) return { major, length: (this.readByte() << 8) | this.readByte() }
    if (additional === 26) {
      const b0 = this.readByte()
      const b1 = this.readByte()
      const b2 = this.readByte()
      const b3 = this.readByte()
      return { major, length: ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0 }
    }
    throw new Error('CompanionCborInvalid: unsupported length encoding')
  }

  private readBytes(length: number): Uint8Array {
    const slice = this.bytes.slice(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  private readByte(): number {
    const value = this.bytes[this.offset]
    if (value === undefined) throw new Error('CompanionCborInvalid: unexpected end of input')
    this.offset += 1
    return value
  }
}

export function readCompanionProtocolVersionFromCapabilities(bytes: Uint8Array): number {
  return decodeCompanionCapabilities(bytes).version
}
