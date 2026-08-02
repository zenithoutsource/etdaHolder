export const fetch = jest.fn(async () => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  bodyString: '{}',
  text: async () => '{}',
}))
