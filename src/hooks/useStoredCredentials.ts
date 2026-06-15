import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

import { readStoredCredentials } from '../services/credentials/storedCredentials'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

type UseStoredCredentialsResult = {
  status: 'ready' | 'storage-not-ready' | 'error'
  credentials: VerifiableCredentialRecord[]
  error: string | null
  refresh: () => void
}

function isStorageNotInitialized(error: unknown): boolean {
  return error instanceof Error && error.message === 'StorageNotInitialized'
}

export function useStoredCredentials(): UseStoredCredentialsResult {
  const [status, setStatus] = useState<UseStoredCredentialsResult['status']>('ready')
  const [credentials, setCredentials] = useState<VerifiableCredentialRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    try {
      setCredentials(readStoredCredentials())
      setStatus('ready')
      setError(null)
    } catch (err) {
      if (isStorageNotInitialized(err)) {
        setCredentials([])
        setStatus('storage-not-ready')
        setError('Wallet storage is not ready.')
        return
      }

      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useFocusEffect(refresh)

  return { status, credentials, error, refresh }
}
