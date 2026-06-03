export const createHash = jest.fn(() => ({
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue(Buffer.alloc(32, 0xab).toString('hex')),
}))

export const randomBytes = jest.fn((size: number) => Buffer.alloc(size, 0))

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
