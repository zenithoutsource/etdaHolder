import {
  buildIssuerLoginUrl,
  readIssuerPortalReturnUrl,
} from './buildIssuerLoginUrl'

describe('buildIssuerLoginUrl', () => {
  const originalLoginUrl = process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL
  const originalReturnUrl = process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/Account/Login'
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = 'walletapp://callback'
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = originalLoginUrl
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = originalReturnUrl
  })

  test('builds Account/Login URL with ReturnUrl and documentType', () => {
    process.env.EXPO_PUBLIC_ISSUER_LOGIN_URL = 'https://issuer.zenithcomp.co.th:455/Account/Login'
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = 'walletapp://callback'

    const url = new URL(buildIssuerLoginUrl('ChulalongkornUniversityTranscript'))
    expect(url.origin + url.pathname).toBe('https://issuer.zenithcomp.co.th:455/Account/Login')
    expect(url.searchParams.get('ReturnUrl')).toBe('walletapp://callback')
    expect(url.searchParams.get('documentType')).toBe('Transcript')
  })

  test('maps ThaiNationalID to IdCard documentType', () => {
    expect(new URL(buildIssuerLoginUrl('ThaiNationalID')).searchParams.get('documentType')).toBe('IdCard')
  })

  test('readIssuerPortalReturnUrl returns configured wallet callback', () => {
    process.env.EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL = 'walletapp://callback'
    expect(readIssuerPortalReturnUrl()).toBe('walletapp://callback')
  })
})
