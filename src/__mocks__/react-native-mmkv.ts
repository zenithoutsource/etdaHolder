export class MMKV {
  private store = new Map<string, string | number | boolean | Uint8Array>()

  getString(key: string): string | undefined {
    const val = this.store.get(key)
    return typeof val === 'string' ? val : undefined
  }

  set(key: string, value: string | number | boolean | Uint8Array): void {
    this.store.set(key, value)
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  contains(key: string): boolean {
    return this.store.has(key)
  }

  getAllKeys(): string[] {
    return Array.from(this.store.keys())
  }

  clearAll(): void {
    this.store.clear()
  }
}

export function createMMKV(_config?: {
  id?: string
  encryptionKey?: string
  encryptionType?: string
}): MMKV {
  return new MMKV()
}
