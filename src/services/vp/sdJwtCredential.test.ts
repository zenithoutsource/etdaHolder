import { isSdJwtCredential } from './sdJwtCredential'

test('isSdJwtCredential detects tilde in rawVc', () => {
  expect(isSdJwtCredential({ rawVc: 'issuer.jwt~disclosure~' } as never)).toBe(true)
  expect(isSdJwtCredential({ rawVc: 'issuer.jwt' } as never)).toBe(false)
})
