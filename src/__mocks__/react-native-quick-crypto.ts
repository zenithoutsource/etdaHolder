import { createCipheriv as nodeCreateCipheriv, createDecipheriv as nodeCreateDecipheriv } from 'crypto'

export const createHash = jest.fn(() => {
  let input = ''
  type MockHash = {
    update: jest.Mock<MockHash, [unknown]>
    digest: jest.Mock<string, []>
  }
  const hash: MockHash = {
    update: jest.fn((value: unknown) => {
      input += typeof value === 'string' ? value : JSON.stringify(value)
      return hash
    }),
    digest: jest.fn(() => {
      const bytes = Buffer.alloc(32, 0xab)
      for (let index = 0; index < input.length; index += 1) {
        bytes[index % bytes.length] = bytes[index % bytes.length] ^ input.charCodeAt(index)
      }
      return bytes.toString('hex')
    }),
  }
  return hash
})

export const randomBytes = jest.fn((size: number) => Buffer.alloc(size, 0))

export const createCipheriv = jest.fn((
  algorithm: string,
  key: Buffer,
  iv: Buffer,
) => nodeCreateCipheriv(algorithm, key, iv))

export const createDecipheriv = jest.fn((
  algorithm: string,
  key: Buffer,
  iv: Buffer,
) => nodeCreateDecipheriv(algorithm, key, iv))

export const subtle = {
  generateKey: jest.fn().mockResolvedValue({
    privateKey: {},
    publicKey: {},
  }),
  exportKey: jest.fn().mockResolvedValue({
    kty: 'EC',
    crv: 'P-256',
    x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    y: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    d: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  }),
  importKey: jest.fn().mockResolvedValue({}),
  sign: jest.fn().mockResolvedValue(new Uint8Array(64)),
}
