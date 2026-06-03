export const generateKeypair = jest.fn().mockResolvedValue(new Uint8Array(33))

export const getPublicBytesForKeyId = jest.fn().mockResolvedValue(new Uint8Array(33))

export const sign = jest.fn().mockResolvedValue(new Uint8Array(64))

export const deleteKey = jest.fn().mockResolvedValue(undefined)

export const isLocalSecureEnvironmentSupported = jest.fn().mockReturnValue(false)

export const setFallbackSecureEnvironment = jest.fn()

export const shouldUseFallbackSecureEnvironment = jest.fn()
