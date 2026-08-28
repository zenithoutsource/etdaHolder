import { detectImageMimeType, readImageDataUriFromBytes } from './imageDataUri'

describe('imageDataUri', () => {
  test('detects JPEG and PNG signatures', () => {
    expect(detectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg')
    expect(detectImageMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png')
  })

  test('builds a data URI from portrait bytes', () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0x02])
    expect(readImageDataUriFromBytes(bytes)).toBe('data:image/jpeg;base64,/9j/AQI=')
  })
})
