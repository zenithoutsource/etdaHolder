import { Platform } from 'react-native'

import {
  __resetHardwareEcdsaSignerCacheForTests,
  getActiveHardwareEcdsaBackend,
  getHardwareEcdsaSigner,
  readHardwareEcdsaBackendPreference,
} from './hardwareEcdsaSigner'
import { HardwareEcdsaUnavailableError } from './hardwareEcdsaTypes'
import { HardwareSigningPlatformBlockedError } from './hardwareSigningPlatformGate'

jest.mock('./hardwareEcdsaSigner.animo', () => ({
  createAnimoHardwareEcdsaSigner: jest.fn(() => ({
    createKey: jest.fn(),
    getPublicJwk: jest.fn(),
    getSecurityLevel: jest.fn(),
    hasKey: jest.fn(),
    openSigningSession: jest.fn(),
    deleteKey: jest.fn(),
  })),
}))

jest.mock('./hardwareEcdsaSigner.custom', () => ({
  createCustomHardwareEcdsaSigner: jest.fn(() => ({
    createKey: jest.fn(),
    getPublicJwk: jest.fn(),
    getSecurityLevel: jest.fn(),
    hasKey: jest.fn(),
    openSigningSession: jest.fn(),
    deleteKey: jest.fn(),
  })),
}))

describe('hardwareEcdsaSigner resolver', () => {
  const originalFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
  const originalBackend = process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND
  const originalNodeEnv = process.env.NODE_ENV
  const originalDev = (global as typeof globalThis & { __DEV__?: boolean }).__DEV__
  const env = process.env as Record<string, string | undefined>

  afterEach(() => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalFlag
    process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND = originalBackend
    env.NODE_ENV = originalNodeEnv
    ;(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = originalDev
    __resetHardwareEcdsaSignerCacheForTests()
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
  })

  test('returns mock signer under Jest regardless of flag', () => {
    env.NODE_ENV = 'test'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    expect(getActiveHardwareEcdsaBackend()).toBe('mock')
    expect(getHardwareEcdsaSigner().createKey).toEqual(expect.any(Function))
  })

  test('readHardwareEcdsaBackendPreference defaults to custom after Animo spike failure', () => {
    delete process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND
    expect(readHardwareEcdsaBackendPreference()).toBe('custom')
  })

  test('throws when flag is off outside __DEV__', () => {
    env.NODE_ENV = 'production'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    ;(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false

    expect(() => getHardwareEcdsaSigner()).toThrow(HardwareEcdsaUnavailableError)
  })

  test('returns mock in __DEV__ when flag is off', () => {
    env.NODE_ENV = 'development'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    ;(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true

    expect(getActiveHardwareEcdsaBackend()).toBe('mock')
    expect(getHardwareEcdsaSigner()).toBeDefined()
  })

  test('blocks iOS when flag is on', () => {
    env.NODE_ENV = 'development'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })

    expect(() => getHardwareEcdsaSigner()).toThrow(HardwareSigningPlatformBlockedError)
  })

  test('loads animo backend on Android when flag is on', () => {
    env.NODE_ENV = 'development'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND = 'animo'
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })

    expect(getActiveHardwareEcdsaBackend()).toBe('animo')
    expect(getHardwareEcdsaSigner()).toBeDefined()
  })

  test('loads custom backend when env selects custom', () => {
    env.NODE_ENV = 'development'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND = 'custom'
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })

    expect(getActiveHardwareEcdsaBackend()).toBe('custom')
    expect(getHardwareEcdsaSigner()).toBeDefined()
  })

  test('refuses mock backend in production', () => {
    env.NODE_ENV = 'production'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND = 'mock'
    ;(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })

    expect(() => getHardwareEcdsaSigner()).toThrow(HardwareEcdsaUnavailableError)
    expect(() => getActiveHardwareEcdsaBackend()).toThrow(/HardwareEcdsaBackendNotAllowed/)
  })

  test('refuses animo backend in production', () => {
    env.NODE_ENV = 'production'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND = 'animo'
    ;(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })

    expect(() => getHardwareEcdsaSigner()).toThrow(/HardwareEcdsaBackendNotAllowed/)
  })

  test('loads custom backend in production', () => {
    env.NODE_ENV = 'production'
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    process.env.EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND = 'custom'
    ;(global as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })

    expect(getActiveHardwareEcdsaBackend()).toBe('custom')
    expect(getHardwareEcdsaSigner()).toBeDefined()
  })
})
