import { fetchPresentationDefinition } from './presentationDefinitionResolver'

const presentationDefinition = {
  id: 'age-over-20',
  input_descriptors: [
    {
      id: 'thai-id-age',
      constraints: { fields: [{ path: ['$.birthDate'] }] },
    },
  ],
}

describe('presentationDefinitionResolver', () => {
  test('fetches presentation definition from allowlisted origin', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(presentationDefinition), { status: 200 }),
    )

    await expect(
      fetchPresentationDefinition('https://verifier.example.com/pd/age-over-20.json', {
        allowedOrigins: ['https://verifier.example.com'],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toEqual(presentationDefinition)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com/pd/age-over-20.json',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  test('rejects off-origin presentation_definition_uri', async () => {
    await expect(
      fetchPresentationDefinition('https://evil.example.com/pd.json', {
        allowedOrigins: ['https://verifier.example.com'],
      }),
    ).rejects.toThrow('PresentationDefinitionUntrusted: URI origin is not allowlisted')
  })

  test('rejects malformed presentation_definition_uri', async () => {
    await expect(
      fetchPresentationDefinition('not-a-valid-url', {
        allowedOrigins: ['https://verifier.example.com'],
      }),
    ).rejects.toThrow('PresentationRequestInvalid: presentation_definition_uri is not a valid URL')
  })

  test('maps fetch network failure to PresentationDefinitionFetchFailed', async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })

    await expect(
      fetchPresentationDefinition('https://verifier.example.com/pd.json', {
        allowedOrigins: ['https://verifier.example.com'],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('PresentationDefinitionFetchFailed: network error')
  })

  test('maps HTTP error status to PresentationDefinitionFetchFailed', async () => {
    const fetchMock = jest.fn(async () => new Response('not found', { status: 404 }))

    await expect(
      fetchPresentationDefinition('https://verifier.example.com/pd.json', {
        allowedOrigins: ['https://verifier.example.com'],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('PresentationDefinitionFetchFailed: HTTP 404')
  })

  test('maps oversize response to PresentationDefinitionFetchFailed', async () => {
    const fetchMock = jest.fn(async () =>
      new Response('x'.repeat(9), { status: 200 }),
    )

    await expect(
      fetchPresentationDefinition('https://verifier.example.com/pd.json', {
        allowedOrigins: ['https://verifier.example.com'],
        fetchImpl: fetchMock as unknown as typeof fetch,
        maxBytes: 8,
      }),
    ).rejects.toThrow('PresentationDefinitionFetchFailed: response exceeds maximum size')
  })

  test('maps fetch timeout to PresentationDefinitionFetchFailed', async () => {
    jest.useFakeTimers()

    const fetchMock = jest.fn(
      (_input: RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    )

    const pending = fetchPresentationDefinition('https://verifier.example.com/pd.json', {
      allowedOrigins: ['https://verifier.example.com'],
      fetchImpl: fetchMock as unknown as typeof fetch,
      timeoutMs: 50,
    })

    jest.advanceTimersByTime(50)

    await expect(pending).rejects.toThrow('PresentationDefinitionFetchFailed: request timed out')

    jest.useRealTimers()
  })

  test('rejects malformed JSON body', async () => {
    const fetchMock = jest.fn(async () => new Response('{not-json', { status: 200 }))

    await expect(
      fetchPresentationDefinition('https://verifier.example.com/pd.json', {
        allowedOrigins: ['https://verifier.example.com'],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('PresentationRequestInvalid')
  })
})
