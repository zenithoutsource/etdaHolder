import { logRouteError } from './routeError'

describe('logRouteError', () => {
  test('logs scoped tag and error object', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = new Error('db-down')

    logRouteError('auth', 'login', err)

    expect(errorSpy).toHaveBeenCalledWith('[wallet-api:auth] login-failed', err)
    errorSpy.mockRestore()
  })
})
